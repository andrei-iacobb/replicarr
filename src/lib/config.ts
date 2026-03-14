export const config = {
  sonarr: {
    url: process.env.SONARR_URL || "http://localhost:8989",
    apiKey: process.env.SONARR_API_KEY || "",
  },
  radarr: {
    url: process.env.RADARR_URL || "http://localhost:7878",
    apiKey: process.env.RADARR_API_KEY || "",
  },
  sonarrLowq: {
    url: process.env.SONARR_LOWQ_URL || "http://localhost:8990",
    apiKey: process.env.SONARR_LOWQ_API_KEY || "",
  },
  radarrLowq: {
    url: process.env.RADARR_LOWQ_URL || "http://localhost:7879",
    apiKey: process.env.RADARR_LOWQ_API_KEY || "",
  },
};
