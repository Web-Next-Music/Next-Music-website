export type Tag = "Next Music" | "PulseSync" | "Web";

export interface ReleaseAsset {
	name: string;
	url: string;
	ext: string;
}

export interface Extension {
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

export interface CacheEntry {
	version: number;
	timestamp: number;
	extensions: Extension[];
	fingerprint: string;
}

export type CalloutType = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION";
