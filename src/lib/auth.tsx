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

interface AuthContextValue {
	user: User | null;
	session: Session | null;
	loading: boolean;
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
	const [loading, setLoading] = useState(true);
	const [authModalOpen, setAuthModalOpen] = useState(false);

	useEffect(() => {
		const sb = getSupabase();
		if (!sb) { setLoading(false); return; }

		sb.auth.getSession().then(({ data }) => {
			setSession(data.session);
			setUser(data.session?.user ?? null);
			setLoading(false);
		});

		const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
			setSession(session);
			setUser(session?.user ?? null);
			const u = session?.user;
			if (u) {
				const login = u.user_metadata?.user_name as string | undefined;
				if (login) {
					syncGitHubMeta(
						u.id,
						login,
						(u.user_metadata?.full_name as string | undefined) ?? null,
						(u.user_metadata?.avatar_url as string | undefined) ?? null,
					);
				}
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
				loading,
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
