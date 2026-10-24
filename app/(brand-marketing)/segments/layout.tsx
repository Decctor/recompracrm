import BrandHeader from "@/app/_components/BrandHeader";
import FooterV2 from "@/app/_components/Footer";

export default function SegmentosLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="bg-white min-h-screen">
			<BrandHeader />
			{children}
			<FooterV2 />
		</div>
	);
}
