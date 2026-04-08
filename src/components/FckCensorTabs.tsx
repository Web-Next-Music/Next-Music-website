"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { OfficialTrack, LegacyTrack } from "@/lib/fckcensor";
import styles from "./FckCensorTabs.module.css";

const PAGE_SIZE = 20;

type TabId = "official" | "legacy";

const TAB_HASHES: Record<TabId, string> = {
    official: "#m3u",
    legacy: "#json",
};

const HASH_TO_TAB: Record<string, TabId> = {
    "#m3u": "official",
    "#json": "legacy",
};

/** Returns the default tab.
 *  Falls back to "official" (M3U) when on the /fckcensor-next/ root
 *  (no hash present) so that direct visits open M3U by default. */
function getTabFromHash(): TabId {
    if (typeof window === "undefined") return "official";
    const hash = window.location.hash.toLowerCase();
    if (!hash) return "official"; // root → M3U tab
    return HASH_TO_TAB[hash] ?? "official";
}

interface Props {
    official: OfficialTrack[];
    legacy: LegacyTrack[];
    jsonUrl?: string;
    m3uUrl?: string;
}

// ---------- Search bar ----------

interface SearchBarProps {
    value: string;
    onChange: (v: string) => void;
}
function SearchBar({ value, onChange }: SearchBarProps) {
    return (
        <div className={styles.searchWrap}>
            <svg
                className={styles.searchIcon}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
            >
                <circle
                    cx="11"
                    cy="11"
                    r="8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                />
                <path
                    d="M21 21l-4.35-4.35"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                />
            </svg>
            <input
                className={styles.searchInput}
                type="text"
                placeholder="Search by title, artist or ID…"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                spellCheck={false}
            />
            {value && (
                <button
                    className={styles.searchClear}
                    onClick={() => onChange("")}
                    aria-label="Clear"
                >
                    ×
                </button>
            )}
        </div>
    );
}

// ---------- Infinite-scroll list ----------

interface OfficialListProps {
    tracks: OfficialTrack[];
    query: string;
}
function OfficialList({ tracks, query }: OfficialListProps) {
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return tracks;
        return tracks.filter(
            (t) =>
                t.title?.toLowerCase().includes(q) ||
                t.artist?.toLowerCase().includes(q) ||
                (t.url.match(/\/(\d+)\.mp3$/)?.[1] ?? "").includes(q),
        );
    }, [tracks, query]);

    const [visible, setVisible] = useState(PAGE_SIZE);
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setVisible(PAGE_SIZE);
    }, [filtered]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting)
                    setVisible((v) => Math.min(v + PAGE_SIZE, filtered.length));
            },
            { rootMargin: "200px" },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [filtered.length]);

    const slice = filtered.slice(0, visible);

    return (
        <div className={styles.list}>
            {filtered.length === 0 && (
                <div className={styles.empty}>
                    {query.trim()
                        ? "No results found."
                        : "Failed to load track list."}
                </div>
            )}
            {slice.map((track, i) => {
                const match = track.url.match(/\/(\d+)\.mp3$/);
                const trackId = match?.[1];
                return (
                    <a
                        key={i}
                        href={
                            trackId
                                ? `https://music.yandex.ru/track/${trackId}`
                                : track.url
                        }
                        className={styles.trackRow}
                    >
                        <span className={styles.num}>{i + 1}</span>
                        {track.cover ? (
                            <img
                                src={track.cover}
                                alt=""
                                width={40}
                                height={40}
                                className={styles.cover}
                                loading="lazy"
                            />
                        ) : (
                            <div className={styles.coverPlaceholder} />
                        )}
                        <div className={styles.info}>
                            <div className={styles.title}>
                                <Highlight
                                    text={track.title || "—"}
                                    query={query}
                                />
                            </div>
                            <div className={styles.artist}>
                                <Highlight text={track.artist} query={query} />
                            </div>
                        </div>
                    </a>
                );
            })}
            {visible < filtered.length && (
                <div ref={sentinelRef} className={styles.sentinel}>
                    <span className={styles.loadingDots}>
                        <span />
                        <span />
                        <span />
                    </span>
                </div>
            )}
        </div>
    );
}

