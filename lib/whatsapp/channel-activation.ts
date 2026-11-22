/**
 * Canal de envio em cinco passos. "Conectado" não é um momento, é uma sequência: a loja só manda
 * campanha quando o número está conectado, o nome de exibição foi aprovado, a Meta consegue cobrar,
 * os modelos foram aprovados e uma mensagem chegou de verdade. Cada passo diz o próximo movimento.
 *
 * Puro: quem lê o banco e a Meta é `readiness.ts`, `connection-health.ts` e `connection-test.ts`.
 * Usado pela etapa do onboarding, pela tela de configurações e pelo hub do painel.
 */

export const META_BILLING_URL = "https://business.facebook.com/billing_hub/payment_settings";
export const META_WHATSAPP_MANAGER_URL = "https://business.facebook.com/wa/manage/phone-numbers/";

// ------------------------------------------------------------------ campos da Meta no telefone

/** `name_status` do número na Meta (revisão do nome de exibição). */
export type TMetaNameStatus = "APPROVED" | "AVAILABLE_WITHOUT_REVIEW" | "PENDING_REVIEW" | "DECLINED" | "EXPIRED" | "NONE";
export type TMetaQualityRating = "GREEN" | "YELLOW" | "RED" | "NA" | "UNKNOWN";

export type TWhatsappPhoneMetaState = {
	nomeStatus: TMetaNameStatus | null;
	qualidade: TMetaQualityRating | null;
	/**
	 * Limite de clientes alcançados fora de conversa aberta em 24 h, do portfólio da empresa
	 * (`TIER_250`, `TIER_2K`, …, `TIER_UNLIMITED`). Vem de `whatsapp_business_manager_messaging_limit`.
	 */
	limiteEnvio: string | null;
	verificadoEm: string;
};

const NAME_STATUSES: readonly TMetaNameStatus[] = ["APPROVED", "AVAILABLE_WITHOUT_REVIEW", "PENDING_REVIEW", "DECLINED", "EXPIRED", "NONE"];
const QUALITY_RATINGS: readonly TMetaQualityRating[] = ["GREEN", "YELLOW", "RED", "NA", "UNKNOWN"];

/** Campos do telefone que pedimos à Meta além de `status`. */
export const META_PHONE_STATE_FIELDS = "name_status,quality_rating,whatsapp_business_manager_messaging_limit";

/**
 * Resposta do GET do telefone na Meta → o que guardamos. Valores desconhecidos viram null, nunca um
 * palpite. `messaging_limit_tier` é o nome antigo (descontinuado) do limite; lido só como reserva.
 */
export function mapMetaPhoneFields(
	body: { name_status?: string; quality_rating?: string; whatsapp_business_manager_messaging_limit?: string; messaging_limit_tier?: string },
	now: Date,
): TWhatsappPhoneMetaState {
	const nomeStatus = NAME_STATUSES.includes(body.name_status as TMetaNameStatus) ? (body.name_status as TMetaNameStatus) : null;
	const qualidade = QUALITY_RATINGS.includes(body.quality_rating as TMetaQualityRating) ? (body.quality_rating as TMetaQualityRating) : null;
	const limit = body.whatsapp_business_manager_messaging_limit ?? body.messaging_limit_tier ?? null;
	return { nomeStatus, qualidade, limiteEnvio: limit && /^(TIER_\w+|UNTIERED)$/.test(limit) ? limit : null, verificadoEm: now.toISOString() };
}

/** "TIER_2K" → "2.000 clientes por dia". Sem nível definido (`UNTIERED`, `TIER_NOT_SET`) → null. */
export function describeMessagingLimit(tier: string | null) {
	if (!tier) return null;
	if (tier === "TIER_UNLIMITED") return "Sem limite diário";
	const match = /^TIER_(\d+)(K?)$/.exec(tier);
	if (!match) return null;
	const value = Number(match[1]) * (match[2] ? 1000 : 1);
	return `${value.toLocaleString("pt-BR")} clientes por dia`;
}

