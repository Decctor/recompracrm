import { Dock } from "@/app/_components/Dock";
import type { Metadata } from "next";
import { ChannelShowcase } from "./_components/ChannelShowcase";
import { ErpContact } from "./_components/ErpContact";
import { ErpFooter } from "./_components/ErpFooter";
import { ErpHero } from "./_components/ErpHero";
import { ErpModules } from "./_components/ErpModules";
import { ErpSetup } from "./_components/ErpSetup";
import { SaleChain } from "./_components/SaleChain";

const title = "ERP com PDV, nota fiscal, estoque e financeiro integrados ao cashback";
const description =
	"O ERP do RecompraCRM reúne PDV, NFC-e e NF-e, compras, estoque, financeiro, mesas e comandas e loja digital. A venda nasce no sistema e o cashback é creditado e resgatado na própria frente de caixa.";

export const metadata: Metadata = {
	title,
	description,
	alternates: { canonical: "/erp" },
	openGraph: {
		title: `${title} | RecompraCRM`,
		description,
		url: "https://www.recompracrm.com.br/erp",
	},
	twitter: {
		card: "summary_large_image",
		title: `${title} | RecompraCRM`,
		description,
	},
};

export default function ErpPage() {
	return (
		<div className="min-h-screen bg-white font-outfit text-[#0e1214] leading-[normal] antialiased lining-nums tabular-nums">
			<Dock variant="erp" />
			<main>
				<ErpHero />
				<ChannelShowcase />
				<SaleChain />
				<ErpModules />
				<ErpSetup />
				<ErpContact />
			</main>
			<ErpFooter />
		</div>
	);
}