interface LegacyListProps {
    tracks: LegacyTrack[];
    query: string;
}
function LegacyList({ tracks, query }: LegacyListProps) {
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return tracks;
        return tracks.filter((t) => String(t.id).includes(q));
    }, [tracks, query]);

    const [visible, setVisible] = useState(PAGE_SIZE);
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setVisible(PAGE_SIZE);
    }, [filtered]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting)
                    setVisible((v) => Math.min(v + PAGE_SIZE, filtered.length));
            },
            { rootMargin: "200px" },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [filtered.length]);

    const slice = filtered.slice(0, visible);

    return (
        <div className={styles.list}>
            {filtered.length === 0 && (
                <div className={styles.empty}>
                    {query.trim()
                        ? "No results found."
                        : "Failed to load track list."}
                </div>
            )}
            {slice.map((track, i) => (
                <a
                    key={track.id}
                    href={`https://music.yandex.ru/track/${track.id}`}
                    className={styles.trackRow}
                >
                    <span className={styles.num}>{i + 1}</span>
                    <div className={styles.legacyIcon}>
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                        >
                            <path
                                d="M9 18V5l12-2v13"
                                stroke="var(--muted)"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <circle
                                cx="6"
                                cy="18"
                                r="3"
                                stroke="var(--muted)"
                                strokeWidth="1.5"
                            />
                            <circle
                                cx="18"
                                cy="16"
                                r="3"
                                stroke="var(--muted)"
                                strokeWidth="1.5"
                            />
                        </svg>
                    </div>
                    <div className={styles.info}>
                        <div className={styles.title}>
                            <Highlight
                                text={`Track #${track.id}`}
                                query={query}
                            />
                        </div>
                        <div className={styles.artist}>
                            ID:{" "}
                            <Highlight text={String(track.id)} query={query} />
                        </div>
                    </div>
                </a>
            ))}
            {visible < filtered.length && (
                <div ref={sentinelRef} className={styles.sentinel}>
                    <span className={styles.loadingDots}>
                        <span />
                        <span />
                        <span />
                    </span>
                </div>
            )}
        </div>
    );
}

// ---------- Download tab ----------

interface DownloadTabProps {
    type: "json" | "m3u";
    url?: string;
}
function DownloadTab({ type, url }: DownloadTabProps) {
    if (!url) {
        return (
            <div className={styles.empty}>
                No {type.toUpperCase()} file available.
            </div>
        );
    }

    const isJson = type === "json";

    return (
        <div className={styles.downloadPane}>
            <p className={styles.downloadDesc}>
                {isJson
                    ? "Full track list as a JSON file — useful for scripts, bots, or your own tools."
                    : "M3U playlist — open directly in VLC, foobar2000, or any compatible player."}
            </p>
            <a href={url} download className={styles.downloadBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                        d="M12 3v13M7 11l5 5 5-5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M4 20h16"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                    />
                </svg>
                Download .{type}
            </a>
            <div className={styles.downloadUrl}>{url}</div>
        </div>
    );
}

// ---------- Highlight helper ----------

function Highlight({ text, query }: { text: string; query: string }) {
    const q = query.trim();
    if (!q) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
        <>
            {text.slice(0, idx)}
            <mark className={styles.highlight}>
                {text.slice(idx, idx + q.length)}
            </mark>
            {text.slice(idx + q.length)}
        </>
    );
}

// ---------- Main tabs ----------

export default function FckCensorTabs({
    official,
    legacy,
    jsonUrl,
    m3uUrl,
}: Props) {
    const [tab, setTab] = useState<TabId>("official");
    const [query, setQuery] = useState("");

    // Initialise from hash on mount; default to "official" (M3U) on bare /fckcensor-next/
    useEffect(() => {
        const initial = getTabFromHash();
        setTab(initial);
        // If no hash, write the canonical one so the URL stays consistent
        if (!window.location.hash) {
            history.replaceState(null, "", TAB_HASHES[initial]);
        }

        const onHashChange = () => {
            setTab(getTabFromHash());
            setQuery("");
        };
        window.addEventListener("hashchange", onHashChange);
        return () => window.removeEventListener("hashchange", onHashChange);
    }, []);

    const handleTabChange = (t: TabId) => {
        setTab(t);
        setQuery("");
        history.replaceState(null, "", TAB_HASHES[t]);
    };

    return (
        <div>
            <div className={styles.tabBar}>
                {/* Official → M3U playlist */}
                <button
                    className={`${styles.tab} ${tab === "official" ? styles.active : ""}`}
                    onClick={() => handleTabChange("official")}
                >
                    M3U
                    <span className={styles.count}>{official.length}</span>
                </button>
                {/* Legacy → JSON download */}
                <button
                    className={`${styles.tab} ${tab === "legacy" ? styles.active : ""}`}
                    onClick={() => handleTabChange("legacy")}
                >
                    JSON
                    <span className={styles.count}>{legacy.length}</span>
                </button>
            </div>

            {tab === "official" && (
                <>
                    <SearchBar value={query} onChange={setQuery} />
                    <OfficialList tracks={official} query={query} />
                    {m3uUrl && (
                        <div className={styles.downloadFooter}>
                            <DownloadTab type="m3u" url={m3uUrl} />
                        </div>
                    )}
                </>
            )}
            {tab === "legacy" && (
                <>
                    <SearchBar value={query} onChange={setQuery} />
                    <LegacyList tracks={legacy} query={query} />
                    {jsonUrl && (
                        <div className={styles.downloadFooter}>
                            <DownloadTab type="json" url={jsonUrl} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
