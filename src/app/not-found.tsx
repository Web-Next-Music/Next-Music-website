import Link from "next/link";
import Header from "@/components/Header";
import styles from "./not-found.module.css";

export default function NotFound() {
    return (
        <>
            <Header />
            <main className={styles.main}>
                {/* Decorative waveform */}
                <div className={styles.wave} aria-hidden>
                    {Array.from({ length: 32 }).map((_, i) => (
                        <div
                            key={i}
                            className={styles.bar}
                            style={
                                {
                                    "--h": `${20 + Math.abs(Math.sin(i * 0.7) * 60)}%`,
                                    "--delay": `${i * 0.05}s`,
                                } as React.CSSProperties
                            }
                        />
                    ))}
                </div>

                <div className={styles.content}>
                    <div className={styles.code}>404</div>
                    <h1 className={styles.title}>Page not found</h1>
                    <p className={styles.desc}>
                        It looks like this page has been deleted or never
                        existed
                    </p>

                    <div className={styles.actions}>
                        <Link href="/" className={styles.btnPrimary}>
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                            >
                                <path
                                    d="M19 12H5M5 12l7-7M5 12l7 7"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            To the homepage
                        </Link>
                        <Link
                            href="/fckcensor-next"
                            className={styles.btnSecondary}
                        >
                            FckCensor Next
                        </Link>
                    </div>
                </div>
            </main>
        </>
    );
}
