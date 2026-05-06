"use client";

import { useEffect, useRef, useCallback, useContext, useState } from "react";
import type { NowPlaying } from "@/types/player";
import { encodeTrackKey } from "@/lib/trackKey";

const WS_PORT = 6972;
const WS_URL = `ws://127.0.0.1:${WS_PORT}`;
const RPC_TICK_MS = 5000;

export function useRichPresenceWS(
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
			const trackUrl = np?.directUrl ?? np?.url ?? null;
			const nmUGCPlayerUrl = trackId.includes("-")
				? (() => {
						const key = encodeTrackKey({
							url:    trackUrl || "",
							title:  np?.title,
							artist: np?.artist,
							cover:  np?.cover,
						});
						return `${window.location.origin}/track?key=${key}`;
					})()
				: null;
			return {
				playerState: state,
				title: np?.title ?? "",
				artists: np?.artist ?? "",
				img: np?.cover ?? "icon",
				albumUrl: "",
				artistUrl: "",
				trackId,
				trackUrl,
				nmUGCPlayerUrl,
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
