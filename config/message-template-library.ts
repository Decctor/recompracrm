import { getDefaultMessageTemplateVariableExample, type TMessageTemplateNativeVariableId } from "@/lib/message-templates/variables";
import type { TCampaignTriggerTypeEnum } from "@/schemas/enums";
import type { TMessageTemplateContent } from "@/schemas/message-templates";

/**
 * Catálogo de modelos de mensagem mantidos pela RecompraCRM.
 *
 * Este módulo é PURO de propósito: nenhuma importação de drizzle ou de qualquer coisa
 * server-only. Ele alimenta dois consumidores diferentes — o seeder de onboarding
 * (`config/onboarding-message-templates.ts`, server) e a biblioteca de templates dentro do
 * construtor de campanhas (client). O seeder mora no outro arquivo justamente para que
 * importar o catálogo no browser não arraste o schema do banco junto.
 *
 * Cada modelo existe em duas variantes — uma que fala de cashback (`COM_CASHBACK`) e uma que
 * não fala (`SEM_CASHBACK`) — para que a mensagem fique coerente com o programa da organização.
 *
 * `intendedTriggers` restringe em quais gatilhos o modelo aparece na biblioteca do construtor.
 * Sem isso, qualquer corpo que use só `clientName` vazaria para todos os gatilhos.
 */
export type TOnboardingTemplateVariant = "COM_CASHBACK" | "SEM_CASHBACK";

export type TMessageTemplateLibraryGroup = "JORNADA" | "CASHBACK" | "AGENDA" | "SEGMENTOS";

/** Keys semeadas no onboarding — subset estável do catálogo completo. */
export type TOnboardingMessageTemplateKey =
	| "primeira_compra"
	| "segunda_compra"
	| "presente_aniversario"
	| "recuperacao_clientes"
	| "cashback_expirando";

export type TMessageTemplateLibraryKey =
	| TOnboardingMessageTemplateKey
	| "pos_compra"
	| "pos_compra_favorito"
	| "primeira_compra_sugerido"
	| "marco_valor"
	| "cashback_acumulado"
	| "pior_dia_vendas"
	| "promocao_produto"
	| "recorrente_fim_de_semana"
	| "recorrente_meio_semana"
	| "recorrente_comeco_mes"
	| "data_comemorativa"
	| "permanencia_segmento"
	| "marco_compras"
	| "feriado"
	| "lancamento"
	| "vip_campeoes"
	| "reativacao_hibernando";

export type TMessageTemplateLibraryBody = { text: string; variables: TMessageTemplateNativeVariableId[] };

export type TMessageTemplateLibraryDefinition = {
	key: TMessageTemplateLibraryKey;
	nome: string;
	/** Rótulo curto para a UI da biblioteca (o `nome` é o identificador técnico na Meta). */
	titulo: string;
	grupo: TMessageTemplateLibraryGroup;
	/** Gatilhos em que o modelo aparece na biblioteca do construtor. */
	intendedTriggers: TCampaignTriggerTypeEnum[];
	/** When true, the template only exists in the cashback-aware variant (no SEM_CASHBACK copy). */
	cashbackOnly?: boolean;
	bodies: Record<TOnboardingTemplateVariant, TMessageTemplateLibraryBody | null>;
};

/** @deprecated Prefer `TMessageTemplateLibraryDefinition` — kept for onboarding seed typing. */
export type TOnboardingMessageTemplateDefinition = TMessageTemplateLibraryDefinition & {
	key: TOnboardingMessageTemplateKey;
};

export const MESSAGE_TEMPLATE_LIBRARY_FOOTER = "Responda esta mensagem se quiser falar com a nossa equipe.";

export const ONBOARDING_MESSAGE_TEMPLATE_KEYS = [
	"primeira_compra",
	"segunda_compra",
	"presente_aniversario",
	"recuperacao_clientes",
	"cashback_expirando",
] as const satisfies readonly TOnboardingMessageTemplateKey[];

export function buildMessageTemplateLibraryContent(body: TMessageTemplateLibraryBody): TMessageTemplateContent {
	return {
		assunto: "",
		preheader: "",
		cabecalho: { tipo: "NENHUM" },
		corpo: {
			conteudo: body.text,
			parametros: body.variables.map((variable, index) => ({
				identificadorInterno: variable,
				identificadorExterno: String(index + 1),
				exemplo: getDefaultMessageTemplateVariableExample(variable),
			})),
		},
		rodape: MESSAGE_TEMPLATE_LIBRARY_FOOTER,
		botoes: [],
	};
}

