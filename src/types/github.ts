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
