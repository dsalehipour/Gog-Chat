import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gogBin, gogEnv, getDefaultAccount } from "./gog";

const execFileAsync = promisify(execFile);
const EXPORT_TIMEOUT = 120_000;

export interface TranscriptDoc {
  id: string;
  title: string;
  date: string;
  url?: string;
}

export interface FetchedTranscript extends TranscriptDoc {
  text: string;
}

function getCacheDir(): string {
  return join(process.cwd(), ".transcripts-cache");
}

function ensureCacheDir(): void {
  const dir = getCacheDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getCachePath(docId: string): string {
  return join(getCacheDir(), `${docId}.txt`);
}

function readCached(docId: string): string | null {
  const path = getCachePath(docId);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf-8");
  return text.trim() ? text : null;
}

function writeCache(docId: string, text: string): void {
  ensureCacheDir();
  writeFileSync(getCachePath(docId), text, "utf-8");
}

async function runGogLong(
  args: string[],
  account?: string,
): Promise<{ stdout: string; stderr: string; success: boolean }> {
  const accountFlag = account ? ["--account", account] : [];
  const fullArgs = [...args, ...accountFlag];
  try {
    const { stdout, stderr } = await execFileAsync(gogBin(), fullArgs, {
      timeout: EXPORT_TIMEOUT,
      env: gogEnv(account ? { GOG_ACCOUNT: account } : undefined),
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      stdout: err.stdout?.trim() || "",
      stderr: err.stderr?.trim() || err.message || "Command failed",
      success: false,
    };
  }
}

function readTmpFile(path: string): string {
  if (!existsSync(path)) return "";
  const text = readFileSync(path, "utf-8");
  try { unlinkSync(path); } catch { /* best effort cleanup */ }
  return text;
}

export async function discoverStandupDocs(): Promise<TranscriptDoc[]> {
  const account = await getDefaultAccount();

  const result = await runGogLong(
    [
      "drive", "search",
      "name contains 'Standup' and name contains 'Notes by Gemini' and mimeType = 'application/vnd.google-apps.document'",
      "--raw-query",
      "--max", "500",
      "--json",
    ],
    account,
  );

  if (!result.success || !result.stdout) {
    throw new Error(`Failed to search Drive: ${result.stderr}`);
  }

  const data = JSON.parse(result.stdout);
  const files = data.files || [];

  return files
    .map((f: Record<string, string>) => ({
      id: f.id,
      title: f.name,
      date: f.modifiedTime || f.createdTime || "",
      url: f.webViewLink,
    }))
    .sort((a: TranscriptDoc, b: TranscriptDoc) => a.date.localeCompare(b.date));
}

export async function fetchTranscriptText(
  doc: TranscriptDoc,
  onProgress?: (msg: string) => void,
): Promise<FetchedTranscript> {
  const cached = readCached(doc.id);
  if (cached) {
    onProgress?.(`  [cached] ${doc.title}`);
    return { ...doc, text: cached };
  }

  const account = await getDefaultAccount();
  const tmpPath = join(tmpdir(), `transcript-${doc.id}.txt`);

  // Strategy 1: gog docs export --format txt
  const docsResult = await runGogLong(
    ["docs", "export", doc.id, "--format", "txt", "--out", tmpPath],
    account,
  );
  let text = docsResult.success ? readTmpFile(tmpPath) : "";

  // Strategy 2: gog drive export with text/plain MIME
  if (!text.trim()) {
    const driveResult = await runGogLong(
      ["drive", "export", doc.id, "--mime", "text/plain", "--out", tmpPath],
      account,
    );
    text = driveResult.success ? readTmpFile(tmpPath) : "";
  }

  // Strategy 3: gog drive download with format flag
  if (!text.trim()) {
    const dlResult = await runGogLong(
      ["drive", "download", doc.id, "--format", "text/plain", "--out", tmpPath],
      account,
    );
    text = dlResult.success ? readTmpFile(tmpPath) : "";
  }

  if (!text.trim()) {
    throw new Error(`Could not extract text from "${doc.title}" (${doc.id})`);
  }

  writeCache(doc.id, text);
  onProgress?.(`  [fetched] ${doc.title}`);
  return { ...doc, text };
}

export async function fetchAllTranscripts(
  docs: TranscriptDoc[],
  onProgress?: (msg: string) => void,
): Promise<{ fetched: FetchedTranscript[]; errors: Array<{ doc: TranscriptDoc; error: string }> }> {
  ensureCacheDir();
  const fetched: FetchedTranscript[] = [];
  const errors: Array<{ doc: TranscriptDoc; error: string }> = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    onProgress?.(`[${i + 1}/${docs.length}] Fetching "${doc.title}"`);
    try {
      const transcript = await fetchTranscriptText(doc, onProgress);
      fetched.push(transcript);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ doc, error: msg });
      onProgress?.(`  [ERROR] ${msg}`);
    }
  }

  return { fetched, errors };
}

export function getCachedTranscriptIds(): string[] {
  ensureCacheDir();
  return readdirSync(getCacheDir())
    .filter((f) => f.endsWith(".txt"))
    .map((f) => f.replace(".txt", ""));
}

/**
 * Check whether a specific person appears as a speaker in the transcript.
 * Gemini transcripts use the format "SpeakerName: dialogue text".
 * Returns true if a line starts with a pattern like "Darius:" or "Darius Fam:"
 * (case-insensitive first-name match at the start of a line).
 */
export function isSpeakerInTranscript(transcript: FetchedTranscript, speakerFirstName: string): boolean {
  const pattern = new RegExp(`^${speakerFirstName}[^:]*:`, "im");
  return pattern.test(transcript.text);
}

/**
 * Split transcripts into those where the target person speaks vs. those
 * where they're only mentioned (or absent). Both sets are useful:
 * - speakerPresent: use for persona/behavior extraction
 * - speakerAbsent: still useful for DW extraction (people quote decisions)
 */
export function partitionBySpeaker(
  transcripts: FetchedTranscript[],
  speakerFirstName: string,
): { speakerPresent: FetchedTranscript[]; speakerAbsent: FetchedTranscript[] } {
  const speakerPresent: FetchedTranscript[] = [];
  const speakerAbsent: FetchedTranscript[] = [];

  for (const t of transcripts) {
    if (isSpeakerInTranscript(t, speakerFirstName)) {
      speakerPresent.push(t);
    } else {
      speakerAbsent.push(t);
    }
  }

  return { speakerPresent, speakerAbsent };
}
