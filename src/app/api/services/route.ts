import { NextResponse } from "next/server";
import { runGogCommand, getDefaultAccount } from "@/lib/gog";

export interface ServiceItem {
  id: string;
  title: string;
  subtitle?: string;
  url?: string;
  date?: string;
}

async function getRecentSheets(): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["drive", "search", "mimeType = 'application/vnd.google-apps.spreadsheet' and viewedByMeTime > '2000-01-01'", "--raw-query", "--max", "20", "--json"],
    account,
  );
  if (!result.success || !result.stdout) return [];
  try {
    const data = JSON.parse(result.stdout);
    const files = data.files || [];
    return files.map((f: Record<string, string>) => ({
      id: f.id,
      title: f.name,
      subtitle: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : undefined,
      url: f.webViewLink,
    }));
  } catch { return []; }
}

async function getRecentEmails(): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["gmail", "search", "newer_than:7d", "--max", "20", "--json"],
    account,
  );
  if (!result.success || !result.stdout) return [];
  try {
    const data = JSON.parse(result.stdout);
    const threads = data.threads || [];
    return threads.map((t: Record<string, string>) => ({
      id: t.id,
      title: t.subject || "(no subject)",
      subtitle: t.from?.replace(/<[^>]+>/g, "").replace(/"/g, "").trim(),
      date: t.date,
    }));
  } catch { return []; }
}

async function getRecentCalendarEvents(): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["calendar", "events", "--max", "20", "--json"],
    account,
  );
  if (!result.success || !result.stdout) return [];
  try {
    const data = JSON.parse(result.stdout);
    const events = data.events || [];
    return events.map((e: Record<string, string | Record<string, string>>) => ({
      id: e.id,
      title: e.summary || "(untitled)",
      subtitle: e.start ? formatEventTime(e.start as Record<string, string>) : undefined,
      url: e.htmlLink,
    }));
  } catch { return []; }
}

function formatEventTime(start: Record<string, string>): string {
  const dt = start.dateTime || start.date;
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch { return dt; }
}

async function getRecentDriveFiles(): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["drive", "search", "viewedByMeTime > '2000-01-01' and trashed = false", "--raw-query", "--max", "25", "--json"],
    account,
  );
  if (!result.success || !result.stdout) return [];
  try {
    const data = JSON.parse(result.stdout);
    const files = data.files || [];
    return files
      .filter((f: Record<string, string>) => f.mimeType !== "application/vnd.google-apps.folder")
      .slice(0, 20)
      .map((f: Record<string, string>) => ({
        id: f.id,
        title: f.name,
        subtitle: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : undefined,
        url: f.webViewLink,
      }));
  } catch { return []; }
}

async function getRecentDocs(): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["drive", "search", "mimeType = 'application/vnd.google-apps.document' and viewedByMeTime > '2000-01-01'", "--raw-query", "--max", "20", "--json"],
    account,
  );
  if (!result.success || !result.stdout) return [];
  try {
    const data = JSON.parse(result.stdout);
    const files = data.files || [];
    return files.map((f: Record<string, string>) => ({
      id: f.id,
      title: f.name,
      subtitle: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : undefined,
      url: f.webViewLink,
    }));
  } catch { return []; }
}

async function getRecentTasks(): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["tasks", "list", "--max", "20", "--json"],
    account,
  );
  if (!result.success || !result.stdout) return [];
  try {
    const data = JSON.parse(result.stdout);
    const tasks = Array.isArray(data) ? data : data.items || data.tasks || [];
    return tasks.slice(0, 20).map((t: Record<string, string>) => ({
      id: t.id,
      title: t.title || "(untitled)",
      subtitle: t.due ? `Due ${new Date(t.due).toLocaleDateString()}` : t.status,
    }));
  } catch { return []; }
}

async function getRecentContacts(): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["contacts", "list", "--max", "20", "--json"],
    account,
  );
  if (!result.success || !result.stdout) return [];
  try {
    const data = JSON.parse(result.stdout);
    const contacts = Array.isArray(data) ? data : data.connections || data.contacts || [];
    return contacts.slice(0, 20).map((c: Record<string, string | Record<string, string>[]>) => ({
      id: typeof c.resourceName === "string" ? c.resourceName : String(c.id || ""),
      title: Array.isArray(c.names) ? (c.names[0] as Record<string, string>)?.displayName || "" : String(c.name || "(unknown)"),
      subtitle: Array.isArray(c.emailAddresses) ? (c.emailAddresses[0] as Record<string, string>)?.value || "" : String(c.email || ""),
    }));
  } catch { return []; }
}

// --- Search handlers (query-based) ---

