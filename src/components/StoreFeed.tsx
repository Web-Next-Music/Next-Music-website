"use client";
import React, { useState, useEffect, useCallback } from "react";
import styles from "./StoreFeed.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tag = "Next Music" | "PulseSync" | "Web";

interface ReleaseAsset {
    name: string;
    url: string;
    ext: string;
}

interface Extension {
    id: string;
    name: string;
    description: string;
    author: string;
    tags: Tag[];
    isTheme: boolean;
    logo?: string;
    readmeUrl?: string;
    readmeBaseUrl?: string;
    userJsUrl?: string;
    repo?: string;
    downloadZip?: string;
    releaseAssets: ReleaseAsset[];
    clients: ("nm" | "ps" | "web")[];
}

// ─── GitHub helpers ───────────────────────────────────────────────────────────

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
        } catch {
            /* try next */
        }
    }
    return {};
}

// ─── Folder metadata ─────────────────────────────────────────────────────────
//
// For submodules: owner/repo point to the external repo, folderPath = "" (root).
// For regular dirs: owner=OWNER, repo=REPO, folderPath = "Addons/FolderName".
// We always list the correct folder so icons/readme/user.js are found locally.

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
                list.find((i) => i.type === "file" && isImg(i.name))
                    ?.download_url ||
                null
            );
        }

        let logo = pickImg(items);

        // If no image at root level, look one directory deeper (e.g. src/ or assets/)
        if (!logo) {
            for (const sub of items.filter((i) => i.type === "dir")) {
                try {
                    const subItems: any[] = await ghContents(
                        owner,
                        repo,
                        sub.path,
                    );
                    if (
                        subItems.some(
                            (i) =>
                                i.type === "file" &&
                                /\.(css|js|json)$/i.test(i.name),
                        )
                    ) {
                        logo = pickImg(subItems);
                        if (logo) break;
                    }
                } catch {
                    /* skip */
                }
            }
        }

        const rmItem = items.find(
            (i) => i.type === "file" && /^readme\.md$/i.test(i.name),
        );
        const jsItem = items.find(
            (i) => i.type === "file" && /^user\.js$/i.test(i.name),
        );

        // readmeBaseUrl: raw base for resolving relative image paths
        // For submodules it's the repo root; for inline folders it's the folder itself
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

/** Collect ALL assets from the latest release */
async function getAllReleaseAssets(
    owner: string,
    repo: string,
): Promise<ReleaseAsset[]> {
    try {
        const res = await fetch(
            `${GH}/repos/${owner}/${repo}/releases/latest`,
            {
                headers: GH_H,
            },
        );
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

/**
 * Derive tags + clients from release asset filenames.
 * Falls back to name/path heuristics if no assets found.
 */
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

    // Fallback if assets gave us nothing
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

// ─── Main loader ──────────────────────────────────────────────────────────────

async function loadExtensions(
    onProgress?: (msg: string) => void,
): Promise<Extension[]> {
    onProgress?.("Loading submodule map…");
    const gitmodules = await loadGitmodules();

    onProgress?.("Scanning sections…");

    const entries: {
        name: string;
        /** Full path in the main repo, e.g. "Addons/MyExt" */
        repoPath: string;
        /** Owner of the repo that actually contains the files */
        owner: string;
        /** Repo that actually contains the files */
        repo: string;
        /** Path inside that repo to list (root for submodules, full path for inline) */
        folderPath: string;
        isTheme: boolean;
    }[] = [];

    for (const section of ["Addons", "Themes"]) {
        const isTheme = section === "Themes";
        const prefix = section + "/";
        const seen = new Set<string>();

        // 1. Submodule entries
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
                folderPath: "", // submodule root
                isTheme,
            });
        }

        // 2. Regular (inline) directory entries
        try {
            const items: any[] = await ghContents(OWNER, REPO, section);
            for (const item of items) {
                if (item.type !== "dir" || seen.has(item.name.toLowerCase()))
                    continue;
                entries.push({
                    name: item.name,
                    repoPath: item.path, // e.g. "Addons/MyExt"
                    owner: OWNER,
                    repo: REPO,
                    folderPath: item.path, // list THIS specific folder, not root
                    isTheme,
                });
            }
        } catch {
            /* section may not exist */
        }
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
            } catch {
                /* skip broken entry */
            }
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(4, entries.length) }, worker),
    );
    return results.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_TAGS: Tag[] = ["Next Music", "PulseSync", "Web"];

