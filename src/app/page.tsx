"use client";

import { useState, useEffect, useCallback } from "react";

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

interface StatusData {
  stats: {
    total: number;
    pending: number;
    added: number;
    downloading: number;
    completed: number;
    failed: number;
  };
  qualityProfiles: {
    sonarr: QualityProfile[];
    radarr: QualityProfile[];
  };
  queue: Array<{
    title?: string;
    status?: string;
    sizeleft?: number;
    size?: number;
    instance: string;
  }>;
}

type Tab = "library" | "approved" | "status";
type Filter = "all" | "series" | "movie";

export default function Home() {
  const [tab, setTab] = useState<Tab>("library");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<QualityProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number>(0);
  const [approving, setApproving] = useState<Set<string>>(new Set());

  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/library?type=${filter}&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (Array.isArray(data)) setLibrary(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [filter, search]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      setStatus(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (tab === "library") fetchLibrary();
    if (tab === "status") fetchStatus();
  }, [tab, fetchLibrary, fetchStatus]);

  const fetchProfiles = async (type: string) => {
    try {
      const res = await fetch(`/api/profiles?type=${type}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setProfiles(data);
        if (data.length > 0) setSelectedProfile(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const approveItem = async (item: LibraryItem) => {
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
      if (res.ok) {
        setLibrary((prev) =>
          prev.map((i) =>
            i.type === item.type && i.tmdbId === item.tmdbId
              ? { ...i, approved: true, status: "added" }
              : i
          )
        );
      }
    } catch (e) {
      console.error(e);
    }
    setApproving((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const bulkApprove = async () => {
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
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
            <select
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(Number(e.target.value))}
              onFocus={() => {
                if (profiles.length === 0) fetchProfiles(filter === "series" ? "series" : "movie");
              }}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            >
              {profiles.length === 0 && <option>Click to load profiles...</option>}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selected.size > 0 && (
              <button
                onClick={bulkApprove}
                className="px-4 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium"
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
                      {/* Badge overlay */}
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
                      {/* Hover approve button */}
                      {!item.approved && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              approveItem(item);
                            }}
                            disabled={isApproving}
                            className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm rounded-lg font-medium disabled:opacity-50"
                          >
                            {isApproving ? "Adding..." : "Approve"}
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
      {tab === "approved" && <ApprovedTab />}

      {/* Status Tab */}
      {tab === "status" && status && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <StatCard label="Total Approved" value={status.stats.total} />
            <StatCard label="Pending" value={status.stats.pending} color="var(--warning)" />
            <StatCard label="Added" value={status.stats.added} color="var(--accent)" />
            <StatCard label="Downloading" value={status.stats.downloading} color="var(--warning)" />
            <StatCard label="Failed" value={status.stats.failed} color="var(--danger)" />
          </div>
          {status.queue.length > 0 && (
            <div>
              <h3 className="text-lg font-medium mb-3">Download Queue</h3>
              <div className="space-y-2">
                {status.queue.map((q, i) => (
                  <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">{q.title || "Unknown"}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{q.instance} &middot; {q.status}</p>
                    </div>
                    {q.size && q.sizeleft && (
                      <div className="text-right">
                        <p className="text-sm">{Math.round(((q.size - q.sizeleft) / q.size) * 100)}%</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ApprovedTab() {
  const [items, setItems] = useState<Array<{
    id: number;
    type: string;
    title: string;
    year: number | null;
    poster: string | null;
    status: string;
    approvedAt: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/approvals")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const removeItem = async (id: number) => {
    await fetch(`/api/approvals?id=${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (loading) return <div className="text-center py-12 text-[var(--text-secondary)]">Loading...</div>;

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <div className="text-center py-12 text-[var(--text-secondary)]">No approved items yet.</div>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 flex items-center gap-3"
        >
          {item.poster && (
            <img src={item.poster} alt="" className="w-10 h-14 rounded object-cover" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.title}</p>
            <p className="text-xs text-[var(--text-secondary)]">
              {item.type === "series" ? "TV" : "Film"} &middot; {item.year} &middot;{" "}
              {new Date(item.approvedAt).toLocaleDateString()}
            </p>
          </div>
          <span className={`px-2 py-1 text-xs rounded font-medium ${
            item.status === "added" ? "bg-green-500/20 text-green-400" :
            item.status === "failed" ? "bg-red-500/20 text-red-400" :
            item.status === "downloading" ? "bg-yellow-500/20 text-yellow-400" :
            "bg-gray-500/20 text-gray-400"
          }`}>
            {item.status}
          </span>
          <button
            onClick={() => removeItem(item.id)}
            className="text-[var(--text-secondary)] hover:text-[var(--danger)] text-sm px-2"
          >
            Remove
          </button>
        </div>
      ))}
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
