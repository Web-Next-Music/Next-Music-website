"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import styles from "./AppPreview.module.css";

// Payload shape sent by the addon's siteRPCServer.js
// Fields match exactly what broadcastToClients() sends
interface WsPayload {
    playerIndex?: number;
    trackId: string | null;
    title: string | null;
    artists: string;
    img: string | null;
    albumUrl: string | null;
    artistUrl: string | null;
    trackUrl: string | null;
    positionSec: number;
    durationSec: number;
    playerState: string | null;
    _lastState?: boolean;
}

/* ── Static cards — shown when WS is offline ── */
const STATIC_CARDS = [
    {
        cover: "https://avatars.yandex.net/get-music-content/41288/49c611ee.a.51178-1/400x400",
        title: "I Kissed A Girl",
        artist: "Katy Perry",
        elapsed: "2:09",
        total: "3:00",
        progress: 52,
    },
    {
        cover: "https://avatars.yandex.net/get-music-content/192707/54d70bf4.a.3719536-2/400x400",
        title: "Style",
        artist: "Taylor Swift",
        elapsed: "1:13",
        total: "3:51",
        progress: 28,
    },
    {
        cover: "https://avatars.yandex.net/get-music-content/13449652/3198e9c1.a.32202913-1/400x400",
        title: "Young Girl A",
        artist: "8-Bit Bunker",
        elapsed: "3:39",
        total: "4:01",
        progress: 85,
    },
];

