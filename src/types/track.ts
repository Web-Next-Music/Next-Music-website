export interface OfficialTrack {
	title: string;
	artist: string;
	cover: string;
	url: string;
}

export interface LegacyTrack {
	id: string;
	url: string;
	yandexUrl: string;
}

export interface TrackMeta {
	title: string;
	artist: string;
	cover?: string;
}

export interface CachedTrack {
	id: string;
	url: string;
	title: string;
	artist: string;
	cover?: string;
	yandexUrl?: string;
	source: "official" | "legacy";
}

export interface StoreSnapshot {
	official: OfficialTrack[];
	legacy: LegacyTrack[];
	loaded: boolean;
}
