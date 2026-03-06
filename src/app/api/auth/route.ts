import { NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { gogBin, gogEnv } from "@/lib/gog";

const execFileAsync = promisify(execFile);

const GOG_NOT_FOUND_MSG = process.platform === "win32"
  ? "The gog CLI is not installed. Download it from https://github.com/steipete/gogcli/releases, extract gog.exe, and add it to your PATH — then refresh this page."
  : "The gog CLI is not installed. Install it first with: brew install steipete/tap/gogcli — then refresh this page.";

/**
 * POST /api/auth — store client credentials and/or authorize a Google account
 *
 * Body (JSON):
 *   { action: "store-credentials", credentials: <client_secret JSON string> }
 *   { action: "authorize", email: string }
 *   { action: "check" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "check") {
      return await checkCredentials();
    }

    if (action === "store-credentials") {
      return await storeCredentials(body.credentials);
    }

    if (action === "authorize") {
      return await authorizeAccount(body.email);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Auth operation failed" },
      { status: 500 },
    );
  }
}

async function checkCredentials(): Promise<NextResponse> {
  try {
    const result = await execFileAsync(gogBin(), ["auth", "credentials", "list"], {
      timeout: 10_000,
      env: gogEnv(),
    });
    const hasCredentials = result.stdout.trim().length > 0 && !result.stdout.includes("No credentials");
    return NextResponse.json({ hasCredentials, output: result.stdout.trim() });
  } catch {
    return NextResponse.json({ hasCredentials: false });
  }
}

async function storeCredentials(credentialsJson: string): Promise<NextResponse> {
  if (!credentialsJson) {
    return NextResponse.json({ error: "No credentials provided" }, { status: 400 });
  }

  // Validate it's a proper Google OAuth client secret
  try {
    const parsed = JSON.parse(credentialsJson);
    if (!parsed.installed && !parsed.web) {
      return NextResponse.json(
        { error: "Invalid credentials file. Expected a Google OAuth client secret JSON with an 'installed' or 'web' key." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in credentials file" },
      { status: 400 },
    );
  }

  // Write to a temp file, then pass to gog
  const tmpPath = join(tmpdir(), `gog-credentials-${Date.now()}.json`);
  try {
    await writeFile(tmpPath, credentialsJson, "utf-8");

    const result = await execFileAsync(gogBin(), ["auth", "credentials", tmpPath], {
      timeout: 15_000,
      env: gogEnv(),
    });

    return NextResponse.json({
      success: true,
      message: "Credentials stored successfully",
      output: result.stdout.trim(),
    });
  } catch (error) {
    const err = error as { code?: string; stderr?: string; message?: string };
    if (err.code === "ENOENT" || err.message?.includes("ENOENT")) {
      return NextResponse.json({ error: GOG_NOT_FOUND_MSG }, { status: 500 });
    }
    return NextResponse.json(
      { error: `Failed to store credentials: ${err.stderr || err.message}` },
      { status: 500 },
    );
  } finally {
    try { await unlink(tmpPath); } catch { /* ignore cleanup errors */ }
  }
}

async function authorizeAccount(email: string): Promise<NextResponse> {
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  // Verify credentials exist by asking gog directly (works cross-platform)
  try {
    const check = await execFileAsync(gogBin(), ["auth", "credentials", "list"], {
      timeout: 10_000,
      env: gogEnv(),
    });
    if (!check.stdout.trim() || check.stdout.includes("No credentials")) {
      return NextResponse.json(
        { error: "No OAuth credentials found. Upload your client_secret JSON first." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "No OAuth credentials found. Upload your client_secret JSON first." },
      { status: 400 },
    );
  }

  try {
    // gog auth add opens a browser for OAuth consent
    const result = await execFileAsync(gogBin(), ["auth", "add", email], {
      timeout: 120_000,
      env: gogEnv(),
    });

    return NextResponse.json({
      success: true,
      message: `Account ${email} authorized successfully`,
      output: result.stdout.trim(),
    });
  } catch (error) {
    const err = error as { code?: string; stdout?: string; stderr?: string; message?: string };
    if (err.code === "ENOENT" || err.message?.includes("ENOENT")) {
      return NextResponse.json({ error: GOG_NOT_FOUND_MSG }, { status: 500 });
    }
    const combined = `${err.stdout || ""} ${err.stderr || ""}`;
    if (combined.includes("Authorization received") || combined.includes("authorized") || err.stdout?.includes("success")) {
      return NextResponse.json({
        success: true,
        message: `Account ${email} authorized successfully`,
        output: (err.stdout || "").trim(),
      });
    }
    return NextResponse.json(
      { error: `Authorization failed: ${err.stderr || err.message}` },
      { status: 500 },
    );
  }
}
