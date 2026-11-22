import { appRoutes } from "@/lib/navigation/routes";
import type { TOnboardingCampaignStateEnum, TWhatsappPaymentStatusEnum } from "@/schemas/enums";
import type { TWhatsappNumberState } from "@/lib/whatsapp/meta-access";
import type { TDataSourceMode } from "./data-source-mode";
import type { TDataSourceIntegrationType } from "@/lib/integrations/data-sources";
import type { TErpChannel } from "./erp-channels";
import { TRIAL_GOAL_TARGET } from "./main-pain";

/**
 * Ativação por segmento, decidida sem I/O. Desenho e dados: docs/onboarding/activation-by-segment.md.
 *
 * "Ativação" não é uma coisa só. A loja que chega por integração tem a base no dia 0 e trava no
 * canal; a do balcão trava antes da primeira venda registrada; a do ERP vende no primeiro dia e some
 * na segunda semana. Cada segmento tem a sua escada de marcos, e a próxima ação é sempre uma só: a do
 * primeiro marco que depende da loja. Esperar a Meta ou a importação não é tarefa de ninguém — esses
 * marcos aparecem "em andamento" e a ação pula para o seguinte.
 *
 * Depois de ativada a loja sai da superfície, e volta com uma ação só quando algo que já funcionava
 * para (o canal caiu, as campanhas não entregam há 14 dias, o canal do ERP não vende há 7 dias).
 */

export type TActivationSegment = "CRM_INTEGRACAO" | "CRM_BALCAO" | "ERP" | "CRM_ERP" | "SEM_FONTE";

/** Vendas de uma origem, contadas a partir do cadastro (o histórico importado não é uso). */
export type TActivationSalesOrigin = {
	primeiraEm: Date | null;
	ultimaEm: Date | null;
	/** Semanas distintas com venda, contadas em blocos de 7 dias desde o cadastro. */
	semanas: number;
	total: number;
	/** Dias distintos com venda nos últimos 7 dias (o ritmo da semana do ERP). */
	diasUltimos7: number;
};

export type TActivationFacts = {
	now: Date;
	organizacao: { id: string; criadaEm: Date; slug: string | null; erpAcesso: boolean };
	jornadas: { crm: boolean; erp: boolean; erpCanal: TErpChannel | null };
	fonte: {
		modo: TDataSourceMode;
		integracaoComErro: { nome: string } | null;
		/** Tipos das integrações de fonte de dados ativas, para mostrar a marca do sistema conectado. */
		integracoes: TDataSourceIntegrationType[];
		importacao: { emAndamento: boolean; vendasImportadas: number };
	};
	base: { clientes: number; clientesSegmentados: number };
	vendas: {
		balcao: TActivationSalesOrigin;
		integracao: TActivationSalesOrigin;
		erp: Record<TErpChannel, TActivationSalesOrigin>;
	};
	canal: { numero: TWhatsappNumberState; pagamento: TWhatsappPaymentStatusEnum | "NAO_APLICAVEL" };
	campanhas: {
		preparadas: Array<{ chave: string; titulo: string; estado: TOnboardingCampaignStateEnum; pronta: boolean }>;
		manuaisAtivas: number;
		templates: Array<{ nome: string; status: "RASCUNHO" | "EM_ANALISE" | "APROVADO" | "REJEITADO" | "PAUSADO" }>;
	};
	envios: { primeiraEntregaEm: Date | null; ultimaEntregaEm: Date | null; entregas14Dias: number };
	erp: { produtosUtilizaveis: number; pendenciasLancamento: Array<{ chave: string; rotulo: string; href: string }> };
	/** Primeiros resultados, para celebrar o momento em que acontecem. */
	resultados: {
		primeiraConversao: { em: Date; valor: number; minutos: number | null } | null;
		primeiroCashback: { em: Date; valor: number } | null;
		/** Clientes distintos com compra atribuída a uma campanha. */
		conversoes: number;
	};
	/** Período de teste e a meta que a loja aceitou no onboarding ("N clientes de volta"). */
	teste: { emTeste: boolean; fim: Date | null; metaAceita: boolean };
};

export type TActivationMilestoneState = "FEITO" | "EM_ANDAMENTO" | "PENDENTE";

