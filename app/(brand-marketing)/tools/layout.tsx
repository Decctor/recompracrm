import { Dock } from "@/app/_components/Dock";
import { MarketingFooter } from "@/app/_components/MarketingFooter";

// As ferramentas gratuitas dividem o Dock e terminam no CTA escuro, logo antes do rodapé.
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-white font-outfit leading-[normal] text-[#0e1214] antialiased lining-nums tabular-nums">
			<Dock variant="tools" />
			<main>{children}</main>
			<MarketingFooter bordered={false} />
		</div>
	);
}
