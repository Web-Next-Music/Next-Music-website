const REPO = "Web-Next-Music/Next-Music-Client";
const BASE = "https://api.github.com";

const FALLBACK_BASES: string[] = ["https://ghapi.huchen.dev"];

function headers(): HeadersInit {
    return {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    };
}

export interface Stargazer {
    login: string;
    avatar_url: string;
    html_url: string;
}

export interface ReleaseAsset {
    name: string;
    browser_download_url: string;
    size: number;
}

export interface RepoRelease {
    tag_name: string;
    name: string;
    prerelease: boolean;
    html_url: string;
    assets: ReleaseAsset[];
}

/**
 * Tries the primary GitHub base URL first, then each fallback in order.
 * Returns the first successful Response, or null if all fail.
 */
async function fetchWithFallback(path: string): Promise<Response | null> {
    const bases = [BASE, ...FALLBACK_BASES];

    for (const base of bases) {
        try {
            const res = await fetch(`${base}${path}`, { headers: headers() });
            if (res.ok) return res;
        } catch {
            // This base is unreachable — try the next one
        }
    }

    return null;
}

/** Fetch all stargazers (paginates through all pages) */
export async function fetchStargazers(): Promise<Stargazer[]> {
    const all: Stargazer[] = [];
    let page = 1;

    while (true) {
        const res = await fetchWithFallback(
            `/repos/${REPO}/stargazers?per_page=100&page=${page}`,
        );
        if (!res) break;

        const data: Stargazer[] = await res.json();
        if (!data.length) break;
        all.push(...data);
        if (data.length < 100) break;
        page++;
    }

    return all;
}

/** Fetch latest release with assets */
export async function fetchLatestRelease(): Promise<RepoRelease | null> {
    const res = await fetchWithFallback(`/repos/${REPO}/releases/latest`);
    if (!res) return null;
    return res.json();
}

/** Find a download URL from release assets by file extension */
export function findAsset(
    assets: ReleaseAsset[],
    ext: string,
): ReleaseAsset | undefined {
    return assets.find((a) => a.name.endsWith(ext));
}

/** Format bytes to human-readable size */
export function formatSize(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}
