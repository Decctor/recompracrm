import FAQ from "./_components/FAQ";
import Features from "./_components/Features";
import Footer from "./_components/Footer";
import HeroSection from "./_components/Hero";
import Navbar from "./_components/Navbar";
import Pricing from "./_components/Pricing";

export default function LandingPage() {
	return (
		<div className="min-h-screen bg-white">
			<Navbar />
			<HeroSection />
			<Features />
			<FAQ />
			<Pricing />
			<Footer />
		</div>
	);
}
