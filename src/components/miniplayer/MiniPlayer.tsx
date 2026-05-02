"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/lib/miniplayer";
import styles from "./MiniPlayer.module.css";

export function MiniPlayerInner({ isHiddenMode }: { isHiddenMode: boolean }) {
	const player = usePlayer();
	const router = useRouter();
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

	useEffect(() => {
		const root = document.documentElement;
		if (nowPlaying) {
			document.body.classList.add("has-mini-player");
			root.style.setProperty("--mini-player-h", "47px");
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
	const isDirectUrl = !!nowPlaying.directUrl;

	return (
		<div className={styles.bar}>
			<div className={styles.inner}>
				<div
					className={styles.left}
					style={{
						pointerEvents: isHiddenMode ? "none" : "auto",
					}}
					onClick={() => {
						if (nowPlaying.directUrl) {
							const params = new URLSearchParams({
								url: nowPlaying.directUrl,
							});
							if (nowPlaying.cover) params.set("cover", nowPlaying.cover);
							if (nowPlaying.artist) params.set("artist", nowPlaying.artist);
							if (nowPlaying.title) params.set("title", nowPlaying.title);
							router.push(`/track?${params.toString()}`);
						} else if (trackId) {
							router.push(`/track?id=${trackId}`);
						}
					}}
				>
					{nowPlaying.cover ? (
						<img src={nowPlaying.cover} alt="" className={styles.cover} />
					) : (
						<div className={styles.coverPlaceholder} />
					)}
					<div className={styles.info}>
						<span className={styles.title}>{nowPlaying.title}</span>
						<span className={styles.artist}>{nowPlaying.artist}</span>
					</div>
				</div>

				<span className={styles.timeSingle}>{fmt(progress)}</span>
				<div
					className={styles.progressWrap}
					onClick={handleSeek}
					ref={progressRef}
				>
					<div className={styles.progressFill} style={{ width: `${pct}%` }} />
				</div>
				<span className={styles.timeSingle}>{fmt(duration)}</span>

				<button
					className={styles.btn}
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

				<div className={styles.volumeWrap}>
					<button
						className={styles.btn}
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
					<div className={styles.volumeSliderWrap}>
						<input
							type="range"
							min="0"
							max="1"
							step="0.02"
							value={muted ? 0 : volume}
							onChange={handleVolumeChange}
							className={styles.volumeSlider}
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
					className={styles.btn}
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
