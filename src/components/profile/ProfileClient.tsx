"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { marked } from "marked";

marked.use({ breaks: true, gfm: true } as Parameters<typeof marked.use>[0]);
function renderBio(text: string): string {
	return marked.parse(text) as string;
}
import { useAuth } from "@/lib/auth";
import { useLikes, type TrackLikeMeta } from "@/lib/likesContext";
import { usePlayer } from "@/lib/miniplayer/context";
import { encodeTrackKey, decodeTrackKey } from "@/lib/trackKey";
import {
	ensureTracksLoaded,
	subscribeStore,
	getStoreSnapshot,
	findTrackById,
} from "@/lib/trackStore";
import { TRACK_META } from "@/lib/fckcensor";
import {
	getPlaylists,
	createPlaylist,
	deletePlaylist,
	renamePlaylist,
	getPlaylistTracks,
	addTrackToPlaylist,
	removeTrackFromPlaylist,
	type Playlist,
	type PlaylistTrack,
} from "@/lib/playlists";
import {
	syncGitHubMeta,
	getOwnProfile,
	saveBio,
	getPinnedPlaylistIds,
	pinPlaylist,
	unpinPlaylist,
} from "@/lib/publicProfile";
import TrackRow from "@/components/ui/TrackRow";
import styles from "./profile.module.scss";

function trackHref(trackId: string, dbMeta?: TrackLikeMeta): string {
	const mp3_url = dbMeta?.mp3_url;
	const title = dbMeta?.title;
	const artist = dbMeta?.artist;
	const cover = dbMeta?.cover;

	if (mp3_url) {
		return `/track?key=${encodeTrackKey({ url: mp3_url, title, artist, cover })}`;
	}

	if (!trackId.startsWith("http")) {
		const decoded = decodeTrackKey(trackId);
		if (decoded?.url) {
			return `/track?key=${encodeTrackKey({
				url: decoded.url,
				title: title ?? decoded.title,
				artist: artist ?? decoded.artist,
				cover: cover ?? decoded.cover,
			})}`;
		}
	}

	return `/track?id=${trackId}`;
}

