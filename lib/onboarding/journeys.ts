import type { TOnboardingProductEnum } from "@/schemas/enums";
import type { TOrganizationOnboardingEntity } from "@/services/drizzle/schema";
import type { TOnboardingReadiness } from "./readiness";

/**
 * Vocabulário de etapas por produto. Importado pelo servidor (retomada), pela API (validação
 * de `etapaAtual`) e pelo cliente (trilho), para que os três nunca divirjam.
 *
 * A etapa é referência de navegação. Se ela está concluída é decidido por `isComplete`, que só
 * olha a prontidão derivada das tabelas reais, nunca o que o usuário clicou.
 */
export const CRM_STAGE_IDS = ["empresa", "fonte-dados", "cashback", "campanhas", "whatsapp", "entrada"] as const;
export type TCrmStageId = (typeof CRM_STAGE_IDS)[number];

export const ERP_STAGE_IDS = ["empresa", "canal", "produtos", "experiencia", "incentivo", "simulacao", "lancamento"] as const;
export type TErpStageId = (typeof ERP_STAGE_IDS)[number];

export type TOnboardingStageId = TCrmStageId | TErpStageId;

export type TOnboardingStageDefinition = {
	id: TOnboardingStageId;
	/** Rótulo curto do trilho. */
	rotulo: string;
	/** Segunda palavra do eyebrow ("Etapa 2 de 6 · Vendas"). */
	eyebrow: string;
	titulo: string;
	descricao: string;
	/** Rótulo da ação secundária ("Fazer depois", "Conectar depois"). Null = não adiável. */
	adiarRotulo: string | null;
	isComplete: (readiness: TOnboardingReadiness, journey: TOrganizationOnboardingEntity | null) => boolean;
};

export type TOnboardingJourneyDefinition = {
	produto: TOnboardingProductEnum;
	rotulo: string;
	etapas: TOnboardingStageDefinition[];
	/** Etapa terminal: concluí-la é entrar no espaço de trabalho. */
	etapaFinal: TOnboardingStageId;
};

const CRM_JOURNEY: TOnboardingJourneyDefinition = {
	produto: "CRM",
	rotulo: "Jornada CRM",
	etapaFinal: "entrada",
	etapas: [
		{
			id: "empresa",
			rotulo: "Empresa",
			eyebrow: "Empresa",
			titulo: "Sobre a empresa",
			descricao: "Nome, CNPJ e segmento. Usamos o segmento para sugerir cashback e campanhas.",
			adiarRotulo: null,
			isComplete: (readiness) => !!readiness.organizacao.atuacaoNicho,
		},
		{
			id: "fonte-dados",
			rotulo: "Vendas",
			eyebrow: "Vendas",
			titulo: "De onde vêm suas vendas",
			descricao: "Conecte o sistema que você já usa ou registre as vendas no balcão. A importação continua em segundo plano.",
			adiarRotulo: "Fazer depois",
			isComplete: (readiness) => readiness.fonteDados.definida,
		},
		{
			id: "cashback",
			rotulo: "Cashback",
			eyebrow: "Cashback",
			titulo: "Incentivo para a próxima compra",
			descricao: "Revise a sugestão para o seu segmento. Você pode ativar agora ou deixar configurado para depois.",
			adiarRotulo: "Fazer depois",
			isComplete: (readiness) => readiness.cashback.estado !== "NAO_CONFIGURADO",
		},
		{
			id: "campanhas",
			rotulo: "Campanhas",
			eyebrow: "Campanhas",
			titulo: "Campanhas para começar",
			descricao: "Sugestões para o seu segmento e programa. Elas ficam preparadas e só enviam quando você liberar.",
			adiarRotulo: "Nenhuma por enquanto",
			isComplete: (readiness, journey) => readiness.campanhas.length > 0 || journey?.respostas.campanhasNenhumaPorEnquanto === true,
		},
		{
			id: "whatsapp",
			rotulo: "WhatsApp",
			eyebrow: "WhatsApp",
			titulo: "Canal de envio",
			descricao: "Conecte pelo caminho oficial da Meta. Você pode preparar tudo agora e conectar depois.",
			adiarRotulo: "Conectar depois",
			isComplete: (readiness) => readiness.whatsapp.numero === "CONECTADO",
		},
		{
			id: "entrada",
			rotulo: "Entrada",
			eyebrow: "Entrada",
			titulo: "Seu programa está preparado",
			descricao: "Veja o que já funciona e qual é a próxima ação.",
			adiarRotulo: null,
			isComplete: (_readiness, journey) => !!journey?.dataConclusao,
		},
	],
};