// ------------------------------------------------------------------ mensagem de teste

export type TConnectionTestStatus =
	/** Modelo de teste enviado à Meta, esperando aprovação. */
	| "AGUARDANDO_MODELO"
	/** Modelo aprovado: o teste pode ser enviado. */
	| "PRONTO"
	| "MODELO_RECUSADO"
	| "ENVIADO"
	| "ENTREGUE"
	/** A Meta recusou por falta de forma de pagamento (131042). */
	| "RECUSADO_PAGAMENTO"
	| "FALHOU";

export type TConnectionTest = {
	status: TConnectionTestStatus;
	atualizadoEm: string;
	templateNome?: string | null;
	templateIdExterno?: string | null;
	destino?: string | null;
	mensagemId?: string | null;
	erroCodigo?: number | null;
	erroMensagem?: string | null;
};

const TEST_STATUS_RANK: Record<TConnectionTestStatus, number> = {
	AGUARDANDO_MODELO: 0,
	MODELO_RECUSADO: 1,
	PRONTO: 1,
	ENVIADO: 2,
	FALHOU: 3,
	RECUSADO_PAGAMENTO: 3,
	ENTREGUE: 4,
};

/**
 * Status de entrega da Meta para a mensagem de teste → próximo estado. A Meta entrega eventos fora
 * de ordem: um "sent" atrasado não rebaixa um teste já entregue, e uma entrega vence uma falha
 * anterior (a pessoa resolveu e mandou de novo com o mesmo id não acontece, mas a ordem pode trocar).
 */
export function resolveConnectionTestUpdate({
	current,
	status,
	errors,
}: {
	current: TConnectionTestStatus;
	status: string;
	errors?: Array<{ code?: number; title?: string; message?: string }>;
}): { status: TConnectionTestStatus; erroCodigo?: number | null; erroMensagem?: string | null } | null {
	let next: TConnectionTestStatus | null = null;
	if (status === "delivered" || status === "read") next = "ENTREGUE";
	else if (status === "failed") next = errors?.some((error) => error.code === 131042) ? "RECUSADO_PAGAMENTO" : "FALHOU";
	else if (status === "sent") next = "ENVIADO";
	if (!next || TEST_STATUS_RANK[next] < TEST_STATUS_RANK[current] || next === current) return null;
	const error = errors?.[0];
	return {
		status: next,
		...(next === "FALHOU" || next === "RECUSADO_PAGAMENTO"
			? { erroCodigo: error?.code ?? null, erroMensagem: error?.message ?? error?.title ?? null }
			: {}),
	};
}

// ------------------------------------------------------------------ os cinco passos

export type TChannelStepTone = "ok" | "andamento" | "pendente" | "falhou";
export type TChannelStepKey = "numero" | "nome" | "pagamento" | "modelos" | "entrega";
export type TChannelStepAction =
	| { tipo: "CONECTAR" }
	| { tipo: "RECONECTAR" }
	| { tipo: "LINK"; rotulo: string; href: string }
	| { tipo: "ENVIAR_TESTE" }
	| { tipo: "CONFIRMAR_PAGAMENTO" };

export type TChannelStep = {
	chave: TChannelStepKey;
	titulo: string;
	tom: TChannelStepTone;
	situacao: string;
	detalhe: string | null;
	acao: TChannelStepAction | null;
};

export type TChannelActivationInput = {
	/** Estado do número no readiness: NENHUM / CONECTADO / EXPIRADO / DESCONECTADO. */
	numero: "NENHUM" | "CONECTADO" | "EXPIRADO" | "DESCONECTADO";
	/** Falha de acesso vista pela checagem de saúde (token revogado, número fora do WABA). */
	saudeFalha: string | null;
	meta: TWhatsappPhoneMetaState | null;
	pagamento: "DESCONHECIDO" | "CONFIRMADO_PELO_USUARIO" | "VERIFICADO" | "PENDENTE";
	teste: TConnectionTest | null;
	modelos: { total: number; aprovados: number; rejeitados: number };
};

