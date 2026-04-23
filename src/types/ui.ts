import type { ReactNode, RefObject } from "react";
import type { NowPlaying } from "./player";
import type { OfficialTrack, LegacyTrack } from "./track";

export interface CardShellProps {
	delay?: number;
	live?: boolean;
	statusDot?: ReactNode;
	cover: ReactNode;
	title: ReactNode;
	artist: ReactNode;
	timeRow: ReactNode;
}

export interface GithubAsset {
	name: string;
	browser_download_url: string;
	size: number;
}

export interface GithubRelease {
	tag_name: string;
	prerelease: boolean;
	html_url: string;
	assets: GithubAsset[];
}

export interface PlayBtnProps {
	track: NowPlaying;
}

export interface SearchBarProps {
	value: string;
	onChange: (v: string) => void;
}

export interface OfficialListProps {
	tracks: OfficialTrack[];
	query: string;
}

export interface LegacyListProps {
	tracks: LegacyTrack[];
	query: string;
}

export interface DownloadTabProps {
	type: "json" | "m3u";
	url: string;
}

export interface PlayerContextValue {
	nowPlaying: NowPlaying | null;
	isPlaying: boolean;
	play: (track: NowPlaying) => void;
	pause: () => void;
	resume: () => void;
	close: () => void;
	audioRef: RefObject<HTMLAudioElement | null>;
}
