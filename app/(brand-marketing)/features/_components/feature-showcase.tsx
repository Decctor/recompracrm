import { ChartBar, Coins, type LucideIcon, MessageCircle, Monitor } from "lucide-react";
import type { ReactNode } from "react";
import { CampaignRankingMock } from "./mocks/CampaignRankingMock";
import { BiDashboardMock, MatrixHealthMock, RfmMatrixMock, SegmentSuggestionsMock } from "./mocks/bi-mocks";
import { CampaignCategoriesMock, CampaignFunnelMock, RfmSegmentsPickerMock, TriggerGridMock } from "./mocks/campaign-mocks";
import { AccumulationSettingsMock, CashbackProgramMock, CashbackReportMock } from "./mocks/cashback-mocks";
import { KioskModeMock, PdiCashbackMock, PdiProfileMock, PdiSuccessMock, PrizesMock, SellersRankingMock } from "./mocks/pdi-mocks";
import { WhatsappPreviewMock } from "./mocks/whatsapp-mocks";

// O que cada página de funcionalidade mostra além do texto: o ícone da aba, a tela do herói e uma
// tela por capítulo (na ordem dos `feature-highlight` do conteúdo). O texto mora em
// `app/_content/feature-pages.ts`; aqui fica só o que é desenho.

export type TFeatureScreen = {
	/** Descrição da tela para leitores de tela. */
	label: string;
	node: ReactNode;
	/** A tela tem controles de verdade (não é só ilustração). */
	interactive?: boolean;
};

type TFeatureShowcase = {
	icon: LucideIcon;
	hero: TFeatureScreen;
	chapters: TFeatureScreen[];
};

const DASHBOARD_SCREEN: TFeatureScreen = {
	label: "Painel de resultados com faturamento, ticket médio, vendas, clientes que voltaram e faturamento por semana",
	node: <BiDashboardMock />,
};

const SHOWCASES: Record<string, TFeatureShowcase> = {
	"programa-de-cashback": {
		icon: Coins,
		hero: {
			label: "Tela do programa de cashback ativo, com cashback gerado, resgatado, taxa de resgate e cashback expirando",
			node: <CashbackProgramMock />,
		},
		chapters: [
			{
				label: "Configuração de acúmulo e validade do cashback e dos canais onde o cliente pode resgatar",
				node: <AccumulationSettingsMock />,
			},
			{ label: "Resgate de cashback no Ponto de Interação, com o desconto aplicado no resumo da venda", node: <PdiCashbackMock /> },
			{
				label: "Prévia da mensagem de WhatsApp que avisa o cliente sobre o cashback ganho e o novo saldo",
				node: <WhatsappPreviewMock variant="utility" />,
			},
			{ label: "Relatório do programa com vendas com cashback e a evolução do cashback gerado", node: <CashbackReportMock /> },
		],
	},
	"campanhas-whatsapp": {
		icon: MessageCircle,
		hero: {
			label: "Construtor de campanhas no passo de gatilho, com o gatilho de cashback expirando selecionado",
			node: <TriggerGridMock />,
		},
		chapters: [
			{ label: "Tipos de gatilho do construtor de campanhas: eventos, agendamentos, segmentações e pesquisas", node: <CampaignCategoriesMock /> },
			{ label: "Seleção das segmentações RFM que recebem a campanha", node: <RfmSegmentsPickerMock /> },
			{ label: "Funil de engajamento da campanha: enviadas, entregues, lidas e convertidas", node: <CampaignFunnelMock /> },
			{ label: "Prévia da mensagem de campanha com cashback bônus", node: <WhatsappPreviewMock variant="marketing" /> },
		],
	},
	"ponto-de-interacao": {
		icon: Monitor,
		hero: {
			label: "Ponto de Interação com o perfil da cliente encontrado pelo telefone e o saldo de cashback disponível",
			node: <PdiProfileMock />,
		},
		chapters: [
			{ label: "Tela de venda registrada no Ponto de Interação, com cashback gerado e novo saldo", node: <PdiSuccessMock /> },
			{ label: "Modo quiosque: escolha entre usar o saldo como desconto ou resgatar uma recompensa", node: <KioskModeMock /> },
			{ label: "Resultado por vendedor com vendas, faturamento e progresso na meta", node: <SellersRankingMock /> },
			{ label: "Escolha de recompensas no Ponto de Interação", node: <PrizesMock /> },
		],
	},
	"business-intelligence": {
		icon: ChartBar,
		hero: {
			label: "Matriz RFM com as 11 segmentações de clientes, a quantidade e o faturamento de cada uma",
			node: <RfmMatrixMock />,
		},
		chapters: [
			{ label: "Diagnóstico da saúde da matriz RFM com status e alertas", node: <MatrixHealthMock /> },
			{ label: "Sugestões de ação para os segmentos Campeões, Em risco e Perdidos", node: <SegmentSuggestionsMock /> },
			DASHBOARD_SCREEN,
			{ label: "Ranking das campanhas que mais geraram receita", node: <CampaignRankingMock />, interactive: true },
		],
	},
};

export function getFeatureShowcase(slug: string) {
	return SHOWCASES[slug] ?? null;
}

/** Tela do capítulo `index`; um capítulo além dos desenhados cai no painel de resultados. */
export function getChapterScreen(showcase: TFeatureShowcase, index: number) {
	return showcase.chapters[index] ?? DASHBOARD_SCREEN;
}
