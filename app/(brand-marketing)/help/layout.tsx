import { Dock } from "@/app/_components/Dock";
import { MarketingFooter } from "@/app/_components/MarketingFooter";

// Central e tutoriais usam a variante `help` do Dock, cujo CTA é o suporte no WhatsApp.
export default function HelpLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-white text-[#0e1214] text-numeric">
			<Dock variant="help" />
			{children}
			<MarketingFooter />
		</div>
	);
}
