import BentoGrid from "./_components/BentoGrid";
import CampaignsSection from "./_components/CampaignsSection";
import FooterV2 from "./_components/Footer";
import Hero from "./_components/Hero";
import NavbarV2 from "./_components/Navbar";
import POSSection from "./_components/POSSection";
import Pricing from "./_components/Pricing";
import SocialProof from "./_components/SocialProof";

export default function LandingPage() {
	return (
		<div className="min-h-screen bg-white">
			<NavbarV2 />
			<Hero />
			{/* <SocialProof /> */}
			<BentoGrid />
			<POSSection />
			<CampaignsSection />
			<Pricing />
			<FooterV2 />
		</div>
	);
}
