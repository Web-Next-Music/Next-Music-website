"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import styles from "./experiments.module.css";

// Row height (item height + gap) must match the CSS values in experiments.module.css
const ROW_H = 36;
const ITEM_MIN_W = 280;
const GAP = 6;
const OVERSCAN = 4; // extra rows to render above/below the visible area

interface Props {
	experiments: string[];
	fetchedAt: string;
}

export default function ExperimentsView({ experiments, fetchedAt }: Props) {
	const [query, setQuery] = useState("");
	const [localDate, setLocalDate] = useState<string | null>(null);

	// Virtual scroll state
	const wrapRef = useRef<HTMLDivElement>(null);
	const [cols, setCols] = useState(3);
	const [scrollY, setScrollY] = useState(0);
	const [viewH, setViewH] = useState(800);
	const [listTop, setListTop] = useState(0);

	useEffect(() => {
		setLocalDate(
			new Date(fetchedAt).toLocaleString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
			}),
		);
	}, [fetchedAt]);

	// Measure container width (for column count) and list's position in the document
	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const measure = () => {
			setCols(
				Math.max(1, Math.floor((el.clientWidth + GAP) / (ITEM_MIN_W + GAP))),
			);
			setListTop(el.getBoundingClientRect().top + window.scrollY);
			setViewH(window.innerHeight);
		};
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		measure();
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		const onScroll = () => setScrollY(window.scrollY);
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return q
			? experiments.filter((e) => e.toLowerCase().includes(q))
			: experiments;
	}, [experiments, query]);

	// Compute which rows are visible
	const rows = Math.ceil(filtered.length / cols);
	const relY = Math.max(0, scrollY - listTop);
	const startRow = Math.max(0, Math.floor(relY / ROW_H) - OVERSCAN);
	const endRow = Math.min(rows, Math.ceil((relY + viewH) / ROW_H) + OVERSCAN);
	const visibleItems = filtered.slice(startRow * cols, endRow * cols);
	const spacerTop = startRow * ROW_H;
	const spacerBottom = Math.max(0, (rows - endRow) * ROW_H);

	return (
		<>
			<div className={styles.hero}>
				<div className={styles.heroInner}>
					<div className={styles.heroTitle}>
						<h1>Experiments</h1>
						<span className={styles.countBadge}>{experiments.length}</span>
					</div>
					<p className={styles.heroSub}>
						Yandex Music A/B experiment flags extracted from the web app state
						and JS bundle enums
					</p>
					<div className={styles.fetchInfo}>
						<span className={styles.fetchLabel}>Last fetched</span>
						<span className={styles.fetchTime}>{localDate ?? fetchedAt}</span>
					</div>
				</div>
			</div>

			<div className={styles.toolbar}>
				<div className={styles.toolbarInner}>
					<div className={styles.searchWrap}>
						<svg
							className={styles.searchIcon}
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
						>
							<circle
								cx="11"
								cy="11"
								r="8"
								stroke="currentColor"
								strokeWidth="2"
							/>
							<path
								d="m21 21-4.35-4.35"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
							/>
						</svg>
						<input
							className={styles.searchInput}
							type="text"
							placeholder="Search experiments…"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							spellCheck={false}
						/>
					</div>
					{query && (
						<span className={styles.resultCount}>
							{filtered.length} / {experiments.length}
						</span>
					)}
				</div>
			</div>

			<main className={styles.main}>
				{filtered.length === 0 ? (
					<p className={styles.empty}>
						No experiments match &quot;{query}&quot;
					</p>
				) : (
					<div ref={wrapRef}>
						<div style={{ height: spacerTop }} />
						<ul className={styles.list}>
							{visibleItems.map((name) => (
								<li key={name} className={styles.item}>
									<code className={styles.flag}>{name}</code>
								</li>
							))}
						</ul>
						<div style={{ height: spacerBottom }} />
					</div>
				)}
			</main>
		</>
	);
}
