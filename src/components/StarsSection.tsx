import { fetchStargazers } from "@/lib/github";
import styles from "./StarsSection.module.css";
import Image from "next/image";

const COLORS: [string, string][] = [
    ["rgba(255,60,111,0.15)", "#ff8fab"],
    ["rgba(0,120,215,0.15)", "#7ab8f5"],
    ["rgba(255,170,0,0.12)", "#ffcc60"],
    ["rgba(40,200,120,0.12)", "#6fdba8"],
    ["rgba(160,90,220,0.15)", "#c49cef"],
    ["rgba(255,107,53,0.12)", "#ffaa7a"],
];

export default async function StarsSection() {
    const stargazers = await fetchStargazers();

    return (
        <section className={styles.section}>
            <div className={styles.sectionLabel}>COMMUNITY</div>
            <div className={styles.sectionTitle}>Stargazers</div>
            <p className={styles.sectionSub}>
                {stargazers.length > 0
                    ? `${stargazers.length} people gave this project a star on GitHub — thank you!`
                    : "Everyone who gave the project a star on GitHub — thank you!"}
            </p>
            <div className={styles.grid}>
                {stargazers.map((user, i) => {
                    const [bg, fg] = COLORS[i % COLORS.length];
                    const initials = user.login.slice(0, 2).toUpperCase();
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

                {stargazers.length === 0 && (
                    <p className={styles.empty}>No stars yet — be the first!</p>
                )}
            </div>
        </section>
    );
}
