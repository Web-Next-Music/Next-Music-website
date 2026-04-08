"use client";

import { useEffect, useState } from "react";
import styles from "./StarsSection.module.css";
import Image from "next/image";

const REPO = "Web-Next-Music/Next-Music-Client";

const COLORS: [string, string][] = [
    ["rgba(255,60,111,0.15)", "#ff8fab"],
    ["rgba(0,120,215,0.15)", "#7ab8f5"],
    ["rgba(255,170,0,0.12)", "#ffcc60"],
    ["rgba(40,200,120,0.12)", "#6fdba8"],
    ["rgba(160,90,220,0.15)", "#c49cef"],
    ["rgba(255,107,53,0.12)", "#ffaa7a"],
];

interface Stargazer {
    login: string;
    avatar_url: string;
    html_url: string;
}

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

export default function StarsSection() {
    const [stargazers, setStargazers] = useState<Stargazer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAllStargazers()
            .then(setStargazers)
            .catch(() => setStargazers([]))
            .finally(() => setLoading(false));
    }, []);

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
                    stargazers.map((user, i) => {
                        const [bg, fg] = COLORS[i % COLORS.length];
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
        </section>
    );
}
