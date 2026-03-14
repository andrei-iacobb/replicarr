import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getQualityProfiles } from "@/lib/arr";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "movie";

  try {
    const arrConfig = type === "series" ? config.sonarrLowq : config.radarrLowq;
    const profiles = await getQualityProfiles(arrConfig);
    return NextResponse.json(profiles);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
