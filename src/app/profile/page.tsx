import { Suspense } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProfileClient from "@/components/profile/ProfileClient";

export default function ProfilePage() {
	return (
		<>
			<Header />
			<Suspense>
				<ProfileClient />
			</Suspense>
			<Footer />
		</>
	);
}
