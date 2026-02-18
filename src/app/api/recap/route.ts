import Anthropic from "@anthropic-ai/sdk";
import { runGogCommand, getDefaultAccount } from "@/lib/gog";

export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await request.json();
  const { startDate, endDate, apiKey, model } = body as {
    startDate: string;
    endDate: string;
    apiKey: string;
    model: string;
  };

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const account = await getDefaultAccount();

  const [emailsResult, calendarResult, driveResult, tasksResult] =
    await Promise.allSettled([
      runGogCommand(
        [
          "gmail",
          "search",
          `after:${startDate.replace(/-/g, "/")} before:${endDate.replace(/-/g, "/")} in:sent`,
          "--max",
          "50",
          "--json",
        ],
        account,
      ),
      runGogCommand(
        ["calendar", "events", "--max", "50", "--json"],
        account,
      ),
      runGogCommand(
        [
          "drive",
          "search",
          `modifiedTime > '${startDate}T00:00:00' and modifiedTime < '${endDate}T23:59:59' and trashed = false`,
          "--raw-query",
          "--max",
          "30",
          "--json",
        ],
        account,
      ),
      runGogCommand(["tasks", "list", "--max", "50", "--json"], account),
    ]);

  const gather = (r: PromiseSettledResult<{ success: boolean; stdout: string }>) => {
    if (r.status === "fulfilled" && r.value.success) return r.value.stdout;
    return "[]";
  };

  const rawData = {
    emailsSent: gather(emailsResult),
    calendarEvents: gather(calendarResult),
    driveFiles: gather(driveResult),
    tasks: gather(tasksResult),
  };

  const recapPrompt = `You are generating an activity recap for the period ${startDate} to ${endDate}.

Here is the raw data gathered from the user's Google Workspace:

## Emails Sent
${rawData.emailsSent}

## Drive Files Modified
${rawData.driveFiles}

## Tasks
${rawData.tasks}

## Calendar Events
${rawData.calendarEvents}

Generate a clear, well-structured recap with these sections in this exact order:
1. **Summary** - 2-3 sentences max. Focus on key achievements and important decisions only. Do not list routine meetings.
2. **Key Emails** - Important emails sent, grouped by topic. Count total. Skip routine/automated emails.
3. **Work Done** - Documents, sheets, and files modified. Focus on what was accomplished.
4. **Tasks** - Tasks completed or added during this period.
5. **Meetings** - Brief list of notable meetings only. Skip routine standups unless something important happened.

Use markdown formatting with ## for section headers. Be concise. If a section has no meaningful data, skip it entirely.`;

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: model || "claude-opus-4-6",
          max_tokens: 4096,
          system: "You are a productivity assistant generating brief, actionable activity recaps. Focus on achievements, not routine. Keep it tight.",
          messages: [{ role: "user", content: recapPrompt }],
          stream: true,
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            "delta" in event &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text", content: event.delta.text })}\n\n`),
            );
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`),
        );
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", content: (error as Error).message })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
