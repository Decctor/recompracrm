import BlingLogo from "@/utils/images/integrations/bling-logo.png";
import CardapioWebLogo from "@/utils/images/integrations/cardapio-web.png";
import IfoodLogo from "@/utils/images/integrations/ifood-logo.png";
import NuvemshopLogo from "@/utils/images/integrations/nuvemshop-logo.png";
import OnlineSoftwareLogo from "@/utils/images/integrations/online-software-logo.png";
import type { StaticImageData } from "next/image";

export type TLandingIntegration = {
	/** Slug da página em /integrations/{slug} (ver app/_content/integration-pages.ts) */
	slug: string;
	name: string;
	category: string;
	pitch: string;
	logo: StaticImageData;
	/** Largura máxima do logo na faixa "Importa vendas de" do hero */
	stripMaxWidth: string;
};

export const LANDING_INTEGRATIONS: TLandingIntegration[] = [
	{
		slug: "bling",
		name: "Bling",
		category: "ERP",
		pitch: "Vendas, clientes e produtos do seu ERP Bling, no automático.",
		logo: BlingLogo,
		stripMaxWidth: "max-w-[90px]",
	},
	{
		slug: "online-software",
		name: "Online Software",
		category: "ERP",
		pitch: "Vendas de balcão do seu ERP, com vendedores e dados fiscais.",
		logo: OnlineSoftwareLogo,
		stripMaxWidth: "max-w-[110px]",
	},
	{
		slug: "cardapio-web",
		name: "Cardápio Web",
		category: "Delivery e PDV",
		pitch: "Pedidos de delivery, retirada e salão viram base de clientes.",
		logo: CardapioWebLogo,
		stripMaxWidth: "max-w-[110px]",
	},
	{
		slug: "nuvem-shop",
		name: "Nuvem Shop",
		category: "E-commerce",
		pitch: "Pedidos da sua loja online, com clientes e variantes de produto.",
		logo: NuvemshopLogo,
		stripMaxWidth: "max-w-[110px]",
	},
	{
		slug: "ifood",
		name: "iFood",
		category: "Marketplace",
		pitch: "Clientes do iFood na sua base, prontos para reativar no WhatsApp.",
		logo: IfoodLogo,
		stripMaxWidth: "max-w-[80px]",
	},
];

/** Ordem da faixa "Importa vendas de" no hero. */
export const HERO_STRIP_ORDER = ["online-software", "bling", "cardapio-web", "nuvem-shop", "ifood"];
