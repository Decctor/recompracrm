import { Dock } from "@/app/_components/Dock";
import { MarketingFooter } from "@/app/_components/MarketingFooter";

// Índice e páginas dos cases usam o mesmo Dock; o rodapé vem logo depois do CTA escuro.
export default function CasesLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-white font-outfit leading-[normal] text-[#0e1214] antialiased lining-nums tabular-nums">
			<Dock variant="cases" />
			<main>{children}</main>
			<MarketingFooter bordered={false} />
		</div>
	);
}
