export interface TrackKeyData {
	url: string;
	title?: string;
	artist?: string;
	cover?: string;
	token?: string;
}

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_TRACK_KEY ?? "";

function xor(data: Buffer, key: Buffer): Buffer {
	const out = Buffer.allocUnsafe(data.length);
	for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
	return out;
}

export function encodeTrackKey(data: TrackKeyData): string {
	const compact: Record<string, string> = { u: data.url };
	if (data.title) compact.t = data.title;
	if (data.artist) compact.a = data.artist;
	if (data.cover) compact.c = data.cover;
	if (data.token) compact.k = data.token;
	return xor(Buffer.from(JSON.stringify(compact)), Buffer.from(ENCRYPTION_KEY))
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

export function decodeTrackKey(key: string): TrackKeyData | null {
	try {
		const raw = Buffer.from(
			key.replace(/-/g, "+").replace(/_/g, "/"),
			"base64",
		);
		const compact = JSON.parse(
			xor(raw, Buffer.from(ENCRYPTION_KEY)).toString("utf8"),
		);
		return {
			url: compact.u ?? "",
			title: compact.t,
			artist: compact.a,
			cover: compact.c,
			token: compact.k,
		};
	} catch {
		return null;
	}
}
