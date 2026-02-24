import Hero from "./_components/Hero";
import SocialProof from "./_components/SocialProof";
import BentoGrid from "./_components/BentoGrid";
import POSSection from "./_components/POSSection";
import CampaignsSection from "./_components/CampaignsSection";
import Pricing from "./_components/Pricing";
import FooterV2 from "./_components/Footer";
import NavbarV2 from "./_components/Navbar";

export default function LandingPageV2() {
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
