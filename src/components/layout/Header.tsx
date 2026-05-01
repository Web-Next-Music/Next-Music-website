"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import styles from "./Header.module.css";
import { useRouter } from "next/navigation";

export default function Header({
	isHiddenMode = false,
}: {
	isHiddenMode?: boolean;
}) {
	const NAV_LINKS = [
		...(isHiddenMode
			? [
					{ href: "https://discord.gg/ky6bcdy7KA", label: "Discord" },
					{ href: "https://boosty.to/diramix", label: "Boosty" },
					{ href: "https://github.com/Diramix", label: "Github" },
				]
			: [
					{ href: "/", label: "Home" },
					{ href: "/store", label: "Store" },
					{ href: "/fckcensor-next", label: "FckCensor Next" },
					{ href: "/experiments", label: "Experiments" },
				]),
	];

	const [open, setOpen] = useState(false);
	const burgerRef = useRef<HTMLDivElement>(null);
	const router = useRouter();

	// Close dropdown when clicking outside
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (!burgerRef.current?.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	// Close dropdown on Escape
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open]);

	return (
		<>
			<header className={styles.header}>
				<div className={styles.headerWrap}>
					<div
						className={styles.logo}
						onClick={!isHiddenMode ? () => router.push("/") : undefined}
						style={{
							pointerEvents: isHiddenMode ? "none" : "auto",
						}}
					>
						<div className={styles.logo}>
							<div
								className={styles.logoImg}
								style={{
									backgroundImage: isHiddenMode
										? 'url("/icons/ugcShare.webp")'
										: 'url("/icons/icon-256.png")',
								}}
							/>
						</div>
						<div className={styles.logoText}>
							{isHiddenMode ? "UGC Share" : "Next Music"}
						</div>
					</div>

					<nav className={styles.nav}>
						{NAV_LINKS.map((l) => (
							<Link key={l.href} href={l.href}>
								{l.label}
							</Link>
						))}
					</nav>

					<div ref={burgerRef} className={styles.burger}>
						<button
							className={styles.burgerBtn}
							onClick={() => setOpen((v) => !v)}
							aria-label="Toggle navigation menu"
							aria-expanded={open}
						>
							<span
								className={`${styles.burgerIcon} ${open ? styles.burgerIconOpen : ""}`}
							>
								<span />
								<span />
								<span />
							</span>
						</button>

						{open && (
							<div className={styles.dropdown}>
								{NAV_LINKS.map((l) => (
									<Link
										key={l.href}
										href={l.href}
										className={styles.dropdownLink}
										onClick={() => setOpen(false)}
									>
										{l.label}
									</Link>
								))}
							</div>
						)}
					</div>
				</div>
			</header>
			<div id="mini-player-slot" />
		</>
	);
}
