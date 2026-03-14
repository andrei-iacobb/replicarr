import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getQueue, getQualityProfiles } from "@/lib/arr";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [sonarrProfiles, radarrProfiles] = await Promise.all([
      getQualityProfiles(config.sonarrLowq).catch(() => []),
      getQualityProfiles(config.radarrLowq).catch(() => []),
    ]);

    const [sonarrQueue, radarrQueue] = await Promise.all([
      getQueue(config.sonarrLowq).catch(() => ({ records: [] })),
      getQueue(config.radarrLowq).catch(() => ({ records: [] })),
    ]);

    const approvals = await prisma.approvedItem.findMany();

    const stats = {
      total: approvals.length,
      pending: approvals.filter((a) => a.status === "pending").length,
      added: approvals.filter((a) => a.status === "added").length,
      downloading: (sonarrQueue.records?.length || 0) + (radarrQueue.records?.length || 0),
      completed: approvals.filter((a) => a.status === "completed").length,
      failed: approvals.filter((a) => a.status === "failed").length,
    };

    return NextResponse.json({
      stats,
      qualityProfiles: {
        sonarr: sonarrProfiles,
        radarr: radarrProfiles,
      },
      queue: [
        ...(sonarrQueue.records || []).map((r: Record<string, unknown>) => ({ ...r, instance: "sonarr" })),
        ...(radarrQueue.records || []).map((r: Record<string, unknown>) => ({ ...r, instance: "radarr" })),
      ],
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
