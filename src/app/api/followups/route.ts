import { NextResponse } from "next/server";
import { runGogCommand, getDefaultAccount } from "@/lib/gog";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

interface ThreadSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  recipientName: string;
  date: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  lastMessageSnippet: string;
  updatedAt: string;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { apiKey, model, conversations } = body as {
    apiKey: string;
    model: string;
    conversations?: ConversationSummary[];
  };

  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 400 });
  }

  const account = await getDefaultAccount();

  const [sentResult, receivedResult] = await Promise.allSettled([
    runGogCommand(
      ["gmail", "search", "in:sent older_than:5d newer_than:30d", "--max", "25", "--json"],
      account,
    ),
    runGogCommand(
      ["gmail", "search", "newer_than:30d -from:me", "--max", "50", "--json"],
      account,
    ),
  ]);

  const parseSafe = (r: PromiseSettledResult<{ success: boolean; stdout: string }>): ThreadSummary[] => {
    if (r.status !== "fulfilled" || !r.value.success) return [];
    try {
      const data = JSON.parse(r.value.stdout);
      return (data.threads || []).map((t: Record<string, string>) => ({
        id: t.id,
        threadId: t.threadId || t.id,
        subject: t.subject || "",
        from: t.from || "",
        to: t.to || "",
        recipientName: "",
        date: t.date || "",
      }));
    } catch { return []; }
  };

  const sentThreads = parseSafe(sentResult);
  const receivedThreads = parseSafe(receivedResult);

  const receivedThreadIds = new Set(receivedThreads.map((t) => t.threadId));
  const unanswered = sentThreads.filter((t) => !receivedThreadIds.has(t.threadId));

  // Fetch thread details in parallel to get actual To/Cc headers
  const threadDetails = await Promise.allSettled(
    unanswered.map((t) => runGogCommand(["gmail", "thread", "get", t.threadId, "--json"], account)),
  );

  for (let i = 0; i < unanswered.length; i++) {
    const result = threadDetails[i];
    if (result.status !== "fulfilled" || !result.value.success) continue;
    try {
      const data = JSON.parse(result.value.stdout);
      const messages: { labelIds?: string[]; payload?: { headers?: { name: string; value: string }[] } }[] = data.thread?.messages || [];

      // Get the To header from the user's sent message
      const sentMsg = messages.find((m) => m.labelIds?.includes("SENT")) || messages[0];
      const sentHeaders = sentMsg?.payload?.headers || [];
      const toHeader = sentHeaders.find((h) => h.name.toLowerCase() === "to")?.value || "";
      if (toHeader) unanswered[i].to = toHeader;

      // Extract the recipient email so we can look for their display name
      const recipientEmail = toHeader.match(/[\w.+-]+@[\w.-]+\.\w{2,}/)?.[0]?.toLowerCase();

      // Scan ALL messages for a From/To/Cc header that pairs this email with a display name.
      // e.g. if the recipient replied, their From header will be "Luiz Palácio <lh@outlook.com>"
      if (recipientEmail) {
        for (const msg of messages) {
          const headers = msg.payload?.headers || [];
          for (const h of headers) {
            if (!["from", "to", "cc"].includes(h.name.toLowerCase())) continue;
            // Check each comma-separated entry in the header
            for (const part of h.value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
              const trimmed = part.trim();
              const emailInPart = trimmed.match(/[\w.+-]+@[\w.-]+\.\w{2,}/)?.[0]?.toLowerCase();
              if (emailInPart !== recipientEmail) continue;
              // Found a header with the recipient's email — extract the display name
              const nameMatch = trimmed.match(/^"?(.+?)"?\s*</);
              if (nameMatch) {
                const name = nameMatch[1].replace(/"/g, "").trim();
                if (name && !name.includes("@") && name.length > (unanswered[i].recipientName?.length || 0)) {
                  unanswered[i].recipientName = name;
                }
              }
            }
          }
          if (unanswered[i].recipientName) break;
        }
      }
    } catch { /* ignore parse errors */ }
  }

  // Build prompt sections
  const promptParts: string[] = [];

  // Section 1: unanswered email threads
  if (unanswered.length > 0) {
    const threadList = unanswered
      .map((t) => `- ThreadID: ${t.threadId} | Subject: ${t.subject} | To: ${t.to} | Sent: ${t.date}`)
      .join("\n");
    promptParts.push(`## UNANSWERED EMAIL THREADS
These are email threads where the user sent a message but received NO reply for at least 5 days.

INCLUDE email follow-ups for:
- Threads to real people (colleagues, clients, partners, prospects) where a reply was expected
- Business conversations, proposals, requests, questions that went unanswered

EXCLUDE from email follow-ups:
- Outbound emails that were clearly one-way (FYI messages, notifications)
- Automated or system emails the user triggered
- Emails to noreply@, support@, or similar non-personal addresses
- Bulk or marketing emails the user sent

Threads:
${threadList}`);
  }

  // Section 2: recent Gog Chat conversations
  if (conversations && conversations.length > 0) {
    const convList = conversations
      .map((c) => `- ConvID: ${c.id} | Title: ${c.title} | Messages: ${c.messageCount} | Last active: ${c.updatedAt} | Last message: ${c.lastMessageSnippet}`)
      .join("\n");
    promptParts.push(`## RECENT GOG CHAT CONVERSATIONS
These are the user's recent conversations with their AI assistant (2–5 days old). Identify ones worth revisiting.

INCLUDE conversation follow-ups for:
- Conversations where the user was exploring an important idea or plan that seems unfinished
- Conversations with actionable insights, decisions, or next steps that weren't completed
- Research or analysis threads the user would benefit from continuing
- Conversations that surfaced something surprising or important that deserves another look

EXCLUDE from conversation follow-ups:
- Quick one-off queries with complete answers (simple lookups, basic questions)
- Conversations that reached a clear conclusion with nothing left to do
- Trivial or test conversations

Conversations:
${convList}`);
  }

  if (promptParts.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const prompt = `You are analyzing two categories of items to identify follow-ups for the user.

${promptParts.join("\n\n")}

Return ONLY a JSON array (no markdown fences) combining results from both sections. Each item:

For email follow-ups:
- "threadId": the ThreadID from the data (pass through exactly)
- "title": the email subject
- "source": "email"
- "contactName": name of the person the user emailed
- "contactEmail": their email address
- "lastAction": "You emailed them on [date]" using a natural date
- "dueDate": null
- "notes": brief note on why a follow-up makes sense

For conversation follow-ups:
- "conversationId": the ConvID from the data (pass through exactly)
- "title": the conversation title
- "source": "conversation"
- "lastAction": "You discussed this on [date]" using a natural date
- "dueDate": null
- "notes": 1 sentence explaining why this conversation is worth revisiting — what was unfinished or intriguing

If nothing qualifies in a category, omit items for that category. If nothing at all, return [].`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: model || "claude-opus-4-6",
      max_tokens: 2048,
      system:
        "You are a productivity assistant. For emails, identify threads genuinely awaiting a reply. For conversations, identify ones with unfinished thoughts or important ideas worth revisiting. Be selective in both — when in doubt, leave it out. Respond with ONLY valid JSON, no markdown fences or other text.",
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "[]";

    let suggestions;
    try {
      suggestions = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      suggestions = match ? JSON.parse(match[0]) : [];
    }

    // Extract contact info from raw thread data, supplementing whatever the LLM returned
    const threadMap = new Map(unanswered.map((t) => [t.threadId, t]));

    function extractEmail(raw: string): string | null {
      if (!raw) return null;
      const match = raw.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
      return match ? match[0] : null;
    }

    function extractName(raw: string): string | null {
      if (!raw) return null;
      // "Name" <email>  or  Name <email>
      const angleMatch = raw.match(/^"?(.+?)"?\s*</);
      if (angleMatch) {
        const name = angleMatch[1].replace(/"/g, "").trim();
        if (name && !name.includes("@")) return name;
      }
      // If it's not an email address and has no angle brackets, treat the whole thing as a name
      if (!raw.includes("@") && !raw.includes("<")) return raw.trim() || null;
      // If it's a bare email, derive name from the local part
      const email = extractEmail(raw);
      if (email) return email.split("@")[0];
      return null;
    }

    for (const s of suggestions) {
      if (s.source === "email" && s.threadId && threadMap.has(s.threadId)) {
        const thread = threadMap.get(s.threadId)!;
        s.recipientRaw = thread.to || thread.from;

        const email = extractEmail(thread.to) || extractEmail(thread.from);
        if (email) s.contactEmail = email;

        // Best name source: recipientName found by scanning all thread messages,
        // then the To header display name, then the From header, then email local part
        const name = thread.recipientName || extractName(thread.to) || extractName(thread.from);
        if (name) s.contactName = name;
      }
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
