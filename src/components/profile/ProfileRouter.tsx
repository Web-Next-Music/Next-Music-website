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
	const githubId = searchParams.get("id");

	useEffect(() => {
		if (loading) return;
		if (!githubId && user) {
			const ownGithubId = (user?.user_metadata?.provider_id ?? user?.user_metadata?.sub) as string | undefined;
			if (ownGithubId) router.replace(`/profile?id=${ownGithubId}`);
		}
	}, [githubId, user, loading, router]);

	if (githubId) {
		const ownGithubId = (user?.user_metadata?.provider_id ?? user?.user_metadata?.sub) as string | undefined;
		if (!loading && ownGithubId && githubId === ownGithubId) {
			return <ProfileClient />;
		}
		return <PublicProfileClient githubId={githubId} />;
	}

	return <ProfileClient />;
}
