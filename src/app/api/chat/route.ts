import Anthropic from "@anthropic-ai/sdk";
import { GOG_TOOLS, SYSTEM_PROMPT } from "@/lib/tools";
import { runGogCommand } from "@/lib/gog";

export const maxDuration = 300;

interface ChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  apiKey: string;
  model: string;
  gogAccount?: string;
  maxTokens?: number;
  maxIterations?: number;
  maxContextChars?: number;
  systemPrompt?: string;
}

const GOG_SERVICE_MAP: Record<string, string> = {
  gog_gmail: "gmail",
  gog_calendar: "calendar",
  gog_drive: "drive",
  gog_sheets: "sheets",
  gog_docs: "docs",
  gog_slides: "slides",
  gog_contacts: "contacts",
  gog_tasks: "tasks",
  gog_auth: "auth",
};

function trimMessages(
  messages: Anthropic.Messages.MessageParam[],
  maxContextChars: number = 180_000,
): Anthropic.Messages.MessageParam[] {
  let totalChars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") totalChars += m.content.length;
    else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if ("text" in block && typeof block.text === "string") totalChars += block.text.length;
        if ("content" in block && typeof block.content === "string") totalChars += block.content.length;
      }
    }
  }

  if (totalChars <= maxContextChars) return messages;

  // Keep the system context fresh: drop oldest pairs but always keep last 4 messages
  const keep = Math.max(4, Math.floor(messages.length / 2));
  const trimmed = messages.slice(-keep);

  // Ensure first message is from user
  if (trimmed.length > 0 && trimmed[0].role !== "user") {
    trimmed.shift();
  }

  return trimmed;
}

export async function POST(request: Request) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.apiKey) {
      return Response.json(
        { error: "API key is required. Please add your Anthropic API key in Settings." },
        { status: 400 },
      );
    }

    const client = new Anthropic({ apiKey: body.apiKey });

    const messages: Anthropic.Messages.MessageParam[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (data: Record<string, unknown>) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            closed = true;
          }
        };

        try {
          const cfgMaxTokens = body.maxTokens || 16384;
          const cfgMaxIter = body.maxIterations || 40;
          const cfgMaxCtx = body.maxContextChars || 180_000;
          const cfgSystem = body.systemPrompt
            ? body.systemPrompt + "\n\n" + SYSTEM_PROMPT
            : SYSTEM_PROMPT;

          let continueLoop = true;
          let currentMessages = trimMessages([...messages], cfgMaxCtx);
          let iterationCount = 0;
          let accumulatedText = "";

          while (continueLoop && iterationCount < cfgMaxIter) {
            iterationCount++;

            let response: Anthropic.Messages.Message;
            try {
              response = await client.messages.create({
                model: body.model,
                max_tokens: cfgMaxTokens,
                system: cfgSystem,
                tools: GOG_TOOLS,
                messages: currentMessages,
              });
            } catch (apiErr: unknown) {
              const e = apiErr as { status?: number; message?: string; error?: { message?: string } };

              if (e.status === 429) {
                send({ type: "error", content: "Rate limited by Anthropic. Please wait a moment and try again." });
                break;
              }

              if (e.status === 400 && e.message?.includes("token")) {
                // Context too long — aggressively trim and retry once
                currentMessages = trimMessages(currentMessages.slice(-4), cfgMaxCtx);
                if (currentMessages.length > 0 && currentMessages[0].role !== "user") {
                  currentMessages.shift();
                }
                send({ type: "text", content: "(Conversation was too long — trimmed earlier context to continue.)\n\n" });
                continue;
              }

              throw apiErr;
            }

            let textContent = "";
            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
            let hasToolUse = false;
            const isFollowUp = iterationCount > 1;

            for (const block of response.content) {
              if (block.type === "text") {
                let chunk = block.text;
                if (isFollowUp && !textContent && accumulatedText) {
                  chunk = "\n" + chunk;
                } else if (textContent && !/\s$/.test(textContent) && !/^\s/.test(chunk)) {
                  chunk = " " + chunk;
                }
                textContent += chunk;
                accumulatedText += chunk;
                send({ type: "text", content: chunk });
              } else if (block.type === "tool_use") {
                hasToolUse = true;
                const toolName = block.name;
                const input = block.input as { args: string[] };
                const service = GOG_SERVICE_MAP[toolName];

                if (!service) {
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: `Unknown tool: ${toolName}`,
                    is_error: true,
                  });
                  send({
                    type: "tool_call",
                    tool: toolName,
                    args: input.args,
                    error: `Unknown tool: ${toolName}`,
                  });
                  continue;
                }

                const fullArgs = [service, ...input.args];
                send({
                  type: "tool_call",
                  tool: toolName,
                  command: `gog ${fullArgs.join(" ")}`,
                  status: "running",
                });

                const result = await runGogCommand(fullArgs, body.gogAccount);

                send({
                  type: "tool_result",
                  tool: toolName,
                  command: result.command,
                  output: result.stdout || result.stderr,
                  success: result.success,
                });

                const outputText = result.success
                  ? result.stdout || "(no output)"
                  : `Error: ${result.stderr || result.stdout || "Command failed"}`;

                // Truncate large tool outputs to avoid blowing context
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: outputText.slice(0, 30000),
                  is_error: !result.success,
                });
              }
            }

            if (hasToolUse) {
              currentMessages = [
                ...currentMessages,
                { role: "assistant" as const, content: response.content },
                { role: "user" as const, content: toolResults },
              ];
              // Trim if the agentic loop is getting too large
              currentMessages = trimMessages(currentMessages, cfgMaxCtx);
            } else {
              continueLoop = false;
            }

            if (response.stop_reason === "end_turn") {
              continueLoop = false;
            }
          }

          if (iterationCount >= cfgMaxIter) {
            send({ type: "text", content: "\n\n(Reached maximum number of steps. Please continue in a follow-up message.)" });
          }

          send({ type: "done" });
          if (!closed) controller.close();
        } catch (err: unknown) {
          const error = err as { status?: number; message?: string };
          let errorMsg = "An error occurred while processing your request.";

          if (error.status === 401) {
            errorMsg = "Invalid API key. Please check your Anthropic API key in Settings.";
          } else if (error.status === 429) {
            errorMsg = "Rate limited. Please wait a moment and try again.";
          } else if (error.status === 400) {
            errorMsg = `Bad request: ${error.message || "Please check your input."}`;
          } else if (error.status === 413) {
            errorMsg = "Conversation too long. Please start a new chat.";
          } else if (error.message) {
            errorMsg = error.message;
          }

          send({ type: "error", content: errorMsg });
          if (!closed) controller.close();
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
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}