async function searchSheets(query: string): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["drive", "search", `name contains '${query}' and mimeType = 'application/vnd.google-apps.spreadsheet'`, "--raw-query", "--max", "20", "--json"],
    account,
  );
  return parseDriveFiles(result);
}

async function searchEmails(query: string): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["gmail", "search", query, "--max", "20", "--json"],
    account,
  );
  if (!result.success || !result.stdout) return [];
  try {
    const data = JSON.parse(result.stdout);
    const threads = data.threads || [];
    return threads.map((t: Record<string, string>) => ({
      id: t.id,
      title: t.subject || "(no subject)",
      subtitle: t.from?.replace(/<[^>]+>/g, "").replace(/"/g, "").trim(),
      date: t.date,
    }));
  } catch { return []; }
}

async function searchCalendar(query: string): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["calendar", "events", "--query", query, "--max", "20", "--json"],
    account,
  );
  if (!result.success || !result.stdout) return [];
  try {
    const data = JSON.parse(result.stdout);
    const events = data.events || [];
    return events.map((e: Record<string, string | Record<string, string>>) => ({
      id: e.id,
      title: e.summary || "(untitled)",
      subtitle: e.start ? formatEventTime(e.start as Record<string, string>) : undefined,
      url: e.htmlLink,
    }));
  } catch { return []; }
}

async function searchDrive(query: string): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["drive", "search", query, "--max", "20", "--json"],
    account,
  );
  return parseDriveFiles(result);
}

async function searchDocs(query: string): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["drive", "search", `name contains '${query}' and mimeType = 'application/vnd.google-apps.document'`, "--raw-query", "--max", "20", "--json"],
    account,
  );
  return parseDriveFiles(result);
}

async function searchTasks(query: string): Promise<ServiceItem[]> {
  const recent = await getRecentTasks();
  const q = query.toLowerCase();
  return recent.filter((t) => t.title.toLowerCase().includes(q));
}

async function searchContacts(query: string): Promise<ServiceItem[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["contacts", "search", query, "--max", "20", "--json"],
    account,
  );
  if (!result.success || !result.stdout) {
    const recent = await getRecentContacts();
    const q = query.toLowerCase();
    return recent.filter((c) => c.title.toLowerCase().includes(q) || (c.subtitle || "").toLowerCase().includes(q));
  }
  try {
    const data = JSON.parse(result.stdout);
    const contacts = Array.isArray(data) ? data : data.connections || data.contacts || [];
    return contacts.slice(0, 20).map((c: Record<string, string | Record<string, string>[]>) => ({
      id: typeof c.resourceName === "string" ? c.resourceName : String(c.id || ""),
      title: Array.isArray(c.names) ? (c.names[0] as Record<string, string>)?.displayName || "" : String(c.name || "(unknown)"),
      subtitle: Array.isArray(c.emailAddresses) ? (c.emailAddresses[0] as Record<string, string>)?.value || "" : String(c.email || ""),
    }));
  } catch { return []; }
}

function parseDriveFiles(result: { success: boolean; stdout: string }): ServiceItem[] {
  if (!result.success || !result.stdout) return [];
  try {
    const data = JSON.parse(result.stdout);
    const files = data.files || [];
    return files
      .filter((f: Record<string, string>) => f.mimeType !== "application/vnd.google-apps.folder")
      .slice(0, 20)
      .map((f: Record<string, string>) => ({
        id: f.id,
        title: f.name,
        subtitle: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : undefined,
        url: f.webViewLink,
      }));
  } catch { return []; }
}

const RECENT_HANDLERS: Record<string, () => Promise<ServiceItem[]>> = {
  sheets: getRecentSheets,
  gmail: getRecentEmails,
  calendar: getRecentCalendarEvents,
  drive: getRecentDriveFiles,
  docs: getRecentDocs,
  tasks: getRecentTasks,
  contacts: getRecentContacts,
};

const SEARCH_HANDLERS: Record<string, (q: string) => Promise<ServiceItem[]>> = {
  sheets: searchSheets,
  gmail: searchEmails,
  calendar: searchCalendar,
  drive: searchDrive,
  docs: searchDocs,
  tasks: searchTasks,
  contacts: searchContacts,
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const service = url.searchParams.get("service");
  const query = url.searchParams.get("query");

  if (!service || !RECENT_HANDLERS[service]) {
    return NextResponse.json({ error: "Invalid service" }, { status: 400 });
  }

  try {
    const items = query
      ? await SEARCH_HANDLERS[service](query)
      : await RECENT_HANDLERS[service]();
    return NextResponse.json({ service, items, searched: !!query });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch ${service}: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