const TAG_CLASS: Record<Tag, string> = {
    "Next Music": "tagNm",
    PulseSync: "tagPs",
    Web: "tagWeb",
};

const CLIENT_LABELS: Record<string, string> = {
    nm: "Next Music",
    ps: "PulseSync",
    web: "Web",
};

function matchSearch(ext: Extension, query: string, activeTags: Tag[]) {
    const q = query.toLowerCase();
    return (
        (!q || ext.name.toLowerCase().includes(q)) &&
        (activeTags.length === 0 ||
            activeTags.every((t) => ext.tags.includes(t)))
    );
}

function resolveImgUrl(src: string, baseUrl?: string): string {
    if (!src || /^https?:\/\//i.test(src)) return src;
    return baseUrl
        ? baseUrl.replace(/\/?$/, "/") + src.replace(/^\//, "")
        : src;
}

// ─── URL routing helpers ──────────────────────────────────────────────────────

function extSlug(ext: Extension) {
    return ext.name.toLowerCase().replace(/\s+/g, "-");
}

/** Push a new path without full page reload */
function navigate(path: string) {
    window.history.pushState(null, "", path);
}

// ─── Icons ────────────────────────────────────────────────────────────────────

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
const IconSearch = () => (
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
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
    </svg>
);
const IconGlobe = () => (
    <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20A14.5 14.5 0 0 0 12 2" />
        <path d="M2 12h20" />
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

// ─── Markdown renderer ────────────────────────────────────────────────────────

// ─── Recursive inline renderer ───────────────────────────────────────────────
// Handles arbitrary nesting: **[link](url)**, *`code`*, **_bold italic_**, etc.

function renderInline(
    raw: string,
    base: string | undefined,
    key: string,
): React.ReactNode {
    if (!raw) return null;

    // Order matters: check longer/more-specific patterns first.
    // Each branch finds the EARLIEST match of its pattern, then recurses on
    // the text before, the content inside, and the text after.

    // 1. Inline image  ![alt](src)
    const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/;
    // 2. Link          [label](href)  — label may contain markup
    const linkRe = /\[([^\]]*)\]\(([^)]+)\)/;
    // 3. Bold          **...**  or  __...__
    const boldRe = /\*\*(.+?)\*\*|__(.+?)__/s;
    // 4. Italic        *...*  or  _..._  (not preceded/followed by same char)
    const italRe = /\*([^*]+?)\*|_([^_]+?)_/s;
    // 5. Inline code   `...`
    const codeRe = /`([^`]+)`/;

    // Find the earliest match across all patterns
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

    // img — leaf, no recursion needed inside src/alt
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

    // link — label is recursed
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
                    {renderInline(m[1], base, key + "la")}
                </a>
            ),
        });
    })();

    // bold
    (() => {
        const m = boldRe.exec(raw);
        if (!m) return;
        const content = m[1] ?? m[2];
        candidates.push({
            index: m.index!,
            end: m.index! + m[0].length,
            inner: "",
            node: <strong>{renderInline(content, base, key + "b")}</strong>,
        });
    })();

    // italic — only if not a stray * inside bold
    (() => {
        const m = italRe.exec(raw);
        if (!m) return;
        const content = m[1] ?? m[2];
        candidates.push({
            index: m.index!,
            end: m.index! + m[0].length,
            inner: "",
            node: <em>{renderInline(content, base, key + "i")}</em>,
        });
    })();

    // code — leaf
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

    if (candidates.length === 0) return raw; // plain text, no markup

    // Pick earliest match (ties: longest wins)
    candidates.sort(
        (a, b) => a.index - b.index || b.end - b.index - (a.end - a.index),
    );
    const hit = candidates[0];

    const before = raw.slice(0, hit.index);
    const after = raw.slice(hit.end);

    return (
        <>
            {before && <span>{before}</span>}
            {React.cloneElement(hit.node as React.ReactElement, {
                key: key + hit.index,
            })}
            {after && renderInline(after, base, key + hit.end)}
        </>
    );
}

function Inline({ text, base }: { text: string; base?: string }) {
    return <>{renderInline(text, base, "il")}</>;
}

// ─── GitHub Callout types ─────────────────────────────────────────────────────

type CalloutType = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION";

const CALLOUT_META: Record<
    CalloutType,
    { label: string; cls: string; icon: string }
> = {
    NOTE: { label: "Note", cls: "calloutNote", icon: "ℹ" },
    TIP: { label: "Tip", cls: "calloutTip", icon: "💡" },
    IMPORTANT: { label: "Important", cls: "calloutImportant", icon: "⚠" },
    WARNING: { label: "Warning", cls: "calloutWarning", icon: "⚠" },
    CAUTION: { label: "Caution", cls: "calloutCaution", icon: "🛑" },
};

// ─── Simple HTML table parser ─────────────────────────────────────────────────

/** Extract src / href / text from a small subset of inline HTML */
function parseInlineHtml(html: string, baseUrl?: string): React.ReactNode {
    // Collect <tr> rows
    const rows: React.ReactNode[] = [];
    let ri = 0;
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trM: RegExpExecArray | null;
    while ((trM = trRe.exec(html)) !== null) {
        const cells: React.ReactNode[] = [];
        const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let cM: RegExpExecArray | null;
        let ci = 0;
        const rowContent = trM[1];
        while ((cM = cellRe.exec(rowContent)) !== null) {
            cells.push(
                <td key={ci++} className={styles.mdTd}>
                    {renderHtmlContent(cM[1], baseUrl)}
                </td>,
            );
        }
        if (cells.length) rows.push(<tr key={ri++}>{cells}</tr>);
    }
    if (rows.length) {
        return (
            <div key="htmltable" className={styles.mdTableWrap}>
                <table className={styles.mdTable}>
                    <tbody>{rows}</tbody>
                </table>
            </div>
        );
    }
    // Fallback: strip tags and render plain text
    return <span>{html.replace(/<[^>]*>/g, " ").trim()}</span>;
}

/** Render the inner HTML of a cell: may contain <img>, <a>, plain text */
function renderHtmlContent(html: string, baseUrl?: string): React.ReactNode {
    const nodes: React.ReactNode[] = [];
    // Split on tags we care about
    const re = /<img\s[^>]*>|<a\s[^>]*>[\s\S]*?<\/a>/gi;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        if (m.index > last) {
            const txt = html
                .slice(last, m.index)
                .replace(/<[^>]*>/g, "")
                .trim();
            if (txt) nodes.push(<span key={last}>{txt}</span>);
        }
        const tag = m[0];
        if (tag.toLowerCase().startsWith("<img")) {
            const srcM = tag.match(/src="([^"]*)"/i);
            const altM = tag.match(/alt="([^"]*)"/i);
            const wM = tag.match(/width="([^"]*)"/i);
            const hM = tag.match(/height="([^"]*)"/i);
            if (srcM) {
                nodes.push(
                    <img
                        key={m.index}
                        src={resolveImgUrl(srcM[1], baseUrl)}
                        alt={altM?.[1] ?? ""}
                        className={styles.mdHtmlImg}
                        style={{
                            width: wM ? `${wM[1]}px` : undefined,
                            height: hM ? `${hM[1]}px` : undefined,
                        }}
                    />,
                );
            }
        } else if (tag.toLowerCase().startsWith("<a")) {
            const hrefM = tag.match(/href="([^"]*)"/i);
            const inner = tag.replace(/<a[^>]*>|<\/a>/gi, "");
            // Inner might itself have an img
            const innerNodes = renderHtmlContent(inner, baseUrl);
            nodes.push(
                <a
                    key={m.index}
                    href={hrefM?.[1] ?? "#"}
                    className={styles.mdLink}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {innerNodes}
                </a>,
            );
        }
        last = m.index + m[0].length;
    }
    if (last < html.length) {
        const txt = html
            .slice(last)
            .replace(/<[^>]*>/g, "")
            .trim();
        if (txt) nodes.push(<span key={last}>{txt}</span>);
    }
    return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

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

        // ── Fenced code block ────────────────────────────────────────────────
        if (line.startsWith("```")) {
            const lang = line.slice(3).trim();
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].startsWith("```")) {
                codeLines.push(lines[i]);
                i++;
            }
            nodes.push(
                <pre key={`pre${i}`} className={styles.mdPre}>
                    {lang && <span className={styles.mdPreLang}>{lang}</span>}
                    <code>{codeLines.join("\n")}</code>
                </pre>,
            );
            i++;
            continue;
        }

        // ── Raw HTML block (e.g. <table>) ────────────────────────────────────
        if (/^<(table|div|details|summary)/i.test(line.trim())) {
            const htmlLines: string[] = [];
            // Collect until blank line or closing tag
            while (i < lines.length && lines[i].trim() !== "") {
                htmlLines.push(lines[i]);
                i++;
            }
            const htmlStr = htmlLines.join("\n");
            nodes.push(
                <div key={`html${i}`} className={styles.mdHtmlBlock}>
                    {parseInlineHtml(htmlStr, baseUrl)}
                </div>,
            );
            continue;
        }

        // ── Headings ─────────────────────────────────────────────────────────
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

            // ── Horizontal rule ───────────────────────────────────────────────────
        } else if (/^[-*_]{3,}$/.test(line.trim())) {
            nodes.push(<hr key={i} className={styles.mdHr} />);

            // ── Unordered list ────────────────────────────────────────────────────
        } else if (/^(\s{0,3})[-*+] /.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^(\s{0,3})[-*+] /.test(lines[i])) {
                items.push(lines[i].replace(/^(\s{0,3})[-*+] /, ""));
                i++;
            }
            nodes.push(
                <ul key={`ul${i}`}>
                    {items.map((it, j) => (
                        <li key={j}>
                            <Inline text={it} base={baseUrl} />
                        </li>
                    ))}
                </ul>,
            );
            continue;

            // ── Ordered list ──────────────────────────────────────────────────────
        } else if (/^\d+\.\s/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
                items.push(lines[i].replace(/^\d+\.\s/, ""));
                i++;
            }
            nodes.push(
                <ol key={`ol${i}`}>
                    {items.map((it, j) => (
                        <li key={j}>
                            <Inline text={it} base={baseUrl} />
                        </li>
                    ))}
                </ol>,
            );
            continue;

            // ── GitHub-style callout / plain blockquote ───────────────────────────
        } else if (line.startsWith("> ")) {
            const bqLines: string[] = [];
            while (i < lines.length && lines[i].startsWith("> ")) {
                bqLines.push(lines[i].slice(2));
                i++;
            }

            // Detect > [!TYPE]
            const calloutMatch = bqLines[0]?.match(
                /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i,
            );
            if (calloutMatch) {
                const type = calloutMatch[1].toUpperCase() as CalloutType;
                const meta = CALLOUT_META[type];
                const bodyLines = bqLines
                    .slice(1)
                    .filter((l) => l.trim() !== "");
                nodes.push(
                    <div
                        key={`co${i}`}
                        className={`${styles.mdCallout} ${styles[meta.cls]}`}
                    >
                        <div className={styles.mdCalloutTitle}>
                            <span className={styles.mdCalloutIcon}>
                                {meta.icon}
                            </span>
                            {meta.label}
                        </div>
                        {bodyLines.map((l, j) => (
                            <p key={j} className={styles.mdCalloutBody}>
                                <Inline text={l} base={baseUrl} />
                            </p>
                        ))}
                    </div>,
                );
            } else {
                nodes.push(
                    <blockquote key={`bq${i}`} className={styles.mdBlockquote}>
                        {bqLines.map((l, j) => (
                            <p key={j}>
                                <Inline text={l} base={baseUrl} />
                            </p>
                        ))}
                    </blockquote>,
                );
            }
            continue;

            // ── GFM pipe table ────────────────────────────────────────────────────
        } else if (/^\|.+\|/.test(line)) {
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
            const headers = parseRow(tableLines[0]);
            const body = tableLines
                .slice(2) // skip separator row
                .filter((r) => !/^\|[-: |]+\|$/.test(r.trim()))
                .map(parseRow);
            nodes.push(
                <div key={`tbl${i}`} className={styles.mdTableWrap}>
                    <table className={styles.mdTable}>
                        <thead>
                            <tr>
                                {headers.map((h, j) => (
                                    <th key={j} className={styles.mdTh}>
                                        <Inline text={h} base={baseUrl} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {body.map((row, ri) => (
                                <tr key={ri}>
                                    {row.map((cell, ci) => (
                                        <td key={ci} className={styles.mdTd}>
                                            <Inline
                                                text={cell}
                                                base={baseUrl}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>,
            );
            continue;

            // ── Standalone image ──────────────────────────────────────────────────
        } else if (/^!\[[^\]]*\]\([^)]*\)$/.test(line.trim())) {
            const m = line.trim().match(/^!\[([^\]]*)\]\(([^)]*)\)$/)!;
            nodes.push(
                <div key={i} className={styles.mdImgWrap}>
                    <img
                        src={resolveImgUrl(m[2], baseUrl)}
                        alt={m[1]}
                        className={styles.mdImgBlock}
                    />
                </div>,
            );

            // ── Paragraph ─────────────────────────────────────────────────────────
        } else if (line.trim() !== "") {
            nodes.push(
                <p key={i}>
                    <Inline text={line} base={baseUrl} />
                </p>,
            );
        }
        i++;
    }

    return <div className={styles.markdownBody}>{nodes}</div>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LogoPlaceholder({ isTheme }: { isTheme: boolean }) {
    return (
        <div
            className={`${styles.logoPh} ${isTheme ? styles.logoPhTheme : ""}`}
        >
            {isTheme ? <IconPalette /> : <IconBlocks />}
        </div>
    );
}

function TagBadge({
    tag,
    active,
    onClick,
}: {
    tag: Tag;
    active?: boolean;
    onClick?: () => void;
}) {
    const cls = [
        styles.tagBadge,
        styles[TAG_CLASS[tag]],
        active ? styles.tagBadgeActive : "",
        onClick ? styles.tagBadgeClickable : "",
    ]
        .filter(Boolean)
        .join(" ");
    return (
        <span className={cls} onClick={onClick}>
            {tag}
        </span>
    );
}

// ClientChip removed — chips are no longer shown on cards
function ClientChip(_: { client: string }) {
    return null;
}

// ─── Download Modal ───────────────────────────────────────────────────────────

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
                    <span className={styles.modalBoxTitle}>
                        Download — {ext.name}
                    </span>
                    <button className={styles.modalBoxClose} onClick={onClose}>
                        <IconX />
                    </button>
                </div>
                <div className={styles.modalBoxBody}>
                    <div className={styles.downloadOptions}>
                        {ext.releaseAssets.map((asset) => {
                            const icon = asset.name
                                .toLowerCase()
                                .endsWith(".js") ? (
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
                                    <div className={styles.dlOptionIcon}>
                                        {icon}
                                    </div>
                                    <div className={styles.dlOptionInfo}>
                                        <div className={styles.dlOptionLabel}>
                                            {asset.name}
                                        </div>
                                    </div>
                                    <span className={styles.dlOptionBadge}>
                                        {asset.ext}
                                    </span>
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
                                    <div className={styles.dlOptionLabel}>
                                        Source ZIP
                                    </div>
                                    <div className={styles.dlOptionSub}>
                                        Full repository source code
                                    </div>
                                </div>
                                <span className={styles.dlOptionBadge}>
                                    .zip
                                </span>
                            </a>
                        )}
                        {!ext.releaseAssets.length && !ext.downloadZip && (
                            <p className={styles.dlOptionNone}>
                                No downloads available yet.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Extension Detail Page ────────────────────────────────────────────────────

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

    // ── Open Graph meta update ─────────────────────────────────────
    useEffect(() => {
        const prev = {
            title: document.title,
            ogTitle: (
                document.querySelector(
                    'meta[property="og:title"]',
                ) as HTMLMetaElement
            )?.content,
            ogDesc: (
                document.querySelector(
                    'meta[property="og:description"]',
                ) as HTMLMetaElement
            )?.content,
            ogImg: (
                document.querySelector(
                    'meta[property="og:image"]',
                ) as HTMLMetaElement
            )?.content,
            twitterCard: (
                document.querySelector(
                    'meta[name="twitter:card"]',
                ) as HTMLMetaElement
            )?.content,
            twitterImg: (
                document.querySelector(
                    'meta[name="twitter:image"]',
                ) as HTMLMetaElement
            )?.content,
            twitterTitle: (
                document.querySelector(
                    'meta[name="twitter:title"]',
                ) as HTMLMetaElement
            )?.content,
        };

        function setMeta(selector: string, attr: string, value: string) {
            let el = document.querySelector(selector) as HTMLMetaElement | null;
            if (!el) {
                el = document.createElement("meta");
                if (selector.includes("property="))
                    el.setAttribute(
                        "property",
                        selector.match(/property="([^"]+)"/)![1],
                    );
                else
                    el.setAttribute(
                        "name",
                        selector.match(/name="([^"]+)"/)![1],
                    );
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
            setMeta(
                'meta[name="twitter:card"]',
                "content",
                "summary_large_image",
            );
            setMeta('meta[name="twitter:image"]', "content", ext.logo);
        }
        setMeta('meta[name="twitter:title"]', "content", title);

        return () => {
            // Restore original values on unmount
            document.title = prev.title || "Next Music Store";
            if (prev.ogTitle !== undefined)
                setMeta('meta[property="og:title"]', "content", prev.ogTitle);
            if (prev.ogDesc !== undefined)
                setMeta(
                    'meta[property="og:description"]',
                    "content",
                    prev.ogDesc,
                );
            if (prev.ogImg !== undefined)
                setMeta('meta[property="og:image"]', "content", prev.ogImg);
            if (prev.twitterCard !== undefined)
                setMeta(
                    'meta[name="twitter:card"]',
                    "content",
                    prev.twitterCard,
                );
            if (prev.twitterImg !== undefined)
                setMeta(
                    'meta[name="twitter:image"]',
                    "content",
                    prev.twitterImg,
                );
            if (prev.twitterTitle !== undefined)
                setMeta(
                    'meta[name="twitter:title"]',
                    "content",
                    prev.twitterTitle,
                );
        };
    }, [ext]);

    const hasDownload = ext.releaseAssets.length > 0 || !!ext.downloadZip;

    return (
        <div className={styles.extPage}>
            {showDl && (
                <DownloadModal ext={ext} onClose={() => setShowDl(false)} />
            )}

            <div className={styles.extPageBack}>
                <button className={styles.backBtn} onClick={onBack}>
                    <IconArrowLeft /> Back to Store
                </button>
            </div>

            <div className={styles.extPageHero}>
                <div className={styles.extPageHeroLeft}>
                    {ext.logo ? (
                        <img
                            src={ext.logo}
                            alt={ext.name}
                            className={styles.extPageLogo}
                        />
                    ) : (
                        <LogoPlaceholder isTheme={ext.isTheme} />
                    )}
                    <div className={styles.extPageHeroMeta}>
                        <h1 className={styles.extPageName}>{ext.name}</h1>
                        {ext.author && (
                            <p className={styles.extPageAuthor}>
                                by {ext.author}
                            </p>
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
                        <MarkdownRenderer
                            text={readme}
                            baseUrl={ext.readmeBaseUrl}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Extension Card ───────────────────────────────────────────────────────────

function ExtCard({
    ext,
    onClick,
    onDownload,
    style,
}: {
    ext: Extension;
    onClick: () => void;
    onDownload: (e: React.MouseEvent) => void;
    style?: React.CSSProperties;
}) {
    return (
        <div className={styles.card} onClick={onClick} style={style}>
            <div className={styles.cardTop}>
                {ext.logo ? (
                    <img
                        src={ext.logo}
                        alt={ext.name}
                        className={styles.cardLogo}
                    />
                ) : (
                    <LogoPlaceholder isTheme={ext.isTheme} />
                )}
                <div className={styles.cardMeta}>
                    <div className={styles.cardName}>{ext.name}</div>
                    {ext.author && (
                        <span className={styles.cardSub}>by {ext.author}</span>
                    )}
                    <div className={styles.cardClients}>
                        {ext.clients.map((c) => (
                            <ClientChip key={c} client={c} />
                        ))}
                    </div>
                </div>
            </div>

            <div className={styles.cardTags}>
                {ext.tags.map((t) => (
                    <TagBadge key={t} tag={t} />
                ))}
            </div>

            <div
                className={styles.cardActions}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.cardActionsRight}>
                    <button
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={onDownload}
                        disabled={
                            ext.releaseAssets.length === 0 && !ext.downloadZip
                        }
                    >
                        <IconDownload /> Download
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Store ───────────────────────────────────────────────────────────────

export default function NextMusicStore() {
    const [activeTab, setActiveTab] = useState<"addons" | "themes">("addons");
    const [activeTags, setActiveTags] = useState<Tag[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedExt, setSelectedExt] = useState<Extension | null>(null);
    const [downloadTarget, setDownloadTarget] = useState<Extension | null>(
        null,
    );
    const [extensions, setExtensions] = useState<Extension[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMsg, setLoadingMsg] = useState("Connecting to GitHub…");
    const [error, setError] = useState<string | null>(null);
    // Hash-based routing: /store#slug → search → open or 404
    const [hashNotFound, setHashNotFound] = useState<string | null>(null);

    const fetchExtensions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setExtensions(await loadExtensions(setLoadingMsg));
        } catch (e: any) {
            setError(e.message ?? "Failed to load extensions.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchExtensions();
    }, [fetchExtensions]);

    // ── URL-based routing ────────────────────────────────────────────────────────
    // initialSlugRef is populated in a useEffect so window is only accessed
    // client-side (avoids SSR "window is not defined").
    // Supports both /store/slug (pathname) and /store#slug (hash).
    const initialSlugRef = React.useRef<string | null>(null);
    // Flag so we know whether the initial slug came from a hash (for 404 logic)
    const initialWasHashRef = React.useRef(false);

    useEffect(() => {
        // Hash takes priority: /store#colorful
        const hash = window.location.hash.slice(1).trim();
        if (hash) {
            initialSlugRef.current = hash;
            initialWasHashRef.current = true;
            return;
        }
        const segs = window.location.pathname.split("/").filter(Boolean);
        initialSlugRef.current = segs[segs.length - 1] || null;
        initialWasHashRef.current = false;
    }, []);

    /** Find extension by slug (exact) or fuzzy name match */
    function resolveSlug(slug: string, exts: Extension[]): Extension | null {
        if (!slug) return null;
        const needle = slug.toLowerCase();
        return (
            exts.find((e) => extSlug(e) === needle) ??
            exts.find((e) => e.name.toLowerCase().includes(needle)) ??
            null
        );
    }

    // After extensions load: resolve the initial slug (direct navigation / page refresh)
    useEffect(() => {
        if (!extensions.length) return;
        if (initialSlugRef.current) {
            const slug = initialSlugRef.current;
            const wasHash = initialWasHashRef.current;
            initialSlugRef.current = null; // consume once
            const found = resolveSlug(slug, extensions);
            if (found) {
                setHashNotFound(null);
                setSelectedExt(found);
                if (wasHash) navigate(`/store/${extSlug(found)}`);
            } else if (wasHash) {
                setHashNotFound(slug);
            }
        }
    }, [extensions]);

    // When selection changes, push a new URL
    const isFirstRender = React.useRef(true);
    useEffect(() => {
        // Skip the very first render to avoid overwriting the initial URL before
        // extensions have loaded (which would strip the slug before we resolve it).
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        if (selectedExt) {
            navigate(`/store/${extSlug(selectedExt)}`);
        } else {
            // Go back to base path (strip any slug segment)
            const segs = window.location.pathname.split("/").filter(Boolean);
            const withoutSlug = segs.filter(
                (s) => !extensions.some((e) => extSlug(e) === s),
            );
            navigate(withoutSlug.length ? `/${withoutSlug.join("/")}` : "/");
        }
    }, [selectedExt]);

    // Handle browser back / forward (pathname routing)
    useEffect(() => {
        const handler = () => {
            const segs = window.location.pathname.split("/").filter(Boolean);
            const slug = segs[segs.length - 1];
            if (!slug || !extensions.length) {
                setSelectedExt(null);
                return;
            }
            const found = extensions.find((e) => extSlug(e) === slug);
            setSelectedExt(found ?? null);
        };
        window.addEventListener("popstate", handler);
        return () => window.removeEventListener("popstate", handler);
    }, [extensions]);

    // Handle hash changes while page is already open: /store#colorful
    useEffect(() => {
        if (!extensions.length) return;
        const handler = () => {
            const hash = window.location.hash.slice(1).trim();
            if (!hash) return;
            const found = resolveSlug(hash, extensions);
            if (found) {
                setHashNotFound(null);
                setSelectedExt(found);
                navigate(`/store/${extSlug(found)}`);
            } else {
                setHashNotFound(hash);
                setSelectedExt(null);
            }
        };
        window.addEventListener("hashchange", handler);
        return () => window.removeEventListener("hashchange", handler);
    }, [extensions]);

    const toggleTag = useCallback(
        (tag: Tag) =>
            setActiveTags((p) =>
                p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag],
            ),
        [],
    );

    const filteredAddons = extensions.filter(
        (e) => !e.isTheme && matchSearch(e, searchQuery, activeTags),
    );
    const filteredThemes = extensions.filter(
        (e) => e.isTheme && matchSearch(e, searchQuery, activeTags),
    );
    const shownItems = activeTab === "addons" ? filteredAddons : filteredThemes;

    return (
        <div className={styles.root}>
            {hashNotFound ? (
                <div className={styles.notFound}>
                    <div className={styles.notFoundCode}>404</div>
                    <div className={styles.notFoundTitle}>
                        Extension not found
                    </div>
                    <div className={styles.notFoundSub}>
                        No extension matched <code>#{hashNotFound}</code>
                    </div>
                    <button
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={() => {
                            setHashNotFound(null);
                            window.history.replaceState(null, "", "/store");
                        }}
                    >
                        ← Back to Store
                    </button>
                </div>
            ) : selectedExt ? (
                <ExtensionPage
                    ext={selectedExt}
                    onBack={() => setSelectedExt(null)}
                />
            ) : (
                <>
                    {/* Tabs — no header above */}
                    <div className={styles.tabs}>
                        <div className={styles.tabsInner}>
                            <button
                                className={`${styles.tab} ${activeTab === "addons" ? styles.tabActive : ""}`}
                                onClick={() => setActiveTab("addons")}
                            >
                                <IconBlocks /> Addons
                                <span className={styles.tabCount}>
                                    {filteredAddons.length}
                                </span>
                            </button>
                            <button
                                className={`${styles.tab} ${activeTab === "themes" ? styles.tabActive : ""}`}
                                onClick={() => setActiveTab("themes")}
                            >
                                <IconPalette /> Themes
                                <span className={styles.tabCount}>
                                    {filteredThemes.length}
                                </span>
                            </button>
                        </div>
                    </div>

                    <div className={styles.toolbar}>
                        <div className={styles.toolbarInner}>
                            <div className={styles.searchWrap}>
                                <span className={styles.searchIcon}>
                                    <IconSearch />
                                </span>
                                <input
                                    className={styles.searchInput}
                                    type="text"
                                    placeholder="Search extensions…"
                                    value={searchQuery}
                                    onChange={(e) =>
                                        setSearchQuery(e.target.value)
                                    }
                                />
                            </div>
                            <div className={styles.tagFilters}>
                                <span className={styles.tagFilterLabel}>
                                    Filter:
                                </span>
                                {ALL_TAGS.map((tag) => (
                                    <TagBadge
                                        key={tag}
                                        tag={tag}
                                        active={activeTags.includes(tag)}
                                        onClick={() => toggleTag(tag)}
                                    />
                                ))}
                                {activeTags.length > 0 && (
                                    <button
                                        className={`${styles.btn} ${styles.btnGhost}`}
                                        style={{
                                            padding: "3px 10px",
                                            fontSize: "0.62rem",
                                        }}
                                        onClick={() => setActiveTags([])}
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <main className={styles.main}>
                        <div className={styles.secLabel}>
                            {activeTab === "addons" ? "Addons" : "Themes"}
                        </div>

                        {loading ? (
                            <>
                                <div className={styles.loadingMsg}>
                                    <span className={styles.spinner} />
                                    {loadingMsg}
                                </div>
                                <div className={styles.loadingGrid}>
                                    {Array.from({ length: 6 }).map((_, idx) => (
                                        <div
                                            key={idx}
                                            className={styles.skeletonCard}
                                            style={{
                                                animationDelay: `${idx * 100}ms`,
                                            }}
                                        />
                                    ))}
                                </div>
                            </>
                        ) : error ? (
                            <div className={styles.grid}>
                                <div className={styles.errorBox}>
                                    <div>
                                        Failed to load extensions: {error}
                                        <br />
                                        <button
                                            className={styles.retryBtn}
                                            onClick={fetchExtensions}
                                        >
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.grid}>
                                {shownItems.length === 0 ? (
                                    <div className={styles.empty}>
                                        No extensions found.
                                    </div>
                                ) : (
                                    shownItems.map((ext, idx) => (
                                        <ExtCard
                                            key={ext.id}
                                            ext={ext}
                                            style={{
                                                animationDelay: `${idx * 40}ms`,
                                            }}
                                            onClick={() => setSelectedExt(ext)}
                                            onDownload={(e) => {
                                                e.stopPropagation();
                                                setDownloadTarget(ext);
                                            }}
                                        />
                                    ))
                                )}
                            </div>
                        )}
                    </main>
                </>
            )}

            {downloadTarget && (
                <DownloadModal
                    ext={downloadTarget}
                    onClose={() => setDownloadTarget(null)}
                />
            )}
        </div>
    );
}
