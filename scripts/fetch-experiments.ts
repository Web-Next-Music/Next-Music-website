import { writeFile, mkdir } from "fs/promises";
import { readFileSync, existsSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const exec = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));

// .env.local
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

// Config
const TOKEN = process.env.YANDEX_TOKEN ?? "";
const OUTPUT_PATH = join(__dir, "../src/data/experiments.json");

if (!TOKEN) {
	console.error("[ERROR] YANDEX_TOKEN is not set.");
	console.error("        Add to .env.local:  YANDEX_TOKEN=y0_...");
	process.exit(1);
}

// Logging helpers
const ok = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const warn = (m: string) => console.log(`\x1b[33m!\x1b[0m ${m}`);
const info = (m: string) => console.log(`\x1b[36mℹ\x1b[0m ${m}`);

// HTTP via curl (Yandex blocks Node's TLS fingerprint)
async function curlGet(url: string): Promise<string> {
	const { stdout } = await exec(
		"curl",
		[
			"--silent",
			"--compressed",
			"--max-time",
			"30",
			"-H",
			"Accept-Language: en",
			"-H",
			`Authorization: OAuth ${TOKEN}`,
			"-A",
			"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
			url,
		],
		{ maxBuffer: 50 * 1024 * 1024 },
	);
	return stdout;
}

// Balanced-brace JSON extractor
function extractBalanced(str: string, start: number): string | null {
	let depth = 0,
		inStr = false,
		esc = false;
	for (let i = start; i < str.length; i++) {
		const c = str[i];
		if (esc) {
			esc = false;
			continue;
		}
		if (c === "\\" && inStr) {
			esc = true;
			continue;
		}
		if (c === '"') {
			inStr = !inStr;
			continue;
		}
		if (inStr) continue;
		if (c === "{") depth++;
		else if (c === "}") {
			if (--depth === 0) return str.slice(start, i + 1);
		}
	}
	return null;
}

// Parse experiments map from __NEXT_DATA__ / window.__initialState__
interface ExperimentEntry {
	group?: unknown;
}
type ExperimentMap = Record<string, ExperimentEntry>;

function parseStateExperiments(html: string): ExperimentMap | null {
	const results = new Map<number, ExperimentMap>();
	let pos = 0;
	while (true) {
		const idx = html.indexOf('"experiments"', pos);
		if (idx === -1) break;
		const brace = html.indexOf("{", idx + 13);
		if (brace === -1) break;
		const json = extractBalanced(html, brace);
		if (json) {
			try {
				const parsed = JSON.parse(json) as ExperimentMap;
				const keys = Object.keys(parsed);
				if (
					keys.length > 10 &&
					keys.some((k) => parsed[k]?.group !== undefined)
				)
					results.set(keys.length, parsed);
			} catch {
				/* malformed JSON — skip */
			}
		}
		pos = idx + 1;
	}
	return results.size ? results.get(Math.max(...results.keys()))! : null;
}

// Enum names that are platform/status constants, not experiment flags
const SKIP = new Set([
	"DEFAULT",
	"ENABLED",
	"DISABLED",
	"ERROR",
	"SUCCESS",
	"PENDING",
	"OFFLINE",
	"NETWORK",
	"TRACK",
	"ALBUM",
	"ARTIST",
	"PLAYLIST",
	"RADIO",
	"SEARCH",
	"HISTORY",
	"VARIOUS",
	"STANDARD",
	"SPECIAL",
	"STACK",
	"TRAILER",
	"WIZARD",
	"ADVERT",
	"CLIPS",
	"CLOSE",
	"COLLECTION",
	"CONCERTS",
	"Desktop",
	"Mobile",
	"DONATIONS",
	"GENERATIVE",
	"IMPORTANT",
	"INFINITE",
	"MIXES",
	"NEUROMUSIC",
	"OUTDATED",
	"OVERVIEW",
	"PREROLL",
	"PROMOTIONS",
	"RADIAL",
	"RECOMMENDED",
	"REJECT",
	"RESOLVE",
	"SKIPPED",
	"SPECTATOR",
	"UNRECOGNIZED",
	"UNSAFE",
	"UNSPECIFIED",
	"WAVES",
	"ANDROID",
	"DISLIKE",
	"DISLIKES",
	"OTHER",
]);

