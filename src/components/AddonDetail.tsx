"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from "./StoreFeed.module.css";
import {
	Extension,
	ReleaseAsset,
	Tag,
	getCachedData,
	saveToCache,
	refreshCacheTimestamp,
	cacheMatchesNewData,
} from "@/lib/addonCache";

const OWNER = "Web-Next-Music";
const REPO = "Next-Music-Extensions";
const GH = "https://api.github.com";
const GH_H = { Accept: "application/vnd.github.v3+json" };

async function ghContents(
	owner: string,
	repo: string,
	path: string,
): Promise<any[]> {
	const url = path
		? `${GH}/repos/${owner}/${repo}/contents/${path}`
		: `${GH}/repos/${owner}/${repo}/contents`;
	const res = await fetch(url, { headers: GH_H });
	if (!res.ok)
		throw new Error(`ghContents ${res.status}: ${owner}/${repo}/${path}`);
	return res.json();
}

async function rawFetch(
	owner: string,
	repo: string,
	branch: string,
	file: string,
) {
	const res = await fetch(
		`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}`,
	);
	if (!res.ok) throw new Error(`raw 404: ${file}`);
	return res.text();
}

function parseGitmodules(text: string): Record<string, string> {
	const map: Record<string, string> = {};
	for (const block of text.split(/(?=\[submodule\s+"[^"]*"\])/)) {
		const pm = block.match(/path\s*=\s*(.+)/);
		const um = block.match(/url\s*=\s*(.+)/);
		if (pm && um) map[pm[1].trim()] = um[1].trim();
	}
	return map;
}

function normalizeGitUrl(url: string) {
	return url
		.replace(/^git:\/\/github\.com\//, "https://github.com/")
		.replace(/^git@github\.com:/, "https://github.com/");
}

function extractGhOwnerRepo(url: string): [string, string] | null {
	const m = normalizeGitUrl(url).match(
		/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
	);
	return m ? [m[1], m[2]] : null;
}

async function loadGitmodules(): Promise<Record<string, string>> {
	for (const branch of ["main", "master", "HEAD"]) {
		try {
			const text = await rawFetch(OWNER, REPO, branch, ".gitmodules");
			if (text.length > 0) return parseGitmodules(text);
		} catch {}
	}
	return {};
}

async function getFolderMeta(owner: string, repo: string, folderPath: string) {
	try {
		const items: any[] = await ghContents(owner, repo, folderPath);
		const isImg = (n: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(n);

		function pickImg(list: any[]): string | null {
			return (
				list.find(
					(i) =>
						i.type === "file" &&
						/^(image|icon|logo|preview)\./i.test(i.name) &&
						isImg(i.name),
				)?.download_url ||
				list.find((i) => i.type === "file" && isImg(i.name))?.download_url ||
				null
			);
		}

		let logo = pickImg(items);

		if (!logo) {
			for (const sub of items.filter((i) => i.type === "dir")) {
				try {
					const subItems: any[] = await ghContents(owner, repo, sub.path);
					if (
						subItems.some(
							(i) => i.type === "file" && /\.(css|js|json)$/i.test(i.name),
						)
					) {
						logo = pickImg(subItems);
						if (logo) break;
					}
				} catch {}
			}
		}

		const rmItem = items.find(
			(i) => i.type === "file" && /^readme\.md$/i.test(i.name),
		);
		const jsItem = items.find(
			(i) => i.type === "file" && /^user\.js$/i.test(i.name),
		);

		const rawBase =
			owner === OWNER && folderPath
				? `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${folderPath}/`
				: `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/`;

		return {
			logo: logo ?? null,
			readmeUrl: rmItem?.download_url ?? null,
			readmeBaseUrl: rawBase,
			userJsUrl: jsItem?.download_url ?? null,
		};
	} catch {
		return {
			logo: null,
			readmeUrl: null,
			readmeBaseUrl: null,
			userJsUrl: null,
		};
	}
}

async function getAllReleaseAssets(
	owner: string,
	repo: string,
): Promise<ReleaseAsset[]> {
	try {
		const res = await fetch(`${GH}/repos/${owner}/${repo}/releases/latest`, {
			headers: GH_H,
		});
		if (!res.ok) return [];
		const release = await res.json();
		if (!release.assets?.length) return [];
		return (release.assets as any[]).map((a) => ({
			name: a.name as string,
			url: a.browser_download_url as string,
			ext: (a.name as string).endsWith(".tar.gz")
				? ".tar.gz"
				: ((a.name as string).match(/\.[^.]+$/) ?? [""])[0],
		}));
	} catch {
		return [];
	}
}

function deriveTagsAndClients(
	assets: ReleaseAsset[],
	name: string,
	path: string,
): { tags: Tag[]; clients: Extension["clients"] } {
	const tags = new Set<Tag>();
	const clients = new Set<Extension["clients"][number]>();

	if (assets.length > 0) {
		for (const { name: n } of assets) {
			const ln = n.toLowerCase();
			tags.add("Next Music");
			clients.add("nm");
			if (ln.endsWith(".pext") || ln.includes(".ps.")) {
				tags.add("PulseSync");
				clients.add("ps");
			}
			if (ln.endsWith("user.js") || ln.endsWith(".js")) {
				tags.add("Web");
				clients.add("web");
			}
		}
	}

	if (tags.size === 0) {
		const lower = (name + " " + path).toLowerCase();
		if (lower.includes("pulse") || lower.includes("/ps")) {
			tags.add("PulseSync");
			clients.add("ps");
		}
		if (lower.includes("web")) {
			tags.add("Web");
			clients.add("web");
		}
		if (!clients.has("ps")) {
			tags.add("Next Music");
			clients.add("nm");
		}
	}

	const orderedTags: Tag[] = [];
	if (tags.has("Next Music")) orderedTags.push("Next Music");
	if (tags.has("PulseSync")) orderedTags.push("PulseSync");
	if (tags.has("Web")) orderedTags.push("Web");

	return { tags: orderedTags, clients: [...clients] };
}

async function loadExtensions(
	onProgress?: (msg: string) => void,
): Promise<Extension[]> {
	onProgress?.("Loading submodule map…");
	const gitmodules = await loadGitmodules();

	onProgress?.("Scanning sections…");

	const entries: {
		name: string;
		repoPath: string;
		owner: string;
		repo: string;
		folderPath: string;
		isTheme: boolean;
	}[] = [];

	for (const section of ["Addons", "Themes"]) {
		const isTheme = section === "Themes";
		const prefix = section + "/";
		const seen = new Set<string>();

		for (const [modPath, modUrl] of Object.entries(gitmodules)) {
			if (!modPath.startsWith(prefix)) continue;
			const name = modPath.slice(prefix.length);
			if (!name || name.includes("/")) continue;
			const parsed = extractGhOwnerRepo(modUrl);
			if (!parsed) continue;
			seen.add(name.toLowerCase());
			entries.push({
				name,
				repoPath: modPath,
				owner: parsed[0],
				repo: parsed[1],
				folderPath: "",
				isTheme,
			});
		}

		try {
			const items: any[] = await ghContents(OWNER, REPO, section);
			for (const item of items) {
				if (item.type !== "dir" || seen.has(item.name.toLowerCase())) continue;
				entries.push({
					name: item.name,
					repoPath: item.path,
					owner: OWNER,
					repo: REPO,
					folderPath: item.path,
					isTheme,
				});
			}
		} catch {}
	}

	onProgress?.(`Found ${entries.length} extensions, loading metadata…`);

	const results: Extension[] = [];
	let i = 0;

	async function worker() {
		while (i < entries.length) {
			const idx = i++;
			const entry = entries[idx];
			try {
				const [meta, releaseAssets] = await Promise.all([
					getFolderMeta(entry.owner, entry.repo, entry.folderPath),
					getAllReleaseAssets(entry.owner, entry.repo),
				]);
				const { tags, clients } = deriveTagsAndClients(
					releaseAssets,
					entry.name,
					entry.repoPath,
				);
				results.push({
					id: entry.repoPath.replace(/\//g, "-").toLowerCase(),
					name: entry.name,
					description: "",
					author: entry.owner !== OWNER ? entry.owner : "",
					tags,
					isTheme: entry.isTheme,
					logo: meta.logo ?? undefined,
					readmeUrl: meta.readmeUrl ?? undefined,
					readmeBaseUrl: meta.readmeBaseUrl ?? undefined,
					userJsUrl: meta.userJsUrl ?? undefined,
					repo: `https://github.com/${entry.owner}/${entry.repo}`,
					downloadZip: `https://github.com/${entry.owner}/${entry.repo}/archive/refs/heads/main.zip`,
					releaseAssets,
					clients,
				});
			} catch {}
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(4, entries.length) }, worker),
	);
	return results.sort((a, b) => a.name.localeCompare(b.name));
}

function resolveSlug(slug: string, exts: Extension[]): Extension | null {
	if (!slug) return null;
	const needle = slug.toLowerCase();
	return (
		exts.find((e) => e.name.toLowerCase().replace(/\s+/g, "-") === needle) ??
		exts.find((e) => e.name.toLowerCase().includes(needle)) ??
		null
	);
}

const IconBlocks = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2" />
		<rect x="14" y="2" width="8" height="8" rx="1" />
	</svg>
);
const IconPalette = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
		<circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
		<circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
		<circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
		<circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
	</svg>
);
const IconDownload = () => (
	<svg
		width="13"
		height="13"
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M8 2v8M5 7l3 3 3-3" />
		<path d="M3 12h10" />
	</svg>
);
const IconArrowLeft = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M19 12H5M12 19l-7-7 7-7" />
	</svg>
);
const IconExternalLink = () => (
	<svg
		width="11"
		height="11"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
		<polyline points="15 3 21 3 21 9" />
		<line x1="10" y1="14" x2="21" y2="3" />
	</svg>
);
const IconX = () => (
	<svg
		width="12"
		height="12"
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		strokeWidth="2.2"
		strokeLinecap="round"
	>
		<path d="M3 3l10 10M13 3L3 13" />
	</svg>
);
const IconCode = () => (
	<svg
		width="13"
		height="13"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<polyline points="16 18 22 12 16 6" />
		<polyline points="8 6 2 12 8 18" />
	</svg>
);
const IconFile = () => (
	<svg
		width="13"
		height="13"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
		<path d="M14 2v4a2 2 0 0 0 2 2h4" />
	</svg>
);

function resolveImgUrl(src: string, baseUrl?: string): string {
	if (!src || /^https?:\/\//i.test(src)) return src;
	return baseUrl ? baseUrl.replace(/\/?$/, "/") + src.replace(/^\//, "") : src;
}

function renderInline(
	raw: string,
	base: string | undefined,
	key: string,
): React.ReactNode {
	if (!raw) return null;

	const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/;
	const linkRe = /\[([^\]]*)\]\(([^)]+)\)/;
	const boldRe = /\*\*(.+?)\*\*|__(.+?)__/s;
	const italRe = /\*([^*]+?)\*|_([^_]+?)_/s;
	const codeRe = /`([^`]+)`/;

	type Hit = {
		index: number;
		end: number;
		node: React.ReactNode;
		inner: string;
	};
	const candidates: Hit[] = [];

	const tryMatch = (
		re: RegExp,
		make: (m: RegExpMatchArray) => React.ReactNode,
	) => {
		const m = re.exec(raw);
		if (m)
			candidates.push({
				index: m.index!,
				end: m.index! + m[0].length,
				node: make(m),
				inner: "",
			});
	};

	(() => {
		const m = imgRe.exec(raw);
		if (m)
			candidates.push({
				index: m.index!,
				end: m.index! + m[0].length,
				inner: "",
				node: (
					<img
						src={resolveImgUrl(m[2], base)}
						alt={m[1]}
						className={styles.mdImg}
					/>
				),
			});
	})();

	(() => {
		const m = linkRe.exec(raw);
		if (!m) return;
		candidates.push({
			index: m.index!,
			end: m.index! + m[0].length,
			inner: "",
			node: (
				<a
					href={m[2]}
					target="_blank"
					rel="noopener noreferrer"
					className={styles.mdLink}
				>
					{renderInline(m[1], base, `${key}_link`)}
				</a>
			),
		});
	})();

	(() => {
		const m = boldRe.exec(raw);
		if (!m) return;
		candidates.push({
			index: m.index!,
			end: m.index! + m[0].length,
			inner: "",
			node: <strong>{renderInline(m[1] || m[2], base, `${key}_b`)}</strong>,
		});
	})();

	(() => {
		const m = italRe.exec(raw);
		if (!m) return;
		candidates.push({
			index: m.index!,
			end: m.index! + m[0].length,
			inner: "",
			node: <em>{renderInline(m[1] || m[2], base, `${key}_i`)}</em>,
		});
	})();

	(() => {
		const m = codeRe.exec(raw);
		if (!m) return;
		candidates.push({
			index: m.index!,
			end: m.index! + m[0].length,
			inner: "",
			node: <code>{m[1]}</code>,
		});
	})();

	if (!candidates.length) return <>{raw}</>;

	candidates.sort((a, b) => a.index - b.index);
	const hit = candidates[0];

	const before = raw.slice(0, hit.index);
	const after = raw.slice(hit.end);

	return (
		<React.Fragment key={key}>
			{before}
			{hit.node}
			{renderInline(after, base, `${key}_a`)}
		</React.Fragment>
	);
}

function Inline({ text, base }: { text: string; base?: string }) {
	const parts = text.split(/(\$\$[^$]+\$\$|`[^`]+`)/);
	return (
		<>
			{parts.map((part, i) => {
				if (part.startsWith("$$") && part.endsWith("$$"))
					return (
						<code key={i} className={styles.mdCode}>
							{part.slice(2, -2)}
						</code>
					);
				if (part.startsWith("`") && part.endsWith("`"))
					return (
						<code key={i} className={styles.mdInlineCode}>
							{part.slice(1, -1)}
						</code>
					);
				return renderInline(part, base, `il_${i}`);
			})}
		</>
	);
}

