interface ArrConfig {
  url: string;
  apiKey: string;
}

async function arrFetch(cfg: ArrConfig, path: string, options?: RequestInit) {
  const res = await fetch(`${cfg.url}/api/v3${path}`, {
    ...options,
    headers: {
      "X-Api-Key": cfg.apiKey,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Arr API error ${res.status}: ${text}`);
  }
  return res.json();
}

export interface SonarrSeries {
  id: number;
  title: string;
  year: number;
  tvdbId: number;
  imdbId?: string;
  tmdbId?: number;
  qualityProfileId: number;
  images: { coverType: string; remoteUrl?: string }[];
  statistics?: { episodeFileCount: number; episodeCount: number; sizeOnDisk: number };
}

export interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  tmdbId: number;
  imdbId?: string;
  qualityProfileId: number;
  images: { coverType: string; remoteUrl?: string }[];
  hasFile: boolean;
  sizeOnDisk?: number;
  movieFile?: { quality: { quality: { name: string } }; size: number };
}

export interface QualityProfile {
  id: number;
  name: string;
}

export async function getSeries(cfg: ArrConfig): Promise<SonarrSeries[]> {
  return arrFetch(cfg, "/series");
}

export async function getMovies(cfg: ArrConfig): Promise<RadarrMovie[]> {
  return arrFetch(cfg, "/movie");
}

export async function getQualityProfiles(cfg: ArrConfig): Promise<QualityProfile[]> {
  return arrFetch(cfg, "/qualityprofile");
}

export async function getRootFolders(cfg: ArrConfig) {
  return arrFetch(cfg, "/rootfolder");
}

export async function addSeries(
  cfg: ArrConfig,
  series: SonarrSeries,
  qualityProfileId: number,
  rootFolderPath: string
) {
  return arrFetch(cfg, "/series", {
    method: "POST",
    body: JSON.stringify({
      tvdbId: series.tvdbId,
      title: series.title,
      qualityProfileId,
      rootFolderPath,
      monitored: true,
      addOptions: { searchForMissingEpisodes: true },
    }),
  });
}

export async function addMovie(
  cfg: ArrConfig,
  movie: RadarrMovie,
  qualityProfileId: number,
  rootFolderPath: string
) {
  return arrFetch(cfg, "/movie", {
    method: "POST",
    body: JSON.stringify({
      tmdbId: movie.tmdbId,
      title: movie.title,
      qualityProfileId,
      rootFolderPath,
      monitored: true,
      addOptions: { searchForMovie: true },
    }),
  });
}

export async function getQueue(cfg: ArrConfig) {
  return arrFetch(cfg, "/queue?pageSize=100&includeUnknownSeriesItems=true&includeUnknownMovieItems=true");
}

function getPoster(images: { coverType: string; remoteUrl?: string }[]): string | null {
  const poster = images.find((i) => i.coverType === "poster");
  return poster?.remoteUrl || null;
}

export function getSeriesPoster(series: SonarrSeries) {
  return getPoster(series.images);
}

export function getMoviePoster(movie: RadarrMovie) {
  return getPoster(movie.images);
}
