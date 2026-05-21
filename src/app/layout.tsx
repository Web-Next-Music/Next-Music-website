import type { Metadata } from "next";
import { Suspense } from "react";
import { ThemeProvider } from "@/lib/theme";
import { PlayerProvider } from "@/lib/miniplayer";
import { AuthProvider } from "@/lib/auth";
import { LikesProvider } from "@/lib/likesContext";
import AuthModal from "@/components/auth/AuthModal";
import BanBanner from "@/components/layout/BanBanner";
import "./globals.scss";

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
		type: "website",
	},
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body suppressHydrationWarning>
				<AuthProvider>
					<LikesProvider>
						<ThemeProvider>
							<BanBanner />
				<Suspense fallback={<>{children}</>}>
								<PlayerProvider>{children}</PlayerProvider>
							</Suspense>
						</ThemeProvider>
						<AuthModal />
					</LikesProvider>
				</AuthProvider>
			</body>
		</html>
	);
}
