"use client";

import {
    useState,
    useEffect,
    useRef,
    useMemo,
    createContext,
    useContext,
    useCallback,
} from "react";
import {
    M3U_URL,
    LEGACY_URL,
    TRACK_META,
    parseM3U,
    parseLegacy,
    type OfficialTrack,
    type LegacyTrack,
    type TrackMeta,
} from "@/lib/fckcensor";
import styles from "./FckCensorTabs.module.css";
import playerStyles from "./MiniPlayer.module.css";

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

function getTabFromHash(): TabId {
    if (typeof window === "undefined") return "official";
    const hash = window.location.hash.toLowerCase();
    if (!hash) return "official";
    return HASH_TO_TAB[hash] ?? "official";
}

// ─── Player context ───────────────────────────────────────────────────────────

export interface NowPlaying {
    url: string;
    title: string;
    artist: string;
    cover?: string;
    yandexUrl?: string;
}

interface PlayerContextValue {
    nowPlaying: NowPlaying | null;
    isPlaying: boolean;
    play: (track: NowPlaying) => void;
    pause: () => void;
    resume: () => void;
    close: () => void;
    audioRef: React.RefObject<HTMLAudioElement | null>;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);

// ─── Rich Presence WebSocket hook ────────────────────────────────────────────

const WS_PORT = 6972;
const WS_URL = `ws://127.0.0.1:${WS_PORT}`;
const RPC_TICK_MS = 5000;

function useRichPresenceWS(
    nowPlaying: NowPlaying | null,
    isPlaying: boolean,
    audioRef: React.RefObject<HTMLAudioElement | null>,
) {
    const wsRef = useRef<WebSocket | null>(null);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Refs so callbacks always see latest values without re-creating them
    const nowPlayingRef = useRef(nowPlaying);
    const isPlayingRef = useRef(isPlaying);
    useEffect(() => {
        nowPlayingRef.current = nowPlaying;
    }, [nowPlaying]);
    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    const send = useCallback((data: object) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    }, []);

    // Reads fresh audio state at call-time — never stale
    const buildPayload = useCallback(
        (state: "playing" | "paused" | "stopped") => {
            const audio = audioRef.current;
            const np = nowPlayingRef.current;
            const positionSec = audio?.currentTime ?? 0;
            const durationSec =
                audio?.duration && isFinite(audio.duration)
                    ? audio.duration
                    : 0;
            const trackId = np?.url.match(/\/(\d+)\.mp3$/)?.[1] ?? "";
            return {
                playerState: state,
                title: np?.title ?? "",
                artists: np?.artist ?? "",
                img: np?.cover ?? "icon",
                albumUrl: "",
                artistUrl: "",
                trackId,
                positionSec,
                durationSec,
            };
        },
        [audioRef],
    );

    const stopTick = useCallback(() => {
        if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
        }
    }, []);

    const startTick = useCallback(() => {
        stopTick();
        tickRef.current = setInterval(
            () => send(buildPayload("playing")),
            RPC_TICK_MS,
        );
    }, [send, buildPayload, stopTick]);

    // New track → reconnect WS, then wait for durationchange before first send
    useEffect(() => {
        const audio = audioRef.current;
        stopTick();

        if (!nowPlaying) {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                    JSON.stringify({
                        playerState: "stopped",
                        title: "",
                        artists: "",
                    }),
                );
            }
            wsRef.current?.close();
            wsRef.current = null;
            return;
        }

        // Reconnect
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close();
            wsRef.current = null;
        }
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;
        ws.onerror = () => {
            /* desktop app may not be running */
        };
        ws.onopen = () => console.log("[RPC-WS] Connected");
        ws.onclose = () => console.log("[RPC-WS] Disconnected");

        // Send first payload only after duration is available — fixes the
        // broken-timestamps burst that happened when audio wasn't loaded yet.
        const onReady = () => {
            const state = isPlayingRef.current ? "playing" : "paused";
            send(buildPayload(state));
            if (state === "playing") startTick();
        };

        if (audio) {
            if (audio.duration && isFinite(audio.duration)) {
                // Duration already known (e.g. cached resource)
                onReady();
            } else {
                audio.addEventListener("durationchange", onReady, {
                    once: true,
                });
            }
        }

        return () => {
            audio?.removeEventListener("durationchange", onReady);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nowPlaying?.url]);

    // Play / pause toggle — only send if duration is already known
    useEffect(() => {
        if (!nowPlaying) return;
        const audio = audioRef.current;
        if (!audio?.duration || !isFinite(audio.duration)) return;

        send(buildPayload(isPlaying ? "playing" : "paused"));
        if (isPlaying) {
            startTick();
        } else {
            stopTick();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying]);

    // Cleanup on provider unmount
    useEffect(() => {
        return () => {
            stopTick();
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                    JSON.stringify({
                        playerState: "stopped",
                        title: "",
                        artists: "",
                    }),
                );
            }
            wsRef.current?.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

// ─── Player provider ──────────────────────────────────────────────────────────

export function PlayerProvider({ children }: { children: React.ReactNode }) {
    const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    useRichPresenceWS(nowPlaying, isPlaying, audioRef);

    const play = useCallback((track: NowPlaying) => {
        setNowPlaying(track);
        setIsPlaying(true);
    }, []);

    const pause = useCallback(() => {
        audioRef.current?.pause();
        setIsPlaying(false);
    }, []);

    const resume = useCallback(() => {
        audioRef.current?.play();
        setIsPlaying(true);
    }, []);

    const close = useCallback(() => {
        audioRef.current?.pause();
        setNowPlaying(null);
        setIsPlaying(false);
    }, []);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !nowPlaying) return;
        audio.src = nowPlaying.url;
        audio.play().catch(console.error);
    }, [nowPlaying]);

    return (
        <PlayerContext.Provider
            value={{
                nowPlaying,
                isPlaying,
                play,
                pause,
                resume,
                close,
                audioRef,
            }}
        >
            <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />
            {children}
            <MiniPlayerSlot />
        </PlayerContext.Provider>
    );
}

