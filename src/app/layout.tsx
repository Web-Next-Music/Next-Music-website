import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme";
import { PlayerProvider } from "@/components/FckCensorTabs";
import "./globals.css";

export const metadata: Metadata = {
	title: "Next Music",
	description:
		"Web client for Yandex Music with support for themes, addons, Discord Rich Presence (RPC) and OBS widget.",
	openGraph: {
		title: "Next Music",
		description:
			"Web client for Yandex Music with support for themes, addons, Discord Rich Presence (RPC) and OBS widget",
		images: [
			"https://github.com/Web-Next-Music/Next-Music-Client/raw/main/doc/preview.png?raw=true",
		],
		url: "https://nextmusic.diram1x.ru",
		type: "website",
	},
};

const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('nm-theme');var t=s||(window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script
					suppressHydrationWarning
					dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
				/>
			</head>
			<body suppressHydrationWarning>
				<ThemeProvider>
					<PlayerProvider>{children}</PlayerProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
