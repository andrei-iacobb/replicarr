import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  getSeries,
  getMovies,
  getSeriesPoster,
  getMoviePoster,
} from "@/lib/arr";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "all";
  const search = searchParams.get("search") || "";

  try {
    const approvedItems = await prisma.approvedItem.findMany();
    const approvedSet = new Set(
      approvedItems.map((a) => `${a.type}:${a.tmdbId}`)
    );

    const items: Array<{
      id: number;
      type: string;
      title: string;
      year: number | null;
      tmdbId: number;
      tvdbId?: number;
      imdbId?: string;
      poster: string | null;
      quality: string;
      size: string;
      approved: boolean;
      status?: string;
    }> = [];

    if (type === "all" || type === "series") {
      const series = await getSeries(config.sonarr);
      for (const s of series) {
        const tmdbId = s.tmdbId || s.tvdbId;
        items.push({
          id: s.id,
          type: "series",
          title: s.title,
          year: s.year,
          tmdbId,
          tvdbId: s.tvdbId,
          imdbId: s.imdbId,
          poster: getSeriesPoster(s),
          quality: `${s.statistics?.episodeFileCount || 0}/${s.statistics?.episodeCount || 0} eps`,
          size: formatBytes(s.statistics?.sizeOnDisk || 0),
          approved: approvedSet.has(`series:${tmdbId}`),
          status: approvedItems.find(
            (a) => a.type === "series" && a.tmdbId === tmdbId
          )?.status,
        });
      }
    }

    if (type === "all" || type === "movie") {
      const movies = await getMovies(config.radarr);
      for (const m of movies) {
        items.push({
          id: m.id,
          type: "movie",
          title: m.title,
          year: m.year,
          tmdbId: m.tmdbId,
          imdbId: m.imdbId,
          poster: getMoviePoster(m),
          quality: m.movieFile?.quality?.quality?.name || (m.hasFile ? "Downloaded" : "Missing"),
          size: formatBytes(m.sizeOnDisk || 0),
          approved: approvedSet.has(`movie:${m.tmdbId}`),
          status: approvedItems.find(
            (a) => a.type === "movie" && a.tmdbId === m.tmdbId
          )?.status,
        });
      }
    }

    const filtered = search
      ? items.filter((i) =>
          i.title.toLowerCase().includes(search.toLowerCase())
        )
      : items;

    filtered.sort((a, b) => a.title.localeCompare(b.title));

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("Library fetch error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