function numberStep(input: TChannelActivationInput): TChannelStep {
	const base = { chave: "numero" as const, titulo: "Número conectado" };
	if (input.numero === "NENHUM")
		return { ...base, tom: "pendente", situacao: "Não conectado", detalhe: "Conecte o número do app WhatsApp Business.", acao: { tipo: "CONECTAR" } };
	if (input.numero !== "CONECTADO" || input.saudeFalha)
		return {
			...base,
			tom: "falhou",
			situacao: input.numero === "EXPIRADO" ? "Acesso expirado" : "Sem acesso ao número",
			detalhe: input.saudeFalha ?? "A Meta não deixa mais o RecompraCRM usar este número. Reconecte para os envios voltarem.",
			acao: { tipo: "RECONECTAR" },
		};
	return { ...base, tom: "ok", situacao: "Conectado", detalhe: null, acao: null };
}

function nameStep(input: TChannelActivationInput): TChannelStep {
	const base = { chave: "nome" as const, titulo: "Nome de exibição aprovado" };
	switch (input.meta?.nomeStatus) {
		case "APPROVED":
		case "AVAILABLE_WITHOUT_REVIEW":
			return { ...base, tom: "ok", situacao: "Aprovado", detalhe: null, acao: null };
		case "DECLINED":
		case "EXPIRED":
			return {
				...base,
				tom: "falhou",
				situacao: input.meta.nomeStatus === "DECLINED" ? "Recusado pela Meta" : "Expirado",
				detalhe: "Ajuste o nome de exibição no Gerenciador do WhatsApp: ele precisa corresponder ao nome da empresa.",
				acao: { tipo: "LINK", rotulo: "Abrir o Gerenciador do WhatsApp", href: META_WHATSAPP_MANAGER_URL },
			};
		case "PENDING_REVIEW":
			return {
				...base,
				tom: "andamento",
				situacao: "Em revisão na Meta",
				detalhe: "Costuma levar de algumas horas a 2 dias. Não precisa fazer nada.",
				acao: null,
			};
		default:
			return { ...base, tom: "andamento", situacao: "Aguardando a Meta", detalhe: "Vamos conferir com a Meta nas próximas horas.", acao: null };
	}
}

function paymentStep(input: TChannelActivationInput): TChannelStep {
	const base = { chave: "pagamento" as const, titulo: "Pagamento na Meta" };
	if (input.pagamento === "VERIFICADO" || input.teste?.status === "ENTREGUE")
		return { ...base, tom: "ok", situacao: "Verificado", detalhe: "A Meta já entregou uma mensagem cobrada por este número.", acao: null };
	if (input.pagamento === "PENDENTE" || input.teste?.status === "RECUSADO_PAGAMENTO")
		return {
			...base,
			tom: "falhou",
			situacao: "Sem forma de pagamento",
			detalhe:
				"A Meta recusou um envio porque a conta do WhatsApp Business não tem forma de pagamento válida. Cadastre um cartão e envie o teste de novo.",
			acao: { tipo: "LINK", rotulo: "Cadastrar pagamento na Meta", href: META_BILLING_URL },
		};
	if (input.pagamento === "CONFIRMADO_PELO_USUARIO")
		return {
			...base,
			tom: "andamento",
			situacao: "Você confirmou",
			detalhe: "Confirmamos de verdade no primeiro envio. A mensagem de teste confirma agora.",
			acao: input.teste?.status === "PRONTO" ? { tipo: "ENVIAR_TESTE" } : null,
		};
	return {
		...base,
		tom: "pendente",
		situacao: "Não confirmado",
		detalhe: "A Meta cobra cada mensagem de campanha direto de você, no cartão da conta do WhatsApp Business. Sem ele, os envios são recusados.",
		acao: { tipo: "LINK", rotulo: "Cadastrar pagamento na Meta", href: META_BILLING_URL },
	};
}

