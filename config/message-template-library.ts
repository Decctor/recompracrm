import { getDefaultMessageTemplateVariableExample, type TMessageTemplateNativeVariableId } from "@/lib/message-templates/variables";
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
 */
export type TOnboardingTemplateVariant = "COM_CASHBACK" | "SEM_CASHBACK";

export type TOnboardingMessageTemplateKey =
	| "primeira_compra"
	| "segunda_compra"
	| "presente_aniversario"
	| "recuperacao_clientes"
	| "cashback_expirando";

export type TMessageTemplateLibraryBody = { text: string; variables: TMessageTemplateNativeVariableId[] };

export type TOnboardingMessageTemplateDefinition = {
	key: TOnboardingMessageTemplateKey;
	nome: string;
	/** Rótulo curto para a UI da biblioteca (o `nome` é o identificador técnico na Meta). */
	titulo: string;
	/** When true, the template only exists in the cashback-aware variant (no SEM_CASHBACK copy). */
	cashbackOnly?: boolean;
	bodies: Record<TOnboardingTemplateVariant, TMessageTemplateLibraryBody | null>;
};

export const MESSAGE_TEMPLATE_LIBRARY_FOOTER = "Responda esta mensagem se quiser falar com a nossa equipe.";

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

export const ONBOARDING_MESSAGE_TEMPLATES: TOnboardingMessageTemplateDefinition[] = [
	{
		key: "primeira_compra",
		nome: "recompracrm_primeira_compra",
		titulo: "Pós primeira compra",
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
		cashbackOnly: true,
		bodies: {
			COM_CASHBACK: {
				text: "Oi {{clientName}}! ⏳ Você tem {{cashbackExpiringAmount}} de cashback que expira em {{cashbackExpiringDate}}. Não deixe esse valor ir embora: passe na loja e aproveite antes do prazo!",
				variables: ["clientName", "cashbackExpiringAmount", "cashbackExpiringDate"],
			},
			SEM_CASHBACK: null,
		},
	},
];

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
	return ONBOARDING_MESSAGE_TEMPLATES.flatMap((definition) => {
		const body = definition.bodies[variant];
		if (!body) return [];
		return [
			{
				key: definition.key,
				nome: definition.nome,
				titulo: definition.titulo,
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
