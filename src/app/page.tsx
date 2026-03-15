"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface LibraryItem {
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
}

interface QualityProfile {
  id: number;
  name: string;
}

interface InstanceInfo {
  name: string;
  online: boolean;
  version: string | null;
  url: string;
  seriesCount?: number;
  movieCount?: number;
  rootFolders?: { path: string; freeSpace: number }[];
  diskSpace?: { path: string; freeSpace: number; totalSpace: number }[];
  profileCount?: number;
  queueCount?: number;
}

interface ContentMovie {
  id: number;
  title: string;
  year: number;
  hasFile: boolean;
  monitored: boolean;
  sizeOnDisk: number;
  qualityName: string | null;
  status: string;
  poster: string | null;
}

interface ContentSeries {
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

interface StatusData {
  stats: {
    total: number;
    pending: number;
    added: number;
    downloading: number;
    completed: number;
    failed: number;
  };
  instances: {
    sonarrMain: InstanceInfo;
    radarrMain: InstanceInfo;
    sonarrLowq: InstanceInfo;
    radarrLowq: InstanceInfo;
  };
  qualityProfiles: {
    sonarr: QualityProfile[];
    radarr: QualityProfile[];
  };
  queue: Array<{
    title?: string;
    status?: string;
    trackedDownloadStatus?: string;
    trackedDownloadState?: string;
    sizeleft?: number;
    size?: number;
    timeleft?: string;
    estimatedCompletionTime?: string;
    instance: string;
    quality?: { quality?: { name?: string } };
  }>;
  content: {
    movies: ContentMovie[];
    series: ContentSeries[];
  };
}

interface Toast {
  id: number;
  message: string;
  type: "error" | "success";
}

type Tab = "library" | "approved" | "status";
type Filter = "all" | "series" | "movie";

let toastId = 0;

export default function Home() {
  const [tab, setTab] = useState<Tab>("library");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<{ sonarr: QualityProfile[]; radarr: QualityProfile[] }>({ sonarr: [], radarr: [] });
  const [selectedProfile, setSelectedProfile] = useState<number>(0);
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const profilesLoaded = useRef(false);

  const addToast = (message: string, type: "error" | "success" = "error") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  };

  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/library?type=${filter}&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (Array.isArray(data)) setLibrary(data);
      else if (data.error) addToast(data.error);
    } catch (e) {
      addToast(`Failed to fetch library: ${e}`);
    }
    setLoading(false);
  }, [filter, search]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      if (data.error) addToast(data.error);
      else setStatus(data);
    } catch (e) {
      addToast(`Failed to fetch status: ${e}`);
    }
  }, []);

  const fetchProfiles = useCallback(async () => {
    if (profilesLoaded.current) return;
    try {
      const [sonarrRes, radarrRes] = await Promise.all([
        fetch("/api/profiles?type=series"),
        fetch("/api/profiles?type=movie"),
      ]);
      const sonarr = await sonarrRes.json();
      const radarr = await radarrRes.json();
      const p = {
        sonarr: Array.isArray(sonarr) ? sonarr : [],
        radarr: Array.isArray(radarr) ? radarr : [],
      };
      setProfiles(p);
      profilesLoaded.current = true;
      // Auto-select HD-720p profile (best for lowq), fallback to first non-"Any"
      if (selectedProfile === 0) {
        const allProfiles = [...p.radarr, ...p.sonarr];
        const hd720 = allProfiles.find((x) => x.name === "HD-720p");
        const hd1080 = allProfiles.find((x) => x.name === "HD-1080p");
        const notAny = allProfiles.find((x) => x.name !== "Any");
        const pick = hd720 || hd1080 || notAny;
        if (pick) setSelectedProfile(pick.id);
      }
    } catch (e) {
      addToast(`Failed to load quality profiles: ${e}`);
    }
  }, [selectedProfile]);

  useEffect(() => {
    if (tab === "library") {
      fetchLibrary();
      fetchProfiles();
    }
    if (tab === "status") fetchStatus();
  }, [tab, fetchLibrary, fetchStatus, fetchProfiles]);

  // Fetch status on tab switch (live refresh is handled inside StatusTab)
  useEffect(() => {
    if (tab === "status" && !status) fetchStatus();
  }, [tab, status, fetchStatus]);

  const currentProfiles = filter === "series" ? profiles.sonarr : profiles.radarr;

  const approveItem = async (item: LibraryItem) => {
    if (!selectedProfile || selectedProfile === 0) {
      addToast("Select a quality profile before approving. Use the dropdown above the library.");
      return;
    }

    const key = `${item.type}:${item.tmdbId}`;
    setApproving((prev) => new Set(prev).add(key));
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: item.type,
          tmdbId: item.tmdbId,
          tvdbId: item.tvdbId,
          imdbId: item.imdbId,
          title: item.title,
          year: item.year,
          qualityProfileId: selectedProfile,
          mainArrId: item.id,
          poster: item.poster,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setLibrary((prev) =>
          prev.map((i) =>
            i.type === item.type && i.tmdbId === item.tmdbId
              ? { ...i, approved: true, status: data.status || "added" }
              : i
          )
        );
        addToast(`"${item.title}" approved and added to ${item.type === "series" ? "Sonarr" : "Radarr"}-LowQ`, "success");
      } else {
        addToast(data.error || `Failed to approve "${item.title}"`);
      }
    } catch (e) {
      addToast(`Network error approving "${item.title}": ${e}`);
    }
    setApproving((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const bulkApprove = async () => {
    if (!selectedProfile || selectedProfile === 0) {
      addToast("Select a quality profile before approving. Use the dropdown above the library.");
      return;
    }
    const items = library.filter((i) => selected.has(`${i.type}:${i.tmdbId}`) && !i.approved);
    for (const item of items) {
      await approveItem(item);
    }
    setSelected(new Set());
  };

  const toggleSelect = (item: LibraryItem) => {
    const key = `${item.type}:${item.tmdbId}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const unapproved = library.filter((i) => !i.approved);
    if (selected.size === unapproved.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unapproved.map((i) => `${i.type}:${i.tmdbId}`)));
    }
  };

  const profileValid = selectedProfile > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg text-sm shadow-lg border animate-[slideIn_0.2s_ease-out] ${
              t.type === "error"
                ? "bg-red-900/90 border-red-700 text-red-100"
                : "bg-green-900/90 border-green-700 text-green-100"
            }`}
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Replicarr</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Low-quality media replication
          </p>
        </div>
        {status && (
          <div className="flex gap-4 text-sm">
            <Stat label="Approved" value={status.stats.total} />
            <Stat label="Downloading" value={status.stats.downloading} color="var(--warning)" />
            <Stat label="Failed" value={status.stats.failed} color="var(--danger)" />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
        {(["library", "approved", "status"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Library Tab */}
      {tab === "library" && (
        <div>
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchLibrary()}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-[var(--accent)]"
            />
            <div className="flex gap-1">
              {(["all", "series", "movie"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 text-sm rounded-lg capitalize ${
                    filter === f
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                  }`}
                >
                  {f === "movie" ? "movies" : f}
                </button>
              ))}
            </div>
            <button
              onClick={fetchLibrary}
              className="px-3 py-2 text-sm bg-[var(--bg-card)] rounded-lg hover:bg-[var(--bg-card-hover)]"
            >
              Refresh
            </button>
          </div>

          {/* Quality profile selector + bulk actions */}
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-secondary)]">Quality:</label>
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(Number(e.target.value))}
                className={`bg-[var(--bg-card)] border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)] ${
                  profileValid ? "border-[var(--border)]" : "border-red-500 text-red-400"
                }`}
              >
                <option value={0}>-- Select profile --</option>
                {currentProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                {currentProfiles.length === 0 && profiles.radarr.length > 0 && (
                  profiles.radarr.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))
                )}
              </select>
              {!profileValid && (
                <span className="text-xs text-red-400">Required</span>
              )}
            </div>
            {selected.size > 0 && (
              <button
                onClick={bulkApprove}
                disabled={!profileValid}
                className="px-4 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Approve {selected.size} selected
              </button>
            )}
            <button
              onClick={toggleSelectAll}
              className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {selected.size === library.filter((i) => !i.approved).length
                ? "Deselect all"
                : "Select all unapproved"}
            </button>
            <span className="text-xs text-[var(--text-secondary)] ml-auto">
              {library.length} items &middot; {library.filter((i) => i.approved).length} approved
            </span>
          </div>

          {loading ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">Loading library...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {library.map((item) => {
                const key = `${item.type}:${item.tmdbId}`;
                const isSelected = selected.has(key);
                const isApproving = approving.has(key);
                return (
                  <div
                    key={key}
                    className={`relative group rounded-lg overflow-hidden border transition-all cursor-pointer ${
                      isSelected
                        ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                        : item.approved
                        ? "border-[var(--success)]/30"
                        : "border-[var(--border)] hover:border-[var(--border)]"
                    }`}
                    onClick={() => !item.approved && toggleSelect(item)}
                  >
                    <div className="aspect-[2/3] bg-[var(--bg-card)] relative">
                      {item.poster ? (
                        <img
                          src={item.poster}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)] text-xs p-2 text-center">
                          {item.title}
                        </div>
                      )}
                      <div className="absolute top-1 left-1 flex gap-1">
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                          item.type === "series" ? "bg-blue-500/80" : "bg-purple-500/80"
                        } text-white`}>
                          {item.type === "series" ? "TV" : "Film"}
                        </span>
                      </div>
                      {item.approved && (
                        <div className="absolute top-1 right-1">
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded text-white ${
                            item.status === "failed" ? "bg-red-500/80" : "bg-green-500/80"
                          }`}>
                            {item.status || "approved"}
                          </span>
                        </div>
                      )}
                      {!item.approved && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              approveItem(item);
                            }}
                            disabled={isApproving || !profileValid}
                            className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm rounded-lg font-medium disabled:opacity-50"
                            title={!profileValid ? "Select a quality profile first" : ""}
                          >
                            {isApproving ? "Adding..." : !profileValid ? "No profile" : "Approve"}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="p-2 bg-[var(--bg-card)]">
                      <p className="text-xs font-medium truncate">{item.title}</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        {item.year} &middot; {item.quality} &middot; {item.size}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!loading && library.length === 0 && (
            <div className="text-center py-12 text-[var(--text-secondary)]">
              No items found. Check your Sonarr/Radarr connection.
            </div>
          )}
        </div>
      )}

      {/* Approved Tab */}
      {tab === "approved" && <ApprovedTab onToast={addToast} />}

      {/* Status Tab */}
      {tab === "status" && <StatusTab status={status} onRefresh={fetchStatus} />}
    </div>
  );
}

function ApprovedTab({ onToast }: { onToast: (msg: string, type?: "error" | "success") => void }) {
  const [items, setItems] = useState<Array<{
    id: number;
    type: string;
    title: string;
    year: number | null;
    tmdbId: number;
    tvdbId?: number;
    imdbId?: string;
    mainArrId: number;
    poster: string | null;
    status: string;
    qualityProfileId: number;
    approvedAt: string;
    updatedAt: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<Set<number>>(new Set());
  const [profiles, setProfiles] = useState<{ sonarr: QualityProfile[]; radarr: QualityProfile[] }>({ sonarr: [], radarr: [] });
  const [retryProfiles, setRetryProfiles] = useState<Record<number, number>>({});

  const fetchItems = useCallback(() => {
    fetch("/api/approvals")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchItems();
    Promise.all([
      fetch("/api/profiles?type=series").then((r) => r.json()),
      fetch("/api/profiles?type=movie").then((r) => r.json()),
    ]).then(([sonarr, radarr]) => {
      setProfiles({
        sonarr: Array.isArray(sonarr) ? sonarr : [],
        radarr: Array.isArray(radarr) ? radarr : [],
      });
    });
  }, [fetchItems]);

  const removeItem = async (id: number, title: string) => {
    await fetch(`/api/approvals?id=${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
    onToast(`"${title}" removed`, "success");
  };

  const retryItem = async (item: typeof items[0]) => {
    const profileId = retryProfiles[item.id] || item.qualityProfileId;
    if (!profileId || profileId === 0) {
      onToast("Select a quality profile before retrying.");
      return;
    }
    setRetrying((prev) => new Set(prev).add(item.id));
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: item.type,
          tmdbId: item.tmdbId,
          tvdbId: item.tvdbId,
          imdbId: item.imdbId,
          title: item.title,
          year: item.year,
          qualityProfileId: profileId,
          mainArrId: item.mainArrId,
          poster: item.poster,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onToast(`"${item.title}" retried successfully`, "success");
        fetchItems();
      } else {
        onToast(data.error || `Failed to retry "${item.title}"`);
      }
    } catch (e) {
      onToast(`Retry failed: ${e}`);
    }
    setRetrying((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  };

  if (loading) return <div className="text-center py-12 text-[var(--text-secondary)]">Loading...</div>;

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <div className="text-center py-12 text-[var(--text-secondary)]">No approved items yet.</div>
      )}
      {items.map((item) => {
        const itemProfiles = item.type === "series" ? profiles.sonarr : profiles.radarr;
        const currentProfile = retryProfiles[item.id] || item.qualityProfileId;
        const profileName = itemProfiles.find((p) => p.id === item.qualityProfileId)?.name;
        return (
          <div
            key={item.id}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 flex items-center gap-3"
          >
            {item.poster && (
              <img src={item.poster} alt="" className="w-10 h-14 rounded object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.title}</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {item.type === "series" ? "TV" : "Film"} &middot; {item.year} &middot;{" "}
                {profileName && <>{profileName} &middot; </>}
                {new Date(item.approvedAt).toLocaleDateString()}
              </p>
            </div>
            <span className={`px-2 py-1 text-xs rounded font-medium flex-shrink-0 ${
              item.status === "added" ? "bg-green-500/20 text-green-400" :
              item.status === "failed" ? "bg-red-500/20 text-red-400" :
              item.status === "downloading" ? "bg-yellow-500/20 text-yellow-400" :
              item.status === "completed" ? "bg-blue-500/20 text-blue-400" :
              "bg-gray-500/20 text-gray-400"
            }`}>
              {item.status}
            </span>
            {item.status === "failed" && (
              <>
                <select
                  value={currentProfile}
                  onChange={(e) => setRetryProfiles((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))}
                  className="bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:outline-none focus:border-[var(--accent)] flex-shrink-0"
                >
                  {itemProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => retryItem(item)}
                  disabled={retrying.has(item.id)}
                  className="text-[var(--accent)] hover:text-[var(--accent-hover)] text-sm px-2 flex-shrink-0 disabled:opacity-50"
                >
                  {retrying.has(item.id) ? "Retrying..." : "Retry"}
                </button>
              </>
            )}
            <button
              onClick={() => removeItem(item.id, item.title)}
              className="text-[var(--text-secondary)] hover:text-[var(--danger)] text-sm px-2 flex-shrink-0"
            >
              Remove
            </button>
          </div>
        );
      })}
    </div>
  );
}

function StatusTab({ status, onRefresh }: { status: StatusData | null; onRefresh: () => void }) {
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [countdown, setCountdown] = useState(5);

  // Live auto-refresh every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      onRefresh();
      setLastUpdate(new Date());
      setCountdown(5);
    }, 5000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  useEffect(() => {
    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(tick);
  }, []);

  if (!status) return <div className="text-center py-12 text-[var(--text-secondary)]">Loading status...</div>;

  const allContent = [
    ...status.content.movies.map((m) => ({ ...m, type: "movie" as const, detail: m.qualityName || (m.hasFile ? "Has file" : "No file") })),
    ...status.content.series.map((s) => ({ ...s, type: "series" as const, detail: `${s.episodeFileCount}/${s.episodeCount} eps` })),
  ];
  const downloadingContent = allContent.filter((c) => c.status === "downloading");
  const completedContent = allContent.filter((c) => c.status === "completed");
  const missingContent = allContent.filter((c) => c.status === "missing" || c.status === "partial");

  return (
    <div className="space-y-6">
      {/* Live indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-[var(--text-secondary)]">
            Live &middot; updated {lastUpdate.toLocaleTimeString()} &middot; next in {countdown}s
          </span>
        </div>
        <button onClick={() => { onRefresh(); setLastUpdate(new Date()); setCountdown(5); }} className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)]">
          Refresh now
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <StatCard label="Approved" value={status.stats.total} />
        <StatCard label="In LowQ" value={allContent.length} color="var(--accent)" />
        <StatCard label="Downloading" value={status.queue.length} color="var(--warning)" />
        <StatCard label="Completed" value={completedContent.length} color="var(--success)" />
        <StatCard label="Missing" value={missingContent.length} color="var(--text-secondary)" />
        <StatCard label="Failed" value={status.stats.failed} color="var(--danger)" />
      </div>

      {/* Active Downloads - prominent */}
      <div>
        <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
          Active Downloads
          {status.queue.length > 0 && (
            <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">{status.queue.length}</span>
          )}
        </h3>
        {status.queue.length === 0 ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-8 text-center">
            <p className="text-[var(--text-secondary)]">No active downloads</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Approve items from the Library tab to start downloading</p>
          </div>
        ) : (
          <div className="space-y-2">
            {status.queue.map((q, i) => {
              const progress = q.size && q.sizeleft !== undefined
                ? Math.round(((q.size - q.sizeleft) / q.size) * 100)
                : 0;
              const downloaded = q.size && q.sizeleft !== undefined ? q.size - q.sizeleft : 0;
              const isStalled = q.trackedDownloadStatus === "warning" || q.trackedDownloadState === "importBlocked";
              const isCompleted = progress === 100 || q.trackedDownloadState === "importPending";
              return (
                <div key={i} className={`bg-[var(--bg-card)] border rounded-lg p-4 ${
                  isStalled ? "border-yellow-500/40" : isCompleted ? "border-green-500/40" : "border-[var(--border)]"
                }`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{q.title || "Unknown"}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        <span className="text-xs text-[var(--text-secondary)]">{q.instance}</span>
                        <span className="text-xs text-[var(--text-secondary)]">{q.quality?.quality?.name || "?"}</span>
                        {q.status && (
                          <span className={`text-xs ${isStalled ? "text-yellow-400" : isCompleted ? "text-green-400" : "text-[var(--text-secondary)]"}`}>
                            {q.trackedDownloadState || q.status}
                          </span>
                        )}
                        {q.timeleft && q.timeleft !== "00:00:00" && (
                          <span className="text-xs text-[var(--accent)]">ETA: {q.timeleft}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      <p className={`text-lg font-bold ${isCompleted ? "text-green-400" : "text-[var(--text-primary)]"}`}>{progress}%</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        {formatBytes(downloaded)} / {q.size ? formatBytes(q.size) : "?"}
                      </p>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${
                        isStalled ? "bg-yellow-500" : isCompleted ? "bg-green-500" : "bg-[var(--accent)]"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* LowQ Content - what's been added */}
      {allContent.length > 0 && (
        <div>
          <h3 className="text-lg font-medium mb-3">LowQ Content ({allContent.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {allContent.map((item) => (
              <div key={`${item.type}-${item.id}`} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="aspect-[2/3] relative">
                  {item.poster ? (
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)] text-[10px] p-1 text-center bg-gray-800">
                      {item.title}
                    </div>
                  )}
                  <div className="absolute top-1 left-1">
                    <span className={`px-1 py-0.5 text-[9px] font-medium rounded text-white ${
                      item.type === "series" ? "bg-blue-500/80" : "bg-purple-500/80"
                    }`}>
                      {item.type === "series" ? "TV" : "Film"}
                    </span>
                  </div>
                  <div className="absolute top-1 right-1">
                    <span className={`px-1 py-0.5 text-[9px] font-medium rounded text-white ${
                      item.status === "downloading" ? "bg-yellow-500/80" :
                      item.status === "completed" ? "bg-green-500/80" :
                      item.status === "partial" ? "bg-blue-500/80" :
                      "bg-gray-500/80"
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  {item.status === "downloading" && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                      <div className="h-full bg-yellow-500 animate-pulse" style={{ width: "50%" }} />
                    </div>
                  )}
                </div>
                <div className="p-1.5">
                  <p className="text-[10px] font-medium truncate">{item.title}</p>
                  <p className="text-[9px] text-[var(--text-secondary)]">
                    {item.year} &middot; {item.detail}
                    {item.sizeOnDisk > 0 && <> &middot; {formatBytes(item.sizeOnDisk)}</>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instance Health - collapsed */}
      <details className="group">
        <summary className="text-lg font-medium mb-3 cursor-pointer list-none flex items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)] group-open:rotate-90 transition-transform">&#9654;</span>
          Instances
          <span className="text-xs text-[var(--text-secondary)]">
            ({Object.values(status.instances).filter((i) => i.online).length}/{Object.values(status.instances).length} online)
          </span>
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {Object.values(status.instances).map((inst) => (
            <div key={inst.name} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${inst.online ? "bg-green-500" : "bg-red-500"}`} />
                  <span className="text-sm font-medium">{inst.name}</span>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  {inst.online ? `v${inst.version}` : "Offline"}
                </span>
              </div>
              <div className="text-xs text-[var(--text-secondary)] space-y-0.5">
                {"seriesCount" in inst && inst.seriesCount !== undefined && (
                  <p>Series: {inst.seriesCount} &middot; Queue: {inst.queueCount}</p>
                )}
                {"movieCount" in inst && inst.movieCount !== undefined && (
                  <p>Movies: {inst.movieCount} &middot; Queue: {inst.queueCount}</p>
                )}
                {inst.rootFolders && inst.rootFolders.map((rf, i) => (
                  <p key={i}>{rf.path} ({formatBytes(rf.freeSpace)} free)</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-right">
      <p className="text-lg font-bold" style={color ? { color } : undefined}>{value}</p>
      <p className="text-[10px] text-[var(--text-secondary)] uppercase">{label}</p>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 text-center">
      <p className="text-2xl font-bold" style={color ? { color } : undefined}>{value}</p>
      <p className="text-xs text-[var(--text-secondary)] mt-1">{label}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
