"use client";

import {
	createContext,
	useContext,
	useEffect,
	useState,
	useCallback,
	type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { decodeTrackKey } from "@/lib/trackKey";

export interface TrackLikeMeta {
	title?: string;
	artist?: string;
	cover?: string;
	mp3_url?: string;
}

interface LikesContextValue {
	likedTrackIds: Set<string>;
	likedMeta: Map<string, TrackLikeMeta>;
	toggle: (trackId: string, meta?: TrackLikeMeta) => Promise<void>;
	findLikedByMeta: (title?: string, artist?: string) => string | null;
}

const LikesContext = createContext<LikesContextValue>({
	likedTrackIds: new Set(),
	likedMeta: new Map(),
	toggle: async () => {},
	findLikedByMeta: () => null,
});

export function LikesProvider({ children }: { children: ReactNode }) {
	const { user } = useAuth();
	const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
	const [likedMeta, setLikedMeta] = useState<Map<string, TrackLikeMeta>>(
		new Map(),
	);

	useEffect(() => {
		if (!user) {
			setLikedTrackIds(new Set());
			setLikedMeta(new Map());
			return;
		}
		const sb = getSupabase();
		if (!sb) return;
		sb.from("track_likes")
			.select("track_id, title, artist, cover, mp3_url")
			.eq("user_id", user.id)
			.then(({ data, error }) => {
				if (error) console.error("[likes] load error:", error.message);
				if (data) {
					setLikedTrackIds(new Set(data.map((r) => r.track_id as string)));
					const meta = new Map<string, TrackLikeMeta>();
					for (const r of data) {
						const trackId = r.track_id as string;
						let title: string | undefined = r.title ?? undefined;
						let artist: string | undefined = r.artist ?? undefined;
						let cover: string | undefined = r.cover ?? undefined;
						const mp3_url: string | undefined = r.mp3_url ?? undefined;

						if (!title && !artist && !cover && !trackId.startsWith("http")) {
							const decoded = decodeTrackKey(trackId);
							if (decoded) {
								title = decoded.title;
								artist = decoded.artist;
								cover = decoded.cover;
							}
						}

						if (title || artist || cover || mp3_url) {
							meta.set(trackId, { title, artist, cover, mp3_url });
						}
					}
					setLikedMeta(meta);
				}
			});
	}, [user?.id]);

	const toggle = useCallback(
		async (trackId: string, meta?: TrackLikeMeta) => {
			if (!user) return;
			const sb = getSupabase();
			if (!sb) return;
			const wasLiked = likedTrackIds.has(trackId);

			// Optimistic update
			setLikedTrackIds((prev) => {
				const next = new Set(prev);
				if (wasLiked) next.delete(trackId);
				else next.add(trackId);
				return next;
			});
			if (!wasLiked && meta) {
				setLikedMeta((prev) => new Map(prev).set(trackId, meta));
			} else if (wasLiked) {
				setLikedMeta((prev) => {
					const m = new Map(prev);
					m.delete(trackId);
					return m;
				});
			}

			// Before inserting a new like, remove stale entries with matching title+artist
			// so URL rotation between sessions doesn't create duplicate liked rows.
			if (!wasLiked && (meta?.title || meta?.artist)) {
				const norm = (s?: string | null) =>
					s?.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim() ?? "";
				const t = norm(meta?.title);
				const a = norm(meta?.artist);
				const staleIds: string[] = [];
				for (const [id, m] of likedMeta) {
					if (id === trackId) continue;
					const titleOk = !t || !m.title || norm(m.title) === t;
					const artistOk = !a || !m.artist || norm(m.artist) === a;
					if (titleOk && artistOk) staleIds.push(id);
				}
				if (staleIds.length > 0) {
					await sb
						.from("track_likes")
						.delete()
						.eq("user_id", user.id)
						.in("track_id", staleIds);
					setLikedTrackIds((prev) => {
						const next = new Set(prev);
						for (const id of staleIds) next.delete(id);
						return next;
					});
					setLikedMeta((prev) => {
						const m = new Map(prev);
						for (const id of staleIds) m.delete(id);
						return m;
					});
				}
			}

			const { error } = wasLiked
				? await sb
						.from("track_likes")
						.delete()
						.eq("track_id", trackId)
						.eq("user_id", user.id)
				: await sb.from("track_likes").upsert(
						{
							track_id: trackId,
							user_id: user.id,
							title: meta?.title ?? null,
							artist: meta?.artist ?? null,
							cover: meta?.cover ?? null,
							mp3_url: meta?.mp3_url ?? null,
						},
						{ onConflict: "user_id,track_id" },
					);

			if (error) {
				console.error("[likes] toggle error:", error.message);
				// Revert optimistic update
				setLikedTrackIds((prev) => {
					const next = new Set(prev);
					if (wasLiked) next.add(trackId);
					else next.delete(trackId);
					return next;
				});
				if (!wasLiked && meta) {
					setLikedMeta((prev) => {
						const m = new Map(prev);
						m.delete(trackId);
						return m;
					});
				}
			}
		},
		[user, likedTrackIds],
	);

	const findLikedByMeta = useCallback(
		(title?: string, artist?: string): string | null => {
			if (!title && !artist) return null;
			const norm = (s?: string) =>
				s?.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim() ?? "";
			const t = norm(title);
			const a = norm(artist);
			for (const [trackId, meta] of likedMeta) {
				if (!meta.title && !meta.artist) continue;
				const titleOk = !t || !meta.title || norm(meta.title) === t;
				const artistOk = !a || !meta.artist || norm(meta.artist) === a;
				if (titleOk && artistOk) return trackId;
			}
			return null;
		},
		[likedMeta],
	);

	return (
		<LikesContext.Provider
			value={{ likedTrackIds, likedMeta, toggle, findLikedByMeta }}
		>
			{children}
		</LikesContext.Provider>
	);
}

export function useLikes() {
	return useContext(LikesContext);
}
