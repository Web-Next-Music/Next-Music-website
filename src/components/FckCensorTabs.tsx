"use client";

import {
	useState,
	useEffect,
	useRef,
	useMemo,
	createContext,
	useContext,
	useCallback,
	useSyncExternalStore,
} from "react";
import { useRouter, usePathname } from "next/navigation";
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
import styles from "./FckCensorTabs.module.css";
import playerStyles from "./MiniPlayer.module.css";
import Link from "next/link";
import type { NowPlaying } from "@/types/player";
import type {
	PlayBtnProps,
	SearchBarProps,
	OfficialListProps,
	LegacyListProps,
	DownloadTabProps,
	PlayerContextValue,
} from "@/types/ui";

export type { NowPlaying };

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

export const PlayerContext = createContext<PlayerContextValue | null>(null);

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

	const buildPayload = useCallback(
		(state: "playing" | "paused" | "stopped") => {
			const audio = audioRef.current;
			const np = nowPlayingRef.current;
			const positionSec = audio?.currentTime ?? 0;
			const durationSec =
				audio?.duration && isFinite(audio.duration) ? audio.duration : 0;
			const trackId = np?.id ?? np?.url.match(/\/(\d+)\.mp3$/)?.[1] ?? "";
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

		if (wsRef.current) {
			wsRef.current.onclose = null;
			wsRef.current.close();
			wsRef.current = null;
		}
		const ws = new WebSocket(WS_URL);
		wsRef.current = ws;
		ws.onerror = () => {};
		ws.onopen = () => console.log("[RPC-WS] Connected");
		ws.onclose = () => console.log("[RPC-WS] Disconnected");

		const onReady = () => {
			const state = isPlayingRef.current ? "playing" : "paused";
			send(buildPayload(state));
			if (state === "playing") startTick();
		};

		if (audio) {
			if (audio.duration && isFinite(audio.duration)) {
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

export function PlayerProvider({ children }: { children: React.ReactNode }) {
	const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const audioRef = useRef<HTMLAudioElement>(null);

	useRichPresenceWS(nowPlaying, isPlaying, audioRef);

	const play = useCallback((track: NowPlaying) => {
		const id = track.id ?? track.url.match(/\/(\d+)\.mp3$/)?.[1] ?? undefined;
		setNowPlaying({ ...track, id });
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
			<MiniPlayerInner />
		</PlayerContext.Provider>
	);
}

export function usePlayer() {
	return useContext(PlayerContext);
}

export function MiniPlayerInner() {
	const player = usePlayer();
	const router = useRouter();
	const pathname = usePathname();
	if (!player) return null;
	const { nowPlaying, isPlaying, pause, resume, close, audioRef } = player;
	const [progress, setProgress] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(1);
	const [muted, setMuted] = useState(false);
	const [lyricsOpen, setLyricsOpen] = useState(true);
	const progressRef = useRef<HTMLDivElement>(null);

	const isOnTrackPage = pathname === "/track";

	useEffect(() => {
		const handler = (e: Event) => {
			setLyricsOpen((e as CustomEvent<{ open: boolean }>).detail.open);
		};
		window.addEventListener("lyricsState", handler);
		return () => window.removeEventListener("lyricsState", handler);
	}, []);

	useEffect(() => {
		if (!isOnTrackPage) setLyricsOpen(true);
	}, [isOnTrackPage]);

	const handleLyricsClick = () => {
		if (!nowPlaying?.id) return;
		if (isOnTrackPage) {
			window.dispatchEvent(new CustomEvent("toggleLyrics"));
		} else {
			router.push(`/track?id=${nowPlaying.id}`);
		}
	};

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

	useEffect(() => {
		const root = document.documentElement;
		if (nowPlaying) {
			document.body.classList.add("has-mini-player");
			root.style.setProperty("--mini-player-h", "48px");
		} else {
			document.body.classList.remove("has-mini-player");
			root.style.setProperty("--mini-player-h", "0px");
		}
		return () => {
			document.body.classList.remove("has-mini-player");
			root.style.setProperty("--mini-player-h", "0px");
		};
	}, [!!nowPlaying]);

	if (!nowPlaying) return null;

	const pct = duration ? (progress / duration) * 100 : 0;
	const trackId = nowPlaying.id;

	return (
		<div className={playerStyles.bar}>
			<div className={playerStyles.inner}>
				<div className={playerStyles.left}>
					{nowPlaying.cover ? (
						<img src={nowPlaying.cover} alt="" className={playerStyles.cover} />
					) : (
						<div className={playerStyles.coverPlaceholder} />
					)}
					<div className={playerStyles.info}>
						<span className={playerStyles.title}>{nowPlaying.title}</span>
						<span className={playerStyles.artist}>{nowPlaying.artist}</span>
					</div>
				</div>

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

				{trackId && (
					<button
						className={`${playerStyles.btn} ${isOnTrackPage && lyricsOpen ? playerStyles.btnActive : ""}`}
						onClick={handleLyricsClick}
						aria-label={isOnTrackPage ? "Toggle lyrics" : "View lyrics"}
						title={isOnTrackPage ? "Toggle lyrics" : "Lyrics / Track page"}
					>
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none">
							<path
								d="M4 6h16M4 10h10M4 14h12M4 18h8"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
							/>
						</svg>
					</button>
				)}

				<button
					className={playerStyles.btn}
					onClick={isPlaying ? pause : resume}
					aria-label={isPlaying ? "Pause" : "Play"}
				>
					{isPlaying ? (
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
							<rect x="6" y="4" width="4" height="16" rx="1" />
							<rect x="14" y="4" width="4" height="16" rx="1" />
						</svg>
					) : (
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
							<path d="M5 3l14 9-14 9V3z" />
						</svg>
					)}
				</button>

				<div className={playerStyles.volumeWrap}>
					<button
						className={playerStyles.btn}
						onClick={toggleMute}
						aria-label={muted ? "Unmute" : "Mute"}
					>
						{effectiveVolume === 0 ? (
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none">
								<path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" />
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
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none">
								<path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" />
								<path
									d="M15.5 8.5a5 5 0 0 1 0 7"
									stroke="currentColor"
									strokeWidth="1.8"
									strokeLinecap="round"
									fill="none"
								/>
							</svg>
						) : (
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none">
								<path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" />
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

function DownloadTab({ type, url }: DownloadTabProps) {
	const isJson = type === "json";
	return (
		<div className={styles.downloadPane}>
			<p className={styles.downloadDesc}>
				{isJson ? "Track list as a JSON file" : "M3U playlist"}
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
