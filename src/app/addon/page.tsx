import Header from "@/components/Header";
import AddonDetail from "@/components/AddonDetail";
import Footer from "@/components/Footer";
import { Suspense } from "react";

export default function AddonPage() {
	return (
		<>
			<Header />
			<Suspense
				fallback={
					<div style={{ textAlign: "center", padding: "4rem" }}>
						Loading addon…
					</div>
				}
			>
				<AddonDetail />
			</Suspense>
			<Footer />
		</>
	);
}
