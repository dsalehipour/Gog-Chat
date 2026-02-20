import { NextResponse } from "next/server";
import { runGogCommand, getDefaultAccount } from "@/lib/gog";

interface MsgPayload {
  body?: { data?: string };
  headers?: { name: string; value: string }[];
  parts?: MsgPayload[];
  mimeType?: string;
}

function extractBody(payload?: MsgPayload): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  return "";
}

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  const full = searchParams.get("full") === "true";

  if (!threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  const account = await getDefaultAccount();
  const result = await runGogCommand(["gmail", "thread", "get", threadId, "--json"], account);

  if (!result.success || !result.stdout) {
    return NextResponse.json({ error: "Failed to fetch thread" }, { status: 500 });
  }

  try {
    const data = JSON.parse(result.stdout);
    const messages: { id?: string; snippet?: string; payload?: MsgPayload; labelIds?: string[] }[] = data.thread?.messages || [];

    if (full) {
      const subject = messages.length > 0
        ? getHeader(messages[0].payload?.headers || [], "Subject")
        : "";

      const threadMessages = messages.map((msg) => {
        const headers = msg.payload?.headers || [];
        return {
          id: msg.id || "",
          from: getHeader(headers, "From"),
          to: getHeader(headers, "To"),
          cc: getHeader(headers, "Cc"),
          date: getHeader(headers, "Date"),
          snippet: msg.snippet || "",
          body: extractBody(msg.payload).trim(),
          labelIds: msg.labelIds || [],
        };
      });

      return NextResponse.json({
        threadId,
        subject,
        messages: threadMessages,
      });
    }

    const msg = messages[messages.length - 1] || messages[0];
    if (!msg) {
      return NextResponse.json({ snippet: "", to: "", cc: "", bodyPreview: "" });
    }

    const headers = msg.payload?.headers || [];
    const body = extractBody(msg.payload).trim();

    return NextResponse.json({
      snippet: msg.snippet || "",
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      cc: getHeader(headers, "Cc"),
      date: getHeader(headers, "Date"),
      bodyPreview: body.slice(0, 800),
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse thread" }, { status: 500 });
  }
}