export function usePlayer() {
    return useContext(PlayerContext);
}

// Renders MiniPlayer into #mini-player-slot div placed right after <header>
function MiniPlayerSlot() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;
    const target = document.getElementById("mini-player-slot");
    if (!target) return null;
    // Dynamic import to keep createPortal client-only
    const { createPortal } = require("react-dom");
    return createPortal(<MiniPlayerInner />, target);
}

// ─── Mini player bar ──────────────────────────────────────────────────────────

export function MiniPlayerInner() {
    const player = usePlayer();
    if (!player) return null;
    const { nowPlaying, isPlaying, pause, resume, close, audioRef } = player;
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const progressRef = useRef<HTMLDivElement>(null);

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setVolume(val);
        if (audioRef.current) {
            audioRef.current.volume = val;
            audioRef.current.muted = val === 0;
        }
        setMuted(val === 0);
    };

    const toggleMute = () => {
        const audio = audioRef.current;
        if (!audio) return;
        const next = !muted;
        setMuted(next);
        audio.muted = next;
    };

    const effectiveVolume = muted ? 0 : volume;

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onTime = () => setProgress(audio.currentTime);
        const onDur = () => setDuration(audio.duration);
        audio.addEventListener("timeupdate", onTime);
        audio.addEventListener("durationchange", onDur);
        return () => {
            audio.removeEventListener("timeupdate", onTime);
            audio.removeEventListener("durationchange", onDur);
        };
    }, [audioRef]);

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const audio = audioRef.current;
        if (audio && duration) {
            audio.currentTime = ratio * duration;
        }
    };

    const fmt = (s: number) => {
        if (!isFinite(s)) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    // Push page content down when player is visible
    useEffect(() => {
        document.body.classList.toggle("has-mini-player", !!nowPlaying);
        return () => document.body.classList.remove("has-mini-player");
    }, [!!nowPlaying]);

    if (!nowPlaying) return null;

    const pct = duration ? (progress / duration) * 100 : 0;

    return (
        <div className={playerStyles.bar}>
            <div className={playerStyles.inner}>
                {/* LEFT: cover + info */}
                <div className={playerStyles.left}>
                    {nowPlaying.cover ? (
                        <img
                            src={nowPlaying.cover}
                            alt=""
                            className={playerStyles.cover}
                        />
                    ) : (
                        <div className={playerStyles.coverPlaceholder} />
                    )}
                    <div className={playerStyles.info}>
                        <span className={playerStyles.title}>
                            {nowPlaying.title}
                        </span>
                        <span className={playerStyles.artist}>
                            {nowPlaying.artist}
                        </span>
                    </div>
                </div>

                {/* MIDDLE: time + progress + time — grows to fill space */}
                <span className={playerStyles.timeSingle}>{fmt(progress)}</span>
                <div
                    className={playerStyles.progressWrap}
                    onClick={handleSeek}
                    ref={progressRef}
                >
                    <div
                        className={playerStyles.progressFill}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <span className={playerStyles.timeSingle}>{fmt(duration)}</span>

                {/* Play / Pause */}
                <button
                    className={playerStyles.btn}
                    onClick={isPlaying ? pause : resume}
                    aria-label={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ? (
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                    ) : (
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path d="M5 3l14 9-14 9V3z" />
                        </svg>
                    )}
                </button>

                {/* Volume */}
                <div className={playerStyles.volumeWrap}>
                    <button
                        className={playerStyles.btn}
                        onClick={toggleMute}
                        aria-label={muted ? "Unmute" : "Mute"}
                    >
                        {effectiveVolume === 0 ? (
                            <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                            >
                                <path
                                    d="M11 5L6 9H3v6h3l5 4V5z"
                                    fill="currentColor"
                                />
                                <line
                                    x1="22"
                                    y1="9"
                                    x2="16"
                                    y2="15"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                />
                                <line
                                    x1="16"
                                    y1="9"
                                    x2="22"
                                    y2="15"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                />
                            </svg>
                        ) : effectiveVolume < 0.5 ? (
                            <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                            >
                                <path
                                    d="M11 5L6 9H3v6h3l5 4V5z"
                                    fill="currentColor"
                                />
                                <path
                                    d="M15.5 8.5a5 5 0 0 1 0 7"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    fill="none"
                                />
                            </svg>
                        ) : (
                            <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                            >
                                <path
                                    d="M11 5L6 9H3v6h3l5 4V5z"
                                    fill="currentColor"
                                />
                                <path
                                    d="M15.5 8.5a5 5 0 0 1 0 7"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    fill="none"
                                />
                                <path
                                    d="M18.5 5.5a9 9 0 0 1 0 13"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    fill="none"
                                />
                            </svg>
                        )}
                    </button>
                    <div className={playerStyles.volumeSliderWrap}>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.02"
                            value={muted ? 0 : volume}
                            onChange={handleVolumeChange}
                            className={playerStyles.volumeSlider}
                            aria-label="Volume"
                            style={
                                {
                                    "--vol": `${effectiveVolume * 100}%`,
                                } as React.CSSProperties
                            }
                        />
                    </div>
                </div>

                {/* Close */}
                <button
                    className={playerStyles.btn}
                    onClick={close}
                    aria-label="Close player"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path
                            d="M18 6L6 18M6 6l12 12"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                    </svg>
                </button>
            </div>
        </div>
    );
}

