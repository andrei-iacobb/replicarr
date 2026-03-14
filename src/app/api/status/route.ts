import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getQueue, getQualityProfiles, getRootFolders, getSeries, getMovies } from "@/lib/arr";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface SystemStatus {
  appName: string;
  version: string;
  startTime?: string;
}

async function getSystemStatus(cfg: { url: string; apiKey: string }): Promise<SystemStatus | null> {
  try {
    const res = await fetch(`${cfg.url}/api/v3/system/status`, {
      headers: { "X-Api-Key": cfg.apiKey },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getDiskSpace(cfg: { url: string; apiKey: string }) {
  try {
    const res = await fetch(`${cfg.url}/api/v3/diskspace`, {
      headers: { "X-Api-Key": cfg.apiKey },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    // Fetch everything in parallel
    const [
      sonarrLowqStatus,
      radarrLowqStatus,
      sonarrMainStatus,
      radarrMainStatus,
      sonarrProfiles,
      radarrProfiles,
      sonarrQueue,
      radarrQueue,
      sonarrLowqRootFolders,
      radarrLowqRootFolders,
      sonarrLowqDisk,
      radarrLowqDisk,
      sonarrLowqSeries,
      radarrLowqMovies,
      approvals,
    ] = await Promise.all([
      getSystemStatus(config.sonarrLowq),
      getSystemStatus(config.radarrLowq),
      getSystemStatus(config.sonarr),
      getSystemStatus(config.radarr),
      getQualityProfiles(config.sonarrLowq).catch(() => []),
      getQualityProfiles(config.radarrLowq).catch(() => []),
      getQueue(config.sonarrLowq).catch(() => ({ records: [] })),
      getQueue(config.radarrLowq).catch(() => ({ records: [] })),
      getRootFolders(config.sonarrLowq).catch(() => []),
      getRootFolders(config.radarrLowq).catch(() => []),
      getDiskSpace(config.sonarrLowq),
      getDiskSpace(config.radarrLowq),
      getSeries(config.sonarrLowq).catch(() => []),
      getMovies(config.radarrLowq).catch(() => []),
      prisma.approvedItem.findMany(),
    ]);

    const stats = {
      total: approvals.length,
      pending: approvals.filter((a) => a.status === "pending").length,
      added: approvals.filter((a) => a.status === "added").length,
      downloading: (sonarrQueue.records?.length || 0) + (radarrQueue.records?.length || 0),
      completed: approvals.filter((a) => a.status === "completed").length,
      failed: approvals.filter((a) => a.status === "failed").length,
    };

    const instances = {
      sonarrMain: {
        name: "Sonarr (Main)",
        online: !!sonarrMainStatus,
        version: sonarrMainStatus?.version || null,
        url: config.sonarr.url,
      },
      radarrMain: {
        name: "Radarr (Main)",
        online: !!radarrMainStatus,
        version: radarrMainStatus?.version || null,
        url: config.radarr.url,
      },
      sonarrLowq: {
        name: "Sonarr-LowQ",
        online: !!sonarrLowqStatus,
        version: sonarrLowqStatus?.version || null,
        url: config.sonarrLowq.url,
        seriesCount: sonarrLowqSeries.length,
        rootFolders: sonarrLowqRootFolders.map((rf: { path: string; freeSpace: number }) => ({
          path: rf.path,
          freeSpace: rf.freeSpace,
        })),
        diskSpace: sonarrLowqDisk,
        profileCount: sonarrProfiles.length,
        queueCount: sonarrQueue.records?.length || 0,
      },
      radarrLowq: {
        name: "Radarr-LowQ",
        online: !!radarrLowqStatus,
        version: radarrLowqStatus?.version || null,
        url: config.radarrLowq.url,
        movieCount: radarrLowqMovies.length,
        rootFolders: radarrLowqRootFolders.map((rf: { path: string; freeSpace: number }) => ({
          path: rf.path,
          freeSpace: rf.freeSpace,
        })),
        diskSpace: radarrLowqDisk,
        profileCount: radarrProfiles.length,
        queueCount: radarrQueue.records?.length || 0,
      },
    };

    return NextResponse.json({
      stats,
      instances,
      qualityProfiles: {
        sonarr: sonarrProfiles,
        radarr: radarrProfiles,
      },
      queue: [
        ...(sonarrQueue.records || []).map((r: Record<string, unknown>) => ({ ...r, instance: "sonarr-lowq" })),
        ...(radarrQueue.records || []).map((r: Record<string, unknown>) => ({ ...r, instance: "radarr-lowq" })),
      ],
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
