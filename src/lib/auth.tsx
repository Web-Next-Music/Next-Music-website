"use client";

import {
	createContext,
	useContext,
	useEffect,
	useState,
	useCallback,
	type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { syncGitHubMeta } from "./publicProfile";
import { getBanInfo, type BanInfo } from "./bans";

const GH_TOKEN_KEY = "gh_provider_token";
const BAN_CACHE_KEY = "ban_status_v1";

function readBanCache(userId: string): boolean | null {
	try {
		const raw = sessionStorage.getItem(BAN_CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as { uid: string; banned: boolean };
		return parsed.uid === userId ? parsed.banned : null;
	} catch {
		return null;
	}
}

function writeBanCache(userId: string, banned: boolean) {
	try {
		sessionStorage.setItem(BAN_CACHE_KEY, JSON.stringify({ uid: userId, banned }));
	} catch {}
}

interface AuthContextValue {
	user: User | null;
	session: Session | null;
	githubToken: string | null;
	loading: boolean;
	banChecking: boolean;
	isBanned: boolean;
	banInfo: BanInfo | null;
	signInWithGitHub: () => Promise<string | null>;
	signOut: () => Promise<void>;
	openAuthModal: () => void;
	closeAuthModal: () => void;
	authModalOpen: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [githubToken, setGithubToken] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [banChecking, setBanChecking] = useState(false);
	const [isBanned, setIsBanned] = useState(false);
	const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
	const [authModalOpen, setAuthModalOpen] = useState(false);

	useEffect(() => {
		const sb = getSupabase();
		if (!sb) {
			setLoading(false);
			return;
		}

		sb.auth.getSession().then(async ({ data }) => {
			const s = data.session;
			setSession(s);
			setUser(s?.user ?? null);

			if (s?.provider_token) {
				localStorage.setItem(GH_TOKEN_KEY, s.provider_token);
				setGithubToken(s.provider_token);
			} else if (s?.user) {
				const saved = localStorage.getItem(GH_TOKEN_KEY);
				setGithubToken(saved);
			}

			const u = s?.user;
			if (u) {
				const login = u.user_metadata?.user_name as string | undefined;
				const githubId = (u.user_metadata?.provider_id ??
					u.user_metadata?.sub) as string | undefined;
				if (login && githubId) {
					syncGitHubMeta(
						u.id,
						githubId,
						login,
						(u.user_metadata?.full_name as string | undefined) ?? null,
						(u.user_metadata?.avatar_url as string | undefined) ?? null,
					);
				}
				const cached = readBanCache(u.id);
				if (cached !== null) {
					setIsBanned(cached);
				} else {
					setBanChecking(true);
				}
				getBanInfo(u.id)
					.then((ban) => {
						const banned = ban !== null;
						setIsBanned(banned);
						setBanInfo(ban);
						writeBanCache(u.id, banned);
					})
					.catch(() => {})
					.finally(() => setBanChecking(false));
			}

			setLoading(false);
		});

		const { data: listener } = sb.auth.onAuthStateChange(async (event, session) => {
			setSession(session);
			setUser(session?.user ?? null);

			if (session?.provider_token) {
				localStorage.setItem(GH_TOKEN_KEY, session.provider_token);
				setGithubToken(session.provider_token);
			} else if (!session) {
				localStorage.removeItem(GH_TOKEN_KEY);
				sessionStorage.removeItem(BAN_CACHE_KEY);
				setGithubToken(null);
				setIsBanned(false);
				setBanInfo(null);
			}

			// Only check ban on actual new sign-in (OAuth callback).
			// getSession() handles the check on every page load.
			// TOKEN_REFRESHED and INITIAL_SESSION must not override the result.
			if (event === "SIGNED_IN" && session?.user) {
				const u = session.user;
				const login = u.user_metadata?.user_name as string | undefined;
				const githubId = (u.user_metadata?.provider_id ??
					u.user_metadata?.sub) as string | undefined;
				if (login && githubId) {
					syncGitHubMeta(
						u.id,
						githubId,
						login,
						(u.user_metadata?.full_name as string | undefined) ?? null,
						(u.user_metadata?.avatar_url as string | undefined) ?? null,
					);
				}
				setBanChecking(true);
				getBanInfo(u.id)
					.then((ban) => {
						const banned = ban !== null;
						setIsBanned(banned);
						setBanInfo(ban);
						writeBanCache(u.id, banned);
					})
					.catch(() => {})
					.finally(() => setBanChecking(false));
			}
		});

		return () => listener.subscription.unsubscribe();
	}, []);

	const signInWithGitHub = useCallback(async (): Promise<string | null> => {
		const sb = getSupabase();
		if (!sb) return "Supabase is not configured.";
		const { error } = await sb.auth.signInWithOAuth({
			provider: "github",
			options: { redirectTo: window.location.origin },
		});
		return error?.message ?? null;
	}, []);

	const signOut = useCallback(async () => {
		await getSupabase()?.auth.signOut();
	}, []);

	const openAuthModal = useCallback(() => setAuthModalOpen(true), []);
	const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);

	return (
		<AuthContext.Provider
			value={{
				user,
				session,
				githubToken,
				loading,
				banChecking,
				isBanned,
				banInfo,
				signInWithGitHub,
				signOut,
				openAuthModal,
				closeAuthModal,
				authModalOpen,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within AuthProvider");
	return ctx;
}