function fmt(sec: number): string {
    const s = Math.floor(Math.max(0, sec));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

/* ── Reusable card shell ── */
interface CardShellProps {
    delay?: number;
    live?: boolean;
    statusDot?: React.ReactNode;
    cover: React.ReactNode;
    title: React.ReactNode;
    artist: React.ReactNode;
    timeRow: React.ReactNode;
}
function CardShell({
    delay = 0,
    live,
    statusDot,
    cover,
    title,
    artist,
    timeRow,
}: CardShellProps) {
    return (
        <div
            className={`${styles.card} ${live ? styles.cardLive : ""}`}
            style={{ "--delay": `${delay}s` } as React.CSSProperties}
        >
            <div className={styles.cardHeader}>
                <span className={styles.headerLabel}>
                    Listening to Next Music
                </span>
                {statusDot ?? <span className={styles.dots}>•••</span>}
            </div>
            <div className={styles.cardBody}>
                {cover}
                <div className={styles.info}>
                    <div className={styles.title}>{title}</div>
                    <div className={styles.artist}>{artist}</div>
                    <div className={styles.timeRow}>{timeRow}</div>
                </div>
            </div>
        </div>
    );
}

function ProgressRow({
    elapsed,
    progress,
    total,
}: {
    elapsed: string;
    progress: number;
    total: string;
}) {
    return (
        <>
            <span>{elapsed}</span>
            <div className={styles.progressBar}>
                <div
                    className={styles.progressFill}
                    style={{ width: `${progress}%` }}
                />
            </div>
            <span>{total}</span>
        </>
    );
}

function CoverImg({ src, alt }: { src: string; alt: string }) {
    return (
        <Image
            src={src}
            alt={alt}
            width={56}
            height={56}
            className={styles.cover}
        />
    );
}

function CoverPlaceholder() {
    return (
        <div className={styles.coverPlaceholder}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
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
    );
}

/* ── Live first card ── */
function LiveCard() {
    const [data, setData] = useState<WsPayload | null>(() => {
        try {
            const raw = localStorage.getItem("nm-ws-last-payload");
            if (!raw) return null;
            const parsed = JSON.parse(raw) as WsPayload;
            positionRef.current = parsed.positionSec ?? 0;
            durationRef.current = parsed.durationSec ?? 0;
            isPlayingRef.current = false;
            return parsed;
        } catch {
            return null;
        }
    });
    const [connected, setConnected] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const positionRef = useRef(0);
    const durationRef = useRef(0);
    const isPlayingRef = useRef(false);
    const lastTickTimeRef = useRef<number | null>(null);
    const [, forceUpdate] = useState(0);

    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    function startTick() {
        if (tickRef.current) clearInterval(tickRef.current);
        lastTickTimeRef.current = performance.now();
        tickRef.current = setInterval(() => {
            if (!isPlayingRef.current) return;
            const now = performance.now();
            const elapsed = (now - (lastTickTimeRef.current ?? now)) / 1000;
            lastTickTimeRef.current = now;
            positionRef.current = Math.min(
                positionRef.current + elapsed,
                durationRef.current,
            );
            forceUpdate((n) => n + 1);
        }, 500);
    }

    function stopTick() {
        if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
        }
        lastTickTimeRef.current = null;
    }

    function applyPayload(raw: WsPayload) {
        try {
            localStorage.setItem("nm-ws-last-payload", JSON.stringify(raw));
        } catch {}

        positionRef.current = raw.positionSec ?? 0;
        durationRef.current = raw.durationSec ?? 0;
        isPlayingRef.current = raw.playerState === "playing";
        setData(raw);

        if (isPlayingRef.current) {
            startTick();
        } else {
            stopTick();
            forceUpdate((n) => n + 1);
        }
    }

    useEffect(() => {
        function onVisibilityChange() {
            if (document.visibilityState === "visible") {
                lastTickTimeRef.current = performance.now();
            } else {
                lastTickTimeRef.current = null;
            }
        }
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () =>
            document.removeEventListener(
                "visibilitychange",
                onVisibilityChange,
            );
    }, []);

    useEffect(() => {
        function connect() {
            if (wsRef.current && wsRef.current.readyState < 2) return;
            let ws: WebSocket;
            try {
                ws = new WebSocket("ws://127.0.0.1:6972");
            } catch {
                reconnRef.current = setTimeout(connect, 3000);
                return;
            }
            wsRef.current = ws;

            ws.onopen = () => setConnected(true);

            ws.onmessage = (e: MessageEvent) => {
                try {
                    applyPayload(JSON.parse(e.data as string) as WsPayload);
                } catch (err) {
                    console.error("[NM-WS] parse error:", err, e.data);
                }
            };

            ws.onerror = () => {};

            ws.onclose = () => {
                setConnected(false);
                isPlayingRef.current = false;
                stopTick();
                reconnRef.current = setTimeout(connect, 3000);
            };
        }

        connect();
        return () => {
            wsRef.current?.close();
            if (reconnRef.current) clearTimeout(reconnRef.current);
            stopTick();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pos = positionRef.current;
    const dur = durationRef.current;
    const isPlaying = isPlayingRef.current;
    const progress = dur > 0 ? Math.min((pos / dur) * 100, 100) : 0;

    if (!data) {
        const c = STATIC_CARDS[0];
        return (
            <CardShell
                delay={0}
                statusDot={
                    <span
                        className={styles.dot}
                        style={{ background: "var(--border)" }}
                        title="Offline"
                    />
                }
                cover={<CoverImg src={c.cover} alt={c.title} />}
                title={c.title}
                artist={c.artist}
                timeRow={
                    <ProgressRow
                        elapsed={c.elapsed}
                        progress={c.progress}
                        total={c.total}
                    />
                }
            />
        );
    }

    return (
        <CardShell
            delay={0}
            live={connected && isPlaying}
            statusDot={
                <span
                    className={`${styles.dot} ${
                        !connected
                            ? ""
                            : isPlaying
                              ? styles.dotLive
                              : styles.dotPaused
                    }`}
                    style={
                        !connected ? { background: "var(--border)" } : undefined
                    }
                    title={
                        !connected
                            ? "Offline"
                            : isPlaying
                              ? "Playing"
                              : "Paused"
                    }
                />
            }
            cover={
                data.img ? (
                    <CoverImg src={data.img} alt={data.title ?? ""} />
                ) : (
                    <CoverPlaceholder />
                )
            }
            title={data.title ?? "—"}
            artist={data.artists || "—"}
            timeRow={
                <ProgressRow
                    elapsed={fmt(pos)}
                    progress={progress}
                    total={fmt(dur)}
                />
            }
        />
    );
}

/* ── Root ── */
export default function AppPreview() {
    return (
        <div className={styles.stack}>
            <LiveCard />
            {STATIC_CARDS.slice(1).map((c, i) => (
                <CardShell
                    key={i}
                    delay={(i + 1) * 0.08}
                    cover={<CoverImg src={c.cover} alt={c.title} />}
                    title={c.title}
                    artist={c.artist}
                    timeRow={
                        <ProgressRow
                            elapsed={c.elapsed}
                            progress={c.progress}
                            total={c.total}
                        />
                    }
                />
            ))}
        </div>
    );
}
