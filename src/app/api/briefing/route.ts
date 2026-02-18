import { NextResponse } from "next/server";
import { runGogCommand, getDefaultAccount } from "@/lib/gog";

export const maxDuration = 60;

interface BriefingItem {
  id: string;
  text: string;
  detail?: string;
  url?: string;
  startTime?: string;
  endTime?: string;
  from?: string;
  threadId?: string;
}

interface BriefingSection {
  title: string;
  items: BriefingItem[];
}

export async function GET() {
  const account = await getDefaultAccount();

  const [emailsResult, calendarResult, driveResult] =
    await Promise.allSettled([
      runGogCommand(
        ["gmail", "search", "in:inbox", "--max", "10", "--json"],
        account,
      ),
      runGogCommand(["calendar", "events", "--max", "10", "--json"], account),
      runGogCommand(
        [
          "drive",
          "search",
          "viewedByMeTime > '2000-01-01' and trashed = false",
          "--raw-query",
          "--max",
          "5",
          "--json",
        ],
        account,
      ),
    ]);

  const sections: BriefingSection[] = [];

  if (emailsResult.status === "fulfilled" && emailsResult.value.success) {
    try {
      const data = JSON.parse(emailsResult.value.stdout);
      const threads = data.threads || [];
      sections.push({
        title: "Inbox",
        items: threads.map(
          (t: Record<string, string>) => ({
            id: t.id,
            threadId: t.threadId || t.id,
            text: t.subject || "(no subject)",
            detail: t.from?.replace(/<[^>]+>/g, "").replace(/"/g, "").trim(),
            from: t.from,
            url: `https://mail.google.com/mail/u/0/#inbox/${t.threadId || t.id}`,
          }),
        ),
      });
    } catch {
      sections.push({ title: "Inbox", items: [] });
    }
  } else {
    sections.push({ title: "Inbox", items: [] });
  }

  if (calendarResult.status === "fulfilled" && calendarResult.value.success) {
    try {
      const data = JSON.parse(calendarResult.value.stdout);
      const events = data.events || [];
      sections.push({
        title: "Today's Events",
        items: events.map(
          (e: Record<string, string | Record<string, string>>) => {
            const start = e.start as Record<string, string> | undefined;
            const end = e.end as Record<string, string> | undefined;
            const startDt = start?.dateTime || start?.date || "";
            const endDt = end?.dateTime || end?.date || "";
            let timeStr = "";
            try {
              timeStr = startDt
                ? new Date(startDt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "";
            } catch {
              timeStr = startDt;
            }
            return {
              id: e.id as string,
              text: (e.summary as string) || "(untitled)",
              detail: timeStr,
              url: e.htmlLink as string,
              startTime: startDt,
              endTime: endDt,
            };
          },
        ),
      });
    } catch {
      sections.push({ title: "Today's Events", items: [] });
    }
  } else {
    sections.push({ title: "Today's Events", items: [] });
  }

  if (driveResult.status === "fulfilled" && driveResult.value.success) {
    try {
      const data = JSON.parse(driveResult.value.stdout);
      const files = (data.files || []).filter(
        (f: Record<string, string>) =>
          f.mimeType !== "application/vnd.google-apps.folder",
      );
      sections.push({
        title: "Recent Files",
        items: files.slice(0, 5).map(
          (f: Record<string, string>) => ({
            id: f.id,
            text: f.name,
            detail: f.modifiedTime
              ? new Date(f.modifiedTime).toLocaleDateString()
              : undefined,
            url: f.webViewLink,
          }),
        ),
      });
    } catch {
      sections.push({ title: "Recent Files", items: [] });
    }
  } else {
    sections.push({ title: "Recent Files", items: [] });
  }

  return NextResponse.json({ sections, timestamp: Date.now() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action, threadId } = body as { action: string; threadId: string };

  if (action === "archive" && threadId) {
    const account = await getDefaultAccount();
    const result = await runGogCommand(
      ["gmail", "thread", "modify", threadId, "--remove", "INBOX"],
      account,
    );
    if (result.success) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: result.stderr || "Failed to archive" }, { status: 500 });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
