import { runGogCommand, getDefaultAccount } from "./gog";
import type { Conversation } from "./types";
import { writeFileSync, readFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const FOLDER_NAME = "GogChat";

function tempPath(name: string): string {
  return join(tmpdir(), `gc_sync_${name}`);
}

interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
}

export async function findOrCreateFolder(): Promise<string> {
  const account = await getDefaultAccount();
  const search = await runGogCommand(
    ["drive", "search", `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, "--json"],
    account,
  );

  if (search.success && search.stdout) {
    try {
      const results = JSON.parse(search.stdout);
      const files = Array.isArray(results) ? results : results?.files || results?.results || [];
      if (files.length > 0) {
        return files[0].id;
      }
    } catch {
      // parse failed, create new
    }
  }

  const mkdir = await runGogCommand(
    ["drive", "mkdir", FOLDER_NAME, "--json"],
    account,
  );

  if (mkdir.success && mkdir.stdout) {
    try {
      const result = JSON.parse(mkdir.stdout);
      return result.id || result.fileId || result.Id;
    } catch {
      // Try to extract ID from non-JSON output
      const idMatch = mkdir.stdout.match(/[a-zA-Z0-9_-]{20,}/);
      if (idMatch) return idMatch[0];
    }
  }

  throw new Error(`Failed to create GogChat folder: ${mkdir.stderr || mkdir.stdout}`);
}

export async function uploadConversation(
  conv: Conversation,
  folderId: string,
): Promise<string> {
  const fileName = `conv_${conv.id}.json`;
  const tempFile = tempPath(fileName);

  try {
    writeFileSync(tempFile, JSON.stringify(conv, null, 2), "utf-8");

    let result;

    const account = await getDefaultAccount();

    if (conv.driveFileId) {
      result = await runGogCommand(
        ["drive", "upload", tempFile, "--replace", conv.driveFileId, "--json", "--force"],
        account,
      );
    } else {
      result = await runGogCommand(
        ["drive", "upload", tempFile, "--parent", folderId, "--name", fileName, "--json", "--force"],
        account,
      );
    }

    if (result.success && result.stdout) {
      try {
        const parsed = JSON.parse(result.stdout);
        const id = parsed.id || parsed.file?.id || parsed.fileId || parsed.Id;
        if (id) return id;
      } catch {
        // fall through
      }
      const idMatch = result.stdout.match(/[a-zA-Z0-9_-]{20,}/);
      if (idMatch) return idMatch[0];
    }

    if (!result.success) {
      throw new Error(`Upload failed: ${result.stderr}`);
    }

    return conv.driveFileId || "";
  } finally {
    try { unlinkSync(tempFile); } catch { /* ignore */ }
  }
}

export async function listDriveConversations(folderId: string): Promise<DriveFile[]> {
  const account = await getDefaultAccount();
  const result = await runGogCommand(
    ["drive", "search", `'${folderId}' in parents and name contains 'conv_' and trashed = false`, "--json"],
    account,
  );

  if (!result.success || !result.stdout) return [];

  try {
    const parsed = JSON.parse(result.stdout);
    const files = Array.isArray(parsed) ? parsed : parsed?.files || parsed?.results || [];
    return files.map((f: Record<string, string>) => ({
      id: f.id || f.Id,
      name: f.name || f.Name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
    }));
  } catch {
    return [];
  }
}

export async function downloadConversation(fileId: string): Promise<Conversation | null> {
  const tempFile = tempPath(`download_${fileId}.json`);

  try {
    const account = await getDefaultAccount();
    const result = await runGogCommand(
      ["drive", "download", fileId, "--out", tempFile, "--force"],
      account,
    );

    if (!result.success) {
      // Try reading anyway in case the file was partially written
      try {
        const content = readFileSync(tempFile, "utf-8");
        return JSON.parse(content);
      } catch {
        return null;
      }
    }

    try {
      const content = readFileSync(tempFile, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  } finally {
    try { unlinkSync(tempFile); } catch { /* ignore */ }
  }
}

export async function pullAllConversations(folderId: string): Promise<Conversation[]> {
  const files = await listDriveConversations(folderId);

  // De-duplicate: for files with the same name, keep the most recently modified
  const byName = new Map<string, DriveFile>();
  for (const file of files) {
    const existing = byName.get(file.name);
    if (!existing || (file.modifiedTime || "") > (existing.modifiedTime || "")) {
      byName.set(file.name, file);
    }
  }

  const uniqueFiles = Array.from(byName.values());
  const conversations: Conversation[] = [];

  for (const file of uniqueFiles) {
    const conv = await downloadConversation(file.id);
    if (conv && conv.id) {
      conv.driveFileId = file.id;
      conversations.push(conv);
    }
  }

  return conversations;
}

export function mergeConversations(
  local: Conversation[],
  remote: Conversation[],
): Conversation[] {
  const merged = new Map<string, Conversation>();

  for (const conv of local) {
    merged.set(conv.id, conv);
  }

  for (const conv of remote) {
    const existing = merged.get(conv.id);
    if (!existing) {
      merged.set(conv.id, conv);
    } else {
      // Newer updatedAt wins; preserve driveFileId from remote
      if (conv.updatedAt > existing.updatedAt) {
        merged.set(conv.id, { ...conv, driveFileId: conv.driveFileId || existing.driveFileId });
      } else {
        merged.set(conv.id, { ...existing, driveFileId: conv.driveFileId || existing.driveFileId });
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

// Local file backup
const DATA_DIR = join(process.cwd(), "data");
let lastBackupTime = 0;
const BACKUP_INTERVAL_MS = 60_000; // At most one timestamped backup per minute

export function saveLocalBackup(conversations: Conversation[]): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
  } catch { /* exists */ }

  const backupPath = join(DATA_DIR, "conversations_backup.json");
  writeFileSync(backupPath, JSON.stringify(conversations, null, 2), "utf-8");

  const now = Date.now();
  if (now - lastBackupTime > BACKUP_INTERVAL_MS) {
    lastBackupTime = now;
    const timestampedPath = join(DATA_DIR, `conversations_backup_${now}.json`);
    writeFileSync(timestampedPath, JSON.stringify(conversations, null, 2), "utf-8");

    // Clean old timestamped backups, keep last 5
    try {
      const { readdirSync } = require("fs");
      const files: string[] = readdirSync(DATA_DIR)
        .filter((f: string) => f.startsWith("conversations_backup_") && f.endsWith(".json"))
        .sort()
        .reverse();
      for (const f of files.slice(5)) {
        try { unlinkSync(join(DATA_DIR, f)); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
}

export function loadLocalBackup(): Conversation[] {
  try {
    const backupPath = join(DATA_DIR, "conversations_backup.json");
    const content = readFileSync(backupPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}
