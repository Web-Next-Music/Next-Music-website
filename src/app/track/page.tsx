import type { Metadata } from "next";
import { Suspense } from "react";
import TrackPageClient from "@components/track/TrackPageClient";

export const metadata: Metadata = {
	title: "Next Music Player",
	description: "Custom web player for Yandex Music.",
	openGraph: {
		title: "Next Music Player",
		description: "Custom web player for Yandex Music",
		images: [
			"https://gitlab.com/uploads/-/system/project/avatar/81825008/ugcShare.png",
		],
		type: "website",
	},
};

export default function Page() {
	return (
		<Suspense fallback={<div />}>
			<TrackPageClient />
		</Suspense>
	);
}
