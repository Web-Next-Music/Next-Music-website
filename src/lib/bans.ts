import { getSupabase } from "./supabase";

export type BanInfo = Record<string, never>;

export async function getBanInfo(userId: string): Promise<BanInfo | null> {
	const sb = getSupabase();
	if (!sb) return null;
	const { data, error } = await sb
		.from("bans")
		.select("user_id")
		.eq("user_id", userId)
		.maybeSingle();
	if (error) throw error;
	return data ? ({} as BanInfo) : null;
}
