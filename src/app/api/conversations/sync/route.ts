import { NextResponse } from "next/server";
import {
  findOrCreateFolder,
  uploadConversation,
  pullAllConversations,
  saveLocalBackup,
} from "@/lib/drive-sync";
import type { Conversation } from "@/lib/types";

export const maxDuration = 120;

// POST: Push local conversations to Drive
export async function POST(request: Request) {
  try {
    const { conversations } = (await request.json()) as { conversations: Conversation[] };

    if (!Array.isArray(conversations)) {
      return NextResponse.json({ error: "Invalid conversations data" }, { status: 400 });
    }

    // Always save local backup first
    saveLocalBackup(conversations);

    const folderId = await findOrCreateFolder();
    const results: { id: string; driveFileId: string; success: boolean; error?: string }[] = [];

    for (const conv of conversations) {
      if (!conv.id || conv.messages.length === 0) continue;

      try {
        const driveFileId = await uploadConversation(conv, folderId);
        results.push({ id: conv.id, driveFileId, success: true });
      } catch (error) {
        results.push({
          id: conv.id,
          driveFileId: conv.driveFileId || "",
          success: false,
          error: (error as Error).message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      folderId,
      results,
      synced: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Sync push failed: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

// GET: Pull conversations from Drive
export async function GET() {
  try {
    const folderId = await findOrCreateFolder();
    const remoteConversations = await pullAllConversations(folderId);

    return NextResponse.json({
      success: true,
      folderId,
      conversations: remoteConversations,
      count: remoteConversations.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Sync pull failed: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
