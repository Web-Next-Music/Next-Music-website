"use client";

import {
	useState,
	useEffect,
	useRef,
	useMemo,
	useCallback,
	useSyncExternalStore,
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
import {
	ensureTracksLoaded,
	subscribeStore,
	getStoreSnapshot,
	getServerSnapshot,
	findTrackById,
} from "@/lib/trackStore";
import { usePlayer, PlayerProvider } from "@/lib/miniplayer";
import { MiniPlayerInner } from "@/components/miniplayer/MiniPlayer";
import LikeButton from "@/components/ui/LikeButton";
import styles from "./FckCensorTabs.module.css";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
	PlayBtnProps,
	SearchBarProps,
	OfficialListProps,
	LegacyListProps,
	DownloadTabProps,
} from "@/types/ui";

export type { NowPlaying } from "@/types/player";

const PAGE_SIZE = 20;
const TRACK_HEIGHT = 58;
const BUFFER_SIZE = 10;

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
				<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
					<rect x="6" y="4" width="4" height="16" rx="1" />
					<rect x="14" y="4" width="4" height="16" rx="1" />
				</svg>
			) : (
				<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
					<path d="M5 3l14 9-14 9V3z" />
				</svg>
			)}
		</button>
	);
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
				<circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
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

	const listRef = useRef<HTMLDivElement>(null);
	const spacerRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const [renderRange, setRenderRange] = useState({
		start: 0,
		end: PAGE_SIZE + BUFFER_SIZE * 2,
	});
	const [listOffset, setListOffset] = useState(0);

	useEffect(() => {
		setRenderRange({ start: 0, end: PAGE_SIZE + BUFFER_SIZE * 2 });
	}, [filtered]);

	useEffect(() => {
		const updateOffset = () => {
			if (listRef.current) {
				const rect = listRef.current.getBoundingClientRect();
				setListOffset(window.scrollY + rect.top);
			}
		};

		updateOffset();

		const handleScroll = () => {
			const viewportHeight = window.innerHeight;
			const scrollTop = window.scrollY;

			const listScrollTop = scrollTop - listOffset;

			if (listScrollTop + viewportHeight < 0) {
				setRenderRange({ start: 0, end: Math.min(PAGE_SIZE, filtered.length) });
				return;
			}

			const effectiveScrollTop = Math.max(0, listScrollTop);

			const startIdx = Math.max(
				0,
				Math.floor(effectiveScrollTop / TRACK_HEIGHT) - BUFFER_SIZE,
			);
			const endIdx = Math.min(
				filtered.length,
				Math.ceil((effectiveScrollTop + viewportHeight) / TRACK_HEIGHT) +
					BUFFER_SIZE,
			);

			setRenderRange({ start: startIdx, end: endIdx });
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("resize", handleScroll, { passive: true });
		handleScroll();

		return () => {
			window.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", handleScroll);
		};
	}, [filtered.length, listOffset]);

	const visibleTracks = filtered.slice(renderRange.start, renderRange.end);

	return (
		<div ref={listRef} className={styles.list}>
			{filtered.length === 0 && (
				<div className={styles.empty}>
					{query.trim() ? "No results found" : "Failed to load track list"}
				</div>
			)}
			<div
				ref={spacerRef}
				style={{
					height: filtered.length * TRACK_HEIGHT,
					position: "relative",
				}}
			>
				<div
					ref={contentRef}
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						transform: `translateY(${renderRange.start * TRACK_HEIGHT}px)`,
					}}
				>
					{visibleTracks.map((track, i) => {
						const globalIndex = renderRange.start + i;
						const match = track.url.match(/\/(\d+)\.mp3$/);
						const trackId = match?.[1];
						const yandexHref = trackId ? `track?id=${trackId}` : track.url;

						return (
							<Link
								key={track.url}
								href={yandexHref}
								className={styles.trackRow}
								style={{ height: TRACK_HEIGHT }}
							>
								<span className={styles.num}>{globalIndex + 1}</span>
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
										<Highlight text={track.title || "—"} query={query} />
									</div>
									<div className={styles.artist}>
										<Highlight text={track.artist} query={query} />
									</div>
								</div>
								<div
									className={styles.rowActions}
									onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
								>
									{trackId && (
										<LikeButton
											compact
											className={styles.likeBtn}
											target={{ type: "track", trackId }}
										/>
									)}
									<PlayBtn
										track={{
											id: trackId,
											url: track.url,
											title: track.title || "—",
											artist: track.artist || "",
											cover: track.cover,
											yandexUrl:
												yandexHref !== track.url ? yandexHref : undefined,
										}}
									/>
								</div>
							</Link>
						);
					})}
				</div>
			</div>
		</div>
	);
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

	const listRef = useRef<HTMLDivElement>(null);
	const spacerRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const [renderRange, setRenderRange] = useState({
		start: 0,
		end: PAGE_SIZE + BUFFER_SIZE * 2,
	});
	const [listOffset, setListOffset] = useState(0);

	useEffect(() => {
		setRenderRange({ start: 0, end: PAGE_SIZE + BUFFER_SIZE * 2 });
	}, [filtered]);

	useEffect(() => {
		const updateOffset = () => {
			if (listRef.current) {
				const rect = listRef.current.getBoundingClientRect();
				setListOffset(window.scrollY + rect.top);
			}
		};

		updateOffset();

		const handleScroll = () => {
			const viewportHeight = window.innerHeight;
			const scrollTop = window.scrollY;

			const listScrollTop = scrollTop - listOffset;

			if (listScrollTop + viewportHeight < 0) {
				setRenderRange({ start: 0, end: Math.min(PAGE_SIZE, filtered.length) });
				return;
			}

			const effectiveScrollTop = Math.max(0, listScrollTop);

			const startIdx = Math.max(
				0,
				Math.floor(effectiveScrollTop / TRACK_HEIGHT) - BUFFER_SIZE,
			);
			const endIdx = Math.min(
				filtered.length,
				Math.ceil((effectiveScrollTop + viewportHeight) / TRACK_HEIGHT) +
					BUFFER_SIZE,
			);

			setRenderRange({ start: startIdx, end: endIdx });
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("resize", handleScroll, { passive: true });
		handleScroll();

		return () => {
			window.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", handleScroll);
		};
	}, [filtered.length, listOffset]);

	const visibleTracks = filtered.slice(renderRange.start, renderRange.end);

	return (
		<div ref={listRef} className={styles.list}>
			{filtered.length === 0 && (
				<div className={styles.empty}>
					{query.trim() ? "No results found" : "Failed to load track list"}
				</div>
			)}
			<div
				ref={spacerRef}
				style={{
					height: filtered.length * TRACK_HEIGHT,
					position: "relative",
				}}
			>
				<div
					ref={contentRef}
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						transform: `translateY(${renderRange.start * TRACK_HEIGHT}px)`,
					}}
				>
					{visibleTracks.map((track, i) => {
						const globalIndex = renderRange.start + i;
						const meta = track.meta;
						const inner = (
							<>
								<span className={styles.num}>{globalIndex + 1}</span>

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
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
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
											<Highlight text={meta.artist} query={query} />
										) : (
											<span style={{ opacity: 0.45 }}>ID: {track.id}</span>
										)}
									</div>
								</div>
								<div
									className={styles.rowActions}
									onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
								>
									<LikeButton
										compact
										className={styles.likeBtn}
										target={{ type: "track", trackId: track.id }}
									/>
									<PlayBtn
										track={{
											id: track.id,
											url: track.url,
											title: meta?.title ?? `Track #${track.id}`,
											artist: meta?.artist ?? "",
											cover: meta?.cover,
											yandexUrl: track.yandexUrl,
										}}
									/>
								</div>
							</>
						);

						return meta ? (
							<Link
								key={track.id}
								href={`/track?id=${track.id}`}
								className={styles.trackRow}
								style={{ height: TRACK_HEIGHT }}
							>
								{inner}
							</Link>
						) : (
							<a
								key={track.id}
								href={track.yandexUrl}
								target="_blank"
								rel="noopener noreferrer"
								className={styles.trackRow}
								style={{ height: TRACK_HEIGHT }}
							>
								{inner}
							</a>
						);
					})}
				</div>
			</div>
		</div>
	);
}

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

function Skeleton() {
	return (
		<div className={styles.list}>
			{Array.from({ length: 8 }).map((_, i) => (
				<div key={i} className={styles.trackRow} style={{ opacity: 0.4 }}>
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

export default function FckCensorTabs() {
	const [tab, setTab] = useState<TabId>("official");
	const [query, setQuery] = useState("");

	const { official, legacy, loaded } = useSyncExternalStore(
		subscribeStore,
		getStoreSnapshot,
		getServerSnapshot,
	);
	const loading = !loaded;

	useEffect(() => {
		ensureTracksLoaded();
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