export const MESSAGE_TEMPLATE_LIBRARY: TMessageTemplateLibraryDefinition[] = [
	// --- Onboarding / canônicos (corpos congelados — já materializados por org) ---
	{
		key: "primeira_compra",
		nome: "recompracrm_primeira_compra",
		titulo: "Pós primeira compra",
		grupo: "JORNADA",
		intendedTriggers: ["PRIMEIRA-COMPRA"],
		bodies: {
			COM_CASHBACK: {
				text: "Olá {{clientName}}! 🎉 Obrigado pela sua primeira compra com a gente. Você já começou a acumular: {{purchaseCashbackAccumulated}} de cashback para usar na próxima visita. Esperamos te ver de novo em breve!",
				variables: ["clientName", "purchaseCashbackAccumulated"],
			},
			SEM_CASHBACK: {
				text: "Olá {{clientName}}! 🎉 Obrigado pela sua primeira compra com a gente. Foi um prazer te atender e esperamos te ver de novo em breve. Qualquer coisa, é só chamar por aqui!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "segunda_compra",
		nome: "recompracrm_segunda_compra",
		titulo: "Segunda compra",
		grupo: "JORNADA",
		intendedTriggers: ["QUANTIDADE-TOTAL-COMPRAS"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! Que bom ter você de volta. 💛 Nesta compra você acumulou {{purchaseCashbackAccumulated}} e seu saldo de cashback já é de {{cashbackAvailableBalance}}. Use quando quiser na sua próxima visita!",
				variables: ["clientName", "purchaseCashbackAccumulated", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}! Que bom ter você de volta. 💛 Obrigado por comprar com a gente de novo. Estamos sempre por aqui para o que você precisar!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "presente_aniversario",
		nome: "recompracrm_presente_aniversario",
		titulo: "Aniversário",
		grupo: "JORNADA",
		intendedTriggers: ["ANIVERSARIO_CLIENTE"],
		bodies: {
			COM_CASHBACK: {
				text: "Feliz aniversário, {{clientName}}! 🥳 Para comemorar, preparamos um presente: um cashback especial já está no seu saldo ({{cashbackAvailableBalance}}). Aproveite para se presentear com a gente!",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Feliz aniversário, {{clientName}}! 🥳 Desejamos um dia incrível para você. Passe na nossa loja para comemorar com a gente, vai ser um prazer te receber!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "recuperacao_clientes",
		nome: "recompracrm_recuperacao_clientes",
		titulo: "Reativação",
		grupo: "SEGMENTOS",
		intendedTriggers: ["ENTRADA-SEGMENTAÇÃO"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}, sentimos a sua falta! 💛 Você tem {{cashbackAvailableBalance}} de cashback esperando por você. Que tal usar na sua próxima compra? Estamos te esperando!",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}, sentimos a sua falta! 💛 Faz um tempo que não te vemos por aqui. Temos novidades esperando por você. Volte para a gente quando puder!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "cashback_expirando",
		nome: "recompracrm_cashback_expirando",
		titulo: "Cashback expirando",
		grupo: "CASHBACK",
		intendedTriggers: ["CASHBACK-EXPIRANDO"],
		cashbackOnly: true,
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! ⏳ Você tem {{cashbackExpiringAmount}} de cashback que expira em {{cashbackExpiringDate}}. Não deixe esse valor ir embora: passe na loja e aproveite antes do prazo!",
				variables: ["clientName", "cashbackExpiringAmount", "cashbackExpiringDate"],
			},
			SEM_CASHBACK: null,
		},
	},

	// --- Canônicos novos (um por gatilho que ainda não tinha modelo) ---
	{
		key: "pos_compra",
		nome: "recompracrm_pos_compra",
		titulo: "Pós compra",
		grupo: "JORNADA",
		intendedTriggers: ["NOVA-COMPRA"],
		bodies: {
			COM_CASHBACK: {
				text: "Obrigado pela visita, {{clientName}}! 💛 Nesta compra você acumulou {{purchaseCashbackAccumulated}} de cashback. Seu saldo agora é {{cashbackAvailableBalance}} — use quando quiser na próxima!",
				variables: ["clientName", "purchaseCashbackAccumulated", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Obrigado pela visita, {{clientName}}! 💛 Foi um prazer te atender. Qualquer coisa, é só chamar por aqui — estamos sempre à disposição.",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "marco_valor",
		nome: "recompracrm_marco_valor",
		titulo: "Marco de valor",
		grupo: "JORNADA",
		intendedTriggers: ["VALOR-TOTAL-COMPRAS"],
		bodies: {
			COM_CASHBACK: {
				text: "Parabéns, {{clientName}}! 🎉 Você atingiu um novo marco com a gente. Seu saldo de cashback está em {{cashbackAvailableBalance}} — aproveite na próxima visita!",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Parabéns, {{clientName}}! 🎉 Você atingiu um novo marco com a gente. Obrigado pela confiança — esperamos te ver em breve!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "cashback_acumulado",
		nome: "recompracrm_cashback_acumulado",
		titulo: "Cashback acumulado",
		grupo: "CASHBACK",
		intendedTriggers: ["CASHBACK-ACUMULADO"],
		cashbackOnly: true,
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! 💰 Seu cashback chegou a {{cashbackAvailableBalance}}. Que tal usar esse valor na próxima compra? Estamos te esperando!",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: null,
		},
	},
	{
		key: "pior_dia_vendas",
		nome: "recompracrm_pior_dia_vendas",
		titulo: "Dia mais fraco",
		grupo: "AGENDA",
		intendedTriggers: ["PIOR-DIA-VENDAS"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! Hoje a loja está com um ritmo especial — e você tem {{cashbackAvailableBalance}} de cashback esperando. Que tal passar por aqui?",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}! Hoje a loja está com um ritmo especial e adoramos te receber. Passe por aqui quando puder — vai ser um prazer te ver!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "promocao_produto",
		nome: "recompracrm_promocao_produto",
		titulo: "Promoção de produto",
		grupo: "AGENDA",
		intendedTriggers: ["PROMOCAO-PRODUTOS"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! Separados especialmente para você: {{promotionProductName}} por {{promotionProductPrice}}. E ainda dá para usar seu cashback ({{cashbackAvailableBalance}})!",
				variables: ["clientName", "promotionProductName", "promotionProductPrice", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}! Separados especialmente para você: {{promotionProductName}} por {{promotionProductPrice}}. Passe na loja e aproveite!",
				variables: ["clientName", "promotionProductName", "promotionProductPrice"],
			},
		},
	},
	{
		key: "recorrente_fim_de_semana",
		nome: "recompracrm_recorrente_fim_de_semana",
		titulo: "Fim de semana",
		grupo: "AGENDA",
		intendedTriggers: ["RECORRENTE"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! O fim de semana chegou 💛 Você tem {{cashbackAvailableBalance}} de cashback — que tal usar na sua próxima visita?",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}! O fim de semana chegou 💛 Estamos te esperando na loja — passa quando puder!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "recorrente_meio_semana",
		nome: "recompracrm_recorrente_meio_semana",
		titulo: "Meio de semana",
		grupo: "AGENDA",
		intendedTriggers: ["RECORRENTE"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! No meio da semana, uma pausa faz bem 💛 Você tem {{cashbackAvailableBalance}} de cashback — passa na loja quando puder!",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}! No meio da semana, uma pausa faz bem 💛 Estamos te esperando na loja — passa quando puder!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "recorrente_comeco_mes",
		nome: "recompracrm_recorrente_comeco_mes",
		titulo: "Começo do mês",
		grupo: "AGENDA",
		intendedTriggers: ["RECORRENTE"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! Começo de mês, começo renovado 💛 Seu cashback disponível é {{cashbackAvailableBalance}}. Que tal usar na próxima visita?",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}! Começo de mês, começo renovado 💛 Estamos com novidades na loja — passa quando puder!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "data_comemorativa",
		nome: "recompracrm_data_comemorativa",
		titulo: "Data comemorativa",
		grupo: "AGENDA",
		intendedTriggers: ["USO-UNICO"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! Nesta data especial, preparamos algo para você. Seu saldo de cashback é {{cashbackAvailableBalance}} — aproveite para se presentear com a gente!",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}! Nesta data especial, queremos te receber com carinho. Passe na loja e celebre conosco!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "permanencia_segmento",
		nome: "recompracrm_permanencia_segmento",
		titulo: "Ainda dá tempo",
		grupo: "SEGMENTOS",
		intendedTriggers: ["PERMANÊNCIA-SEGMENTAÇÃO"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}, ainda dá tempo! 💛 Você tem {{cashbackAvailableBalance}} de cashback disponível. Volte quando quiser — estamos te esperando.",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}, ainda dá tempo! 💛 Faz um tempo que não te vemos. Quando puder, passa aqui — será um prazer te receber de novo.",
				variables: ["clientName"],
			},
		},
	},

	// --- Pacote de calendário / ocasião (mesmo gatilho, outra intenção) ---
	{
		key: "marco_compras",
		nome: "recompracrm_marco_compras",
		titulo: "Marco de compras",
		grupo: "JORNADA",
		intendedTriggers: ["QUANTIDADE-TOTAL-COMPRAS"],
		bodies: {
			COM_CASHBACK: {
				text: "Parabéns, {{clientName}}! 🎉 Você chegou a um novo marco de compras conosco. Seu cashback está em {{cashbackAvailableBalance}} — use na próxima visita!",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Parabéns, {{clientName}}! 🎉 Você chegou a um novo marco de compras conosco. Obrigado por continuar escolhendo a gente!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "feriado",
		nome: "recompracrm_feriado",
		titulo: "Feriado",
		grupo: "AGENDA",
		intendedTriggers: ["USO-UNICO"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! Neste feriado a loja está aberta e você tem {{cashbackAvailableBalance}} de cashback esperando. Venha aproveitar!",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}! Neste feriado a loja está aberta e adoramos te receber. Passe quando puder — será um prazer!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "lancamento",
		nome: "recompracrm_lancamento",
		titulo: "Lançamento",
		grupo: "AGENDA",
		intendedTriggers: ["USO-UNICO"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! Temos novidades fresquinhas na loja ✨ E você ainda tem {{cashbackAvailableBalance}} de cashback para usar. Vem conferir!",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}! Temos novidades fresquinhas na loja ✨ Passe para conferir — queremos saber o que você acha!",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "vip_campeoes",
		nome: "recompracrm_vip_campeoes",
		titulo: "Clientes VIP",
		grupo: "SEGMENTOS",
		intendedTriggers: ["ENTRADA-SEGMENTAÇÃO"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! Você faz parte do nosso time de clientes especiais 💛 Seu cashback disponível é {{cashbackAvailableBalance}}. Obrigado por estar conosco!",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}! Você faz parte do nosso time de clientes especiais 💛 Obrigado por confiar na gente — é um prazer te atender.",
				variables: ["clientName"],
			},
		},
	},
	{
		key: "reativacao_hibernando",
		nome: "recompracrm_reativacao_hibernando",
		titulo: "Hibernando / perdidos",
		grupo: "SEGMENTOS",
		intendedTriggers: ["ENTRADA-SEGMENTAÇÃO"],
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}, faz tempo que não te vemos… 💛 Seu cashback de {{cashbackAvailableBalance}} ainda está aí. Volte antes que expire — queremos te receber de novo!",
				variables: ["clientName", "cashbackAvailableBalance"],
			},
			SEM_CASHBACK: {
				text: "Oi {{clientName}}, faz tempo que não te vemos… 💛 Sentimos sua falta de verdade. Quando puder, passa na loja — será um prazer te receber de novo!",
				variables: ["clientName"],
			},
		},
	},

	// --- Pós-compra com produto (favorito / sugerido) ---
	{
		key: "pos_compra_favorito",
		nome: "recompracrm_pos_compra_favorito",
		titulo: "Pós compra · favorito",
		grupo: "JORNADA",
		intendedTriggers: ["NOVA-COMPRA"],
		bodies: {
			COM_CASHBACK: {
				text: "Obrigado pela visita, {{clientName}}! 💛 Nesta compra você acumulou {{purchaseCashbackAccumulated}}. Da próxima, que tal levar de novo o seu {{clientFavoriteProduct}}?",
				variables: ["clientName", "purchaseCashbackAccumulated", "clientFavoriteProduct"],
			},
			SEM_CASHBACK: {
				text: "Obrigado pela visita, {{clientName}}! 💛 Da próxima, que tal levar de novo o seu {{clientFavoriteProduct}}? Estamos te esperando.",
				variables: ["clientName", "clientFavoriteProduct"],
			},
		},
	},
	{
		key: "primeira_compra_sugerido",
		nome: "recompracrm_primeira_compra_sugerido",
		titulo: "Primeira compra · sugestão",
		grupo: "JORNADA",
		intendedTriggers: ["PRIMEIRA-COMPRA"],
		bodies: {
			COM_CASHBACK: {
				text: "Olá {{clientName}}! 🎉 Obrigado pela primeira compra. Você já acumulou {{purchaseCashbackAccumulated}} de cashback. Na próxima, experimente {{clientSuggestedProduct}} — achamos que combina com você!",
				variables: ["clientName", "purchaseCashbackAccumulated", "clientSuggestedProduct"],
			},
			SEM_CASHBACK: {
				text: "Olá {{clientName}}! 🎉 Obrigado pela primeira compra. Na próxima visita, experimente {{clientSuggestedProduct}} — achamos que combina com você!",
				variables: ["clientName", "clientSuggestedProduct"],
			},
		},
	},
];

export const MESSAGE_TEMPLATE_LIBRARY_BY_KEY = new Map(MESSAGE_TEMPLATE_LIBRARY.map((template) => [template.key, template]));

/** Subset do catálogo usado pelo seeder de onboarding (5 keys). */
export const ONBOARDING_MESSAGE_TEMPLATES = MESSAGE_TEMPLATE_LIBRARY.filter((definition): definition is TOnboardingMessageTemplateDefinition =>
	(ONBOARDING_MESSAGE_TEMPLATE_KEYS as readonly string[]).includes(definition.key),
);

export const ONBOARDING_MESSAGE_TEMPLATES_BY_KEY = new Map(ONBOARDING_MESSAGE_TEMPLATES.map((template) => [template.key, template]));

export function getOnboardingMessageTemplateName(key: TOnboardingMessageTemplateKey): string {
	const template = ONBOARDING_MESSAGE_TEMPLATES_BY_KEY.get(key);
	if (!template) throw new Error(`Template de onboarding desconhecido: ${key}`);
	return template.nome;
}

/** Resolves a human-readable preview of a template body for the given variant (variables → examples). */
export function getOnboardingTemplatePreview(key: TOnboardingMessageTemplateKey, variant: TOnboardingTemplateVariant): string | null {
	const body = ONBOARDING_MESSAGE_TEMPLATES_BY_KEY.get(key)?.bodies[variant];
	if (!body) return null;
	return body.variables.reduce((text, variable) => text.replaceAll(`{{${variable}}}`, getDefaultMessageTemplateVariableExample(variable)), body.text);
}

/**
 * Modelos disponíveis para clonar, já resolvidos na variante da organização.
 * `cashbackOnly` some quando a organização não roda cashback — o corpo simplesmente não existe.
 */
export function getMessageTemplateLibraryEntries(variant: TOnboardingTemplateVariant) {
	return MESSAGE_TEMPLATE_LIBRARY.flatMap((definition) => {
		const body = definition.bodies[variant];
		if (!body) return [];
		return [
			{
				key: definition.key,
				nome: definition.nome,
				titulo: definition.titulo,
				grupo: definition.grupo,
				intendedTriggers: definition.intendedTriggers,
				variables: body.variables,
				conteudo: buildMessageTemplateLibraryContent(body),
			},
		];
	});
}

/**
 * `messageTemplates` tem índice único em (organizacaoId, nome), e as organizações que passaram
 * pelo onboarding JÁ possuem os nomes do catálogo. Clonar precisa, portanto, de um nome livre:
 * sufixamos com `_copia`, depois `_copia_2`, `_copia_3`… até achar um que não colida.
 */
export function buildClonedMessageTemplateName(baseName: string, existingNames: Iterable<string>): string {
	const taken = new Set(Array.from(existingNames, (name) => name.toLowerCase()));
	if (!taken.has(baseName.toLowerCase())) return baseName;

	const firstCandidate = `${baseName}_copia`;
	if (!taken.has(firstCandidate.toLowerCase())) return firstCandidate;

	for (let suffix = 2; suffix < 1000; suffix++) {
		const candidate = `${baseName}_copia_${suffix}`;
		if (!taken.has(candidate.toLowerCase())) return candidate;
	}
	return `${baseName}_copia_${Date.now()}`;
}