export type TActivationMilestone = {
	chave: string;
	rotulo: string;
	estado: TActivationMilestoneState;
	/** Complemento com número real ("1.284 clientes", "126 vendas importadas até agora"). */
	detalhe: string | null;
	/** O que resolve este marco; null quando feito ou quando ainda não há o que fazer. */
	acao: TActivationAction | null;
	/** De quem é o marco, quando é de alguém: o hub desenha a marca (Meta, o sistema conectado, o canal). */
	marca?: TActivationMark | null;
};

/**
 * A marca de um marco que pertence a um terceiro ou a um canal: a Meta no WhatsApp oficial, o
 * sistema que a loja conectou (Bling, Nuvemshop…), o RecompraCRM no balcão, o canal do ERP.
 */
export type TActivationMark =
	| { tipo: "META" }
	| { tipo: "INTEGRACAO"; integracoes: TDataSourceIntegrationType[] }
	| { tipo: "RECOMPRACRM" }
	| { tipo: "CANAL"; canal: TErpChannel };

/** `href` nulo = a etapa espera alguém de fora; mostrar o texto, sem botão. */
export type TActivationAction = { chave: string; rotulo: string; descricao: string; href: string | null };

export type TActivationRegression = { motivo: "CANAL_PERDIDO" | "SEM_ENVIO" | "SEM_VENDA"; desde: Date | null };

/** Um primeiro resultado recente. A chave inclui a data, para "fechar" valer só para este momento. */
export type TActivationCelebration = { chave: string; titulo: string; texto: string };

