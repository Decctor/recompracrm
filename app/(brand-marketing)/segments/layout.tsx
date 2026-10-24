import { Dock } from "@/app/_components/Dock";
import { MarketingFooter } from "@/app/_components/MarketingFooter";

// Hub e páginas de cada segmento usam a mesma variante do Dock: "Segmentos" aponta para a lista
// (`/segments#segmentos`) e o CTA "Agendar demonstração" para `#cta`. O rodapé vem logo depois
// do CTA escuro, por isso sem a linha de cima. A entrelinha `normal` reproduz o design, que mede
// os textos sem `line-height` explícito.
export default function SegmentsLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-white font-outfit leading-[normal] text-[#0e1214] antialiased text-numeric">
			<Dock variant="segments" />
			<main>{children}</main>
			<MarketingFooter bordered={false} />
		</div>
	);
}
