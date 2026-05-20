"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import styles from "./AuthButton.module.scss";

export default function AuthButton() {
	const { user, loading, signOut, openAuthModal } = useAuth();
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!dropdownOpen) return;
		const handler = (e: MouseEvent) => {
			if (!ref.current?.contains(e.target as Node)) setDropdownOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [dropdownOpen]);

	if (loading) return null;

	if (!user) {
		return (
			<button className={styles.signInBtn} onClick={openAuthModal}>
				Sign In
			</button>
		);
	}

	const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
	const initial = (user.user_metadata?.user_name ?? user.email ?? "?")[0].toUpperCase();

	return (
		<div ref={ref} className={styles.wrap}>
			<button
				className={styles.avatarBtn}
				onClick={() => setDropdownOpen((v) => !v)}
				aria-label="Account menu"
				title={user.user_metadata?.user_name ?? user.email}
			>
				{avatarUrl ? (
					<img src={avatarUrl} alt={initial} className={styles.avatarImg} />
				) : (
					initial
				)}
			</button>

			{dropdownOpen && (
				<div className={styles.dropdown}>
					<p className={styles.email}>
						{user.user_metadata?.user_name ?? user.email}
					</p>
					<Link
						href={`/profile?id=${(user.user_metadata?.provider_id ?? user.user_metadata?.sub) ?? ""}`}
						className={styles.dropdownLink}
						onClick={() => setDropdownOpen(false)}
					>
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
							<circle cx="12" cy="7" r="4" />
						</svg>
						Profile
					</Link>
					<button
						className={styles.signOutBtn}
						onClick={async () => {
							setDropdownOpen(false);
							await signOut();
						}}
					>
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none">
							<path
								d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							<polyline
								points="16 17 21 12 16 7"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							<line
								x1="21"
								y1="12"
								x2="9"
								y2="12"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
							/>
						</svg>
						Sign Out
					</button>
				</div>
			)}
		</div>
	);
}
