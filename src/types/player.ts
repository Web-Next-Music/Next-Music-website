export interface WsPayload {
	playerIndex?: number;
	trackId: string | null;
	title: string | null;
	artists: string;
	img: string | null;
	albumUrl: string | null;
	artistUrl: string | null;
	trackUrl: string | null;
	positionSec: number;
	durationSec: number;
	playerState: string | null;
	_lastState?: boolean;
}

export interface NowPlaying {
	id?: string;
	url: string;
	directUrl?: string;
	title: string;
	artist: string;
	cover?: string;
	yandexUrl?: string;
}
