"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
	getProfileByUsername,
	getUserPinnedPlaylists,
	getUserStats,
	type UserProfile,
} from "@/lib/publicProfile";
import {
	getPlaylistTracks,
	type Playlist,
	type PlaylistTrack,
} from "@/lib/playlists";
import { usePlayer } from "@/lib/miniplayer/context";
import { encodeTrackKey, decodeTrackKey } from "@/lib/trackKey";
import { findTrackById, ensureTracksLoaded } from "@/lib/trackStore";
import { TRACK_META } from "@/lib/fckcensor";
import { marked } from "marked";
import LikeButton from "@/components/ui/LikeButton";
import styles from "./PublicProfileClient.module.css";

marked.use({ breaks: true, gfm: true } as Parameters<typeof marked.use>[0]);

function renderBio(text: string): string {
	return marked.parse(text) as string;
}

function trackHref(trackId: string): string {
	if (!trackId.startsWith("http")) {
		const decoded = decodeTrackKey(trackId);
		if (decoded?.url) {
			return `/track?key=${encodeTrackKey(decoded)}`;
		}
	}
	return `/track?id=${trackId}`;
}

function resolveTrackMeta(trackId: string) {
	const meta = TRACK_META[trackId];
	if (meta) return meta;
	const stored = findTrackById(trackId);
	if (stored)
		return { title: stored.title, artist: stored.artist, cover: stored.cover };
	if (!trackId.startsWith("http")) {
		const decoded = decodeTrackKey(trackId);
		if (decoded?.title || decoded?.artist)
			return {
				title: decoded.title,
				artist: decoded.artist,
				cover: decoded.cover,
			};
	}
	return null;
}

function PlayBtn({ trackId, small }: { trackId: string; small?: boolean }) {
	const player = usePlayer();
	const [loading, setLoading] = useState(false);
	if (!player) return null;

	const { nowPlaying, isPlaying, play, pause, resume } = player;
	const isThis = nowPlaying?.id === trackId || nowPlaying?.url === trackId;
	const active = isThis && isPlaying;

	const handleClick = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (isThis) {
			isPlaying ? pause() : resume();
			return;
		}

		const decoded = !trackId.startsWith("http")
			? decodeTrackKey(trackId)
			: null;
		const playUrl = decoded?.url;
		if (playUrl) {
			play({
				id: trackId,
				url: playUrl,
				title: decoded?.title ?? "Unknown",
				artist: decoded?.artist ?? "",
				cover: decoded?.cover,
			});
			return;
		}
		setLoading(true);
		await ensureTracksLoaded();
		const track = findTrackById(trackId);
		if (track)
			play({
				id: track.id,
				url: track.url,
				title: track.title,
				artist: track.artist,
				cover: track.cover,
				yandexUrl: track.yandexUrl,
			});
		setLoading(false);
	};

	const sz = small ? 12 : 14;
	return (
		<button
			className={`${styles.playBtn} ${isThis ? styles.playBtnActive : ""}`}
			onClick={handleClick}
			aria-label={active ? "Pause" : "Play"}
		>
			{loading ? (
				<svg
					width={sz}
					height={sz}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					strokeLinecap="round"
				>
					<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
				</svg>
			) : active ? (
				<svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor">
					<rect x="6" y="4" width="4" height="16" rx="1" />
					<rect x="14" y="4" width="4" height="16" rx="1" />
				</svg>
			) : (
				<svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor">
					<path d="M5 3l14 9-14 9V3z" />
				</svg>
			)}
		</button>
	);
}