// A jornada ERP fica definida para que trilho, validação e retomada já a reconheçam. As telas
// chegam na fase 5 (docs/onboarding/onboarding-crm-erp-technical-and-visual-design.md §11).
const ERP_JOURNEY: TOnboardingJourneyDefinition = {
	produto: "ERP",
	rotulo: "Jornada ERP",
	etapaFinal: "lancamento",
	etapas: [
		{
			id: "empresa",
			rotulo: "Empresa",
			eyebrow: "Empresa",
			titulo: "Sobre a empresa",
			descricao: "Nome, CNPJ e segmento.",
			adiarRotulo: null,
			isComplete: (readiness) => !!readiness.organizacao.atuacaoNicho,
		},
		{
			id: "canal",
			rotulo: "Canal",
			eyebrow: "Canal",
			titulo: "Como você quer vender",
			descricao: "Balcão, catálogo digital ou mesas e comandas. Escolha um para preparar primeiro.",
			adiarRotulo: null,
			isComplete: (_readiness, journey) => !!journey?.respostas.erpCanalInicial,
		},
		{
			id: "produtos",
			rotulo: "Produtos",
			eyebrow: "Produtos",
			titulo: "Seus primeiros produtos",
			descricao: "Um conjunto pequeno já permite experimentar a compra. O catálogo pode crescer depois.",
			adiarRotulo: null,
			isComplete: (readiness) => readiness.erp.produtosUtilizaveis > 0,
		},
		{
			id: "experiencia",
			rotulo: "Loja",
			eyebrow: "Loja",
			titulo: "A cara da sua loja",
			descricao: "Apresentação, categorias e opções de compra do canal escolhido.",
			adiarRotulo: "Fazer depois",
			isComplete: (readiness) => readiness.erp.lojaDigital.existe || readiness.erp.pontosAtendimento > 0,
		},
		{
			id: "incentivo",
			rotulo: "Incentivo",
			eyebrow: "Incentivo",
			titulo: "Incentivo na compra",
			descricao: "Cashback ou cupom dentro da experiência de compra.",
			adiarRotulo: "Fazer depois",
			isComplete: (readiness) => readiness.cashback.estado !== "NAO_CONFIGURADO",
		},
		{
			id: "simulacao",
			rotulo: "Simulação",
			eyebrow: "Simulação",
			titulo: "Experimente uma compra",
			descricao: "Percorra o lado do cliente e veja o pedido chegar na operação. Nada é cobrado nem movimentado.",
			adiarRotulo: "Fazer depois",
			isComplete: (readiness) => readiness.erp.simulacaoConcluida,
		},
		{
			id: "lancamento",
			rotulo: "Lançamento",
			eyebrow: "Lançamento",
			titulo: "Comece a vender",
			descricao: "Resolva as pendências do canal e disponibilize-o.",
			adiarRotulo: null,
			isComplete: (_readiness, journey) => !!journey?.dataConclusao,
		},
	],
};

const JOURNEYS: Record<TOnboardingProductEnum, TOnboardingJourneyDefinition> = { CRM: CRM_JOURNEY, ERP: ERP_JOURNEY };

export function getJourneyDefinition(produto: TOnboardingProductEnum): TOnboardingJourneyDefinition {
	return JOURNEYS[produto];
}

export function getStageDefinition(produto: TOnboardingProductEnum, stageId: string): TOnboardingStageDefinition | null {
	return JOURNEYS[produto].etapas.find((stage) => stage.id === stageId) ?? null;
}

export function isOnboardingStageId(produto: TOnboardingProductEnum, value: unknown): value is TOnboardingStageId {
	return typeof value === "string" && JOURNEYS[produto].etapas.some((stage) => stage.id === value);
}

export function getStageIndex(produto: TOnboardingProductEnum, stageId: string): number {
	return JOURNEYS[produto].etapas.findIndex((stage) => stage.id === stageId);
}

/**
 * Etapa em que retomar: a primeira não concluída e não adiada, nunca antes da segunda etapa
 * quando a organização já existe (a etapa "empresa" vira edição, não recriação). Se tudo está
 * concluído ou adiado, a etapa final.
 */
export function resolveResumeStage({
	produto,
	journey,
	readiness,
}: {
	produto: TOnboardingProductEnum;
	journey: TOrganizationOnboardingEntity | null;
	readiness: TOnboardingReadiness;
}): TOnboardingStageId {
	const definition = JOURNEYS[produto];
	const deferred = new Set(journey?.etapasAdiadas ?? []);
	for (const stage of definition.etapas) {
		if (stage.id === definition.etapaFinal) break;
		if (deferred.has(stage.id)) continue;
		if (!stage.isComplete(readiness, journey)) return stage.id;
	}
	return definition.etapaFinal;
}

/** Ids do fluxo antigo (cookie `onboarding_stage`) → ids novos, para migrar retomadas em curso. */
const LEGACY_STAGE_MAP: Record<string, TCrmStageId> = {
	"organization-general-info": "empresa",
	"cashback-config": "cashback",
	"whatsapp-connection": "whatsapp",
	"campaigns-config": "campanhas",
	"data-source": "fonte-dados",
	conclusion: "entrada",
};

export function mapLegacyStageId(value: unknown): TCrmStageId | null {
	return typeof value === "string" ? (LEGACY_STAGE_MAP[value] ?? null) : null;
}

export const LEGACY_ONBOARDING_STAGE_COOKIE = "onboarding_stage";
