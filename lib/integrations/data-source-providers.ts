import type { TDataSourceIntegrationTipoEnum } from "@/schemas/enums";
import CardapioWebLogo from "@/utils/images/integrations/cardapio-web.png";
import NuvemshopLogo from "@/utils/images/integrations/nuvemshop-logo.png";
import OnlineSoftwareLogo from "@/utils/images/integrations/online-software-logo.png";
import IfoodLogo from "@/utils/images/integrations/ifood-logo.png";
import BlingLogo from "@/utils/images/integrations/bling-logo.png";
import ErpFlexLogo from "@/utils/images/integrations/erpflex.png";
import type { StaticImageData } from "next/image";

export type TDataSourceIntegrationProvider = {
	id: TDataSourceIntegrationTipoEnum;
	nome: string;
	descricao: string;
	logo?: StaticImageData;
	buttonText: string;
	brandColor: string;
	brandClassName: string;
	authUrl?: string;
	/** Subpágina do hub quando já conectado (ex.: iFood). */
	hubHref?: string;
};

export const DATA_SOURCE_INTEGRATION_PROVIDERS: TDataSourceIntegrationProvider[] = [
	{
		id: "ONLINE-SOFTWARE",
		nome: "Online Software",
		logo: OnlineSoftwareLogo,
		descricao:
			"Líder regional no Triângulo Mineiro, este ERP é a escolha certa para materiais de construção, conveniência e vestuário. Sincronize vendas, produtos, clientes e parcerios com total eficiência.",
		buttonText: "CONECTAR COM ONLINE SOFTWARE",
		brandColor: "#145c99",
		brandClassName: "bg-[#145c99] text-white hover:bg-[#145c99]/80",
	},
	{
		id: "CARDAPIO-WEB",
		nome: "Cardápio Web",
		logo: CardapioWebLogo,
		descricao:
			"A solução completa para Food Service. Perfeito para restaurantes, sorveterias e delivery. Integre sua gestão de pedidos e cardápios para escalar sua operação gastronômica (com suporte a iFood).",
		buttonText: "CONECTAR COM CARDÁPIO WEB",
		brandColor: "#a543fb",
		brandClassName: "bg-[#a543fb] text-white hover:bg-[#a543fb]/80",
	},
	{
		id: "NUVEM-SHOP",
		nome: "Nuvem Shop",
		logo: NuvemshopLogo,
		descricao:
			"Conecte sua loja Nuvem Shop para sincronizar pedidos, clientes e produtos com o Recompra CRM através da autorização segura da plataforma.",
		buttonText: "CONECTAR COM NUVEM SHOP",
		brandColor: "#2d2e6f",
		brandClassName: "bg-[#2d2e6f] text-white hover:bg-[#2d2e6f]/80",
		authUrl: "/api/integrations/nuvemshop/auth",
	},
	{
		id: "IFOOD",
		nome: "iFood",
		logo: IfoodLogo,
		descricao:
			"Conecte sua loja iFood para receber eventos e pedidos no Recompra CRM, alimentando vendas, clientes, campanhas e cashback automaticamente.",
		buttonText: "CONECTAR COM IFOOD",
		brandColor: "#EA1D2C",
		brandClassName: "bg-[#EA1D2C] text-white hover:bg-[#EA1D2C]/80",
		hubHref: "/dashboard/integrations/ifood",
	},
	{
		id: "BLING",
		nome: "Bling",
		logo: BlingLogo,
		descricao: "Conecte sua conta Bling para sincronizar pedidos de venda, clientes e produtos com o Recompra CRM em modo somente leitura.",
		buttonText: "CONECTAR COM BLING",
		brandColor: "#34AD61",
		brandClassName: "bg-[#34AD61] text-white hover:bg-[#34AD61]/80",
		authUrl: "/api/integrations/bling/auth",
	},
	{
		id: "ERP-FLEX",
		nome: "ERPFlex",
		logo: ErpFlexLogo,
		descricao: "Conecte sua conta ERPFlex para importar faturamentos, clientes e produtos com as credenciais de API fornecidas pelo time do ERPFlex.",
		buttonText: "CONECTAR COM ERPFLEX",
		brandColor: "#1B5FAA",
		brandClassName: "bg-[#1B5FAA] text-white hover:bg-[#1B5FAA]/80",
	},
];
