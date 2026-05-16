"use client";

import { useEffect, useState } from "react";
import styles from "./StarsSection.module.css";
import Image from "next/image";
import type { Stargazer } from "@/types/github";

const REPO = "Web-Next-Music/Next-Music-Client";

async function fetchAllStargazers(): Promise<Stargazer[]> {
	const all: Stargazer[] = [];
	let page = 1;

	while (true) {
		const res = await fetch(
			`https://api.github.com/repos/${REPO}/stargazers?per_page=100&page=${page}`,
			{ headers: { Accept: "application/vnd.github+json" } },
		);
		if (!res.ok) break;
		const batch: Stargazer[] = await res.json();
		if (batch.length === 0) break;
		all.push(...batch);
		if (batch.length < 100) break;
		page++;
	}

	return all;
}

const PAGE_SIZE = 12;

export default function StarsSection() {
	const [stargazers, setStargazers] = useState<Stargazer[]>([]);
	const [loading, setLoading] = useState(true);
	const [page, setPage] = useState(1);

	useEffect(() => {
		fetchAllStargazers()
			.then(setStargazers)
			.catch(() => setStargazers([]))
			.finally(() => setLoading(false));
	}, []);

	const totalPages = Math.ceil(stargazers.length / PAGE_SIZE);
	const pageItems = stargazers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	return (
		<section className={styles.section}>
			<div className={styles.sectionLabel}>COMMUNITY</div>
			<div className={styles.sectionTitle}>Stargazers</div>
			<p className={styles.sectionSub}>
				{loading
					? "Loading stargazers…"
					: stargazers.length > 0
						? `${stargazers.length} people gave this project a star on GitHub — thank you!`
						: "Everyone who gave the project a star on GitHub — thank you!"}
			</p>
			<div className={styles.grid}>
				{loading && <p className={styles.empty}>Loading…</p>}

				{!loading && stargazers.length === 0 && (
					<p className={styles.empty}>No stars yet — be the first!</p>
				)}

				{!loading &&
					pageItems.map((user) => {
						return (
							<a
								key={user.login}
								href={user.html_url}
								target="_blank"
								rel="noopener noreferrer"
								className={styles.card}
							>
								<Image
									src={user.avatar_url}
									alt={user.login}
									width={44}
									height={44}
									className={styles.avatarImg}
									loading="lazy"
								/>
								<div className={styles.name}>{user.login}</div>
							</a>
						);
					})}
			</div>

			{!loading && totalPages > 1 && (
				<div className={styles.pagination}>
					<button
						className={styles.pageBtn}
						onClick={() => setPage((p) => Math.max(1, p - 1))}
						disabled={page === 1}
					>
						←
					</button>

					{Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
						<button
							key={p}
							className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`}
							onClick={() => setPage(p)}
						>
							{p}
						</button>
					))}

					<button
						className={styles.pageBtn}
						onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
						disabled={page === totalPages}
					>
						→
					</button>
				</div>
			)}
		</section>
	);
}
