import Header from "@/components/Header";
import Hero from "@/components/Hero";
import StarsSection from "@/components/StarsSection";
import Footer from "@/components/Footer";

export default function Home() {
	return (
		<>
			<Header />
			<main>
				<div id="download">
					<Hero />
				</div>
			</main>
			<StarsSection />
			<Footer />
		</>
	);
}