// ─── Play button ──────────────────────────────────────────────────────────────

interface PlayBtnProps {
    track: NowPlaying;
}

function PlayBtn({ track }: PlayBtnProps) {
    const player = usePlayer();
    if (!player) return null;
    const { nowPlaying, isPlaying, play, pause, resume } = player;
    const isThis = nowPlaying?.url === track.url;
    const active = isThis && isPlaying;

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isThis) {
            play(track);
        } else if (isPlaying) {
            pause();
        } else {
            resume();
        }
    };

    return (
        <button
            className={`${styles.playBtn} ${isThis ? styles.playBtnActive : ""}`}
            onClick={handleClick}
            aria-label={active ? "Pause" : "Play"}
        >
            {active ? (
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
            ) : (
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path d="M5 3l14 9-14 9V3z" />
                </svg>
            )}
        </button>
    );
}

// ─── Search bar ───────────────────────────────────────────────────────────────

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
                placeholder="Search by title, artist or ID..."
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

// ─── Official list ────────────────────────────────────────────────────────────

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
                const yandexHref = trackId
                    ? `https://music.yandex.ru/track/${trackId}`
                    : track.url;

                return (
                    <a
                        key={i}
                        href={yandexHref}
                        target="_blank"
                        rel="noopener noreferrer"
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
                        <PlayBtn
                            track={{
                                url: track.url,
                                title: track.title || "—",
                                artist: track.artist || "",
                                cover: track.cover,
                                yandexUrl:
                                    yandexHref !== track.url
                                        ? yandexHref
                                        : undefined,
                            }}
                        />
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

// ─── Legacy list ──────────────────────────────────────────────────────────────

interface LegacyListProps {
    tracks: LegacyTrack[];
    query: string;
}

function LegacyList({ tracks, query }: LegacyListProps) {
    const enriched = useMemo(
        () =>
            tracks.map((t) => ({
                ...t,
                meta: (TRACK_META[t.id] ?? null) as TrackMeta | null,
            })),
        [tracks],
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return enriched;
        return enriched.filter(
            (t) =>
                t.id.includes(q) ||
                t.meta?.title?.toLowerCase().includes(q) ||
                t.meta?.artist?.toLowerCase().includes(q),
        );
    }, [enriched, query]);

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
                const meta = track.meta;
                return (
                    <a
                        key={track.id}
                        href={track.yandexUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.trackRow}
                    >
                        <span className={styles.num}>{i + 1}</span>

                        {meta?.cover ? (
                            <img
                                src={meta.cover}
                                alt=""
                                width={40}
                                height={40}
                                className={styles.cover}
                                loading="lazy"
                            />
                        ) : (
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
                        )}

                        <div className={styles.info}>
                            <div className={styles.title}>
                                <Highlight
                                    text={meta?.title ?? `Track #${track.id}`}
                                    query={query}
                                />
                            </div>
                            <div className={styles.artist}>
                                {meta?.artist ? (
                                    <Highlight
                                        text={meta.artist}
                                        query={query}
                                    />
                                ) : (
                                    <span style={{ opacity: 0.45 }}>
                                        ID: {track.id}
                                    </span>
                                )}
                            </div>
                        </div>
                        <PlayBtn
                            track={{
                                url: track.url,
                                title: meta?.title ?? `Track #${track.id}`,
                                artist: meta?.artist ?? "",
                                cover: meta?.cover,
                                yandexUrl: track.yandexUrl,
                            }}
                        />
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

// ─── Download tab ─────────────────────────────────────────────────────────────

interface DownloadTabProps {
    type: "json" | "m3u";
    url: string;
}

function DownloadTab({ type, url }: DownloadTabProps) {
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

// ─── Highlight ────────────────────────────────────────────────────────────────

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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
    return (
        <div className={styles.list}>
            {Array.from({ length: 8 }).map((_, i) => (
                <div
                    key={i}
                    className={styles.trackRow}
                    style={{ opacity: 0.4 }}
                >
                    <span className={styles.num}>{i + 1}</span>
                    <div className={styles.coverPlaceholder} />
                    <div className={styles.info}>
                        <div
                            className={styles.title}
                            style={{
                                background: "var(--color-border-tertiary)",
                                borderRadius: 4,
                                width: `${120 + (i % 3) * 40}px`,
                                height: 14,
                            }}
                        />
                        <div
                            className={styles.artist}
                            style={{
                                background: "var(--color-border-tertiary)",
                                borderRadius: 4,
                                width: `${60 + (i % 4) * 20}px`,
                                height: 12,
                                marginTop: 4,
                            }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FckCensorTabs() {
    const [tab, setTab] = useState<TabId>("official");
    const [query, setQuery] = useState("");
    const [official, setOfficial] = useState<OfficialTrack[]>([]);
    const [legacy, setLegacy] = useState<LegacyTrack[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            fetch(M3U_URL)
                .then((r) => r.text())
                .then(parseM3U),
            fetch(LEGACY_URL)
                .then((r) => r.json())
                .then(parseLegacy),
        ])
            .then(([off, leg]) => {
                setOfficial(off);
                setLegacy(leg);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const initial = getTabFromHash();
        setTab(initial);
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
                <button
                    className={`${styles.tab} ${tab === "official" ? styles.active : ""}`}
                    onClick={() => handleTabChange("official")}
                >
                    M3U
                    <span className={styles.count}>
                        {loading ? "..." : official.length}
                    </span>
                </button>
                <button
                    className={`${styles.tab} ${tab === "legacy" ? styles.active : ""}`}
                    onClick={() => handleTabChange("legacy")}
                >
                    JSON
                    <span className={styles.count}>
                        {loading ? "..." : legacy.length}
                    </span>
                </button>
            </div>

            {tab === "official" && (
                <>
                    <SearchBar value={query} onChange={setQuery} />
                    {loading ? (
                        <Skeleton />
                    ) : (
                        <OfficialList tracks={official} query={query} />
                    )}
                </>
            )}
            {tab === "legacy" && (
                <>
                    <SearchBar value={query} onChange={setQuery} />
                    {loading ? (
                        <Skeleton />
                    ) : (
                        <LegacyList tracks={legacy} query={query} />
                    )}
                </>
            )}
        </div>
    );
}
