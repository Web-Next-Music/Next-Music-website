"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePlayer } from "@/lib/miniplayer/context";
import { useAuth } from "@/lib/auth";
import { encodeTrackKey, decodeTrackKey } from "@/lib/trackKey";
import {
	getPlaylistTracks,
	addTrackToPlaylist,
	removeTrackFromPlaylist,
	type Playlist,
} from "@/lib/playlists";
import type { TrackLikeMeta } from "@/lib/likesContext";
import LikeButton from "./LikeButton";
import styles from "./TrackRow.module.css";

function buildHref(trackId: string, dbMeta?: TrackLikeMeta): string {
	const mp3_url = dbMeta?.mp3_url;
	if (mp3_url) {
		return `/track?key=${encodeTrackKey({
			url: mp3_url,
			title: dbMeta?.title,
			artist: dbMeta?.artist,
			cover: dbMeta?.cover,
		})}`;
	}
	if (!trackId.startsWith("http")) {
		const decoded = decodeTrackKey(trackId);
		if (decoded?.url) return `/track?key=${trackId}`;
	}
	return `/track?id=${trackId}`;
}

function PlayBtn({ trackId, title, artist, cover, dbMeta }: { trackId: string; title?: string; artist?: string; cover?: string; dbMeta?: TrackLikeMeta }) {
	const player = usePlayer();
	const [loading, setLoading] = useState(false);
	if (!player) return null;

	const { nowPlaying, isPlaying, play, pause, resume } = player;
	const isThis = nowPlaying?.id === trackId || nowPlaying?.url === trackId;
	const active = isThis && isPlaying;

	const handleClick = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (isThis) { isPlaying ? pause() : resume(); return; }
		const decoded = !trackId.startsWith("http") ? decodeTrackKey(trackId) : null;
		const playUrl = dbMeta?.mp3_url ?? decoded?.url;
		if (playUrl) {
			play({
				id: trackId,
				url: playUrl,
				title: dbMeta?.title ?? title ?? decoded?.title ?? "Unknown",
				artist: dbMeta?.artist ?? artist ?? decoded?.artist ?? "",
				cover: dbMeta?.cover ?? cover ?? decoded?.cover,
			});
			return;
		}
		setLoading(true);
		const { ensureTracksLoaded, findTrackById } = await import("@/lib/trackStore");
		await ensureTracksLoaded();
		const track = findTrackById(trackId);
		if (track) play({ id: track.id, url: track.url, title: track.title, artist: track.artist, cover: track.cover, yandexUrl: track.yandexUrl });
		setLoading(false);
	};

	return (
		<button
			className={`${styles.playBtn} ${isThis ? styles.playBtnActive : ""}`}
			onClick={handleClick}
			aria-label={active ? "Pause" : "Play"}
		>
			{loading ? (
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
					<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
				</svg>
			) : active ? (
				<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
					<rect x="6" y="4" width="4" height="16" rx="1" />
					<rect x="14" y="4" width="4" height="16" rx="1" />
				</svg>
			) : (
				<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
					<path d="M5 3l14 9-14 9V3z" />
				</svg>
			)}
		</button>
	);
}

function AddToPlaylistMenu({
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
			if (!btnRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	if (!user || playlists.length === 0) return null;

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
				className={styles.actionBtn}
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
						className={styles.menu}
						style={{ top: pos.top, right: pos.right }}
						onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
					>
						{playlists.map((pl) => {
							const isIn = inPlaylists.has(pl.id);
							return (
								<button
									key={pl.id}
									className={`${styles.menuItem} ${isIn ? styles.menuItemActive : ""}`}
									onClick={(e) => handleToggle(e, pl.id)}
								>
									<span>{pl.name}</span>
									{isIn && (
										<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
											<polyline points="20 6 9 17 4 12" />
										</svg>
									)}
								</button>
							);
						})}
					</div>,
					document.body,
				)}
		</>
	);
}

export interface TrackRowProps {
	trackId: string;
	index: number;
	title: string;
	artist?: string;
	cover?: string;
	dbMeta?: TrackLikeMeta;
	playlists?: Playlist[];
	showLike?: boolean;
	onRemove?: (e: React.MouseEvent) => void;
}

export default function TrackRow({
	trackId,
	index,
	title,
	artist,
	cover,
	dbMeta,
	playlists,
	showLike,
	onRemove,
}: TrackRowProps) {
	const player = usePlayer();
	const isThis = player?.nowPlaying?.id === trackId || player?.nowPlaying?.url === trackId;
	const href = buildHref(trackId, dbMeta);

	return (
		<Link
			href={href}
			className={`${styles.row} ${isThis ? styles.rowActive : ""}`}
		>
			<span className={styles.num}>{index + 1}</span>
			<div className={styles.cover}>
				{cover ? (
					<img src={cover} alt="" className={styles.coverImg} loading="lazy" />
				) : (
					<div className={styles.coverPlaceholder}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
							<path d="M9 18V5l12-2v13" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
							<circle cx="6" cy="18" r="3" stroke="var(--muted)" strokeWidth="1.5" />
							<circle cx="18" cy="16" r="3" stroke="var(--muted)" strokeWidth="1.5" />
						</svg>
					</div>
				)}
			</div>
			<div className={styles.info}>
				<span className={styles.title}>{title}</span>
				{artist && <span className={styles.artist}>{artist}</span>}
			</div>
			<div
				className={styles.actions}
				onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
			>
				{playlists && <AddToPlaylistMenu trackId={trackId} playlists={playlists} />}
				{showLike && (
					<LikeButton
						compact
						target={{
							type: "track",
							trackId,
							meta: {
								title,
								artist,
								cover,
								mp3_url: dbMeta?.mp3_url,
							},
						}}
					/>
				)}
				{onRemove && (
					<button className={`${styles.actionBtn} ${styles.actionBtnRemove}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(e); }} aria-label="Remove">
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				)}
				<PlayBtn trackId={trackId} title={title} artist={artist} cover={cover} dbMeta={dbMeta} />
			</div>
		</Link>
	);
}
