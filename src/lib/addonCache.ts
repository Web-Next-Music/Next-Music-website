import type { Tag, ReleaseAsset, Extension, CacheEntry } from "@/types/addon";

export type { Tag, ReleaseAsset, Extension };

const CACHE_VERSION = 1;
const CACHE_KEY = "nextmusic_addon_cache";
const CACHE_TTL_MS = 30 * 60 * 1000;

export function computeFingerprint(exts: Extension[]): string {
	return exts
		.map(
			(e) =>
				`${e.id}:${e.name}:${e.releaseAssets.map((a) => a.name).join(",")}`,
		)
		.join("|");
}

export function getCachedData(): {
	exts: Extension[] | null;
	needsRefresh: boolean;
} {
	if (typeof window === "undefined") return { exts: null, needsRefresh: true };

	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return { exts: null, needsRefresh: true };

		const entry: CacheEntry = JSON.parse(raw);

		if (entry.version !== CACHE_VERSION) {
			return { exts: null, needsRefresh: true };
		}

		const age = Date.now() - entry.timestamp;
		const expired = age > CACHE_TTL_MS;

		return {
			exts: entry.extensions,
			needsRefresh: expired,
		};
	} catch {
		return { exts: null, needsRefresh: true };
	}
}

export function saveToCache(exts: Extension[]) {
	if (typeof window === "undefined") return;
	try {
		const entry: CacheEntry = {
			version: CACHE_VERSION,
			timestamp: Date.now(),
			extensions: exts,
			fingerprint: computeFingerprint(exts),
		};
		localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
	} catch {}
}

export function refreshCacheTimestamp() {
	if (typeof window === "undefined") return;
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return;
		const entry: CacheEntry = JSON.parse(raw);
		entry.timestamp = Date.now();
		localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
	} catch {}
}

export function clearCache() {
	if (typeof window === "undefined") return;
	try {
		localStorage.removeItem(CACHE_KEY);
	} catch {}
}

export function cacheMatchesNewData(newExts: Extension[]): boolean {
	if (typeof window === "undefined") return false;
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return false;
		const entry: CacheEntry = JSON.parse(raw);
		const newFp = computeFingerprint(newExts);
		return entry.fingerprint === newFp;
	} catch {
		return false;
	}
}
