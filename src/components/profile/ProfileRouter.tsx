"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import ProfileClient from "./ProfileClient";
import PublicProfileClient from "./PublicProfileClient";

export default function ProfileRouter() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const { user, loading } = useAuth();
	const name = searchParams.get("n");

	useEffect(() => {
		if (loading) return;
		if (!name && user) {
			const ownLogin = user?.user_metadata?.user_name as string | undefined;
			if (ownLogin) router.replace(`/profile?n=${ownLogin}`);
		}
	}, [name, user, loading, router]);

	if (name) {
		const ownLogin = user?.user_metadata?.user_name as string | undefined;
		if (!loading && ownLogin && name.toLowerCase() === ownLogin.toLowerCase()) {
			return <ProfileClient />;
		}
		return <PublicProfileClient username={name} />;
	}

	return <ProfileClient />;
}
