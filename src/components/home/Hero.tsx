"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import styles from "./Hero.module.css";
import AppPreview from "@/components/home/AppPreview";
import { findAsset, formatSize } from "@/lib/github";
import type { GithubAsset, GithubRelease } from "@/types/ui";

const REPO = "Web-Next-Music/Next-Music-Client";

function WindowsIcon() {
	return (
		<Image src="/icons/pkgs/windows.svg" width={18} height={18} alt="windows" />
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

function DebIcon() {
	return (
		<Image src="/icons/pkgs/debian.svg" width={18} height={18} alt="debian" />
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

function downloadViaIframe(url: string) {
	const iframe = document.createElement("iframe");
	iframe.style.display = "none";
	iframe.src = url;

	document.body.appendChild(iframe);

	// через время можно удалить (чтобы не копились)
	setTimeout(() => {
		iframe.remove();
	}, 10000);
}

export default function Hero() {
	const [release, setRelease] = useState<GithubRelease | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
			headers: { Accept: "application/vnd.github+json" },
		})
			.then((res) => res.json())
			.then((data: GithubRelease) => setRelease(data))
			.catch(() => setRelease(null))
			.finally(() => setLoading(false));
	}, []);

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
			icon: <AppImageIcon />,
			label: "Linux",
			name: ".AppImage",
			href: appImageAsset?.browser_download_url ?? release?.html_url ?? "#",
			size: appImageAsset ? formatSize(appImageAsset.size) : null,
			iconClass: "appimage",
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
					{loading ? (
						<span className={styles.skeletonBadge} />
					) : (
						<>
							{version} — {isPrerelease ? "pre-release" : "latest release"}
						</>
					)}
				</div>
				<h1 className={styles.title}>
					Next Music
					<br />
					<span>Client</span>
				</h1>
				<p className={styles.desc}>
					Web client for Yandex Music with support for themes, addons, Discord
					Rich Presence (RPC) and OBS widget
				</p>
				<div className={styles.dlGrid}>
					{buttons.map((btn, i) => {
						const isDisabled = loading || !btn.href || btn.href === "#";

						return (
							<a
								key={i}
								href={btn.href}
								onClick={(e) => {
									if (isDisabled) return;

									e.preventDefault();
									downloadViaIframe(btn.href);
								}}
								className={`${styles.dlBtn} ${loading ? styles.dlBtnLoading : ""}`}
							>
								<div className={`${styles.dlIcon} ${styles[btn.iconClass]}`}>
									{btn.icon}
								</div>

								<div className={styles.dlText}>
									<span className={styles.dlLabel}>{btn.label}</span>

									<span className={styles.dlName}>
										{btn.name}
										{btn.size && (
											<span className={styles.dlSize}>{btn.size}</span>
										)}
									</span>
								</div>
							</a>
						);
					})}
				</div>
			</div>
			<div className={styles.heroRight}>
				<AppPreview />
			</div>
		</section>
	);
}
