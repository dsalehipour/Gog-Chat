import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { runGogCommand, getDefaultAccount } from "@/lib/gog";

export const maxDuration = 60;

interface SuggestionContext {
  emails: string[];
  events: string[];
  files: string[];
  sheets: string[];
  tasks: string[];
}

async function gatherContext(): Promise<SuggestionContext> {
  const account = await getDefaultAccount();
  const ctx: SuggestionContext = { emails: [], events: [], files: [], sheets: [], tasks: [] };

  const [emailsRes, calRes, driveRes, tasksRes] = await Promise.allSettled([
    runGogCommand(["gmail", "search", "in:inbox", "--max", "8", "--json"], account),
    runGogCommand(["calendar", "events", "--max", "8", "--today", "--json"], account),
    runGogCommand(
      ["drive", "search", "viewedByMeTime > '2000-01-01' and trashed = false", "--raw-query", "--max", "8", "--json"],
      account,
    ),
    runGogCommand(["tasks", "list", "--json"], account),
  ]);

  if (emailsRes.status === "fulfilled" && emailsRes.value.success) {
    try {
      const data = JSON.parse(emailsRes.value.stdout);
      ctx.emails = (data.threads || []).map((t: Record<string, string>) => {
        const subj = t.subject || "(no subject)";
        const from = (t.from || "unknown").replace(/"/g, "");
        return JSON.stringify(subj) + " from " + from;
      });
    } catch { /* skip */ }
  }

  if (calRes.status === "fulfilled" && calRes.value.success) {
    try {
      const data = JSON.parse(calRes.value.stdout);
      ctx.events = (data.events || []).map((e: Record<string, string | Record<string, string>>) => {
        const start = e.start as Record<string, string> | undefined;
        const time = start?.dateTime
          ? new Date(start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : "all-day";
        const summary = e.summary || "(untitled)";
        return JSON.stringify(summary) + " at " + time;
      });
    } catch { /* skip */ }
  }

  if (driveRes.status === "fulfilled" && driveRes.value.success) {
    try {
      const data = JSON.parse(driveRes.value.stdout);
      const files = (data.files || []).filter(
        (f: Record<string, string>) => f.mimeType !== "application/vnd.google-apps.folder",
      );
      for (const f of files.slice(0, 8)) {
        const entry = JSON.stringify(f.name) + " (" + (f.mimeType || "file") + ")";
        if (f.mimeType === "application/vnd.google-apps.spreadsheet") {
          ctx.sheets.push(f.name);
        }
        ctx.files.push(entry);
      }
    } catch { /* skip */ }
  }

  if (tasksRes.status === "fulfilled" && tasksRes.value.success) {
    try {
      const data = JSON.parse(tasksRes.value.stdout);
      const lists = data.taskLists || data.items || [];
      for (const list of lists) {
        const name = list.title || list.name || "Tasks";
        ctx.tasks.push(name);
      }
    } catch { /* skip */ }
  }

  return ctx;
}

function buildPrompt(ctx: SuggestionContext): string {
  const parts: string[] = [];

  if (ctx.emails.length > 0) parts.push(`Recent inbox emails:\n${ctx.emails.map((e) => `- ${e}`).join("\n")}`);
  if (ctx.events.length > 0) parts.push(`Today's calendar:\n${ctx.events.map((e) => `- ${e}`).join("\n")}`);
  if (ctx.files.length > 0) parts.push(`Recent Drive files:\n${ctx.files.map((f) => `- ${f}`).join("\n")}`);
  if (ctx.sheets.length > 0) parts.push(`Spreadsheets the user has:\n${ctx.sheets.map((s) => `- ${s}`).join("\n")}`);
  if (ctx.tasks.length > 0) parts.push(`Task lists:\n${ctx.tasks.map((t) => `- ${t}`).join("\n")}`);

  const contextBlock = parts.length > 0
    ? `Here is what the user currently has in their Google Workspace:\n\n${parts.join("\n\n")}`
    : "The user's Google Workspace context is not available right now. Generate plausible but generic suggestions.";

  return `You are generating 4 short suggestion prompts for a Google Workspace AI assistant called Gog Chat. These appear as clickable cards on the new-conversation screen. The user will click one to start a chat.

${contextBlock}

Generate exactly 4 suggestions. They must be written as direct instructions/questions the user would say to the assistant (first-person, imperative or question form). Keep each under 100 characters.

IMPORTANT RULES:
- Suggestions 1 and 2 must be ADVANCED, multi-service power-user prompts that showcase the system's unique capabilities. Examples of the caliber expected:
  * Analyzing a specific spreadsheet the user has, finding patterns, and proposing edits
  * Cross-referencing emails, calendar, and documents to surface insights or solve a problem
  * Reading through recent communications and files to identify blockers or opportunities
  * Combining data from multiple Google services to produce a novel analysis
  Reference REAL file names, email subjects, event names, or task lists from the context above when possible.
- Suggestions 3 and 4 must be SIMPLER, everyday tasks that are still useful — things like checking today's schedule, summarizing unread emails, listing tasks, etc. Still personalize them using the context when possible.

Respond with ONLY a JSON array of exactly 4 strings, nothing else. Example format:
["suggestion 1", "suggestion 2", "suggestion 3", "suggestion 4"]`;
}

export async function POST(request: Request) {
  try {
    const { apiKey, model } = (await request.json()) as { apiKey?: string; model?: string };

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 400 });
    }

    const ctx = await gatherContext();
    const prompt = buildPrompt(ctx);

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: 300,
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

    const suggestions: string[] = JSON.parse(match[0]);
    if (!Array.isArray(suggestions) || suggestions.length < 4) {
      return NextResponse.json({ error: "Invalid suggestions format" }, { status: 500 });
    }

    return NextResponse.json({ suggestions: suggestions.slice(0, 4) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
