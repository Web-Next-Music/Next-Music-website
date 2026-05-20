"use client";

import {
	createContext,
	useContext,
	useLayoutEffect,
	useState,
	useCallback,
	ReactNode,
} from "react";
import type { Theme, ThemeContextValue } from "@/types/theme";

export type { Theme, ThemeContextValue };

const ThemeContext = createContext<ThemeContextValue>({
	theme: "dark",
	toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useState<Theme>("dark");

	useLayoutEffect(() => {
		try {
			const saved = localStorage.getItem("nm-theme") as Theme | null;
			const preferred = window.matchMedia("(prefers-color-scheme: light)")
				.matches
				? "light"
				: "dark";
			const resolved: Theme = saved ?? preferred;
			document.documentElement.setAttribute("data-theme", resolved);
			setTheme(resolved);
		} catch {}
	}, []);

	const toggle = useCallback(() => {
		setTheme((prev) => {
			const next: Theme = prev === "dark" ? "light" : "dark";
			document.documentElement.setAttribute("data-theme", next);
			try {
				localStorage.setItem("nm-theme", next);
			} catch {}
			return next;
		});
	}, []);

	return (
		<ThemeContext.Provider value={{ theme, toggle }}>
			{children}
		</ThemeContext.Provider>
	);
}

export const useTheme = () => useContext(ThemeContext);
