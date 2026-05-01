"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { usePlayer } from "@/components/fckcensor/FckCensorTabs";
import {
	ensureTracksLoaded,
	subscribeStore,
	getStoreSnapshot,
	findTrackById,
	type CachedTrack,
} from "@/lib/trackStore";
import styles from "./page.module.css";
import { ID3Writer } from "browser-id3-writer";

interface LrcLine {
	time: number;
	text: string;
}

function parseLrc(raw: string): LrcLine[] {
	const lines: LrcLine[] = [];
	const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
	for (const line of raw.split("\n")) {
		const m = line.match(re);
		if (!m) continue;
		const min = parseInt(m[1], 10);
		const sec = parseInt(m[2], 10);
		const ms = parseInt(m[3].padEnd(3, "0"), 10);
		const time = min * 60 + sec + ms / 1000;
		const text = m[4].trim();
		if (text) lines.push({ time, text });
	}
	return lines;
}

interface LrcResult {
	synced: LrcLine[] | null;
	plain: string | null;
	found: boolean;
}

async function fetchLyrics(title: string, artist: string): Promise<LrcResult> {
	const empty: LrcResult = { synced: null, plain: null, found: false };

	const parse = (data: any): LrcResult | null => {
		if (!data || data.statusCode === 404) return null;
		const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics) : null;
		const plain = data.plainLyrics ?? null;
		if (!synced && !plain) return null;
		return { synced, plain, found: true };
	};

	try {
		const q = new URLSearchParams({
			track_name: title,
			artist_name: artist,
		});
		const fast = await fetch(`https://lrclib.net/api/get?${q}`);
		if (fast.ok) {
			const result = parse(await fast.json());
			if (result) return result;
		}

		const search = await fetch(`https://lrclib.net/api/search?${q}`);
		if (!search.ok) return empty;
		const list = await search.json();
		if (!list?.length) return empty;
		const best = list.find((d: any) => d.syncedLyrics) ?? list[0];
		const result = parse(best);
		return result ?? empty;
	} catch {
		return empty;
	}
}

async function handleDownload(
	audioUrl: string,
	artist: string,
	title: string,
	cover?: string,
) {
	const audioRes = await fetch(audioUrl);
	const arrayBuffer = await audioRes.arrayBuffer();

	const writer = new ID3Writer(arrayBuffer);

	if (cover) {
		const coverRes = await fetch(cover);
		const coverBuffer = await coverRes.arrayBuffer();

		writer.setFrame("APIC", {
			type: 3,
			data: coverBuffer,
			description: "Cover",
		});
	}

	writer.setFrame("TIT2", title);
	writer.setFrame("TPE1", [artist]);

	writer.addTag();

	const blob = writer.getBlob();

	const objectUrl = URL.createObjectURL(blob);

	const a = document.createElement("a");
	a.href = objectUrl;
	a.download = `${artist} - ${title}.mp3`;
	a.click();

	URL.revokeObjectURL(objectUrl);
}

