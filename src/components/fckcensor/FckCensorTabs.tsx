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
import { createPortal } from "react-dom";
import { usePlayer, PlayerProvider } from "@/lib/miniplayer";
import { MiniPlayerInner } from "@/components/miniplayer/MiniPlayer";
import LikeButton from "@/components/ui/LikeButton";
import { useAuth } from "@/lib/auth";
import {
	getPlaylists,
	getPlaylistTracks,
	addTrackToPlaylist,
	removeTrackFromPlaylist,
	type Playlist,
} from "@/lib/playlists";
import styles from "./FckCensorTabs.module.scss";
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

function AddToPlaylistBtn({
	trackId,
	playlists,
}: {
	trackId: string;
	playlists: Playlist[];
}) {
	const { user } = useAuth();
	const [open, setOpen] = useState(false);
	const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
	const [inPlaylists, setInPlaylists] = useState<Set<string>>(new Set());
	const btnRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (
				!btnRef.current?.contains(e.target as Node) &&
				!menuRef.current?.contains(e.target as Node)
			)
				setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	if (!user) return null;

	const handleOpen = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (open) { setOpen(false); return; }
		if (btnRef.current) {
			const rect = btnRef.current.getBoundingClientRect();
			setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
		}
		const results = await Promise.all(playlists.map((pl) => getPlaylistTracks(pl.id)));
		const containing = new Set<string>();
		playlists.forEach((pl, i) => {
			if (results[i].some((t) => t.track_id === trackId)) containing.add(pl.id);
		});
		setInPlaylists(containing);
		setOpen(true);
	};

	const handleToggle = async (e: React.MouseEvent, playlistId: string) => {
		e.preventDefault();
		e.stopPropagation();
		const isIn = inPlaylists.has(playlistId);
		if (isIn) {
			await removeTrackFromPlaylist(playlistId, trackId);
			setInPlaylists((prev) => { const s = new Set(prev); s.delete(playlistId); return s; });
		} else {
			await addTrackToPlaylist(playlistId, trackId, 0);
			setInPlaylists((prev) => new Set(prev).add(playlistId));
		}
	};

	return (
		<>
			<button
				ref={btnRef}
				className={styles.addToPlaylistBtn}
				onClick={handleOpen}
				aria-label="Add to playlist"
			>
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
			</button>
			{open && pos && typeof document !== "undefined" &&
				createPortal(
					<div
						ref={menuRef}
						className={styles.playlistMenu}
						style={{ top: pos.top, right: pos.right }}
						onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
					>
						{playlists.length === 0 ? (
							<div className={styles.playlistMenuEmpty}>No playlists</div>
						) : (
							playlists.map((pl) => {
								const inPlaylist = inPlaylists.has(pl.id);
								return (
									<button
										key={pl.id}
										className={`${styles.playlistMenuItem} ${inPlaylist ? styles.playlistMenuItemActive : ""}`}
										onClick={(e) => handleToggle(e, pl.id)}
									>
										<span>{pl.name}</span>
										{inPlaylist && (
											<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
												<polyline points="20 6 9 17 4 12" />
											</svg>
										)}
									</button>
								);
							})
						)}
					</div>,
					document.body,
				)}
		</>
	);
}

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

function OfficialList({ tracks, query, playlists }: OfficialListProps) {
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
										<AddToPlaylistBtn trackId={trackId} playlists={playlists} />
									)}
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

function LegacyList({ tracks, query, playlists }: LegacyListProps) {
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
									<AddToPlaylistBtn trackId={track.id} playlists={playlists} />
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
	const [playlists, setPlaylists] = useState<Playlist[]>([]);
	const { user } = useAuth();

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
		if (!user) { setPlaylists([]); return; }
		getPlaylists(user.id).then(setPlaylists);
	}, [user?.id]);

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
						<OfficialList tracks={official} query={query} playlists={playlists} />
					)}
				</>
			)}
			{tab === "legacy" && (
				<>
					<SearchBar value={query} onChange={setQuery} />
					{loading ? (
						<Skeleton />
					) : (
						<LegacyList tracks={legacy} query={query} playlists={playlists} />
					)}
				</>
			)}
		</div>
	);
}
