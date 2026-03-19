import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { hostname, userInfo } from "os";

const execFileAsync = promisify(execFile);

const COMMAND_TIMEOUT = 30_000;

function deriveKeyringPassword(): string {
  if (process.env.GOG_KEYRING_PASSWORD) return process.env.GOG_KEYRING_PASSWORD;
  const seed = `gogchat-${hostname()}-${userInfo().username}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

const KEYRING_PASSWORD = deriveKeyringPassword();

export function gogEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GOG_KEYRING_PASSWORD: KEYRING_PASSWORD,
  };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      env[k] = v;
    }
  }
  return env;
}

const isWindows = process.platform === "win32";

function getCandidatePaths(): string[] {
  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA || "";
    const userProfile = process.env.USERPROFILE || "";
    return [
      ...(localAppData ? [join(localAppData, "Programs", "gogcli", "gog.exe")] : []),
      ...(userProfile ? [
        join(userProfile, "gog.exe"),
        join(userProfile, "Downloads", "gog.exe"),
      ] : []),
      "C:\\Program Files\\gogcli\\gog.exe",
      "C:\\Program Files (x86)\\gogcli\\gog.exe",
    ];
  }
  return [
    "/opt/homebrew/bin/gog",   // Apple Silicon
    "/usr/local/bin/gog",      // Intel Mac
    "/home/linuxbrew/.linuxbrew/bin/gog",
  ];
}

function resolveGogPath(): string {
  const whichCmd = isWindows ? "where" : "which";
  const binName = isWindows ? "gog.exe" : "gog";

  try {
    const result = execFileSync(whichCmd, [binName], { timeout: 3000, encoding: "utf-8" });
    const p = result.trim().split(/\r?\n/)[0];
    if (p) return p;
  } catch { /* not on PATH */ }

  for (const p of getCandidatePaths()) {
    if (existsSync(p)) return p;
  }

  return binName;
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

export async function runGogCommand(
  args: string[],
  account?: string,
): Promise<GogResult> {
  // execFile bypasses the shell, so args are passed directly to the process
  // and don't need shell metacharacter sanitization.
  const accountFlag = account ? ["--account", account] : [];
  const fullArgs = [...args, ...accountFlag];
  const displayCommand = ["gog", ...fullArgs].join(" ");

  try {
    const { stdout, stderr } = await execFileAsync(gogBin(), fullArgs, {
      timeout: COMMAND_TIMEOUT,
      env: gogEnv(account ? { GOG_ACCOUNT: account } : undefined),
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
      const result = await execFileAsync(gogBin(), ["--version"], { timeout: 5000, env: gogEnv() });
      version = result.stdout.trim();
    } catch {
      try {
        const result = await execFileAsync(gogBin(), ["version"], { timeout: 5000, env: gogEnv() });
        version = result.stdout.trim();
      } catch { /* use default */ }
    }

    let accounts: string[] = [];
    try {
      const acctResult = await execFileAsync(gogBin(), ["auth", "list", "--json"], { timeout: 5000, env: gogEnv() });
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
        const acctResult = await execFileAsync(gogBin(), ["auth", "list"], { timeout: 5000, env: gogEnv() });
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
    const result = await execFileAsync(gogBin(), ["auth", "list"], { timeout: 5000, env: gogEnv() });
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
