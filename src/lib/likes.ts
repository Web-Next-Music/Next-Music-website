import { getSupabase } from "./supabase";

type LikeTable = "track_likes" | "account_likes";
type LikeField = "track_id" | "github_login";

function fieldFor(table: LikeTable): LikeField {
	return table === "track_likes" ? "track_id" : "github_login";
}

export async function getLikeCount(
	table: LikeTable,
	id: string,
): Promise<number> {
	const sb = getSupabase();
	if (!sb) return 0;
	const field = fieldFor(table);
	const { count } = await sb
		.from(table)
		.select("*", { count: "exact", head: true })
		.eq(field, id);
	return count ?? 0;
}

export async function getUserLiked(
	table: LikeTable,
	id: string,
	userId: string,
): Promise<boolean> {
	const sb = getSupabase();
	if (!sb) return false;
	const field = fieldFor(table);
	const { data } = await sb
		.from(table)
		.select("id")
		.eq(field, id)
		.eq("user_id", userId)
		.maybeSingle();
	return data !== null;
}

export async function addLike(
	table: LikeTable,
	id: string,
	userId: string,
): Promise<boolean> {
	const sb = getSupabase();
	if (!sb) return false;
	const field = fieldFor(table);
	const { error } = await sb
		.from(table)
		.insert({ [field]: id, user_id: userId });
	if (error) console.error("[likes] addLike error:", error.message, error.code);
	return !error;
}

export async function removeLike(
	table: LikeTable,
	id: string,
	userId: string,
): Promise<boolean> {
	const sb = getSupabase();
	if (!sb) return false;
	const field = fieldFor(table);
	const { error } = await sb
		.from(table)
		.delete()
		.eq(field, id)
		.eq("user_id", userId);
	if (error) console.error("[likes] removeLike error:", error.message, error.code);
	return !error;
}
