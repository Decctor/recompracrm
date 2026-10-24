import { Dock } from "@/app/_components/Dock";
import { MarketingFooter } from "@/app/_components/MarketingFooter";

// Hub e páginas de cada integração usam a mesma variante do Dock: "Conectores" aponta para
// `#conectores` (a grade no hub, "Outras integrações" no detalhe) e o CTA vira "Agendar
// demonstração" sobre `#cta`.
export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-white text-[#0e1214] text-numeric">
			<Dock variant="integrations" />
			{children}
			<MarketingFooter />
		</div>
	);
}
