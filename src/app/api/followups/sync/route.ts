import { NextResponse } from "next/server";
import {
  findOrCreateFolder,
  findFollowUpsFile,
  uploadFollowUps,
  downloadFollowUps,
} from "@/lib/drive-sync";
import type { FollowUp } from "@/lib/types";

export const maxDuration = 60;

// POST: Push local follow-ups to Drive
export async function POST(request: Request) {
  try {
    const { followUps, driveFileId } = (await request.json()) as {
      followUps: FollowUp[];
      driveFileId?: string;
    };

    if (!Array.isArray(followUps)) {
      return NextResponse.json({ error: "Invalid followUps data" }, { status: 400 });
    }

    const folderId = await findOrCreateFolder();

    // If caller doesn't know the Drive file ID, look it up
    let fileId = driveFileId;
    if (!fileId) {
      const existing = await findFollowUpsFile(folderId);
      if (existing) fileId = existing.id;
    }

    const newFileId = await uploadFollowUps(followUps, folderId, fileId);

    return NextResponse.json({
      success: true,
      driveFileId: newFileId,
      count: followUps.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Follow-up sync push failed: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

// GET: Pull follow-ups from Drive
export async function GET() {
  try {
    const folderId = await findOrCreateFolder();
    const file = await findFollowUpsFile(folderId);

    if (!file) {
      return NextResponse.json({
        success: true,
        followUps: [],
        driveFileId: null,
        count: 0,
      });
    }

    const followUps = await downloadFollowUps(file.id);

    return NextResponse.json({
      success: true,
      followUps,
      driveFileId: file.id,
      count: followUps.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Follow-up sync pull failed: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