function MarkdownRenderer({
	text,
	baseUrl,
}: {
	text: string;
	baseUrl?: string;
}) {
	const lines = text.split("\n");
	const nodes: React.ReactNode[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (/^\s*> \[!(\w+)\]\s*(.*)/.test(line)) {
			const m = line.match(/^\s*> \[!(\w+)\]\s*(.*)/)!;
			const type = m[1];
			const title = m[2] || type;
			const bodyLines: string[] = [];
			i++;
			while (
				i < lines.length &&
				/^\s*>/.test(lines[i]) &&
				!/^\s*> \[!/.test(lines[i])
			) {
				bodyLines.push(lines[i].replace(/^\s*>\s?/, ""));
				i++;
			}
			nodes.push(
				<div
					key={i}
					className={`${styles.mdCallout} ${styles["mdCallout" + type]}`}
				>
					<div className={styles.mdCalloutHead}>{title}</div>
					<div className={styles.mdCalloutBody}>
						{bodyLines.map((l, j) => (
							<p key={j}>
								<Inline text={l} base={baseUrl} />
							</p>
						))}
					</div>
				</div>,
			);
			continue;
		}

		if (line.startsWith("```")) {
			const lang = line.slice(3).trim();
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i].startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			i++;
			nodes.push(
				<div key={i} className={styles.mdCodeBlock}>
					{lang && <div className={styles.mdCodeLang}>{lang}</div>}
					<pre>
						<code>{codeLines.join("\n")}</code>
					</pre>
				</div>,
			);
			continue;
		}

		if (/^\|/.test(line)) {
			const tableLines: string[] = [];
			while (i < lines.length && /^\|/.test(lines[i])) {
				tableLines.push(lines[i]);
				i++;
			}
			const parseRow = (r: string) =>
				r
					.split("|")
					.slice(1, -1)
					.map((c) => c.trim());
			const isSep = (r: string) => /^[\s\-:|]+$/.test(r);
			const rows = tableLines.filter((r) => !isSep(r)).map(parseRow);
			const headers = rows[0] ?? [];
			const body = rows.slice(1);
			nodes.push(
				<div key={i} className={styles.mdTableWrap}>
					<table className={styles.mdTable}>
						<thead>
							<tr>
								{headers.map((h, j) => (
									<th key={j}>
										<Inline text={h} base={baseUrl} />
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{body.map((row, ri) => (
								<tr key={ri}>
									{row.map((c, ci) => (
										<td key={ci}>
											<Inline text={c} base={baseUrl} />
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>,
			);
			continue;
		}

		if (line.startsWith("#### ")) {
			nodes.push(
				<h4 key={i}>
					<Inline text={line.slice(5)} base={baseUrl} />
				</h4>,
			);
		} else if (line.startsWith("### ")) {
			nodes.push(
				<h3 key={i}>
					<Inline text={line.slice(4)} base={baseUrl} />
				</h3>,
			);
		} else if (line.startsWith("## ")) {
			nodes.push(
				<h2 key={i}>
					<Inline text={line.slice(3)} base={baseUrl} />
				</h2>,
			);
		} else if (line.startsWith("# ")) {
			nodes.push(
				<h1 key={i}>
					<Inline text={line.slice(2)} base={baseUrl} />
				</h1>,
			);
		} else if (line.trim() === "") {
		} else {
			const imgMatches = [...line.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
			if (imgMatches.length > 0) {
				const isBadge = (url: string) =>
					/shields\.io|badge\.fury|badgen\.net|img\.shields/i.test(url);
				const hasBadges = imgMatches.some((m) => isBadge(m[2]));
				const hasReal = imgMatches.some((m) => !isBadge(m[2]));
				if (hasBadges && !hasReal) {
					nodes.push(
						<div key={i} className={styles.mdBadgeRow}>
							{imgMatches.map((m, idx) => (
								<img
									key={idx}
									src={resolveImgUrl(m[2], baseUrl)}
									alt={m[1]}
									className={styles.mdBadge}
								/>
							))}
						</div>,
					);
				} else {
					imgMatches.forEach((m, idx) => {
						nodes.push(
							<div key={`${i}_${idx}`} className={styles.mdImgWrap}>
								<img
									src={resolveImgUrl(m[2], baseUrl)}
									alt={m[1]}
									className={styles.mdImgBlock}
								/>
							</div>,
						);
					});
				}
			} else {
				nodes.push(
					<p key={i}>
						<Inline text={line} base={baseUrl} />
					</p>,
				);
			}
		}
		i++;
	}

	return <div className={styles.markdownBody}>{nodes}</div>;
}

function LogoPlaceholder({ isTheme }: { isTheme: boolean }) {
	return (
		<div className={`${styles.logoPh} ${isTheme ? styles.logoPhTheme : ""}`}>
			{isTheme ? <IconPalette /> : <IconBlocks />}
		</div>
	);
}

const TAG_CLASS: Record<Tag, string> = {
	"Next Music": "tagNm",
	PulseSync: "tagPs",
	Web: "tagWeb",
};

function TagBadge({ tag }: { tag: Tag }) {
	const cls = [styles.tagBadge, styles[TAG_CLASS[tag]]]
		.filter(Boolean)
		.join(" ");
	return <span className={cls}>{tag}</span>;
}

function ClientChip(_: { client: string }) {
	return null;
}

function DownloadModal({
	ext,
	onClose,
}: {
	ext: Extension;
	onClose: () => void;
}) {
	return (
		<div
			className={styles.modalBg}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modalBox}>
				<div className={styles.modalBoxHead}>
					<span className={styles.modalBoxTitle}>Download — {ext.name}</span>
					<button className={styles.modalBoxClose} onClick={onClose}>
						<IconX />
					</button>
				</div>
				<div className={styles.modalBoxBody}>
					<div className={styles.downloadOptions}>
						{ext.releaseAssets.map((asset) => {
							const icon = asset.name.toLowerCase().endsWith(".js") ? (
								<IconCode />
							) : asset.name.toLowerCase().endsWith(".tar.gz") ||
							  asset.name.toLowerCase().endsWith(".zip") ? (
								<IconDownload />
							) : (
								<IconFile />
							);
							return (
								<a
									key={asset.name}
									href={asset.url}
									className={styles.dlOption}
									target="_blank"
									rel="noopener noreferrer"
								>
									<div className={styles.dlOptionIcon}>{icon}</div>
									<div className={styles.dlOptionInfo}>
										<div className={styles.dlOptionLabel}>{asset.name}</div>
									</div>
									<span className={styles.dlOptionBadge}>{asset.ext}</span>
								</a>
							);
						})}
						{ext.downloadZip && (
							<a
								href={ext.downloadZip}
								className={styles.dlOption}
								target="_blank"
								rel="noopener noreferrer"
							>
								<div className={styles.dlOptionIcon}>
									<IconDownload />
								</div>
								<div className={styles.dlOptionInfo}>
									<div className={styles.dlOptionLabel}>Source ZIP</div>
									<div className={styles.dlOptionSub}>
										Full repository source code
									</div>
								</div>
								<span className={styles.dlOptionBadge}>.zip</span>
							</a>
						)}
						{!ext.releaseAssets.length && !ext.downloadZip && (
							<p className={styles.dlOptionNone}>No downloads available yet.</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function ExtensionPage({
	ext,
	onBack,
}: {
	ext: Extension;
	onBack: () => void;
}) {
	const [showDl, setShowDl] = useState(false);
	const [showUserJs, setShowUserJs] = useState(false);
	const [userJsContent, setUserJsContent] = useState<string | null>(null);
	const [readme, setReadme] = useState<string | null>(null);
	const [readmeLoading, setReadmeLoading] = useState(false);

	useEffect(() => {
		if (!ext.readmeUrl) return;
		setReadme(null);
		setReadmeLoading(true);
		fetch(ext.readmeUrl)
			.then((r) => r.text())
			.then(setReadme)
			.catch(() => setReadme("*Failed to load README.*"))
			.finally(() => setReadmeLoading(false));
	}, [ext.readmeUrl]);

	useEffect(() => {
		if (!showUserJs || userJsContent !== null || !ext.userJsUrl) return;
		fetch(ext.userJsUrl)
			.then((r) => r.text())
			.then(setUserJsContent)
			.catch(() => setUserJsContent("// Failed to load user.js"));
	}, [showUserJs, ext.userJsUrl]);

	useEffect(() => {
		const prev = {
			title: document.title,
			ogTitle: (
				document.querySelector('meta[property="og:title"]') as HTMLMetaElement
			)?.content,
			ogDesc: (
				document.querySelector(
					'meta[property="og:description"]',
				) as HTMLMetaElement
			)?.content,
			ogImg: (
				document.querySelector('meta[property="og:image"]') as HTMLMetaElement
			)?.content,
			twitterCard: (
				document.querySelector('meta[name="twitter:card"]') as HTMLMetaElement
			)?.content,
			twitterImg: (
				document.querySelector('meta[name="twitter:image"]') as HTMLMetaElement
			)?.content,
			twitterTitle: (
				document.querySelector('meta[name="twitter:title"]') as HTMLMetaElement
			)?.content,
		};

		function setMeta(selector: string, attr: string, value: string) {
			let el = document.querySelector(selector) as HTMLMetaElement | null;
			if (!el) {
				el = document.createElement("meta");
				if (selector.includes("property="))
					el.setAttribute("property", selector.match(/property="([^"]+)"/)![1]);
				else el.setAttribute("name", selector.match(/name="([^"]+)"/)![1]);
				document.head.appendChild(el);
			}
			el.setAttribute(attr, value);
		}

		const title = `${ext.name} — Next Music Store`;
		document.title = title;
		setMeta('meta[property="og:title"]', "content", title);
		setMeta(
			'meta[property="og:description"]',
			"content",
			ext.description || `${ext.name} extension for Next Music`,
		);
		if (ext.logo) {
			setMeta('meta[property="og:image"]', "content", ext.logo);
			setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
			setMeta('meta[name="twitter:image"]', "content", ext.logo);
		}
		setMeta('meta[name="twitter:title"]', "content", title);

		return () => {
			document.title = prev.title || "Next Music Store";
			if (prev.ogTitle !== undefined)
				setMeta('meta[property="og:title"]', "content", prev.ogTitle);
			if (prev.ogDesc !== undefined)
				setMeta('meta[property="og:description"]', "content", prev.ogDesc);
			if (prev.ogImg !== undefined)
				setMeta('meta[property="og:image"]', "content", prev.ogImg);
			if (prev.twitterCard !== undefined)
				setMeta('meta[name="twitter:card"]', "content", prev.twitterCard);
			if (prev.twitterImg !== undefined)
				setMeta('meta[name="twitter:image"]', "content", prev.twitterImg);
			if (prev.twitterTitle !== undefined)
				setMeta('meta[name="twitter:title"]', "content", prev.twitterTitle);
		};
	}, [ext]);

	const hasDownload = ext.releaseAssets.length > 0 || !!ext.downloadZip;

	return (
		<div className={styles.extPage}>
			{showDl && <DownloadModal ext={ext} onClose={() => setShowDl(false)} />}

			<div className={styles.extPageBack}>
				<button className={styles.backBtn} onClick={onBack}>
					<IconArrowLeft /> Back to Store
				</button>
			</div>

			<div className={styles.extPageHero}>
				<div className={styles.extPageHeroLeft}>
					{ext.logo ? (
						<img src={ext.logo} alt={ext.name} className={styles.extPageLogo} />
					) : (
						<LogoPlaceholder isTheme={ext.isTheme} />
					)}
					<div className={styles.extPageHeroMeta}>
						<h1 className={styles.extPageName}>{ext.name}</h1>
						{ext.author && (
							<p className={styles.extPageAuthor}>by {ext.author}</p>
						)}
						<div className={styles.extPageTags}>
							{ext.tags.map((t) => (
								<TagBadge key={t} tag={t} />
							))}
						</div>
						<div className={styles.extPageClients}>
							{ext.clients.map((c) => (
								<ClientChip key={c} client={c} />
							))}
						</div>
					</div>
				</div>

				<div className={styles.extPageHeroActions}>
					{ext.repo && (
						<a
							href={ext.repo}
							target="_blank"
							rel="noopener noreferrer"
							className={`${styles.btn} ${styles.btnOutline} ${styles.btnLg}`}
						>
							<IconExternalLink /> Repository
						</a>
					)}
					{hasDownload && (
						<button
							className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}
							onClick={() => setShowDl(true)}
						>
							<IconDownload /> Download
						</button>
					)}
				</div>
			</div>

			{showUserJs && (
				<div className={styles.userjsBlock}>
					<div className={styles.userjsBlockHead}>
						<span className={styles.userjsBlockLabel}>user.js</span>
						<span className={styles.editorModalBadge}>RAW</span>
					</div>
					<pre className={styles.userjsBlockCode}>
						<code>{userJsContent ?? "Loading…"}</code>
					</pre>
				</div>
			)}

			{readmeLoading && (
				<div className={styles.loadingMsg}>
					<span className={styles.spinner} />
					Loading README…
				</div>
			)}

			{readme && !readmeLoading && (
				<div className={styles.readmeSection}>
					<div className={styles.secLabel}>README</div>
					<div className={styles.readmeSectionBody}>
						<MarkdownRenderer text={readme} baseUrl={ext.readmeBaseUrl} />
					</div>
				</div>
			)}
		</div>
	);
}

export default function AddonDetail() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const name = searchParams.get("name");

	const [extension, setExtension] = useState<Extension | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMsg, setLoadingMsg] = useState("Loading addon…");
	const [error, setError] = useState<string | null>(null);

	const loadAddon = useCallback(async () => {
		if (!name) {
			setLoading(false);
			setError("No addon name provided. Use ?name=xxx");
			return;
		}

		setLoading(true);
		setError(null);

		const cached = getCachedData();

		if (cached.exts && !cached.needsRefresh) {
			const found = resolveSlug(name, cached.exts);
			if (found) {
				setExtension(found);
				setLoading(false);
				return;
			}
		}

		try {
			setLoadingMsg("Connecting to GitHub…");
			const freshExts = await loadExtensions(setLoadingMsg);

			if (cached.exts && cacheMatchesNewData(freshExts)) {
				refreshCacheTimestamp();

				const found = resolveSlug(name, cached.exts!);
				if (found) {
					setExtension(found);
					setLoading(false);
					return;
				}
			}

			saveToCache(freshExts);

			const found = resolveSlug(name, freshExts);
			if (found) {
				setExtension(found);
			} else {
				setError(`Addon "${name}" not found`);
			}
		} catch (e: any) {
			if (cached.exts) {
				const found = resolveSlug(name, cached.exts);
				if (found) {
					setExtension(found);
					console.warn(
						"[AddonDetail] Using cached data (GitHub API unavailable)",
					);
				} else {
					setError(
						`Addon "${name}" not found in cache. GitHub API is currently unavailable.`,
					);
				}
			} else {
				setError(
					`Failed to load extensions: ${e.message ?? "Unknown error"}. GitHub API is currently unavailable.`,
				);
			}
		} finally {
			setLoading(false);
		}
	}, [name]);

	useEffect(() => {
		loadAddon();
	}, [loadAddon]);

	const handleBack = useCallback(() => {
		router.push("/store");
	}, [router]);

	if (loading) {
		return (
			<div className={styles.loadingPage}>
				<div className={styles.loadingPageContent}>
					<span className={styles.spinner} />
					<p>{loadingMsg}</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className={styles.root}>
				<div className={styles.notFound}>
					<div className={styles.notFoundCode}>404</div>
					<div className={styles.notFoundTitle}>Addon not found</div>
					<div className={styles.notFoundSub}>{error}</div>
					<button
						className={`${styles.btn} ${styles.btnPrimary}`}
						onClick={handleBack}
					>
						← Back to Store
					</button>
				</div>
			</div>
		);
	}

	if (!extension) {
		return (
			<div className={styles.root}>
				<div className={styles.notFound}>
					<div className={styles.notFoundCode}>404</div>
					<div className={styles.notFoundTitle}>Addon not found</div>
					<div className={styles.notFoundSub}>
						No addon matched <code>{name}</code>
					</div>
					<button
						className={`${styles.btn} ${styles.btnPrimary}`}
						onClick={handleBack}
					>
						← Back to Store
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.root}>
			<ExtensionPage ext={extension} onBack={handleBack} />
		</div>
	);
}
