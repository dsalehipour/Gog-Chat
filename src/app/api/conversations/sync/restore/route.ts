import { NextResponse } from "next/server";
import { pullAllConversations } from "@/lib/drive-sync";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { folderId } = (await request.json()) as { folderId?: string };

    if (!folderId || typeof folderId !== "string" || folderId.trim().length < 10) {
      return NextResponse.json(
        { error: "A valid Google Drive folder ID is required." },
        { status: 400 },
      );
    }

    const conversations = await pullAllConversations(folderId.trim());

    return NextResponse.json({
      success: true,
      conversations,
      count: conversations.length,
      folderId: folderId.trim(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Restore failed: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
