import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ── Read .env.local ──────────────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url));

const envPath = join(__dir, "../.env.local");
if (existsSync(envPath)) {
	const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const val = trimmed.slice(eqIdx + 1).trim();
		if (key && !(key in process.env)) process.env[key] = val;
	}
}

// ── Config ───────────────────────────────────────────────────────────────────

const LEGACY_URL =
	"https://raw.githubusercontent.com/Hazzz895/FckCensorData/refs/heads/main/list.json";

const YANDEX_API = "https://api.music.yandex.net/tracks";
const YANDEX_TOKEN = process.env.YANDEX_TOKEN ?? "";

const OUTPUT_PATH = join(__dir, "../src/data/track-meta.json");

const BATCH_SIZE = 50;
const DELAY_MS = 350;

// ── Token check ──────────────────────────────────────────────────────────────

if (!YANDEX_TOKEN) {
	console.error("[ERROR] YANDEX_TOKEN is not set.");
	console.error("        Add to .env.local: YANDEX_TOKEN=y0_...");
	console.error(
		"        Get token: https://github.com/MarshalX/yandex-music-token",
	);
	process.exit(1);
}

console.log(
	`[KEY] Token: ${YANDEX_TOKEN.slice(0, 8)}... (length: ${YANDEX_TOKEN.length})`,
);

// ── Types ────────────────────────────────────────────────────────────────────

export interface TrackMeta {
	title: string;
	artist: string;
	cover?: string;
}

type MetaMap = Record<string, TrackMeta | null>;

interface YandexTrack {
	id: number | string;
	title?: string;
	artists?: Array<{ name: string }>;
	albums?: Array<{ coverUri?: string; ogImage?: string }>;
	coverUri?: string;
	ogImage?: string;
	error?: string;
}

// ── Utils ────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function coverUrl(raw?: string): string | undefined {
	if (!raw) return undefined;
	return "https://" + raw.replace("%%", "400x400");
}

function loadExisting(): MetaMap {
	if (!existsSync(OUTPUT_PATH)) return {};
	try {
		return JSON.parse(readFileSync(OUTPUT_PATH, "utf8")) as MetaMap;
	} catch {
		console.warn("[WARN] Failed to read existing file — starting fresh");
		return {};
	}
}

function save(meta: MetaMap) {
	const dir = dirname(OUTPUT_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(OUTPUT_PATH, JSON.stringify(meta, null, 2) + "\n", "utf8");
}

// Using curl instead of Node fetch — Yandex blocks Node by TLS fingerprint
function fetchBatch(ids: string[]): MetaMap {
	const output = execSync(
		`curl -s -X POST "${YANDEX_API}"` +
			` -H "Authorization: OAuth ${YANDEX_TOKEN}"` +
			` -H "Content-Type: application/x-www-form-urlencoded"` +
			` -d "track-ids=${ids.join(",")}"`,
		{ encoding: "utf8", timeout: 30000 },
	);

	const data = JSON.parse(output) as { result?: YandexTrack[] };
	const tracks = data.result ?? [];

	const result: MetaMap = {};
	for (const t of tracks) {
		if (!t.id || t.error) continue;
		const rawCover =
			t.coverUri ??
			t.ogImage ??
			t.albums?.[0]?.coverUri ??
			t.albums?.[0]?.ogImage;

		result[String(t.id)] = {
			title: t.title?.trim() || `Track #${t.id}`,
			artist: t.artists?.map((a) => a.name).join(", ") ?? "",
			cover: coverUrl(rawCover),
		};
	}
	return result;
}

// ── Main flow ────────────────────────────────────────────────────────────────

async function main() {
	// 1. Download legacy list
	console.log("[DOWNLOAD] Loading legacy JSON...");
	const legacyResp = await fetch(LEGACY_URL);
	if (!legacyResp.ok)
		throw new Error(`Failed to load legacy JSON: ${legacyResp.status}`);

	const legacyData = (await legacyResp.json()) as {
		tracks: Record<string, string>;
	};
	const allIds = Object.keys(legacyData.tracks);
	console.log(`   Tracks in list: ${allIds.length}`);

	// 2. Load existing metadata
	const existing = loadExisting();
	const existingCount = Object.keys(existing).length;
	if (existingCount > 0) {
		console.log(`[FILE] Already saved: ${existingCount} entries`);
	}

	// 3. Only new + previously null
	const toFetch = allIds.filter(
		(id) => !(id in existing) || existing[id] === null,
	);

	if (toFetch.length === 0) {
		console.log("[OK] All tracks already known, no update needed.");
		return;
	}

	console.log(`[PROCESS] Need to fetch: ${toFetch.length} tracks`);

	// 4. Batch requests via curl
	const meta: MetaMap = { ...existing };
	let processed = 0;
	let failed = 0;
	const batches = Math.ceil(toFetch.length / BATCH_SIZE);
	const batchesWidth = String(batches).length;

	console.log(
		`[MUSIC] Fetching in batches of ${BATCH_SIZE} (total batches: ${batches})...\n`,
	);

	for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
		const batch = toFetch.slice(i, i + BATCH_SIZE);
		const batchNum = Math.floor(i / BATCH_SIZE) + 1;

		try {
			const batchMeta = fetchBatch(batch);

			for (const id of batch) {
				meta[id] = batchMeta[id] ?? null;
			}

			processed += batch.length;
			const percent = Math.round((processed / toFetch.length) * 100);
			const found = Object.keys(batchMeta).length;
			console.log(
				`   [${String(batchNum).padStart(batchesWidth)}/${batches}]` +
					` received ${String(found).padStart(2)}/${batch.length}` +
					`  (${percent}%)`,
			);
		} catch (err) {
			failed += batch.length;
			processed += batch.length;
			console.error(
				`   [ERROR] Batch ${batchNum} failed: ${(err as Error).message}`,
			);
		}

		if (i + BATCH_SIZE < toFetch.length) {
			await sleep(DELAY_MS);
		}
	}

	// 5. Save
	console.log(`\n[SAVE] Writing → ${OUTPUT_PATH}`);
	save(meta);

	const withMeta = Object.values(meta).filter(Boolean).length;
	const total = Object.keys(meta).length;
	console.log(`\n[OK] Done!`);
	console.log(`   Total entries           : ${total}`);
	console.log(`   With metadata           : ${withMeta}`);
	console.log(`   Without metadata (null) : ${total - withMeta}`);
	if (failed > 0) console.warn(`   Failed batches         : ${failed} tracks`);
}

main().catch((err) => {
	console.error("\n[FATAL] Fatal error:", err);
	process.exit(1);
});
