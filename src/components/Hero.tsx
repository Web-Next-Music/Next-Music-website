import AppPreview from "./AppPreview";
import Image from "next/image";
import { fetchLatestRelease, findAsset, formatSize } from "@/lib/github";
import styles from "./Hero.module.css";

function WindowsIcon() {
    return (
        <Image
            src="/icons/pkgs/windows.svg"
            width={18}
            height={18}
            alt="windows"
        />
    );
}

function DebIcon() {
    return (
        <Image
            src="/icons/pkgs/debian.svg"
            width={18}
            height={18}
            alt="debian"
        />
    );
}

function AppImageIcon() {
    return (
        <Image
            src="/icons/pkgs/appimage.svg"
            width={18}
            height={18}
            alt="AppImage"
        />
    );
}

function PkgIcon() {
    return (
        <Image
            src="/icons/pkgs/archlinux.svg"
            width={18}
            height={18}
            alt="pacman"
        />
    );
}

export default async function Hero() {
    const release = await fetchLatestRelease();
    const version = release?.tag_name ?? "unknown";
    const isPrerelease = release?.prerelease ?? false;
    const assets = release?.assets ?? [];

    const winAsset = findAsset(assets, ".exe");
    const debAsset = findAsset(assets, ".deb");
    const appImageAsset = findAsset(assets, ".AppImage");
    const pkgAsset = findAsset(assets, ".pkg.tar.zst");

    const buttons = [
        {
            icon: <WindowsIcon />,
            label: "Windows",
            name: ".exe",
            href: winAsset?.browser_download_url ?? release?.html_url ?? "#",
            size: winAsset ? formatSize(winAsset.size) : null,
            iconClass: "win",
        },
        {
            icon: <DebIcon />,
            label: "Debian",
            name: ".deb",
            href: debAsset?.browser_download_url ?? release?.html_url ?? "#",
            size: debAsset ? formatSize(debAsset.size) : null,
            iconClass: "deb",
        },
        {
            icon: <AppImageIcon />,
            label: "Linux",
            name: ".AppImage",
            href:
                appImageAsset?.browser_download_url ?? release?.html_url ?? "#",
            size: appImageAsset ? formatSize(appImageAsset.size) : null,
            iconClass: "appimage",
        },
        {
            icon: <PkgIcon />,
            label: "Arch Linux",
            name: ".pkg.tar.zst",
            href: pkgAsset?.browser_download_url ?? release?.html_url ?? "#",
            size: pkgAsset ? formatSize(pkgAsset.size) : null,
            iconClass: "pkg",
        },
    ];

    return (
        <section className={styles.hero}>
            <div className={styles.heroLeft}>
                <div className={styles.badge}>
                    {version} —{" "}
                    {isPrerelease ? "pre-release" : "latest release"}
                </div>
                <h1 className={styles.title}>
                    Next Music
                    <br />
                    <span>Client</span>
                </h1>
                <p className={styles.desc}>
                    Web client for Yandex Music with support for themes, addons,
                    Discord Rich Presence (RPC) and OBS widget
                </p>
                <div className={styles.dlGrid}>
                    {buttons.map((btn, i) => (
                        <a
                            key={i}
                            href={btn.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.dlBtn}
                        >
                            <div
                                className={`${styles.dlIcon} ${styles[btn.iconClass]}`}
                            >
                                {btn.icon}
                            </div>
                            <div className={styles.dlText}>
                                <span className={styles.dlLabel}>
                                    {btn.label}
                                </span>
                                <span className={styles.dlName}>
                                    {btn.name}
                                    {btn.size && (
                                        <span className={styles.dlSize}>
                                            {btn.size}
                                        </span>
                                    )}
                                </span>
                            </div>
                        </a>
                    ))}
                </div>
            </div>
            <div className={styles.heroRight}>
                <AppPreview />
            </div>
        </section>
    );
}
