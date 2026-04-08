"use client";

import { useTheme } from "@/lib/theme";
import styles from "./Footer.module.css";
import Link from "next/link";

const links = {
    product: [
        { label: "Download", href: "#download", external: false },
        {
            label: "Changelog",
            href: "https://github.com/Web-Next-Music/Next-Music-Client/releases/latest",
            external: true,
        },
    ],
    resources: [
        {
            label: "Wiki",
            href: "https://github.com/Web-Next-Music/Next-Music-Client/wiki",
            external: true,
        },
    ],
    links: [
        {
            label: "GitHub",
            href: "https://github.com/Web-Next-Music/Next-Music-Client",
            external: true,
        },
        {
            label: "Discord",
            href: "https://discord.gg/ky6bcdy7KA",
            external: true,
        },
        { label: "Boosty", href: "https://boosty.to/diramix", external: true },
    ],
};

function SunIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle
                cx="12"
                cy="12"
                r="4"
                stroke="currentColor"
                strokeWidth="1.8"
            />
            <path
                d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path
                d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export default function Footer() {
    const { theme, toggle } = useTheme();
    const isDark = theme === "dark";

    return (
        <>
            <footer className={styles.footer}>
                <div className={styles.col}>
                    <div className={styles.brand}>Next Music</div>
                    <p className={styles.copy}>Web client for Yandex Music</p>
                </div>
                <div className={styles.col}>
                    <h4>PRODUCT</h4>
                    {links.product.map((l) => (
                        <Link key={l.label} href={l.href}>
                            {l.label}
                        </Link>
                    ))}
                </div>
                <div className={styles.col}>
                    <h4>RESOURCES</h4>
                    {links.resources.map((l) => (
                        <Link key={l.label} href={l.href}>
                            {l.label}
                        </Link>
                    ))}
                </div>
                <div className={styles.col}>
                    <h4>LINKS</h4>
                    {links.links.map((l) => (
                        <Link key={l.label} href={l.href}>
                            {l.label}
                        </Link>
                    ))}
                </div>
            </footer>

            <div className={styles.bottom}>
                <p>© 2026 Next Music. MIT License</p>

                {/* Theme toggle */}
                <button
                    className={styles.themeToggle}
                    onClick={toggle}
                    aria-label={
                        isDark
                            ? "Switch to light theme"
                            : "Switch to dark theme"
                    }
                    title={
                        isDark
                            ? "Switch to light theme"
                            : "Switch to dark theme"
                    }
                >
                    <span
                        className={`${styles.toggleTrack} ${isDark ? styles.dark : styles.light}`}
                    >
                        <span className={styles.toggleThumb}>
                            {isDark ? <MoonIcon /> : <SunIcon />}
                        </span>
                    </span>
                    <span className={styles.toggleLabel}>
                        {isDark ? "Dark" : "Light"}
                    </span>
                </button>

                <p>Made with ♥ for Lucky Star lovers</p>
            </div>
        </>
    );
}
