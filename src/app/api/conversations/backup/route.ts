import { NextResponse } from "next/server";
import { saveLocalBackup, loadLocalBackup } from "@/lib/drive-sync";
import type { Conversation } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { conversations } = (await request.json()) as { conversations: Conversation[] };

    if (!Array.isArray(conversations)) {
      return NextResponse.json({ error: "Invalid conversations data" }, { status: 400 });
    }

    saveLocalBackup(conversations);

    return NextResponse.json({
      success: true,
      count: conversations.length,
      message: `Backed up ${conversations.length} conversations to local file`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Backup failed: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const conversations = loadLocalBackup();
    return NextResponse.json({
      success: true,
      conversations,
      count: conversations.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Load failed: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
