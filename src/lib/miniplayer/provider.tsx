"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { NowPlaying } from "@/types/player";
import { PlayerContext } from "./context";
import { useRichPresenceWS } from "./hooks";
import { MiniPlayerInner } from "@/components/miniplayer/MiniPlayer";

export function PlayerProvider({ children }: { children: React.ReactNode }) {
	const searchParams = useSearchParams();
	const paramToken = searchParams.get("token") ?? "";
	const isHiddenMode = paramToken === process.env.NEXT_PUBLIC_HIDDEN_MODE_TOKEN;

	const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const audioRef = useRef<HTMLAudioElement>(null);
	const isRestoringRef = useRef(false);
	const currentTrackUrlRef = useRef<string | null>(null);
	const pendingSeekTimeRef = useRef<number>(0);

	useRichPresenceWS(nowPlaying, isPlaying, audioRef);

	const play = useCallback((track: NowPlaying) => {
		const id =
			track.id && !track.directUrl ? track.id : (track.url ?? undefined);
		currentTrackUrlRef.current = null;
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

		if (currentTrackUrlRef.current !== nowPlaying.url) {
			currentTrackUrlRef.current = nowPlaying.url;
			audio.src = nowPlaying.url;
			if (isRestoringRef.current) {
				const seekTime = pendingSeekTimeRef.current;
				audio.addEventListener(
					"loadedmetadata",
					() => {
						audio.currentTime = seekTime;
						audio.play().catch(console.error);
						isRestoringRef.current = false;
					},
					{ once: true },
				);
			} else {
				audio.currentTime = 0;
				audio.play().catch(console.error);
			}
		}
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
			<MiniPlayerInner isHiddenMode={isHiddenMode} />
		</PlayerContext.Provider>
	);
}