function resolveTrackMeta(
	trackId: string,
	likedMeta?: Map<string, TrackLikeMeta>,
) {
	const meta = TRACK_META[trackId];
	if (meta) return meta;
	const stored = findTrackById(trackId);
	if (stored)
		return { title: stored.title, artist: stored.artist, cover: stored.cover };
	const db = likedMeta?.get(trackId);
	if (db?.title || db?.artist || db?.cover)
		return { title: db.title, artist: db.artist, cover: db.cover };
	// Stable keys encode title/artist/cover inside them - decode as last resort
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

function PlayTrackBtn({
	trackId,
	dbMeta,
	small,
}: {
	trackId: string;
	dbMeta?: TrackLikeMeta;
	small?: boolean;
}) {
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
		// Key-based track: mp3_url from DB columns, or fall back to decoding the trackId key
		const playUrl =
			dbMeta?.mp3_url ??
			(!trackId.startsWith("http") ? decodeTrackKey(trackId)?.url : undefined);
		if (playUrl) {
			play({
				id: trackId,
				url: playUrl,
				title: dbMeta?.title ?? "Unknown",
				artist: dbMeta?.artist ?? "",
				cover: dbMeta?.cover,
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

function TrackItem({
	trackId,
	index,
	playlists,
	playlistContents,
	likedMeta,
	onAddToPlaylist,
	onRemoveFromPlaylist,
	onEnsurePlaylistLoaded,
	onUnlike,
	showUnlike,
}: {
	trackId: string;
	index: number;
	playlists: Playlist[];
	playlistContents: Record<string, Set<string>>;
	likedMeta: Map<string, TrackLikeMeta>;
	onAddToPlaylist: (trackId: string, playlistId: string) => void;
	onRemoveFromPlaylist: (trackId: string, playlistId: string) => void;
	onEnsurePlaylistLoaded: (playlistId: string) => Promise<void>;
	onUnlike?: (trackId: string) => void;
	showUnlike?: boolean;
}) {
	const meta = resolveTrackMeta(trackId, likedMeta);
	const dbMeta = likedMeta.get(trackId);
	const title = meta?.title ?? `Track #${trackId}`;
	const artist = meta?.artist ?? "";
	const cover = meta?.cover;
	const [menuOpen, setMenuOpen] = useState(false);
	const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
		null,
	);
	const [loadingPlaylists, setLoadingPlaylists] = useState(false);
	const menuWrapRef = useRef<HTMLDivElement>(null);
	const menuPortalRef = useRef<HTMLDivElement>(null);
	const player = usePlayer();
	const isThis = player?.nowPlaying?.id === trackId;

	useEffect(() => {
		if (!menuOpen) return;
		const handler = (e: MouseEvent) => {
			if (
				!menuWrapRef.current?.contains(e.target as Node) &&
				!menuPortalRef.current?.contains(e.target as Node)
			)
				setMenuOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [menuOpen]);

	const handleOpenMenu = async (e: React.MouseEvent) => {
		e.preventDefault();
		if (menuOpen) {
			setMenuOpen(false);
			setMenuPos(null);
			return;
		}
		if (menuWrapRef.current) {
			const rect = menuWrapRef.current.getBoundingClientRect();
			setMenuPos({
				top: rect.bottom + 4,
				right: window.innerWidth - rect.right,
			});
		}
		setLoadingPlaylists(true);
		await Promise.all(playlists.map((p) => onEnsurePlaylistLoaded(p.id)));
		setLoadingPlaylists(false);
		setMenuOpen(true);
	};

	return (
		<Link
			href={trackHref(trackId, dbMeta)}
			className={`${styles.trackRow} ${isThis ? styles.trackRowActive : ""}`}
		>
			<span className={styles.trackNum}>{index + 1}</span>
			<div className={styles.trackCoverWrap}>
				{cover ? (
					<img
						src={cover}
						alt=""
						className={styles.trackCover}
						loading="lazy"
					/>
				) : (
					<div className={styles.trackCoverPlaceholder}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
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
			</div>
			<div className={styles.trackInfo}>
				<span className={styles.trackTitle}>{title}</span>
				{artist && <span className={styles.trackArtist}>{artist}</span>}
			</div>
			<div
				className={styles.trackActions}
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
				}}
			>
				{playlists.length > 0 && (
					<div className={styles.menuWrap} ref={menuWrapRef}>
						<button
							className={styles.iconBtn}
							onClick={handleOpenMenu}
							title="Add to playlist"
						>
							{loadingPlaylists ? (
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.5"
									strokeLinecap="round"
								>
									<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M2 12h4M18 12h4" />
								</svg>
							) : (
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
								>
									<line x1="12" y1="5" x2="12" y2="19" />
									<line x1="5" y1="12" x2="19" y2="12" />
								</svg>
							)}
						</button>
						{menuOpen &&
							menuPos &&
							createPortal(
								<div
									ref={menuPortalRef}
									className={styles.menu}
									style={{
										position: "fixed",
										top: menuPos.top,
										right: menuPos.right,
									}}
								>
									{playlists.map((p) => {
										const inPlaylist =
											playlistContents[p.id]?.has(trackId) ?? false;
										return (
											<button
												key={p.id}
												className={`${styles.menuItem} ${inPlaylist ? styles.menuItemActive : ""}`}
												onClick={(e) => {
													e.preventDefault();
													if (inPlaylist) onRemoveFromPlaylist(trackId, p.id);
													else onAddToPlaylist(trackId, p.id);
													setMenuOpen(false);
												}}
											>
												<span className={styles.menuItemName}>{p.name}</span>
												{inPlaylist && (
													<svg
														width="13"
														height="13"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="2.5"
														strokeLinecap="round"
														strokeLinejoin="round"
													>
														<polyline points="20 6 9 17 4 12" />
													</svg>
												)}
											</button>
										);
									})}
								</div>,
								document.body,
							)}
					</div>
				)}
				{showUnlike && onUnlike && (
					<button
						className={`${styles.iconBtn} ${styles.iconBtnLiked}`}
						onClick={(e) => {
							e.preventDefault();
							onUnlike(trackId);
						}}
						title="Remove from liked"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="currentColor"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
						</svg>
					</button>
				)}
				<PlayTrackBtn trackId={trackId} dbMeta={dbMeta} />
			</div>
		</Link>
	);
}

function PlaylistSection({
	playlist,
	likedMeta,
	isPinned,
	readOnly,
	onDelete,
	onRename,
	onTogglePin,
	onContentsLoaded,
	onTrackRemoved,
}: {
	playlist: Playlist;
	likedMeta: Map<string, TrackLikeMeta>;
	isPinned: boolean;
	readOnly?: boolean;
	onDelete: (id: string) => void;
	onRename: (id: string, name: string) => void;
	onTogglePin: (id: string) => void;
	onContentsLoaded: (playlistId: string, trackIds: string[]) => void;
	onTrackRemoved: (playlistId: string, trackId: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
	const [loadingTracks, setLoadingTracks] = useState(false);
	const [editing, setEditing] = useState(false);
	const [editName, setEditName] = useState(playlist.name);
	const inputRef = useRef<HTMLInputElement>(null);
	const player = usePlayer();

	useEffect(() => {
		if (open && tracks.length === 0) {
			setLoadingTracks(true);
			getPlaylistTracks(playlist.id).then((data) => {
				setTracks(data);
				setLoadingTracks(false);
				onContentsLoaded(
					playlist.id,
					data.map((t) => t.track_id),
				);
			});
		}
	}, [open, playlist.id]);

	useEffect(() => {
		if (editing) inputRef.current?.focus();
	}, [editing]);

	const handleRename = async () => {
		const trimmed = editName.trim();
		if (!trimmed || trimmed === playlist.name) {
			setEditing(false);
			return;
		}
		await onRename(playlist.id, trimmed);
		setEditing(false);
	};

	const handleRemoveTrack = async (trackId: string) => {
		await removeTrackFromPlaylist(playlist.id, trackId);
		setTracks((prev) => prev.filter((t) => t.track_id !== trackId));
		onTrackRemoved(playlist.id, trackId);
	};

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
				{editing ? (
					<input
						ref={inputRef}
						className={styles.playlistNameInput}
						value={editName}
						onChange={(e) => setEditName(e.target.value)}
						onBlur={handleRename}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleRename();
							if (e.key === "Escape") setEditing(false);
						}}
						onClick={(e) => e.stopPropagation()}
					/>
				) : (
					<span className={styles.playlistName}>{playlist.name}</span>
				)}
				<span className={styles.playlistCount}>
					{tracks.length > 0 ? `${tracks.length} tracks` : ""}
				</span>
				{!readOnly && (
					<div
						className={styles.playlistActions}
						onClick={(e) => e.stopPropagation()}
					>
						<button
							className={`${styles.iconBtn} ${isPinned ? styles.iconBtnPinned : ""}`}
							onClick={() => onTogglePin(playlist.id)}
							title={
								isPinned ? "Unpin from public profile" : "Pin to public profile"
							}
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill={isPinned ? "currentColor" : "none"}
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<line x1="12" y1="17" x2="12" y2="22" />
								<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
							</svg>
						</button>
						<button
							className={styles.iconBtn}
							onClick={() => setEditing(true)}
							title="Rename"
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
							>
								<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
								<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
							</svg>
						</button>
						<button
							className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
							onClick={() => onDelete(playlist.id)}
							title="Delete playlist"
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
							>
								<polyline points="3 6 5 6 21 6" />
								<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
								<path d="M10 11v6M14 11v6" />
								<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
							</svg>
						</button>
					</div>
				)}
			</div>

			{open && (
				<div className={styles.playlistTracks}>
					{loadingTracks ? (
						<div className={styles.loadingSmall}>Loading…</div>
					) : tracks.length === 0 ? (
						<div className={styles.emptySmall}>No tracks yet</div>
					) : (
						tracks.map((pt, i) => {
							const meta = resolveTrackMeta(pt.track_id, likedMeta);
							const dbMeta = likedMeta.get(pt.track_id);
							return (
								<TrackRow
									key={pt.id}
									trackId={pt.track_id}
									index={i}
									title={meta?.title ?? `Track #${pt.track_id}`}
									artist={meta?.artist}
									cover={meta?.cover}
									dbMeta={dbMeta}
									onRemove={(e) => {
										e.stopPropagation();
										handleRemoveTrack(pt.track_id);
									}}
								/>
							);
						})
					)}
				</div>
			)}
		</div>
	);
}

export default function ProfileClient() {
	const { user, loading, openAuthModal } = useAuth();
	const { likedTrackIds, likedMeta, toggle: toggleLike } = useLikes();
	const player = usePlayer();
	const [playlists, setPlaylists] = useState<Playlist[]>([]);
	const [playlistsLoading, setPlaylistsLoading] = useState(false);
	const [creating, setCreating] = useState(false);
	const [newName, setNewName] = useState("");
	const newNameRef = useRef<HTMLInputElement>(null);
	const [tab, setTab] = useState<"bio" | "liked" | "playlists">("bio");
	const [, setStoreReady] = useState(() => getStoreSnapshot().loaded);
	const [playlistContents, setPlaylistContents] = useState<
		Record<string, Set<string>>
	>({});

	// Bio
	const [bio, setBio] = useState<string>("");
	const [editingBio, setEditingBio] = useState(false);
	const [bioInput, setBioInput] = useState("");
	const [bioSaving, setBioSaving] = useState(false);

	// Pinned playlists
	const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (getStoreSnapshot().loaded) return;
		const unsub = subscribeStore(() => {
			if (getStoreSnapshot().loaded) setStoreReady(true);
		});
		ensureTracksLoaded();
		return unsub;
	}, []);

	const likedIds = Array.from(likedTrackIds).filter((id) => {
		if (id.startsWith("http://") || id.startsWith("https://")) {
			const m = likedMeta.get(id);
			return !!(m?.title || m?.artist);
		}
		return true;
	});
	const hasPlayer = !!player?.nowPlaying;

	// Sync GitHub metadata and load own bio on login
	useEffect(() => {
		if (!user) return;
		const login = user.user_metadata?.user_name as string | undefined;
		const name = user.user_metadata?.full_name as string | undefined;
		const avatar = user.user_metadata?.avatar_url as string | undefined;
		if (login) syncGitHubMeta(user.id, login, name ?? null, avatar ?? null);
		getOwnProfile(user.id).then((p) => {
			if (p?.bio) setBio(p.bio);
		});
		getPinnedPlaylistIds(user.id).then(setPinnedIds);
	}, [user?.id]);

	useEffect(() => {
		if (!user) return;
		setPlaylistsLoading(true);
		getPlaylists(user.id).then((data) => {
			setPlaylists(data);
			setPlaylistsLoading(false);
		});
	}, [user?.id]);

	useEffect(() => {
		if (creating) newNameRef.current?.focus();
	}, [creating]);

	const handleEnsurePlaylistLoaded = useCallback(
		async (playlistId: string) => {
			if (playlistContents[playlistId]) return;
			const tracks = await getPlaylistTracks(playlistId);
			setPlaylistContents((prev) => ({
				...prev,
				[playlistId]: new Set(tracks.map((t) => t.track_id)),
			}));
		},
		[playlistContents],
	);

	const handleContentsLoaded = useCallback(
		(playlistId: string, trackIds: string[]) => {
			setPlaylistContents((prev) => ({
				...prev,
				[playlistId]: new Set(trackIds),
			}));
		},
		[],
	);

	const handleTrackRemoved = useCallback(
		(playlistId: string, trackId: string) => {
			setPlaylistContents((prev) => {
				const set = new Set(prev[playlistId]);
				set.delete(trackId);
				return { ...prev, [playlistId]: set };
			});
		},
		[],
	);

	const handleCreatePlaylist = async () => {
		const name = newName.trim();
		if (!name || !user) return;
		const pl = await createPlaylist(user.id, name);
		if (pl) {
			setPlaylists((prev) => [pl, ...prev]);
			setPlaylistContents((prev) => ({ ...prev, [pl.id]: new Set() }));
		}
		setNewName("");
		setCreating(false);
	};

	const handleDeletePlaylist = async (id: string) => {
		await deletePlaylist(id);
		setPlaylists((prev) => prev.filter((p) => p.id !== id));
		setPlaylistContents((prev) => {
			const n = { ...prev };
			delete n[id];
			return n;
		});
	};

	const handleRenamePlaylist = async (id: string, name: string) => {
		await renamePlaylist(id, name);
		setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
	};

	const handleAddToPlaylist = async (trackId: string, playlistId: string) => {
		await addTrackToPlaylist(playlistId, trackId, 0);
		setPlaylistContents((prev) => {
			const set = new Set(prev[playlistId] ?? []);
			set.add(trackId);
			return { ...prev, [playlistId]: set };
		});
	};

	const handleRemoveFromPlaylist = async (
		trackId: string,
		playlistId: string,
	) => {
		await removeTrackFromPlaylist(playlistId, trackId);
		setPlaylistContents((prev) => {
			const set = new Set(prev[playlistId] ?? []);
			set.delete(trackId);
			return { ...prev, [playlistId]: set };
		});
	};

	const handleSaveBio = async () => {
		if (!user) return;
		setBioSaving(true);
		await saveBio(user.id, bioInput);
		setBio(bioInput);
		setEditingBio(false);
		setBioSaving(false);
	};

	const handleTogglePin = async (playlistId: string) => {
		if (!user) return;
		if (pinnedIds.has(playlistId)) {
			setPinnedIds((prev) => {
				const s = new Set(prev);
				s.delete(playlistId);
				return s;
			});
			await unpinPlaylist(user.id, playlistId);
		} else {
			setPinnedIds((prev) => new Set(prev).add(playlistId));
			await pinPlaylist(user.id, playlistId, pinnedIds.size);
		}
	};

	if (loading) {
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

	if (!user) {
		return (
			<div className={styles.centered}>
				<p className={styles.centeredText}>Sign in to view your profile</p>
				<button className={styles.signInBtn} onClick={openAuthModal}>
					Sign In
				</button>
			</div>
		);
	}

	const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
	const username = user.user_metadata?.user_name as string | undefined;
	const displayName = user.user_metadata?.full_name as string | undefined;

	return (
		<div className={`${styles.page} ${styles.profilePage}`}>
			<div className={styles.layout}>
				<aside className={styles.sidebar}>
					<div className={styles.userCard}>
						{avatarUrl ? (
							<img src={avatarUrl} alt={username} className={styles.avatar} />
						) : (
							<div className={styles.avatarPlaceholder}>
								{(username ?? "?")[0].toUpperCase()}
							</div>
						)}
						<h1 className={styles.username}>{displayName || username}</h1>
					</div>

					<div className={styles.statsCard}>
						<button
							className={`${styles.statItem} ${tab === "bio" ? styles.statItemActive : ""}`}
							onClick={() => setTab("bio")}
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
								<circle cx="12" cy="7" r="4" />
							</svg>
							<span className={styles.statLabel} style={{ flex: 1 }}>
								Public profile
							</span>
						</button>
						<button
							className={`${styles.statItem} ${tab === "liked" ? styles.statItemActive : ""}`}
							onClick={() => setTab("liked")}
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill={tab === "liked" ? "currentColor" : "none"}
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
							</svg>
							<span className={styles.statLabel}>Liked tracks</span>
						</button>
						<button
							className={`${styles.statItem} ${tab === "playlists" ? styles.statItemActive : ""}`}
							onClick={() => setTab("playlists")}
						>
							<svg
								width="16"
								height="16"
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
							<span className={styles.statLabel}>Playlists</span>
						</button>
					</div>
				</aside>

				<div className={styles.content}>
					{tab === "bio" &&
						(() => {
							const pinnedPlaylists = playlists.filter((pl) =>
								pinnedIds.has(pl.id),
							);
							return (
								<>
									<section className={styles.section}>
										<div className={styles.sectionHeader}>
											<h2 className={styles.sectionTitle}>Bio</h2>
											{!editingBio && (
												<button
													className={styles.newPlaylistBtn}
													onClick={() => {
														setBioInput(bio);
														setEditingBio(true);
													}}
												>
													<svg
														width="12"
														height="12"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
														strokeLinecap="round"
													>
														<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
														<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
													</svg>
													{bio ? "Edit bio" : "Add bio"}
												</button>
											)}
										</div>
										{editingBio ? (
											<div className={styles.bioEditArea}>
												<textarea
													className={styles.bioTextarea}
													value={bioInput}
													onChange={(e) => setBioInput(e.target.value)}
													placeholder="Write something about yourself… (Markdown supported)"
													rows={6}
													autoFocus
												/>
												<div className={styles.bioBtnRow}>
													<button
														className={styles.bioCancel}
														onClick={() => setEditingBio(false)}
														disabled={bioSaving}
													>
														Cancel
													</button>
													<button
														className={styles.bioSave}
														onClick={handleSaveBio}
														disabled={bioSaving}
													>
														{bioSaving ? "Saving…" : "Save"}
													</button>
												</div>
											</div>
										) : bio ? (
											<div
												className={styles.bioRendered}
												dangerouslySetInnerHTML={{ __html: renderBio(bio) }}
											/>
										) : (
											<div className={styles.empty}>
												No bio yet. Click <strong>Add bio</strong> to write
												something
											</div>
										)}

										<div className={styles.separator}></div>
									</section>

									<section className={styles.section} style={{ marginTop: 20 }}>
										<div className={styles.sectionHeader}>
											<h2 className={styles.sectionTitle}>Pinned Playlists</h2>
											<button
												className={styles.newPlaylistBtn}
												onClick={() => setTab("playlists")}
											>
												Manage
												<svg
													width="11"
													height="11"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2.5"
													strokeLinecap="round"
													strokeLinejoin="round"
													style={{ marginLeft: 4 }}
												>
													<path d="M9 18l6-6-6-6" />
												</svg>
											</button>
										</div>
										{pinnedPlaylists.length === 0 ? (
											<div className={styles.empty}>
												No pinned playlists - go to <strong>Playlists</strong>{" "}
												and pin some with the 📌 button
											</div>
										) : (
											<div className={styles.playlistList}>
												{pinnedPlaylists.map((pl) => (
													<PlaylistSection
														key={pl.id}
														playlist={pl}
														likedMeta={likedMeta}
														isPinned={true}
														readOnly
														onDelete={handleDeletePlaylist}
														onRename={handleRenamePlaylist}
														onTogglePin={handleTogglePin}
														onContentsLoaded={handleContentsLoaded}
														onTrackRemoved={handleTrackRemoved}
													/>
												))}
											</div>
										)}
									</section>
								</>
							);
						})()}

					{tab === "liked" && (
						<section>
							<div className={styles.sectionHeader}>
								<h2 className={styles.sectionTitle}>Liked Tracks</h2>
								{likedIds.length > 0 && (
									<span className={styles.sectionCount}>{likedIds.length}</span>
								)}
							</div>
							{likedIds.length === 0 ? (
								<div className={styles.empty}>No liked tracks yet</div>
							) : (
								<div className={styles.trackList}>
									{likedIds.map((id, i) => {
										const meta = resolveTrackMeta(id, likedMeta);
										const dbMeta = likedMeta.get(id);
										return (
											<TrackRow
												key={id}
												trackId={id}
												index={i}
												title={meta?.title ?? `Track #${id}`}
												artist={meta?.artist}
												cover={meta?.cover}
												dbMeta={dbMeta}
												playlists={playlists}
												showLike
											/>
										);
									})}
								</div>
							)}
						</section>
					)}

					{tab === "playlists" && (
						<section className={styles.section}>
							<div className={styles.sectionHeader}>
								<h2 className={styles.sectionTitle}>Playlists</h2>
								{playlists.length > 0 && (
									<span className={styles.sectionCount}>
										{playlists.length}
									</span>
								)}
								<button
									className={styles.newPlaylistBtn}
									onClick={() => setCreating(true)}
								>
									<svg
										width="13"
										height="13"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.5"
										strokeLinecap="round"
									>
										<line x1="12" y1="5" x2="12" y2="19" />
										<line x1="5" y1="12" x2="19" y2="12" />
									</svg>
									New Playlist
								</button>
							</div>

							{creating && (
								<div className={styles.createRow}>
									<input
										ref={newNameRef}
										className={styles.createInput}
										placeholder="Playlist name…"
										value={newName}
										onChange={(e) => setNewName(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleCreatePlaylist();
											if (e.key === "Escape") {
												setCreating(false);
												setNewName("");
											}
										}}
									/>
									<button
										className={styles.createConfirm}
										onClick={handleCreatePlaylist}
									>
										Create
									</button>
									<button
										className={styles.createCancel}
										onClick={() => {
											setCreating(false);
											setNewName("");
										}}
									>
										Cancel
									</button>
								</div>
							)}

							{playlistsLoading ? (
								<div className={styles.empty}>Loading…</div>
							) : playlists.length === 0 && !creating ? (
								<div className={styles.empty}>No playlists yet</div>
							) : (
								<div className={styles.playlistList}>
									{playlists.map((pl) => (
										<PlaylistSection
											key={pl.id}
											playlist={pl}
											likedMeta={likedMeta}
											isPinned={pinnedIds.has(pl.id)}
											onDelete={handleDeletePlaylist}
											onRename={handleRenamePlaylist}
											onTogglePin={handleTogglePin}
											onContentsLoaded={handleContentsLoaded}
											onTrackRemoved={handleTrackRemoved}
										/>
									))}
								</div>
							)}
						</section>
					)}
				</div>
			</div>
		</div>
	);
}
