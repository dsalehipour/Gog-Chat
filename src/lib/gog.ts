import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

const COMMAND_TIMEOUT = 30_000;

const HOMEBREW_PATHS = [
  "/opt/homebrew/bin/gog",   // Apple Silicon
  "/usr/local/bin/gog",      // Intel Mac
  "/home/linuxbrew/.linuxbrew/bin/gog",
];

function resolveGogPath(): string {
  // Try `which gog` first (works if PATH is correct)
  try {
    const result = execFileSync("which", ["gog"], { timeout: 3000, encoding: "utf-8" });
    const p = result.trim();
    if (p) return p;
  } catch { /* not on PATH */ }

  // Check common Homebrew install locations
  for (const p of HOMEBREW_PATHS) {
    if (existsSync(p)) return p;
  }

  // Fall back to bare name — will produce a clear ENOENT if missing
  return "gog";
}

let _gogBin: string | null = null;

export function gogBin(): string {
  if (!_gogBin) _gogBin = resolveGogPath();
  return _gogBin;
}

export interface GogResult {
  stdout: string;
  stderr: string;
  success: boolean;
  command: string;
}

function sanitizeArg(arg: string): string {
  return arg.replace(/[;&|`${}]/g, "");
}

export async function runGogCommand(
  args: string[],
  account?: string,
): Promise<GogResult> {
  const sanitizedArgs = args.map(sanitizeArg);
  const accountFlag = account ? ["--account", sanitizeArg(account)] : [];
  const fullArgs = [...sanitizedArgs, ...accountFlag];
  const displayCommand = ["gog", ...fullArgs].join(" ");

  try {
    const { stdout, stderr } = await execFileAsync(gogBin(), fullArgs, {
      timeout: COMMAND_TIMEOUT,
      env: {
        ...process.env,
        ...(account ? { GOG_ACCOUNT: account } : {}),
      },
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), success: true, command: displayCommand };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      stdout: err.stdout?.trim() || "",
      stderr: err.stderr?.trim() || err.message || "Command failed",
      success: false,
      command: displayCommand,
    };
  }
}

export async function checkGogInstalled(): Promise<{
  installed: boolean;
  version?: string;
  accounts?: string[];
}> {
  try {
    let version = "unknown";
    try {
      const result = await execFileAsync(gogBin(), ["--version"], { timeout: 5000 });
      version = result.stdout.trim();
    } catch {
      try {
        const result = await execFileAsync(gogBin(), ["version"], { timeout: 5000 });
        version = result.stdout.trim();
      } catch { /* use default */ }
    }

    let accounts: string[] = [];
    try {
      const acctResult = await execFileAsync(gogBin(), ["auth", "list", "--json"], { timeout: 5000 });
      const raw = acctResult.stdout.trim();
      try {
        const parsed = JSON.parse(raw);
        accounts = Array.isArray(parsed) ? parsed : [];
      } catch {
        accounts = raw
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.includes("@"));
      }
    } catch {
      try {
        const acctResult = await execFileAsync(gogBin(), ["auth", "list"], { timeout: 5000 });
        const raw = acctResult.stdout.trim();
        accounts = raw
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.includes("@"));
      } catch { /* no accounts */ }
    }

    return { installed: true, version, accounts };
  } catch {
    return { installed: false };
  }
}

let cachedAccount: string | null = null;

export async function getDefaultAccount(): Promise<string | undefined> {
  if (cachedAccount) return cachedAccount;
  try {
    const result = await execFileAsync(gogBin(), ["auth", "list"], { timeout: 5000 });
    const lines = result.stdout.trim().split("\n");
    for (const line of lines) {
      const match = line.match(/\S+@\S+\.\S+/);
      if (match) {
        cachedAccount = match[0];
        return cachedAccount;
      }
    }
  } catch { /* no account */ }
  return undefined;
}