export type TActivation = {
	segmento: TActivationSegment;
	/** Canal do ERP que a escada acompanha (segmentos ERP e CRM_ERP). */
	canalErp: TErpChannel | null;
	marcos: TActivationMilestone[];
	progresso: { feitos: number; total: number };
	proximaAcao: TActivationAction | null;
	ativado: boolean;
	regressao: TActivationRegression | null;
	/** A superfície do hub aparece: antes da ativação, ou numa regressão. */
	visivel: boolean;
	/** Primeiro resultado dos últimos dias, mostrado uma vez (com ou sem a superfície). */
	celebracao: TActivationCelebration | null;
	/** Meta do teste aceita no onboarding, acompanhada depois da ativação enquanto o teste dura. */
	metaTeste: { atual: number; alvo: number; fim: Date } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const ACTIVATION_DELIVERY_REGRESSION_DAYS = 14;
export const ACTIVATION_ERP_REGRESSION_DAYS = 7;
export const ACTIVATION_CELEBRATION_DAYS = 7;
/** Ritmo da semana no ERP: dias com venda em 7. */
export const ERP_WEEKLY_DAYS_TARGET = 5;
const ERP_CHANNELS: TErpChannel[] = ["BALCAO", "CATALOGO", "MESAS"];

const number = (value: number) => value.toLocaleString("pt-BR");
const plural = (count: number, singular: string, pluralForm: string) => `${number(count)} ${count === 1 ? singular : pluralForm}`;
const shortDate = (date: Date) => date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

// ------------------------------------------------------------------ segmento

function erpSalesEver(facts: TActivationFacts) {
	return ERP_CHANNELS.reduce((total, channel) => total + facts.vendas.erp[channel].total, 0);
}

export function resolveActivationSegment(facts: TActivationFacts): TActivationSegment {
	const usesErp = facts.organizacao.erpAcesso && (facts.jornadas.erp || erpSalesEver(facts) > 0);
	const crmSource = facts.fonte.modo !== "NENHUMA";
	const usesCrm = facts.jornadas.crm || crmSource || facts.envios.primeiraEntregaEm !== null;
	if (usesErp && usesCrm) return "CRM_ERP";
	if (usesErp) return "ERP";
	if (facts.fonte.modo === "INTEGRACAO" || facts.fonte.modo === "AMBOS") return "CRM_INTEGRACAO";
	if (facts.fonte.modo === "POI") return "CRM_BALCAO";
	return "SEM_FONTE";
}

/** Canal que a escada do ERP acompanha: o escolhido na jornada, senão o que mais vendeu, senão o balcão. */
export function resolveErpChannel(facts: TActivationFacts): TErpChannel {
	if (facts.jornadas.erpCanal) return facts.jornadas.erpCanal;
	const busiest = [...ERP_CHANNELS].sort((a, b) => facts.vendas.erp[b].total - facts.vendas.erp[a].total)[0];
	return busiest && facts.vendas.erp[busiest].total > 0 ? busiest : "BALCAO";
}

// ------------------------------------------------------------------ escadas

type TStep = TActivationMilestone;

const done = (chave: string, rotulo: string, detalhe: string | null = null): TStep => ({ chave, rotulo, estado: "FEITO", detalhe, acao: null });
const waiting = (chave: string, rotulo: string, acao: TActivationAction): TStep => ({
	chave,
	rotulo,
	estado: "EM_ANDAMENTO",
	detalhe: acao.descricao,
	acao,
});
const todo = (chave: string, rotulo: string, acao: TActivationAction | null, detalhe: string | null = null): TStep => ({
	chave,
	rotulo,
	estado: "PENDENTE",
	detalhe,
	acao,
});

const accountStep = () => done("conta", "Conta criada");
const withMark = (step: TStep, marca: TActivationMark): TStep => ({ ...step, marca });

function whatsappSettingsHref() {
	return `${appRoutes.settings()}?view=meta-oauth`;
}

function channelStep(facts: TActivationFacts): TStep {
	return withMark(channelStepBase(facts), { tipo: "META" });
}

function channelStepBase(facts: TActivationFacts): TStep {
	const rotulo = "WhatsApp oficial conectado";
	switch (facts.canal.numero) {
		case "CONECTADO":
			return done("whatsapp", rotulo);
		case "NENHUM":
			return todo("whatsapp", rotulo, {
				chave: "conectar-whatsapp",
				rotulo: "Conectar o WhatsApp oficial",
				descricao:
					facts.base.clientes > 0
						? `${plural(facts.base.clientes, "cliente já está", "clientes já estão")} na sua base. As campanhas só saem pelo número oficial.`
						: "As campanhas saem pelo número oficial da Meta. Leva uns 5 minutos.",
				href: whatsappSettingsHref(),
			});
		default:
			return todo("whatsapp", rotulo, {
				chave: "reconectar-whatsapp",
				rotulo: "Reconectar o WhatsApp",
				descricao: "A Meta não deixa mais o RecompraCRM usar o número. Reconecte para as campanhas voltarem a sair.",
				href: whatsappSettingsHref(),
			});
	}
}

/** O primeiro envio entregue: o marco de ativação do CRM. O que o bloqueia decide a ação. */
function firstDeliveryStep(facts: TActivationFacts): TStep {
	const rotulo = "Primeira campanha entregue";
	if (facts.envios.primeiraEntregaEm) return done("primeira-entrega", rotulo, shortDate(facts.envios.primeiraEntregaEm));
	const campaignsHref = appRoutes.growth.campaigns();
	if (facts.canal.pagamento === "PENDENTE") {
		return todo("primeira-entrega", rotulo, {
			chave: "pagamento-whatsapp",
			rotulo: "Resolver pagamento na Meta",
			descricao: "A Meta recusou um envio por falta de forma de pagamento. As campanhas ficam paradas até resolver.",
			href: whatsappSettingsHref(),
		});
	}
	const rejected = facts.campanhas.templates.find((template) => template.status === "REJEITADO");
	if (rejected) {
		return todo("primeira-entrega", rotulo, {
			chave: "template-rejeitado",
			rotulo: "Corrigir a mensagem",
			descricao: `A Meta recusou a mensagem "${rejected.nome}". Ajuste o texto e envie de novo.`,
			href: `${appRoutes.settings()}?view=message-templates`,
		});
	}
	const ready = facts.campanhas.preparadas.find((campaign) => campaign.estado === "PRONTA");
	if (ready) {
		return todo("primeira-entrega", rotulo, {
			chave: "liberar-campanha",
			rotulo: "Liberar envios",
			descricao: `"${ready.titulo}" está pronta e só começa a enviar quando você liberar.`,
			href: campaignsHref,
		});
	}
	if (facts.campanhas.preparadas.length === 0 && facts.campanhas.manuaisAtivas === 0) {
		return todo("primeira-entrega", rotulo, {
			chave: "preparar-campanha",
			rotulo: "Preparar uma campanha",
			descricao: "Escolha uma campanha sugerida para o seu segmento. Ela só envia quando você liberar.",
			href: campaignsHref,
		});
	}
	if (facts.canal.numero !== "CONECTADO") return todo("primeira-entrega", rotulo, null);
	const inReview = facts.campanhas.templates.some((template) => template.status === "EM_ANALISE");
	if (inReview) {
		return waiting("primeira-entrega", rotulo, {
			chave: "aguardando-meta",
			rotulo: "Aguardando a Meta",
			descricao: "A Meta está analisando a mensagem das campanhas. Não precisa fazer nada: este passo avança sozinho quando ela aprovar.",
			href: null,
		});
	}
	const live = facts.campanhas.manuaisAtivas > 0 || facts.campanhas.preparadas.some((campaign) => campaign.estado === "ATIVA");
	if (live) {
		return waiting("primeira-entrega", rotulo, {
			chave: "aguardando-publico",
			rotulo: "Campanha ativa",
			descricao: "A campanha está ligada e envia quando um cliente entrar no público dela.",
			href: null,
		});
	}
	return todo("primeira-entrega", rotulo, {
		chave: "revisar-campanhas",
		rotulo: "Revisar campanhas",
		descricao: "As campanhas preparadas ainda dependem de um passo. Veja qual na tela de campanhas.",
		href: campaignsHref,
	});
}

function integrationSourceStep(facts: TActivationFacts): TStep {
	return withMark(integrationSourceStepBase(facts), { tipo: "INTEGRACAO", integracoes: facts.fonte.integracoes });
}

function integrationSourceStepBase(facts: TActivationFacts): TStep {
	const rotulo = "Sistema conectado";
	if (facts.fonte.integracaoComErro) {
		return todo("fonte", rotulo, {
			chave: "reconectar-integracao",
			rotulo: "Reconectar integração",
			descricao: `A conexão com ${facts.fonte.integracaoComErro.nome} precisa de atenção para as vendas continuarem entrando.`,
			href: `${appRoutes.settings()}?view=integration`,
		});
	}
	return done("fonte", rotulo);
}

function baseStep(facts: TActivationFacts): TStep {
	const rotulo = "Base na plataforma";
	if (facts.base.clientesSegmentados > 0) return done("base", rotulo, plural(facts.base.clientes, "cliente", "clientes"));
	return waiting("base", rotulo, {
		chave: "aguardando-base",
		rotulo: "Sua base está chegando",
		descricao: facts.fonte.importacao.emAndamento
			? `${plural(facts.fonte.importacao.vendasImportadas, "venda importada", "vendas importadas")} até agora. Você pode seguir configurando enquanto isso.`
			: "Estamos organizando seus clientes por segmento. Você pode seguir configurando enquanto isso.",
		href: null,
	});
}

function counterHref(facts: TActivationFacts) {
	return `/point-of-interaction/${facts.organizacao.id}`;
}

function counterSteps(facts: TActivationFacts): TStep[] {
	const counter = facts.vendas.balcao;
	const open: TActivationAction = {
		chave: "registrar-balcao",
		rotulo: "Abrir o Ponto de Interação",
		descricao: "",
		href: counterHref(facts),
	};
	const first = counter.primeiraEm
		? done("primeira-venda-balcao", "Primeira venda no balcão", shortDate(counter.primeiraEm))
		: todo("primeira-venda-balcao", "Primeira venda no balcão", {
				...open,
				chave: "primeira-venda-balcao",
				rotulo: "Registrar a primeira venda no balcão",
				descricao: "O cliente recebe o cashback na hora e entra na sua base.",
			});
	const secondWeek =
		counter.semanas >= 2
			? done("balcao-segunda-semana", "Vendas no balcão em 2 semanas")
			: todo(
					"balcao-segunda-semana",
					"Vendas no balcão em 2 semanas",
					counter.primeiraEm
						? {
								...open,
								descricao: `${plural(counter.total, "venda registrada", "vendas registradas")} no balcão até agora. Registrar toda semana é o que forma a base para as campanhas.`,
							}
						: null,
				);
	return [first, secondWeek];
}

const ERP_FIRST_SALE_LABEL: Record<TErpChannel, string> = {
	BALCAO: "Primeira venda no PDV",
	CATALOGO: "Primeiro pedido pela loja",
	MESAS: "Primeira comanda fechada",
};

function erpChannelAction(facts: TActivationFacts, channel: TErpChannel): TActivationAction {
	switch (channel) {
		case "CATALOGO":
			return {
				chave: "abrir-loja",
				rotulo: "Abrir a loja digital",
				descricao: "Mande o link da loja para seus clientes; os pedidos chegam no painel.",
				href: facts.organizacao.slug ? `/shop/${facts.organizacao.slug}` : appRoutes.catalog.store(),
			};
		case "MESAS":
			return {
				chave: "abrir-comandas",
				rotulo: "Abrir as comandas",
				descricao: "Abra uma comanda para a próxima mesa e feche a conta por aqui.",
				href: appRoutes.sales.serviceAccounts(),
			};
		default:
			return { chave: "abrir-pdv", rotulo: "Abrir o PDV", descricao: "Registre a próxima venda do balcão pelo PDV.", href: appRoutes.sales.new() };
	}
}

function erpSteps(facts: TActivationFacts, channel: TErpChannel): TStep[] {
	const sales = facts.vendas.erp[channel];
	const action = erpChannelAction(facts, channel);
	const steps: TStep[] = [accountStep()];
	steps.push(
		facts.jornadas.erpCanal || sales.total > 0
			? withMark(done("canal-erp", "Canal escolhido", ERP_CHANNEL_NAME[channel]), { tipo: "CANAL", canal: channel })
			: todo("canal-erp", "Canal escolhido", {
					chave: "escolher-canal",
					rotulo: "Escolher como vender",
					descricao: "Balcão, loja digital ou mesas. Escolha um para preparar primeiro.",
					href: "/onboarding?produto=ERP&retomar=true&etapa=canal",
				}),
	);
	steps.push(
		facts.erp.produtosUtilizaveis > 0 || sales.total > 0
			? done("produtos", "Produtos cadastrados", facts.erp.produtosUtilizaveis > 0 ? plural(facts.erp.produtosUtilizaveis, "produto", "produtos") : null)
			: todo("produtos", "Produtos cadastrados", {
					chave: "cadastrar-produtos",
					rotulo: "Cadastrar produtos",
					descricao: "Um conjunto pequeno, com nome e preço, já permite a primeira venda.",
					href: appRoutes.catalog.products(),
				}),
	);
	const launchPending =
		sales.total === 0
			? facts.erp.pendenciasLancamento.find((item) => item.chave !== "canal" && item.chave !== "produtos" && item.chave !== "acesso")
			: undefined;
	steps.push(
		sales.primeiraEm
			? done("primeira-venda-erp", ERP_FIRST_SALE_LABEL[channel], shortDate(sales.primeiraEm))
			: todo(
					"primeira-venda-erp",
					ERP_FIRST_SALE_LABEL[channel],
					launchPending
						? { chave: `lancamento-${launchPending.chave}`, rotulo: "Preparar o canal", descricao: launchPending.rotulo, href: launchPending.href }
						: action,
				),
	);
	steps.push(
		sales.semanas >= 2
			? done("erp-segunda-semana", "Vendas em 2 semanas")
			: todo(
					"erp-segunda-semana",
					"Vendas em 2 semanas",
					sales.primeiraEm
						? {
								...action,
								descricao: `Vendas em ${plural(sales.diasUltimos7, "dia", "dias")} dos últimos 7. Meta da semana: vender pelo sistema em ${ERP_WEEKLY_DAYS_TARGET}.`,
							}
						: null,
				),
	);
	return steps;
}

function crmSteps(facts: TActivationFacts, segment: TActivationSegment): TStep[] {
	const steps: TStep[] = [accountStep()];
	if (segment === "CRM_ERP") steps.push(withMark(done("fonte", "Vendas pelo PDV"), { tipo: "CANAL", canal: "BALCAO" }));
	else if (segment === "CRM_BALCAO") steps.push(withMark(done("fonte", "Balcão escolhido"), { tipo: "RECOMPRACRM" }), ...counterSteps(facts));
	else steps.push(integrationSourceStep(facts), baseStep(facts));
	steps.push(channelStep(facts), firstDeliveryStep(facts));
	return steps;
}

function noSourceSteps(facts: TActivationFacts): TStep[] {
	const href = facts.jornadas.crm ? "/onboarding?produto=CRM&retomar=true&etapa=fonte-dados" : `${appRoutes.settings()}?view=integration`;
	return [
		accountStep(),
		todo("fonte", "De onde vêm as vendas", {
			chave: "definir-fonte",
			rotulo: "Definir de onde vêm as vendas",
			descricao: "Conecte seu sistema ou registre a primeira venda no balcão para sua base começar.",
			href,
		}),
		todo("primeira-venda", "Primeira venda na plataforma", null),
	];
}

// ------------------------------------------------------------------ ativação e regressão

function isErpActivated(facts: TActivationFacts, channel: TErpChannel) {
	return facts.vendas.erp[channel].semanas >= 2;
}

function lastErpSale(facts: TActivationFacts) {
	return ERP_CHANNELS.map((channel) => facts.vendas.erp[channel].ultimaEm).reduce<Date | null>(
		(latest, at) => (at && (!latest || at > latest) ? at : latest),
		null,
	);
}

function resolveCrmRegression(facts: TActivationFacts): TActivationRegression | null {
	if (facts.canal.numero === "EXPIRADO" || facts.canal.numero === "DESCONECTADO" || facts.canal.numero === "NENHUM")
		return { motivo: "CANAL_PERDIDO", desde: facts.envios.ultimaEntregaEm };
	const last = facts.envios.ultimaEntregaEm;
	if (last && facts.now.getTime() - last.getTime() > ACTIVATION_DELIVERY_REGRESSION_DAYS * DAY_MS) return { motivo: "SEM_ENVIO", desde: last };
	return null;
}

function resolveErpRegression(facts: TActivationFacts): TActivationRegression | null {
	const last = lastErpSale(facts);
	if (last && facts.now.getTime() - last.getTime() > ACTIVATION_ERP_REGRESSION_DAYS * DAY_MS) return { motivo: "SEM_VENDA", desde: last };
	return null;
}

const ERP_CHANNEL_NAME: Record<TErpChannel, string> = { BALCAO: "Balcão", CATALOGO: "Loja digital", MESAS: "Mesas e comandas" };

const CHANNEL_NAME: Record<TErpChannel, string> = { BALCAO: "PDV", CATALOGO: "loja digital", MESAS: "comandas" };

function regressionAction(facts: TActivationFacts, regression: TActivationRegression, channel: TErpChannel | null): TActivationAction {
	switch (regression.motivo) {
		case "CANAL_PERDIDO":
			return {
				chave: "reconectar-whatsapp",
				rotulo: "Reconectar o WhatsApp",
				descricao: "O número oficial desconectou, e as campanhas não saem até reconectar.",
				href: whatsappSettingsHref(),
			};
		case "SEM_ENVIO":
			return {
				chave: "revisar-campanhas",
				rotulo: "Revisar campanhas",
				descricao: regression.desde
					? `Suas campanhas não entregam mensagens desde ${shortDate(regression.desde)}.`
					: "Suas campanhas pararam de entregar mensagens.",
				href: appRoutes.growth.campaigns(),
			};
		default: {
			const target = channel ?? "BALCAO";
			const action = erpChannelAction(facts, target);
			return {
				...action,
				descricao: regression.desde ? `Nenhuma venda pelo ${CHANNEL_NAME[target]} desde ${shortDate(regression.desde)}.` : action.descricao,
			};
		}
	}
}

const ERP_FIRST_SALE_CELEBRATION: Record<TErpChannel, string> = {
	BALCAO: "Sua primeira venda no PDV",
	CATALOGO: "Seu primeiro pedido pela loja",
	MESAS: "Sua primeira comanda fechada",
};

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * O pico do esforço merece mais que um selo de "feito" (regra do pico e do fim): a primeira compra de
 * quem recebeu campanha, a primeira campanha entregue, a primeira venda no balcão ou no canal do ERP.
 * Vale por alguns dias depois do acontecimento; o mais forte ganha. Números sempre reais.
 */
export function resolveActivationCelebration(
	facts: TActivationFacts,
	segmento: TActivationSegment,
	canalErp: TErpChannel | null,
): TActivationCelebration | null {
	const recent = (date: Date | null | undefined): date is Date =>
		!!date && facts.now.getTime() - date.getTime() <= ACTIVATION_CELEBRATION_DAYS * DAY_MS && date.getTime() <= facts.now.getTime();

	const conversion = facts.resultados.primeiraConversao;
	if (conversion && recent(conversion.em)) {
		const days = conversion.minutos === null ? null : Math.round(conversion.minutos / (24 * 60));
		const when = days === null ? "" : days === 0 ? " no mesmo dia" : `, ${plural(days, "dia", "dias")} depois`;
		return {
			chave: `primeira-recompra:${dayKey(conversion.em)}`,
			titulo: "Um cliente voltou depois da sua campanha",
			texto:
				conversion.valor > 0
					? `Ele recebeu a mensagem e comprou ${money(conversion.valor)}${when}.`
					: `Ele recebeu a mensagem e voltou a comprar${when}.`,
		};
	}
	const firstDelivery = facts.envios.primeiraEntregaEm;
	if (segmento !== "ERP" && recent(firstDelivery)) {
		return {
			chave: `primeira-entrega:${dayKey(firstDelivery)}`,
			titulo: "Sua primeira campanha saiu",
			texto: `${plural(facts.envios.entregas14Dias, "mensagem entregue", "mensagens entregues")} desde ${shortDate(firstDelivery)}.`,
		};
	}
	const firstCounterSale = facts.vendas.balcao.primeiraEm;
	if (segmento === "CRM_BALCAO" && recent(firstCounterSale)) {
		const cashback = facts.resultados.primeiroCashback;
		return {
			chave: `primeira-venda-balcao:${dayKey(firstCounterSale)}`,
			titulo: "Primeira venda no balcão registrada",
			texto:
				cashback && recent(cashback.em) && cashback.valor > 0
					? `O cliente já tem ${money(cashback.valor)} de cashback para a próxima visita.`
					: "O cliente já está na sua base, pronto para as campanhas.",
		};
	}
	const erpSales = canalErp ? facts.vendas.erp[canalErp] : null;
	if (canalErp && erpSales && recent(erpSales.primeiraEm)) {
		return {
			chave: `primeira-venda-erp:${dayKey(erpSales.primeiraEm)}`,
			titulo: ERP_FIRST_SALE_CELEBRATION[canalErp],
			texto: `${plural(erpSales.total, "venda", "vendas")} desde ${shortDate(erpSales.primeiraEm)}.`,
		};
	}
	return null;
}

export function resolveActivation(facts: TActivationFacts): TActivation {
	const segmento = resolveActivationSegment(facts);
	const usesErp = segmento === "ERP" || segmento === "CRM_ERP";
	const canalErp = usesErp ? resolveErpChannel(facts) : null;
	const erpActivated = canalErp ? isErpActivated(facts, canalErp) : false;
	const crmActivated = facts.envios.primeiraEntregaEm !== null;

	const ativado =
		segmento === "ERP" ? erpActivated : segmento === "CRM_ERP" ? erpActivated && crmActivated : segmento === "SEM_FONTE" ? false : crmActivated;

	// CRM_ERP: a escada do ERP até ele firmar, depois a do CRM com o PDV como fonte.
	const steps =
		segmento === "SEM_FONTE"
			? noSourceSteps(facts)
			: segmento === "ERP" || (segmento === "CRM_ERP" && !erpActivated)
				? erpSteps(facts, canalErp ?? "BALCAO")
				: crmSteps(facts, segmento);

	let regressao: TActivationRegression | null = null;
	if (ativado) {
		const erpRegression = usesErp ? resolveErpRegression(facts) : null;
		const crmRegression = segmento !== "ERP" ? resolveCrmRegression(facts) : null;
		regressao = erpRegression ?? crmRegression;
	}

	const proximaAcao = regressao
		? regressionAction(facts, regressao, canalErp)
		: ativado
			? null
			: (steps.find((step) => step.estado === "PENDENTE" && step.acao)?.acao ?? steps.find((step) => step.estado === "EM_ANDAMENTO")?.acao ?? null);

	const marcos: TActivationMilestone[] = steps;
	return {
		segmento,
		canalErp,
		marcos,
		progresso: { feitos: marcos.filter((milestone) => milestone.estado === "FEITO").length, total: marcos.length },
		proximaAcao,
		ativado,
		regressao,
		visivel: !ativado || regressao !== null,
		celebracao: resolveActivationCelebration(facts, segmento, canalErp),
		metaTeste:
			ativado && facts.teste.emTeste && facts.teste.metaAceita && facts.teste.fim && segmento !== "ERP" && segmento !== "SEM_FONTE"
				? { atual: facts.resultados.conversoes, alvo: TRIAL_GOAL_TARGET, fim: facts.teste.fim }
				: null,
	};
}
