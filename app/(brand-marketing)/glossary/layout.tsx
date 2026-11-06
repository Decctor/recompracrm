import { Dock } from "@/app/_components/Dock";
import { MarketingFooter } from "@/app/_components/MarketingFooter";

// Índice e verbetes do glossário dividem o Dock `glossary`, cujo CTA é o teste grátis.
export default function GlossaryLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-white font-outfit text-[#0e1214] leading-[normal] antialiased lining-nums tabular-nums">
			<Dock variant="glossary" />
			{children}
			<MarketingFooter bordered={false} />
		</div>
	);
}
