import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { runGogCommand, getDefaultAccount } from "@/lib/gog";

export const maxDuration = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const apiKey = searchParams.get("apiKey");
  const model = searchParams.get("model") || "claude-opus-4-6";

  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["gmail", "search", "is:unread", "--max", "20", "--json"],
    account,
  );

  if (!result.success || !result.stdout) {
    return NextResponse.json({ emails: [] });
  }

  let allEmails: { id: string; threadId: string; subject: string; from: string; snippet: string; date: string }[];
  try {
    const data = JSON.parse(result.stdout);
    const threads = data.threads || [];
    allEmails = threads.map((t: Record<string, string>) => ({
      id: t.id,
      threadId: t.threadId || t.id,
      subject: t.subject || "(no subject)",
      from: t.from?.replace(/<[^>]+>/g, "").replace(/"/g, "").trim() || "",
      snippet: t.snippet || "",
      date: t.date || "",
    }));
  } catch {
    return NextResponse.json({ emails: [] });
  }

  if (allEmails.length === 0 || !apiKey) {
    return NextResponse.json({ emails: [] });
  }

  const emailList = allEmails.map((e, i) =>
    `${i}. From: ${e.from} | Subject: ${e.subject} | Snippet: ${e.snippet?.slice(0, 100)}`
  ).join("\n");

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      system: "You classify emails. Respond with ONLY a JSON array of integers, no other text.",
      messages: [{
        role: "user",
        content: `Which of these unread emails are from real people and actually need a personal reply from the user? Exclude all automated emails, calendar invites/RSVPs/acceptances/declines, newsletters, notifications, marketing, service alerts, e-signature requests, and anything that doesn't need a human response.

Return ONLY a JSON array of the index numbers that need replies. Example: [0, 3, 5]
If none need replies, return [].

Emails:
${emailList}`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "[]";
    let indices: number[];
    try {
      indices = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*?\]/);
      indices = match ? JSON.parse(match[0]) : [];
    }

    const filtered = indices
      .filter((i) => typeof i === "number" && i >= 0 && i < allEmails.length)
      .map((i) => allEmails[i]);

    return NextResponse.json({ emails: filtered });
  } catch {
    return NextResponse.json({ emails: [] });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;

  if (action === "analyze-style") {
    return analyzeStyle(body);
  }
  if (action === "generate-draft") {
    return generateDraft(body);
  }
  if (action === "send-draft") {
    return sendDraft(body);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

async function analyzeStyle(body: {
  apiKey: string;
  model: string;
}): Promise<NextResponse> {
  const { apiKey, model } = body;
  if (!apiKey)
    return NextResponse.json({ error: "API key required" }, { status: 400 });

  const account = await getDefaultAccount();
  const listResult = await runGogCommand(
    ["gmail", "search", "in:sent -from:calendar-notification -from:noreply -from:no-reply newer_than:30d", "--max", "15", "--json"],
    account,
  );

  if (!listResult.success || !listResult.stdout) {
    return NextResponse.json({
      error: "Could not fetch sent emails",
    }, { status: 500 });
  }

  let sentEmails: { id: string; subject: string; snippet: string }[] = [];
  try {
    const data = JSON.parse(listResult.stdout);
    sentEmails = (data.threads || []).slice(0, 15);
  } catch {
    return NextResponse.json({ error: "Failed to parse sent emails" }, { status: 500 });
  }

  function extractText(part: Record<string, unknown>): string {
    const mime = (part.mimeType as string) || "";
    const body = part.body as Record<string, unknown> | undefined;
    if (mime === "text/plain" && body?.data) {
      try { return Buffer.from(body.data as string, "base64").toString("utf-8"); } catch { return ""; }
    }
    if (body?.data && mime.startsWith("text/")) {
      try { return Buffer.from(body.data as string, "base64").toString("utf-8"); } catch { return ""; }
    }
    for (const sub of (part.parts as Record<string, unknown>[]) || []) {
      const r = extractText(sub);
      if (r) return r;
    }
    return "";
  }

  const emailSamples: string[] = [];
  for (const email of sentEmails.slice(0, 10)) {
    try {
      const readResult = await runGogCommand(
        ["gmail", "read", email.id, "--json"],
        account,
      );
      if (readResult.success && readResult.stdout) {
        const parsed = JSON.parse(readResult.stdout);
        let bodyText = "";

        const messages = parsed.thread?.messages || parsed.messages || [];
        if (messages.length > 0) {
          const msg = messages[0];
          bodyText = extractText(msg.payload || {});
          if (!bodyText) bodyText = msg.snippet || "";
        }

        if (!bodyText) {
          bodyText = parsed.body || parsed.snippet || parsed.text || "";
        }

        if (bodyText) emailSamples.push(bodyText.slice(0, 500));
      }
    } catch {
      // skip
    }
  }

  if (emailSamples.length === 0) {
    return NextResponse.json({
      profile: {
        tone: "professional",
        greetingPatterns: ["Hi"],
        signOffPatterns: ["Best"],
        vocabularyNotes: "Standard professional vocabulary",
        sentenceLengthTendency: "medium",
        formalityLevel: "semi-formal",
        raw: "Default profile (no sent emails found)",
      },
    });
  }

  const prompt = `Analyze the writing style of these sent emails and produce a JSON style profile.

Email samples:
${emailSamples.map((s, i) => `--- Email ${i + 1} ---\n${s}`).join("\n\n")}

Return ONLY a JSON object with these fields (no markdown fences):
{
  "tone": "description of overall tone",
  "greetingPatterns": ["array of greeting styles used"],
  "signOffPatterns": ["array of sign-off styles used"],
  "vocabularyNotes": "notes on vocabulary and word choice",
  "sentenceLengthTendency": "short/medium/long",
  "formalityLevel": "casual/semi-formal/formal",
  "raw": "a 2-3 sentence summary of the writing style"
}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system:
        "You are a writing style analyst. Respond with ONLY valid JSON, no markdown fences or other text.",
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "{}";

    let profile;
    try {
      profile = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      profile = match ? JSON.parse(match[0]) : {};
    }

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

async function generateDraft(body: {
  apiKey: string;
  model: string;
  emailId: string;
  styleProfile: Record<string, unknown>;
}): Promise<NextResponse> {
  const { apiKey, model, emailId, styleProfile } = body;
  if (!apiKey)
    return NextResponse.json({ error: "API key required" }, { status: 400 });

  const account = await getDefaultAccount();
  const readResult = await runGogCommand(
    ["gmail", "read", emailId, "--json"],
    account,
  );

  if (!readResult.success || !readResult.stdout) {
    return NextResponse.json({ error: "Could not read email" }, { status: 500 });
  }

  let emailContent: string;
  try {
    const parsed = JSON.parse(readResult.stdout);
    emailContent = `From: ${parsed.from || ""}\nSubject: ${parsed.subject || ""}\nDate: ${parsed.date || ""}\n\n${parsed.body || parsed.snippet || parsed.text || ""}`;
  } catch {
    emailContent = readResult.stdout;
  }

  const styleInstructions = styleProfile?.raw
    ? `Match this writing style: ${styleProfile.raw}\nGreetings to use: ${(styleProfile.greetingPatterns as string[])?.join(", ") || "Hi"}\nSign-offs to use: ${(styleProfile.signOffPatterns as string[])?.join(", ") || "Best"}\nTone: ${styleProfile.tone || "professional"}\nFormality: ${styleProfile.formalityLevel || "semi-formal"}`
    : "Write in a professional, friendly tone.";

  const prompt = `Draft a reply to this email. ${styleInstructions}

CRITICAL RULES:
- NEVER use em dashes (the long dash character). Use commas, periods, or parentheses instead.
- Match the user's natural writing style as closely as possible.
- Keep it concise and to the point.
- Do not include the subject line in the reply.

Email to reply to:
${emailContent}

Write ONLY the reply body text, no "Subject:" line, no metadata.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: model || "claude-opus-4-6",
      max_tokens: 1024,
      system: "You are drafting email replies. Write naturally, matching the specified style. NEVER use em dashes.",
      messages: [{ role: "user", content: prompt }],
    });

    const draft =
      response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

async function sendDraft(body: {
  emailId: string;
  threadId: string;
  draftText: string;
  subject: string;
  to: string;
}): Promise<NextResponse> {
  const { threadId, draftText, subject, to } = body;
  const account = await getDefaultAccount();

  const result = await runGogCommand(
    [
      "gmail",
      "send",
      "--to",
      to,
      "--subject",
      `Re: ${subject}`,
      "--body",
      draftText,
      "--thread-id",
      threadId,
    ],
    account,
  );

  if (!result.success) {
    return NextResponse.json(
      { error: result.stderr || "Failed to send" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, output: result.stdout });
}
