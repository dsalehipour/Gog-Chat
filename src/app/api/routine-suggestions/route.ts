import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { runGogCommand, getDefaultAccount } from "@/lib/gog";

export const maxDuration = 60;

async function gatherContext(): Promise<string> {
  const account = await getDefaultAccount();
  const parts: string[] = [];

  const [emailsRes, calRes, driveRes, tasksRes] = await Promise.allSettled([
    runGogCommand(["gmail", "search", "in:inbox", "--max", "10", "--json"], account),
    runGogCommand(["calendar", "events", "--max", "10", "--today", "--json"], account),
    runGogCommand(
      ["drive", "search", "viewedByMeTime > '2000-01-01' and trashed = false", "--raw-query", "--max", "10", "--json"],
      account,
    ),
    runGogCommand(["tasks", "list", "--json"], account),
  ]);

  if (emailsRes.status === "fulfilled" && emailsRes.value.success) {
    try {
      const data = JSON.parse(emailsRes.value.stdout);
      const items = (data.threads || []).map((t: Record<string, string>) => {
        const subj = t.subject || "(no subject)";
        const from = (t.from || "unknown").replace(/"/g, "");
        return `- ${subj} from ${from}`;
      });
      if (items.length) parts.push(`Recent inbox emails:\n${items.join("\n")}`);
    } catch { /* skip */ }
  }

  if (calRes.status === "fulfilled" && calRes.value.success) {
    try {
      const data = JSON.parse(calRes.value.stdout);
      const items = (data.events || []).map((e: Record<string, string | Record<string, string>>) => {
        const start = e.start as Record<string, string> | undefined;
        const time = start?.dateTime
          ? new Date(start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : "all-day";
        return `- ${e.summary || "(untitled)"} at ${time}`;
      });
      if (items.length) parts.push(`Today's calendar events:\n${items.join("\n")}`);
    } catch { /* skip */ }
  }

  if (driveRes.status === "fulfilled" && driveRes.value.success) {
    try {
      const data = JSON.parse(driveRes.value.stdout);
      const files = (data.files || []).filter(
        (f: Record<string, string>) => f.mimeType !== "application/vnd.google-apps.folder",
      );
      const items = files.slice(0, 10).map((f: Record<string, string>) => `- ${f.name} (${f.mimeType || "file"})`);
      if (items.length) parts.push(`Recent Drive files:\n${items.join("\n")}`);
    } catch { /* skip */ }
  }

  if (tasksRes.status === "fulfilled" && tasksRes.value.success) {
    try {
      const data = JSON.parse(tasksRes.value.stdout);
      const lists = data.taskLists || data.items || [];
      const items = lists.map((l: Record<string, string>) => `- ${l.title || l.name || "Tasks"}`);
      if (items.length) parts.push(`Task lists:\n${items.join("\n")}`);
    } catch { /* skip */ }
  }

  return parts.length > 0 ? parts.join("\n\n") : "";
}

function buildPrompt(context: string): string {
  const contextBlock = context
    ? `Here is what the user currently has in their Google Workspace:\n\n${context}`
    : "The user's Google Workspace context is not available right now. Generate plausible but creative suggestions.";

  return `You are generating 6 creative routine ideas for a Google Workspace AI assistant. These are scheduled automations the user can set up to run on a recurring basis (daily, weekly, monthly, or one-time).

${contextBlock}

Generate exactly 6 routine suggestions. Each should be a JSON object with:
- "title": A short catchy name (3-6 words)
- "instruction": The detailed instruction the AI will execute, written as a direct command (imperative form, 1-2 sentences, under 200 chars)
- "schedule": Suggested frequency — one of "daily", "weekly", "monthly"

IMPORTANT RULES:
- Ideas 1-2: DAILY routines — things that are useful every morning/evening. Examples: morning briefing summaries, end-of-day inbox cleanup, daily standup prep.
- Ideas 3-4: WEEKLY routines — things better done once a week. Examples: weekly email digest, calendar review for the week ahead, drive cleanup, meeting prep summaries.
- Ideas 5-6: ADVANCED/CREATIVE routines — power-user ideas that showcase the system's unique cross-service capabilities. Examples: cross-referencing calendar conflicts with email commitments, analyzing communication patterns, tracking project progress across docs/sheets/email.
- Personalize using REAL file names, email subjects, event names, or task lists from the context when possible.
- Make them feel genuinely useful, not generic. The user should think "oh that's a great idea, I want that."

Respond with ONLY a JSON array of exactly 6 objects, nothing else. Example format:
[{"title":"Morning Briefing","instruction":"Summarize my unread emails and today's calendar events with action items","schedule":"daily"}]`;
}

export async function POST(request: Request) {
  try {
    const { apiKey, model } = (await request.json()) as { apiKey?: string; model?: string };

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 400 });
    }

    const context = await gatherContext();
    const prompt = buildPrompt(context);

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json({ error: "Failed to parse suggestions" }, { status: 500 });
    }

    const suggestions = JSON.parse(match[0]) as { title: string; instruction: string; schedule: string }[];
    if (!Array.isArray(suggestions) || suggestions.length < 4) {
      return NextResponse.json({ error: "Invalid suggestions format" }, { status: 500 });
    }

    return NextResponse.json({ suggestions: suggestions.slice(0, 6) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
