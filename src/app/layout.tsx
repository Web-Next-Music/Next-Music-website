import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme";
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

// Inlined as a plain string — NOT a React component, so no "script tag" warning.
// This runs synchronously before first paint, preventing theme flash (FOUC).
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('nm-theme');var t=s||(window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            {/*
        dangerouslySetInnerHTML on <head> children works correctly in Next.js App Router —
        the script is serialized as raw HTML by the server, not processed by React client runtime.
        suppressHydrationWarning on <html> suppresses the hydration mismatch from data-theme.
      */}
            <head>
                <script
                    suppressHydrationWarning
                    dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
                />
            </head>
            <body suppressHydrationWarning>
                <ThemeProvider>{children}</ThemeProvider>
            </body>
        </html>
    );
}
