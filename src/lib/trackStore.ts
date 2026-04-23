import {
	M3U_URL,
	LEGACY_URL,
	TRACK_META,
	parseM3U,
	parseLegacy,
	type OfficialTrack,
	type LegacyTrack,
	type TrackMeta,
} from "@/lib/fckcensor";
import type { CachedTrack, StoreSnapshot } from "@/types/track";

export type { CachedTrack, StoreSnapshot };

let official: OfficialTrack[] = [];
let legacy: LegacyTrack[] = [];
let loaded = false;
let loading = false;
let promise: Promise<void> | null = null;
const listeners = new Set<() => void>();

let snapshot: StoreSnapshot = { official, legacy, loaded };

function notify() {
	snapshot = { official, legacy, loaded };
	listeners.forEach((fn) => fn());
}

export function subscribeStore(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export function getStoreSnapshot(): StoreSnapshot {
	return snapshot;
}

export function getServerSnapshot(): StoreSnapshot {
	return { official: [], legacy: [], loaded: false };
}

export function ensureTracksLoaded(): Promise<void> {
	if (loaded) return Promise.resolve();
	if (promise) return promise;

	loading = true;
	promise = Promise.all([
		fetch(M3U_URL)
			.then((r) => r.text())
			.then(parseM3U),
		fetch(LEGACY_URL)
			.then((r) => r.json())
			.then(parseLegacy),
	])
		.then(([off, leg]) => {
			official = off;
			legacy = leg;
			loaded = true;
			loading = false;
			notify();
		})
		.catch((err) => {
			console.error("[trackStore] Failed to load tracks:", err);
			loading = false;
			promise = null;
		});

	return promise!;
}

export function findTrackById(id: string): CachedTrack | null {
	for (const t of official) {
		const tid = t.url.match(/\/(\d+)\.mp3$/)?.[1];
		if (tid === id) {
			return {
				id,
				url: t.url,
				title: t.title || `Track #${id}`,
				artist: t.artist || "",
				cover: t.cover,
				yandexUrl: `https://music.yandex.ru/track/${id}`,
				source: "official",
			};
		}
	}

	for (const t of legacy) {
		if (t.id === id) {
			const meta = (TRACK_META[t.id] ?? null) as TrackMeta | null;
			return {
				id,
				url: t.url,
				title: meta?.title || `Track #${id}`,
				artist: meta?.artist || "",
				cover: meta?.cover,
				yandexUrl: t.yandexUrl,
				source: "legacy",
			};
		}
	}

	return null;
}
