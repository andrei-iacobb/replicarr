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

    // Build detailed content list from lowq instances
    interface MovieSummary {
      id: number;
      title: string;
      year: number;
      hasFile: boolean;
      monitored: boolean;
      sizeOnDisk: number;
      qualityName: string | null;
      status: string; // grabbed, downloading, completed, missing, monitoring
      poster: string | null;
    }
    interface SeriesSummary {
      id: number;
      title: string;
      year: number;
      monitored: boolean;
      episodeFileCount: number;
      episodeCount: number;
      sizeOnDisk: number;
      status: string;
      poster: string | null;
    }

    const movies: MovieSummary[] = radarrLowqMovies.map((m: Record<string, unknown>) => {
      const mf = m.movieFile as Record<string, unknown> | undefined;
      const images = (m.images as Array<{ coverType: string; remoteUrl?: string }>) || [];
      const posterImg = images.find((i) => i.coverType === "poster");
      return {
        id: m.id as number,
        title: m.title as string,
        year: m.year as number,
        hasFile: m.hasFile as boolean,
        monitored: m.monitored as boolean,
        sizeOnDisk: (m.sizeOnDisk as number) || 0,
        qualityName: mf
          ? ((mf.quality as Record<string, unknown>)?.quality as Record<string, unknown>)?.name as string || null
          : null,
        status: (m.hasFile as boolean) ? "completed" : "missing",
        poster: posterImg?.remoteUrl || null,
      };
    });

    const series: SeriesSummary[] = sonarrLowqSeries.map((s: Record<string, unknown>) => {
      const stats = (s.statistics as Record<string, unknown>) || {};
      const images = (s.images as Array<{ coverType: string; remoteUrl?: string }>) || [];
      const posterImg = images.find((i) => i.coverType === "poster");
      return {
        id: s.id as number,
        title: s.title as string,
        year: s.year as number,
        monitored: s.monitored as boolean,
        episodeFileCount: (stats.episodeFileCount as number) || 0,
        episodeCount: (stats.episodeCount as number) || 0,
        sizeOnDisk: (stats.sizeOnDisk as number) || 0,
        status: ((stats.episodeFileCount as number) || 0) === ((stats.episodeCount as number) || 0)
          ? "completed"
          : ((stats.episodeFileCount as number) || 0) > 0
          ? "partial"
          : "missing",
        poster: posterImg?.remoteUrl || null,
      };
    });

    // Mark items in queue as downloading
    for (const r of (sonarrQueue.records || [])) {
      const seriesId = (r as Record<string, unknown>).seriesId as number;
      const s = series.find((x) => x.id === seriesId);
      if (s) s.status = "downloading";
    }
    for (const r of (radarrQueue.records || [])) {
      const movieId = (r as Record<string, unknown>).movieId as number;
      const m = movies.find((x) => x.id === movieId);
      if (m) m.status = "downloading";
    }

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
      content: { movies, series },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
