"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";

export default function BanBanner() {
	const { isBanned } = useAuth();
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (el) {
			document.documentElement.style.setProperty(
				"--ban-banner-h",
				`${el.offsetHeight}px`,
			);
		}
		return () => {
			document.documentElement.style.removeProperty("--ban-banner-h");
		};
	}, [isBanned]);

	if (!isBanned) return null;

	return (
		<>
			<div
				ref={ref}
				style={{
					background: "#c0392b",
					color: "#fff",
					textAlign: "center",
					padding: "8px 16px",
					fontSize: "13px",
					fontWeight: 500,
					lineHeight: 1.4,
					position: "fixed",
					top: 0,
					left: 0,
					right: 0,
					zIndex: 101,
				}}
			>
				Your account has been banned
			</div>
			<div style={{ height: "var(--ban-banner-h, 0px)" }} />
		</>
	);
}
