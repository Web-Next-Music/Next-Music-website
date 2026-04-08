"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    ReactNode,
} from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
    theme: Theme;
    toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: "dark",
    toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>("dark");

    // Read actual value from <html data-theme> set by the blocking script
    useEffect(() => {
        const current = document.documentElement.getAttribute(
            "data-theme",
        ) as Theme | null;
        if (current) setTheme(current);
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