// Scan JS bundle chunks for enum-style experiment names
async function fetchBundleNames(html: string): Promise<Set<string>> {
	const versionMatch = html.match(/music\/(v[\d.]+)\/_next\/static/);
	if (!versionMatch) {
		warn("Bundle version not found — skipping");
		return new Set();
	}

	const version = versionMatch[1];
	const base = `https://yastatic-net.ru/s3/music-frontend-static/music/${version}/_next/static/chunks/`;
	info(`Bundle version: ${version}`);

	const rscMatch = html.match(/src="([^"]*rsc-cache-update[^"]*)"/);
	if (!rscMatch) {
		warn("rsc-cache-update not found — skipping");
		return new Set();
	}

	const rscUrl = rscMatch[1].startsWith("http")
		? rscMatch[1]
		: `https://music.yandex.ru${rscMatch[1]}`;

	const rscText = await curlGet(rscUrl);
	const chunkFiles = [
		...new Set(
			[...rscText.matchAll(/"static\/chunks\/([\w\-\.]+\.js)"/g)].map(
				(m) => m[1],
			),
		),
	];
	info(`Scanning ${chunkFiles.length} chunks...`);

	// Only chunks that contain at least one known experiment marker are enum files
	const markers = [
		"WebNextConcertPage",
		"WebNextArtistSkeleton",
		"WebNextDisableVibe",
	];
	const allNames = new Set<string>();

	await Promise.all(
		chunkFiles.map(async (chunk) => {
			try {
				const text = await curlGet(base + chunk);
				if (!markers.some((m) => text.includes(m))) return;
				console.log(`    enum: ${chunk}`);
				for (const m of text.matchAll(
					/\be\.([A-Z][a-zA-Z0-9]{4,60})\s*=\s*["']\1["']/g,
				))
					allNames.add(m[1]);
				for (const m of text.matchAll(
					/["']([A-Z][a-zA-Z0-9]{4,60})["']\s*:\s*["']\1["']/g,
				))
					allNames.add(m[1]);
			} catch {
				/* single chunk network error — ignore */
			}
		}),
	);

	return new Set([...allNames].filter((n) => !SKIP.has(n) && n.length > 5));
}

// Output format

export interface ExperimentsFile {
	fetchedAt: string;
	experiments: string[];
}

// Main
async function main(): Promise<void> {
	console.log("\n\x1b[1mYandex Music — experiments export\x1b[0m\n");

	info("Loading music.yandex.ru...");
	const html = await curlGet("https://music.yandex.ru/");

	if (html.length < 1000)
		throw new Error(`Empty response (${html.length} bytes) — check your token`);
	if (!html.includes('"experiments"')) {
		console.error("Response preview:", html.slice(0, 500));
		throw new Error('"experiments" not found in response');
	}

	const stateExps = parseStateExperiments(html);
	if (!stateExps) throw new Error("Failed to parse experiments from state");
	ok(`STATE: ${Object.keys(stateExps).length} experiments`);

	const bundleNames = await fetchBundleNames(html);
	ok(`BUNDLE: ${bundleNames.size} names`);

	const experiments = [
		...new Set([...Object.keys(stateExps), ...bundleNames]),
	].sort((a, b) => a.localeCompare(b));

	const output: ExperimentsFile = {
		fetchedAt: new Date().toISOString(),
		experiments,
	};

	await mkdir(dirname(OUTPUT_PATH), { recursive: true });
	await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

	console.log("");
	ok(`src/data/experiments.json saved (${experiments.length} experiments)`);
	console.log("");
}

main().catch((e: Error) => {
	console.error("\x1b[31m[ERROR]\x1b[0m", e.message);
	process.exit(1);
});
