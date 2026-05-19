"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useLikes, type TrackLikeMeta } from "@/lib/likesContext";
import { getLikeCount, getUserLiked, addLike, removeLike } from "@/lib/likes";
import styles from "./LikeButton.module.css";

type LikeTarget =
	| { type: "track"; trackId: string; meta?: TrackLikeMeta }
	| { type: "account"; githubLogin: string };

interface Props {
	target: LikeTarget;
	className?: string;
	compact?: boolean;
}

export default function LikeButton({ target, className, compact }: Props) {
	const { user, openAuthModal } = useAuth();
	const likes = useLikes();

	const [count, setCount] = useState(0);
	const [individualLiked, setIndividualLiked] = useState(false);
	const [loading, setLoading] = useState(true);

	const table = target.type === "track" ? "track_likes" : "account_likes";
	const id = target.type === "track" ? target.trackId : target.githubLogin;

	useEffect(() => {
		if (compact) {
			setLoading(false);
			return;
		}
		let cancelled = false;
		async function load() {
			setLoading(true);
			const [cnt, isLiked] = await Promise.all([
				getLikeCount(table, id),
				user ? getUserLiked(table, id, user.id) : Promise.resolve(false),
			]);
			if (!cancelled) {
				setCount(cnt);
				setIndividualLiked(isLiked);
				setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [compact, table, id, user?.id]);

	// For key-based tracks (those with title/artist meta), check liked by metadata
	// so a changed URL/key still resolves to the same liked state.
	const metaLikedId =
		compact &&
		target.type === "track" &&
		(target.meta?.title || target.meta?.artist)
			? likes.findLikedByMeta(target.meta?.title, target.meta?.artist)
			: null;

	const liked =
		compact && target.type === "track"
			? metaLikedId !== null || likes.likedTrackIds.has(target.trackId)
			: individualLiked;

	const toggle = useCallback(async () => {
		if (!user) {
			openAuthModal();
			return;
		}

		if (compact && target.type === "track") {
			const storedId = metaLikedId ?? target.trackId;
			await likes.toggle(storedId, target.meta);
			return;
		}

		const wasLiked = liked;
		setIndividualLiked(!wasLiked);
		setCount((c) => c + (wasLiked ? -1 : 1));
		const ok = wasLiked
			? await removeLike(table, id, user.id)
			: await addLike(table, id, user.id);
		if (!ok) {
			setIndividualLiked(wasLiked);
			setCount((c) => c + (wasLiked ? 1 : -1));
		}
	}, [user, liked, compact, target, likes, table, id, openAuthModal]);

	return (
		<button
			className={[
				styles.btn,
				compact ? styles.compact : "",
				liked ? styles.liked : "",
				className ?? "",
			].join(" ")}
			onClick={toggle}
			disabled={!compact && loading}
			aria-label={liked ? "Unlike" : "Like"}
			title={user ? (liked ? "Unlike" : "Like") : "Sign in to like"}
		>
			<svg
				className={styles.heart}
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill={liked ? "currentColor" : "none"}
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
			</svg>
			{!compact && !loading && <span className={styles.count}>{count}</span>}
		</button>
	);
}
