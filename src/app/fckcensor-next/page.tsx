import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FckCensorTabs from "@/components/FckCensorTabs";
import Image from "next/image";
import { fetchOfficialTracks, fetchLegacyTracks } from "@/lib/fckcensor";
import styles from "./page.module.css";

export const metadata = {
    title: "FckCensor Next — Track List",
    description: "Список треков с обходом цензуры Яндекс Музыки",
};

const GitHubIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
            d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"
            fill="currentColor"
        />
    </svg>
);

export default async function FckCensorPage() {
    const [official, legacy] = await Promise.all([
        fetchOfficialTracks(),
        fetchLegacyTracks(),
    ]);

    return (
        <>
            <Header />
            <main className={styles.main}>
                <div className={styles.addonHero}>
                    <Image
                        className={styles.addonIcon}
                        src="https://github.com/Web-Next-Music/FckCensor-Next/blob/main/FckCensor%20Next/icon.webp?raw=true"
                        width={48}
                        height={48}
                        alt="addon icon"
                    />
                    <div className={styles.addonInfo}>
                        <h1 className={styles.addonTitle}>FckCensor Next</h1>
                        <p className={styles.addonDesc}>
                            This add-on allows bypassing censorship by replacing
                            the MP3 file of the currently playing track.
                        </p>
                    </div>
                    <a
                        href="https://github.com/Web-Next-Music/FckCensor-Next/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.addonBtn}
                    >
                        <GitHubIcon />
                        GitHub
                    </a>
                </div>

                {/* ── Credits block ── */}
                <div className={styles.creditsBlock}>
                    <Image
                        src="https://avatars.githubusercontent.com/Hazzz895"
                        alt="Hazzz895"
                        width={48}
                        height={48}
                        className={styles.creditsAvatar}
                    />

                    <div className={styles.creditsInfo}>
                        <div className={styles.creditsName}>Special thanks</div>
                        <p className={styles.creditsDesc}>
                            Special thanks to the original author&nbsp;
                            <a
                                href="https://github.com/Hazzz895/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.creditsLink}
                            >
                                @Hazzz895
                            </a>{" "}
                            of the "FckCensor" script
                        </p>
                    </div>
                </div>

                {/* ── Tabs ── */}
                <FckCensorTabs official={official} legacy={legacy} />
            </main>
            <Footer />
        </>
    );
}
