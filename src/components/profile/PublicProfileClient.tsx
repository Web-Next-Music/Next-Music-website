"use client";

import { useState, useEffect } from "react";
import {
	getPublicProfile,
	getUserPinnedPlaylists,
	type UserProfile,
} from "@/lib/publicProfile";
import {
	getPlaylistTracks,
	type Playlist,
	type PlaylistTrack,
} from "@/lib/playlists";
import { decodeTrackKey } from "@/lib/trackKey";
import { findTrackById } from "@/lib/trackStore";
import { TRACK_META } from "@/lib/fckcensor";
import { marked } from "marked";
import TrackRow from "@/components/ui/TrackRow";
import styles from "./profile.module.scss";

marked.use({ breaks: true, gfm: true } as Parameters<typeof marked.use>[0]);

function renderBio(text: string): string {
	return marked.parse(text) as string;
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

function PublicPlaylistSection({ playlist }: { playlist: Playlist }) {
	const [open, setOpen] = useState(false);
	const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
	const [loading, setLoading] = useState(false);

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
							return (
								<TrackRow
									key={pt.id}
									trackId={pt.track_id}
									index={i}
									title={title}
									artist={artist}
									cover={cover}
									dbMeta={{ title, artist, cover, mp3_url }}
									showLike
								/>
							);
						})
					)}
				</div>
			)}
		</div>
	);
}

export default function PublicProfileClient({
	githubId,
}: {
	githubId: string;
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
		getPublicProfile(githubId).then((result) => {
			if (!result) {
				setProfile(null);
				return;
			}
			const { profile, stats } = result;
			setProfile(profile);
			setStats(stats);
			const name = profile.display_name ?? profile.github_login ?? githubId;
			document.title = `${name} - Next Music`;
			getUserPinnedPlaylists(profile.user_id).then(setPlaylists);
		});
		return () => {
			document.title = "Next Music";
		};
	}, [githubId]);

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
				<p className={styles.centeredText}>User not found</p>
			</div>
		);
	}

	const displayName = profile.display_name ?? profile.github_login ?? githubId;

	return (
		<div className={`${styles.page} ${styles.publicPage}`}>
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

							<div className={styles.separator}></div>
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