function PublicPlaylistSection({ playlist }: { playlist: Playlist }) {
	const [open, setOpen] = useState(false);
	const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
	const [loading, setLoading] = useState(false);
	const player = usePlayer();

	useEffect(() => {
		if (open && tracks.length === 0) {
			setLoading(true);
			getPlaylistTracks(playlist.id).then((data) => {
				setTracks(data);
				setLoading(false);
			});
		}
	}, [open, playlist.id]);

	return (
		<div className={styles.playlistItem}>
			<div className={styles.playlistHeader} onClick={() => setOpen((v) => !v)}>
				<div className={styles.playlistChevron} data-open={open}>
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
					>
						<path d="M9 18l6-6-6-6" />
					</svg>
				</div>
				<span className={styles.playlistName}>{playlist.name}</span>
				<span className={styles.playlistCount}>
					{tracks.length > 0 ? `${tracks.length} tracks` : ""}
				</span>
			</div>

			{open && (
				<div className={styles.playlistTracks}>
					{loading ? (
						<div className={styles.loadingSmall}>Loading…</div>
					) : tracks.length === 0 ? (
						<div className={styles.emptySmall}>No tracks</div>
					) : (
						tracks.map((pt, i) => {
							const meta = resolveTrackMeta(pt.track_id);
							const title = meta?.title ?? pt.track_id;
							const artist = meta?.artist ?? "";
							const cover = meta?.cover;
							const mp3_url =
								(!pt.track_id.startsWith("http")
									? decodeTrackKey(pt.track_id)?.url
									: undefined) ?? findTrackById(pt.track_id)?.url;
							const isThis =
								player?.nowPlaying?.id === pt.track_id ||
								player?.nowPlaying?.url === pt.track_id;
							return (
								<div
									key={pt.id}
									className={`${styles.trackRow} ${isThis ? styles.trackRowActive : ""}`}
								>
									<span className={styles.trackNum}>{i + 1}</span>
									<div className={styles.trackCoverWrap}>
										{cover ? (
											<img
												src={cover}
												alt=""
												className={styles.trackCover}
												loading="lazy"
											/>
										) : (
											<div className={styles.trackCoverPlaceholder} />
										)}
										<PlayBtn trackId={pt.track_id} small />
									</div>
									<div className={styles.trackInfo}>
										<Link
											href={trackHref(pt.track_id)}
											className={styles.trackTitle}
										>
											{title}
										</Link>
										{artist && (
											<span className={styles.trackArtist}>{artist}</span>
										)}
									</div>
									<LikeButton
										target={{
											type: "track",
											trackId: pt.track_id,
											meta: { title, artist, cover, mp3_url },
										}}
										compact
										className={styles.trackLikeBtn}
									/>
								</div>
							);
						})
					)}
				</div>
			)}
		</div>
	);
}

export default function PublicProfileClient({
	username,
}: {
	username: string;
}) {
	const [profile, setProfile] = useState<UserProfile | null | "loading">(
		"loading",
	);
	const [playlists, setPlaylists] = useState<Playlist[]>([]);
	const [stats, setStats] = useState<{
		likes: number;
		playlists: number;
	} | null>(null);

	useEffect(() => {
		getProfileByUsername(username).then((p) => {
			setProfile(p);
			if (p) {
				getUserPinnedPlaylists(p.user_id).then(setPlaylists);
				getUserStats(p.user_id).then(setStats);
			}
		});
	}, [username]);

	if (profile === "loading") {
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

	if (!profile) {
		return (
			<div className={styles.centered}>
				<p className={styles.centeredText}>
					User <strong>@{username}</strong> not found
				</p>
			</div>
		);
	}

	const displayName = profile.display_name ?? profile.github_login ?? username;

	return (
		<div className={styles.page}>
			<div className={styles.layout}>
				<aside className={styles.sidebar}>
					<div className={styles.userCard}>
						{profile.avatar_url ? (
							<img
								src={profile.avatar_url}
								alt={displayName}
								className={styles.avatar}
							/>
						) : (
							<div className={styles.avatarPlaceholder}>
								{displayName[0].toUpperCase()}
							</div>
						)}
						<h1 className={styles.username}>{displayName}</h1>
					</div>

					{stats && (
						<div className={styles.statsCard}>
							<div className={styles.statItem}>
								<svg
									width="15"
									height="15"
									viewBox="0 0 24 24"
									fill="currentColor"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
								</svg>
								<span className={styles.statValue}>{stats.likes}</span>
								<span className={styles.statLabel}>Liked tracks</span>
							</div>
							<div className={styles.statItem}>
								<svg
									width="15"
									height="15"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
								>
									<line x1="8" y1="6" x2="21" y2="6" />
									<line x1="8" y1="12" x2="21" y2="12" />
									<line x1="8" y1="18" x2="21" y2="18" />
									<line x1="3" y1="6" x2="3.01" y2="6" />
									<line x1="3" y1="12" x2="3.01" y2="12" />
									<line x1="3" y1="18" x2="3.01" y2="18" />
								</svg>
								<span className={styles.statValue}>{stats.playlists}</span>
								<span className={styles.statLabel}>Playlists</span>
							</div>
						</div>
					)}
				</aside>

				<div className={styles.content}>
					{profile.bio && (
						<section className={styles.section}>
							<div className={styles.sectionHeader}>
								<h2 className={styles.sectionTitle}>Bio</h2>
							</div>
							<div
								className={styles.bioRendered}
								dangerouslySetInnerHTML={{ __html: renderBio(profile.bio) }}
							/>
						</section>
					)}

					<section
						className={styles.section}
						style={profile.bio ? { marginTop: 20 } : undefined}
					>
						<div className={styles.sectionHeader}>
							<h2 className={styles.sectionTitle}>Pinned Playlists</h2>
						</div>
						{playlists.length === 0 ? (
							<div className={styles.empty}>No pinned playlists</div>
						) : (
							<div className={styles.playlistList}>
								{playlists.map((pl) => (
									<PublicPlaylistSection key={pl.id} playlist={pl} />
								))}
							</div>
						)}
					</section>
				</div>
			</div>
		</div>
	);
}
