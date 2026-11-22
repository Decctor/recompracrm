import z from "zod";
import { OnboardingIntentOriginEnum, OnboardingMainPainEnum, OnboardingProductEnum } from "./enums";

/**
 * Respostas que o usuário dá ao longo da jornada e que não têm entidade própria. Tudo o que
 * tem entidade (programa de cashback, campanhas, integrações, telefones) vive na sua tabela e
 * entra na prontidão derivada; aqui ficam só escolhas e intenções.
 */
export const OnboardingAnswersSchema = z.object({
	fonteDadosModo: z
		.enum(["INTEGRACAO", "POI", "DEPOIS"], { invalid_type_error: "Tipo não válido para o modo da fonte de dados." })
		.nullable()
		.default(null),
	campanhasSelecionadas: z.array(z.string({ invalid_type_error: "Tipo não válido para a chave da campanha." })).default([]),
	// Intenção explícita de liberar envios: o motor só considera a campanha quando ela está
	// pronta E o usuário a liberou. Resolver uma dependência nunca dispara envio sozinho.
	campanhasComEnvioHabilitado: z.array(z.string({ invalid_type_error: "Tipo não válido para a chave da campanha." })).default([]),
	campanhasNenhumaPorEnquanto: z.boolean({ invalid_type_error: "Tipo não válido para a escolha de campanhas." }).default(false),
	whatsappPagamentoConfirmadoPeloUsuario: z.boolean({ invalid_type_error: "Tipo não válido para a confirmação de pagamento." }).default(false),
	painelAtivacaoOcultadoEm: z.string({ invalid_type_error: "Tipo não válido para a data." }).nullable().default(null),
	erpCanalInicial: z.enum(["BALCAO", "CATALOGO", "MESAS"], { invalid_type_error: "Tipo não válido para o canal inicial." }).nullable().default(null),
	erpCanaisPretendidos: z.array(z.string({ invalid_type_error: "Tipo não válido para o canal." })).default([]),
	erpSimulacaoConcluidaEm: z.string({ required_error: "Data da prévia não informada.", invalid_type_error: "Tipo não válido para a data." }).datetime({ message: "Data da prévia inválida." }).nullable().default(null),
	// Declaração de intenção (opcional): o que mais incomoda hoje. Escolhe a campanha recomendada.
	dorPrincipal: OnboardingMainPainEnum.nullable().default(null),
	// Meta do teste aceita pela loja ("5 clientes de volta depois de uma campanha"), acompanhada no hub.
	metaTesteAceita: z.boolean({ invalid_type_error: "Tipo não válido para a meta do teste." }).default(false),
});
export type TOnboardingAnswers = z.infer<typeof OnboardingAnswersSchema>;

export const DEFAULT_ONBOARDING_ANSWERS: TOnboardingAnswers = OnboardingAnswersSchema.parse({});

export const OrganizationOnboardingSchema = z.object({
	organizacaoId: z.string({ required_error: "Organização não informada.", invalid_type_error: "Tipo não válido para a organização." }),
	produto: OnboardingProductEnum,
	origemIntencao: OnboardingIntentOriginEnum,
	etapaAtual: z.string({ required_error: "Etapa atual não informada.", invalid_type_error: "Tipo não válido para a etapa atual." }),
	etapasAdiadas: z.array(z.string({ invalid_type_error: "Tipo não válido para a etapa." })),
	etapasVisitadas: z.array(z.string({ invalid_type_error: "Tipo não válido para a etapa." })),
	respostas: OnboardingAnswersSchema,
	dataInicio: z
		.string({ invalid_type_error: "Tipo não válido para a data de início." })
		.datetime({ message: "Formato inválido para a data de início." })
		.transform((val) => new Date(val)),
	dataConclusao: z
		.string({ invalid_type_error: "Tipo não válido para a data de conclusão." })
		.datetime({ message: "Formato inválido para a data de conclusão." })
		.transform((val) => new Date(val))
		.nullable(),
	autorId: z.string({ invalid_type_error: "Tipo não válido para o autor." }).nullable(),
});
export type TOrganizationOnboarding = z.infer<typeof OrganizationOnboardingSchema>;
