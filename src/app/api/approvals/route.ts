import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  getSeries,
  getMovies,
  addSeries,
  addMovie,
  getQualityProfiles,
  getRootFolders,
} from "@/lib/arr";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await prisma.approvedItem.findMany({
      orderBy: { approvedAt: "desc" },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, tmdbId, tvdbId, imdbId, title, year, qualityProfileId, mainArrId, poster } = body;

    // Save approval to DB
    const item = await prisma.approvedItem.upsert({
      where: { type_tmdbId: { type, tmdbId } },
      create: {
        type,
        title,
        year,
        tmdbId,
        tvdbId,
        imdbId,
        qualityProfileId,
        mainArrId,
        poster,
        status: "pending",
      },
      update: {
        qualityProfileId,
        status: "pending",
      },
    });

    // Add to lowq instance
    try {
      const arrConfig = type === "series" ? config.sonarrLowq : config.radarrLowq;
      const rootFolders = await getRootFolders(arrConfig);
      const rootFolder = rootFolders[0]?.path;

      if (!rootFolder) {
        await prisma.approvedItem.update({
          where: { id: item.id },
          data: { status: "failed" },
        });
        return NextResponse.json(
          { error: "No root folder configured in lowq instance" },
          { status: 500 }
        );
      }

      let lowqId: number;

      if (type === "series") {
        const mainSeries = await getSeries(config.sonarr);
        const series = mainSeries.find((s) => s.id === mainArrId);
        if (!series) throw new Error("Series not found in main Sonarr");
        const result = await addSeries(arrConfig, series, qualityProfileId, rootFolder);
        lowqId = result.id;
      } else {
        const mainMovies = await getMovies(config.radarr);
        const movie = mainMovies.find((m) => m.id === mainArrId);
        if (!movie) throw new Error("Movie not found in main Radarr");
        const result = await addMovie(arrConfig, movie, qualityProfileId, rootFolder);
        lowqId = result.id;
      }

      await prisma.approvedItem.update({
        where: { id: item.id },
        data: { lowqArrId: lowqId, status: "added" },
      });

      return NextResponse.json({ ...item, lowqArrId: lowqId, status: "added" });
    } catch (addError) {
      const errMsg = String(addError);
      // Already exists in lowq is fine
      if (errMsg.includes("already been added") || errMsg.includes("already exists")) {
        await prisma.approvedItem.update({
          where: { id: item.id },
          data: { status: "added" },
        });
        return NextResponse.json({ ...item, status: "added" });
      }
      await prisma.approvedItem.update({
        where: { id: item.id },
        data: { status: "failed" },
      });
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get("id") || "0");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await prisma.approvedItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