function TrackPageContent({ isHiddenMode }: { isHiddenMode: boolean }) {
	const searchParams = useSearchParams();

	const id = searchParams.get("id") ?? "";
	const directUrl = searchParams.get("url")!;
	const paramCover = searchParams.get("cover");
	const paramArtist = searchParams.get("artist") ?? "Unknown Artist";
	const paramTitle = searchParams.get("title") ?? "Unknown Title";

	const router = useRouter();

	const [storeReady, setStoreReady] = useState(() => getStoreSnapshot().loaded);
	const [track, setTrack] = useState<CachedTrack | null>(null);

	// Create virtual track for direct URL mode
	const urlTrack =
		directUrl && !id
			? {
					id: "",
					url: directUrl,
					title: paramTitle ?? "Unknown",
					artist: paramArtist ?? "",
					cover: paramCover ?? "",
					yandexUrl: "",
				}
			: null;

	// Use store track or virtual URL track
	const displayTrack = track ?? urlTrack;
	const [notFound, setNotFound] = useState(false);

	const [lyrics, setLyrics] = useState<LrcResult | null>(null);
	const [lyricsLoading, setLyricsLoading] = useState(false);
	const [showLyrics, setShowLyrics] = useState(true);

	const player = usePlayer();
	const [activeLine, setActiveLine] = useState(-1);

	const [ugcState, setUgcState] = useState<
		"idle" | "loading" | "playing" | "error"
	>("idle");

	const lyricsContainerRef = useRef<HTMLDivElement>(null);
	const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
	const userScrolling = useRef(false);
	const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const handler = () => setShowLyrics((v) => !v);
		window.addEventListener("toggleLyrics", handler);
		return () => window.removeEventListener("toggleLyrics", handler);
	}, []);

	useEffect(() => {
		if (getStoreSnapshot().loaded) {
			setStoreReady(true);
			return;
		}
		const unsub = subscribeStore(() => {
			if (getStoreSnapshot().loaded) {
				setStoreReady(true);
				unsub();
			}
		});
		ensureTracksLoaded();
		return unsub;
	}, []);

	useEffect(() => {
		if (!storeReady) return;
		// Only check for notFound when using id (not for url mode)
		if (!id && !directUrl) {
			setNotFound(true);
			return;
		}
		if (id) {
			const found = findTrackById(id);
			found ? setTrack(found) : setNotFound(true);
		}
		// For url mode, displayTrack will be used from the virtual track
	}, [storeReady, id, directUrl]);

	const playedRef = useRef(false);

	useEffect(() => {
		if (!directUrl || !player || playedRef.current) return;
		playedRef.current = true;

		try {
			const host = new URL(directUrl).hostname;
			if (!host.endsWith("yandex.net")) {
				setUgcState("error");
				return;
			}
		} catch {
			setUgcState("error");
			return;
		}

		setUgcState("playing");
	}, [player, directUrl, paramTitle, paramArtist, paramCover]);

	useEffect(() => {
		if (!displayTrack?.title) return;
		setLyrics(null);
		setLyricsLoading(true);
		setShowLyrics(true);
		setActiveLine(-1);
		if (lyricsContainerRef.current) {
			lyricsContainerRef.current.scrollTop = 0;
		}
		fetchLyrics(displayTrack?.title, displayTrack?.artist).then((res) => {
			setLyrics(res);
			setLyricsLoading(false);
			if (!res.found) setShowLyrics(false);
		});
	}, [displayTrack?.title, displayTrack?.artist]);

	const isThisLoaded = id
		? player?.nowPlaying?.id === id
		: player?.nowPlaying?.url === directUrl;

	useEffect(() => {
		if (!lyrics?.synced) return;
		if (!isThisLoaded) {
			setActiveLine(-1);
			return;
		}

		const lines = lyrics.synced;
		let rafId: number;
		let lastIdx = -1;

		const tick = () => {
			const audio = player?.audioRef.current;
			const t = audio?.currentTime ?? 0;

			let idx = -1;
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].time <= t) idx = i;
			}

			if (idx !== lastIdx) {
				lastIdx = idx;
				setActiveLine(idx);
			}

			rafId = requestAnimationFrame(tick);
		};

		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	}, [lyrics?.synced, isThisLoaded, player?.audioRef]);

	useEffect(() => {
		if (!isThisLoaded) {
			setActiveLine(-1);
		}
	}, [isThisLoaded]);

	useEffect(() => {
		if (activeLine < 0 || userScrolling.current) return;
		const container = lyricsContainerRef.current;
		const el = lineRefs.current[activeLine];
		if (!container || !el) return;

		const containerRect = container.getBoundingClientRect();
		const elRect = el.getBoundingClientRect();
		const elOffsetInContainer =
			elRect.top - containerRect.top + container.scrollTop;

		if (activeLine === 0) {
			container.scrollTo({ top: 0, behavior: "smooth" });
		} else {
			const targetScrollTop =
				elOffsetInContainer - container.clientHeight / 2 + el.clientHeight / 2;
			container.scrollTo({ top: targetScrollTop, behavior: "smooth" });
		}
	}, [activeLine]);

	const handleLyricsScroll = useCallback(() => {
		userScrolling.current = true;
		if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
		scrollTimeout.current = setTimeout(() => {
			userScrolling.current = false;
		}, 3000);
	}, []);

	const handlePlay = useCallback(() => {
		if (!displayTrack || !player) return;
		player.play({
			id: displayTrack.id,
			url: displayTrack.url,
			directUrl: directUrl ? displayTrack.url : undefined,
			title: displayTrack.title,
			artist: displayTrack.artist,
			cover: displayTrack.cover,
			yandexUrl: displayTrack.yandexUrl,
		});
	}, [displayTrack, player, directUrl]);

	useEffect(() => {
		window.dispatchEvent(
			new CustomEvent("lyricsState", { detail: { open: showLyrics } }),
		);
	}, [showLyrics]);

	const isThisPlaying = isThisLoaded && player?.isPlaying;

	// No fallback needed - displayTrack handles all cases

	if (!storeReady) {
		return (
			<div className={styles.centered}>
				<div className={styles.loadingDots}>
					<span />
					<span />
					<span />
				</div>
				<p className={styles.centeredDesc}>Loading track list…</p>
			</div>
		);
	}

	if (notFound) {
		return (
			<div className={styles.centered}>
				<div className={styles.notFoundIcon}>
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none">
						<circle
							cx="12"
							cy="12"
							r="10"
							stroke="var(--muted)"
							strokeWidth="1.5"
						/>
						<path
							d="M12 8v4M12 16h.01"
							stroke="var(--muted)"
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
					</svg>
				</div>
				<h2 className={styles.centeredTitle}>Track not found</h2>
				<p className={styles.centeredDesc}>
					{id ? `Track with ID ${id} was not found` : "Track not found"}
				</p>
				<button className={styles.backBtn} onClick={() => router.back()}>
					Back
				</button>
			</div>
		);
	}

	if (!displayTrack) {
		return (
			<div className={styles.centered}>
				<div className={styles.loadingDots}>
					<span />
					<span />
					<span />
				</div>
			</div>
		);
	}

	const hasLyrics = lyrics?.found;
	const isSynced = !!lyrics?.synced;

	return (
		<div className={styles.page}>
			<div
				className={`${styles.layoutOuter} ${!showLyrics ? styles.layoutOuterCentered : ""}`}
			>
				<button
					className={styles.backLink}
					onClick={() => router.back()}
					style={{
						display: isHiddenMode ? "none" : "auto",
					}}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
						<path
							d="M19 12H5M12 5l-7 7 7 7"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</button>
				<div
					className={`${styles.layout} ${!showLyrics ? styles.layoutCentered : ""}`}
				>
					<div className={styles.heroCard}>
						<div className={styles.coverWrap}>
							{displayTrack?.cover ? (
								<img
									src={displayTrack?.cover}
									alt={displayTrack?.title}
									className={styles.heroCover}
								/>
							) : (
								<div className={styles.heroCoverPlaceholder}>
									<svg width="48" height="48" viewBox="0 0 24 24" fill="none">
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

							<button
								className={styles.coverPlayBtn}
								onClick={
									isThisPlaying
										? player?.pause
										: isThisLoaded
											? player?.resume
											: handlePlay
								}
								aria-label={isThisPlaying ? "Pause" : "Play"}
							>
								{isThisPlaying ? (
									<svg
										width="28"
										height="28"
										viewBox="0 0 24 24"
										fill="currentColor"
									>
										<rect x="6" y="4" width="4" height="16" rx="1.5" />
										<rect x="14" y="4" width="4" height="16" rx="1.5" />
									</svg>
								) : (
									<svg
										width="28"
										height="28"
										viewBox="0 0 24 24"
										fill="currentColor"
									>
										<path d="M6 3.5l14 8.5-14 8.5V3.5z" />
									</svg>
								)}
							</button>

							{isThisPlaying && (
								<div className={styles.playingBadge}>
									<span />
									<span />
									<span />
								</div>
							)}
						</div>

						<div className={styles.heroMeta}>
							<h1 className={styles.heroTitle}>{displayTrack?.title}</h1>
							<p className={styles.heroArtist}>
								{displayTrack?.artist || "Unknown artist"}
							</p>
							{displayTrack?.id && (
								<p className={styles.heroId}>ID: {displayTrack?.id}</p>
							)}
						</div>

						<div className={styles.heroActions}>
							{isHiddenMode && (
								<button
									onClick={() =>
										handleDownload(
											directUrl,
											paramArtist,
											paramTitle,
											paramCover,
										)
									}
									className={styles.outlineBtn}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										aria-hidden="true"
										role="img"
										width="15"
										height="15"
										viewBox="0 0 24 24"
									>
										<g
											fill="none"
											stroke="currentColor"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
										>
											<path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
											<path d="m7 10l5 5l5-5" />
										</g>
									</svg>
									Download
								</button>
							)}

							{displayTrack?.yandexUrl && (
								<a
									href={displayTrack?.yandexUrl}
									target="_blank"
									rel="noopener noreferrer"
									className={styles.outlineBtn}
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
										<path
											d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"
											stroke="currentColor"
											strokeWidth="1.8"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
										<polyline
											points="15 3 21 3 21 9"
											stroke="currentColor"
											strokeWidth="1.8"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
										<line
											x1="10"
											y1="14"
											x2="21"
											y2="3"
											stroke="currentColor"
											strokeWidth="1.8"
											strokeLinecap="round"
										/>
									</svg>
									Yandex Music
								</a>
							)}

							{lyricsLoading}

							{lyrics !== null && !hasLyrics && !lyricsLoading}
						</div>
					</div>

					{showLyrics && (
						<div className={styles.lyricsPanel}>
							<div className={styles.lyricsMeta}>
								<span className={styles.lyricsLabel}>
									{lyricsLoading ? (
										<>
											<span className={styles.miniDots}>
												<span />
												<span />
												<span />
											</span>
											Searching…
										</>
									) : isSynced ? (
										<>
											<svg
												width="11"
												height="11"
												viewBox="0 0 24 24"
												fill="none"
											>
												<circle
													cx="12"
													cy="12"
													r="10"
													stroke="var(--accent)"
													strokeWidth="2"
												/>
												<polyline
													points="12 6 12 12 16 14"
													stroke="var(--accent)"
													strokeWidth="2"
													strokeLinecap="round"
												/>
											</svg>
											Synchronized
										</>
									) : hasLyrics ? (
										"Plain lyrics"
									) : (
										"No lyrics found"
									)}
								</span>
								{hasLyrics && !lyricsLoading && (
									<a
										href="https://lrclib.net/"
										target="_blank"
										rel="noopener noreferrer"
										className={styles.lyricsSource}
									>
										via lrclib.net
									</a>
								)}
							</div>

							{lyricsLoading && (
								<div className={styles.lyricsSkeleton}>
									{[80, 55, 90, 45, 70, 60, 85, 50, 75, 40].map((w, i) => (
										<div
											key={i}
											className={styles.skeletonLine}
											style={{
												width: `${w}%`,
												animationDelay: `${i * 0.05}s`,
											}}
										/>
									))}
								</div>
							)}

							{!lyricsLoading && isSynced && (
								<div
									className={styles.syncedLyrics}
									ref={lyricsContainerRef}
									onScroll={handleLyricsScroll}
								>
									{lyrics!.synced!.map((line, i) => (
										<div
											key={i}
											ref={(el) => {
												lineRefs.current[i] = el;
											}}
											className={[
												styles.lyricLine,
												i === activeLine ? styles.lyricLineActive : "",
												i < activeLine ? styles.lyricLinePast : "",
											].join(" ")}
											onClick={() => {
												const audio = player?.audioRef.current;
												if (!isThisLoaded) {
													handlePlay();
													const trySeek = () => {
														const a = player?.audioRef.current;
														if (a && a.readyState >= 1) {
															a.currentTime = line.time;
														} else {
															setTimeout(trySeek, 50);
														}
													};
													setTimeout(trySeek, 50);
													return;
												}
												if (!audio) return;
												audio.currentTime = line.time;
												if (!player?.isPlaying) player?.resume();
											}}
										>
											<span className={styles.lyricText}>{line.text}</span>
										</div>
									))}
									<div className={styles.lyricsBottomPad} />
								</div>
							)}

							{!lyricsLoading && !isSynced && hasLyrics && (
								<div className={styles.plainLyrics}>
									{lyrics!.plain!.split("\n").map((line, i) => (
										<p
											key={i}
											className={styles.plainLine}
											style={{
												animationDelay: `${Math.min(i * 0.02, 0.5)}s`,
											}}
										>
											{line || <br />}
										</p>
									))}
								</div>
							)}

							{!lyricsLoading && lyrics !== null && !hasLyrics && (
								<div className={styles.noLyricsBody}>
									<p>No lyrics found for this track.</p>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export default function TrackPage() {
	const searchParams = useSearchParams();
	const paramToken = searchParams.get("token") ?? "";
	const isHiddenMode = paramToken === process.env.NEXT_PUBLIC_HIDDEN_MODE_TOKEN;

	return (
		<>
			<Header isHiddenMode={isHiddenMode} />
			<main>
				<Suspense fallback={<div>Loading...</div>}>
					<TrackPageContent isHiddenMode={isHiddenMode} />
				</Suspense>
			</main>
			<Footer isHiddenMode={isHiddenMode} />
		</>
	);
}
