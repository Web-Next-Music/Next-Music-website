import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ExperimentsView from "./ExperimentsView";
import data from "@/data/experiments.json";

export const metadata = {
	title: "Experiments — Next Music",
	description: "Yandex Music A/B experiment flags extracted from the web app.",
};

export default function ExperimentsPage() {
	return (
		<>
			<Header />
			<ExperimentsView
				experiments={data.experiments}
				fetchedAt={data.fetchedAt}
			/>
			<Footer />
		</>
	);
}
