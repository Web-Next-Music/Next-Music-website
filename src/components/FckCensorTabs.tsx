"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { OfficialTrack, LegacyTrack } from "@/lib/fckcensor";
import styles from "./FckCensorTabs.module.css";

// How many items to load per batch
const PAGE_SIZE = 20;

interface Props {
    official: OfficialTrack[];
    legacy: LegacyTrack[];
}

// ---------- Infinite-scroll list ----------

interface OfficialListProps {
    tracks: OfficialTrack[];
}
function OfficialList({ tracks }: OfficialListProps) {
    const [visible, setVisible] = useState(PAGE_SIZE);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Reset when track list changes (tab switch)
    useEffect(() => {
        setVisible(PAGE_SIZE);
    }, [tracks]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting)
                    setVisible((v) => Math.min(v + PAGE_SIZE, tracks.length));
            },
            { rootMargin: "200px" },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [tracks.length]);

    const slice = tracks.slice(0, visible);

    return (
        <div className={styles.list}>
            {tracks.length === 0 && (
                <div className={styles.empty}>
                    Не удалось загрузить список треков.
                </div>
            )}
            {slice.map((track, i) => {
                // Extract yandex track ID from mp3 URL: .../12345678.mp3
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
                        onClick={(e) => {
                            // For non-nextmusic links fall back to direct mp3
                            if (!trackId) return;
                            // Attempt deep link; browsers ignore unknown protocols silently
                        }}
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
                                {track.title || "—"}
                            </div>
                            <div className={styles.artist}>{track.artist}</div>
                        </div>
                    </a>
                );
            })}
            {/* Sentinel — triggers next page load */}
            {visible < tracks.length && (
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
}
function LegacyList({ tracks }: LegacyListProps) {
    const [visible, setVisible] = useState(PAGE_SIZE);
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setVisible(PAGE_SIZE);
    }, [tracks]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting)
                    setVisible((v) => Math.min(v + PAGE_SIZE, tracks.length));
            },
            { rootMargin: "200px" },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [tracks.length]);

    const slice = tracks.slice(0, visible);

    return (
        <div className={styles.list}>
            {tracks.length === 0 && (
                <div className={styles.empty}>
                    Не удалось загрузить список треков.
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
                        <div className={styles.title}>Track #{track.id}</div>
                        <div className={styles.artist}>ID: {track.id}</div>
                    </div>
                </a>
            ))}
            {visible < tracks.length && (
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

// ---------- Main tabs ----------

export default function FckCensorTabs({ official, legacy }: Props) {
    const [tab, setTab] = useState<"official" | "legacy">("official");

    return (
        <div>
            <div className={styles.tabBar}>
                <button
                    className={`${styles.tab} ${tab === "official" ? styles.active : ""}`}
                    onClick={() => setTab("official")}
                >
                    Official
                    <span className={styles.count}>{official.length}</span>
                </button>
                <button
                    className={`${styles.tab} ${tab === "legacy" ? styles.active : ""}`}
                    onClick={() => setTab("legacy")}
                >
                    Legacy
                    <span className={styles.count}>{legacy.length}</span>
                </button>
            </div>

            {tab === "official" && <OfficialList tracks={official} />}
            {tab === "legacy" && <LegacyList tracks={legacy} />}
        </div>
    );
}
