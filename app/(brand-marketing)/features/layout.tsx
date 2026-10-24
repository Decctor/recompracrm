import { MarketingFooter } from "@/app/_components/MarketingFooter";

// O cabeçalho é o Dock (variante `product`), montado na página; aqui fica o rodapé comum. A
// entrelinha `normal` reproduz o design, que mede os textos sem `line-height` explícito.
export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-white leading-[normal] text-[#0e1214] antialiased text-numeric">
			{children}
			<MarketingFooter />
		</div>
	);
}
