export type Theme = "dark" | "light";

export interface ThemeContextValue {
	theme: Theme;
	toggle: () => void;
}
