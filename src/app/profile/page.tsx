import { Suspense } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProfileRouter from "@/components/profile/ProfileRouter";

export default function ProfilePage() {
	return (
		<>
			<Header />
			<Suspense>
				<ProfileRouter />
			</Suspense>
			<Footer />
		</>
	);
}