function templatesStep(input: TChannelActivationInput): TChannelStep {
	const base = { chave: "modelos" as const, titulo: "Modelos de mensagem aprovados" };
	const { total, aprovados, rejeitados } = input.modelos;
	if (total === 0)
		return {
			...base,
			tom: "andamento",
			situacao: "Nenhum modelo ainda",
			detalhe: "Os modelos das campanhas vão para a Meta quando o número conecta.",
			acao: null,
		};
	if (rejeitados > 0)
		return {
			...base,
			tom: "falhou",
			situacao: `${rejeitados} recusado${rejeitados > 1 ? "s" : ""}`,
			detalhe: "Ajuste o texto do modelo recusado e envie de novo.",
			acao: { tipo: "LINK", rotulo: "Ver modelos", href: "/dashboard/settings?view=message-templates" },
		};
	if (aprovados === total) return { ...base, tom: "ok", situacao: `${aprovados} de ${total} aprovados`, detalhe: null, acao: null };
	return {
		...base,
		tom: aprovados > 0 ? "ok" : "andamento",
		situacao: `${aprovados} de ${total} aprovados`,
		detalhe: "A Meta revisa cada modelo; costuma levar de minutos a algumas horas.",
		acao: null,
	};
}

function deliveryStep(input: TChannelActivationInput): TChannelStep {
	const base = { chave: "entrega" as const, titulo: "Primeira mensagem entregue" };
	const test = input.teste;
	if (test?.status === "ENTREGUE" || input.pagamento === "VERIFICADO")
		return { ...base, tom: "ok", situacao: "Entregue", detalhe: test?.destino ? `A mensagem de teste chegou em ${test.destino}.` : null, acao: null };
	switch (test?.status) {
		case "PRONTO":
			return {
				...base,
				tom: "pendente",
				situacao: "Pronto para testar",
				detalhe: "Mande uma mensagem de teste para o seu WhatsApp e veja chegar.",
				acao: { tipo: "ENVIAR_TESTE" },
			};
		case "ENVIADO":
			return { ...base, tom: "andamento", situacao: "Enviado, aguardando a entrega", detalhe: "Confira o seu WhatsApp.", acao: null };
		case "RECUSADO_PAGAMENTO":
			return {
				...base,
				tom: "falhou",
				situacao: "Recusado por pagamento",
				detalhe: "Cadastre o pagamento na Meta e envie o teste de novo.",
				acao: { tipo: "ENVIAR_TESTE" },
			};
		case "FALHOU":
			return {
				...base,
				tom: "falhou",
				situacao: "Não entregue",
				detalhe: test.erroMensagem ? `A Meta respondeu: ${test.erroMensagem}` : "A Meta não entregou a mensagem de teste.",
				acao: { tipo: "ENVIAR_TESTE" },
			};
		case "MODELO_RECUSADO":
			return {
				...base,
				tom: "falhou",
				situacao: "Teste indisponível",
				detalhe: "A Meta recusou o modelo de teste. A primeira campanha entregue confirma este passo.",
				acao: null,
			};
		default:
			return {
				...base,
				tom: "andamento",
				situacao: "Preparando o teste",
				detalhe: "O modelo de teste está em revisão na Meta. Assim que aprovar, você manda o teste por aqui.",
				acao: null,
			};
	}
}

export function resolveWhatsappChannelSteps(input: TChannelActivationInput) {
	const number = numberStep(input);
	if (number.tom !== "ok") {
		// Sem número, os outros passos não têm o que mostrar: só o primeiro, com a ação.
		return { passos: [number], concluidos: 0, total: 5, proximo: number, pronto: false };
	}
	const passos = [number, nameStep(input), paymentStep(input), templatesStep(input), deliveryStep(input)];
	const concluidos = passos.filter((step) => step.tom === "ok").length;
	const proximo =
		passos.find((step) => step.tom === "falhou") ?? passos.find((step) => step.tom === "pendente") ?? passos.find((step) => step.tom !== "ok") ?? null;
	return { passos, concluidos, total: 5, proximo, pronto: concluidos === 5 };
}
export type TWhatsappChannelSteps = ReturnType<typeof resolveWhatsappChannelSteps>;
