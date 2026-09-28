import { z } from "zod";

/**
 * Fundação de integrations (marketing/parceiros).
 *
 * Cada linha de `integrations` guarda uma conexão concreta com uma plataforma externa. O campo
 * `configuracao` (jsonb) é uma união discriminada por `tipo` — um schema por tipo de integração.
 * O `tipo` da configuração espelha a coluna `tipo` da linha (mantidos em sincronia pelo serviço).
 *
 * Segredos (tokens) NUNCA voltam crus ao cliente: as respostas de API passam por `maskConfig`
 * (`@/lib/integrations/mask`).
 */

export const MetaAdsIntegrationConfigSchema = z.object({
	tipo: z.literal("META_ADS"),
	accessToken: z.string({
		required_error: "Token de acesso do Meta Ads não informado.",
		invalid_type_error: "Tipo não válido para o token de acesso do Meta Ads.",
	}),
	tokenExpiresAt: z
		.string({ invalid_type_error: "Tipo não válido para a expiração do token do Meta Ads." })
		.datetime({ message: "Formato inválido para a expiração do token do Meta Ads." })
		.nullable(),
	metaUserId: z.string({
		required_error: "ID do usuário Meta não informado.",
		invalid_type_error: "Tipo não válido para o ID do usuário Meta.",
	}),
	adAccountId: z
		.string({
			required_error: "ID da conta de anúncios não informado.",
			invalid_type_error: "Tipo não válido para o ID da conta de anúncios.",
		})
		.regex(/^act_\d+$/, { message: "ID da conta de anúncios deve estar no formato act_<id>." }),
	adAccountNumericId: z.string({
		required_error: "ID numérico da conta de anúncios não informado.",
		invalid_type_error: "Tipo não válido para o ID numérico da conta de anúncios.",
	}),
	adAccountName: z.string({
		required_error: "Nome da conta de anúncios não informado.",
		invalid_type_error: "Tipo não válido para o nome da conta de anúncios.",
	}),
	currency: z.string({ invalid_type_error: "Tipo não válido para a moeda da conta de anúncios." }).optional(),
	timezoneName: z.string({ invalid_type_error: "Tipo não válido para o fuso horário da conta de anúncios." }).optional(),
	businessId: z.string({ invalid_type_error: "Tipo não válido para o ID do negócio Meta." }).optional(),
	businessName: z.string({ invalid_type_error: "Tipo não válido para o nome do negócio Meta." }).optional(),
	scopes: z.array(
		z.string({
			required_error: "Escopo do Meta Ads não informado.",
			invalid_type_error: "Tipo não válido para o escopo do Meta Ads.",
		}),
	),

	// Conversions API / Custom Audiences — preenchidos após a conexão base (Fase 2/3).
	// O Pixel/Dataset e o test event code do Events Manager vivem aqui (mesma conta de Ads).
	pixelId: z.string({ invalid_type_error: "Tipo não válido para o ID do Pixel." }).optional(),
	capiDatasetId: z.string({ invalid_type_error: "Tipo não válido para o ID do dataset do CAPI." }).optional(),
	capiTestEventCode: z.string({ invalid_type_error: "Tipo não válido para o código de teste do CAPI." }).optional(),
	// Chaves de evento (minúsculas) que disparam envio server-side ao CAPI (ex.: ["purchase"]).
	eventosCapi: z.array(z.string({ invalid_type_error: "Tipo não válido para evento do CAPI." })).optional(),
});
export type TMetaAdsIntegrationConfig = z.infer<typeof MetaAdsIntegrationConfigSchema>;

/**
 * Subconjunto editável da config Meta Ads (settings de CAPI). Tudo opcional — o PATCH aplica só o
 * que veio. Não permite mexer em token/adAccount (isso vem do fluxo OAuth).
 */
export const MetaAdsCapiConfigPatchSchema = z.object({
	pixelId: z.string({ invalid_type_error: "Tipo não válido para o ID do Pixel." }).optional().nullable(),
	capiDatasetId: z.string({ invalid_type_error: "Tipo não válido para o ID do dataset do CAPI." }).optional().nullable(),
	capiTestEventCode: z.string({ invalid_type_error: "Tipo não válido para o código de teste do CAPI." }).optional().nullable(),
	eventosCapi: z
		.array(z.string({ invalid_type_error: "Tipo não válido para evento do CAPI." }))
		.optional()
		.nullable(),
});
export type TMetaAdsCapiConfigPatch = z.infer<typeof MetaAdsCapiConfigPatchSchema>;

// ---------------------------------------------------------------------------
// Fontes de dados (ERP/marketplace) — variantes migradas de OrganizationIntegrationConfigSchema
// (schemas/organizations.ts). Shapes preservados byte a byte: o backfill copia o jsonb da org
// sem transformação e os conectores ramificam por `config.tipo` com a grafia legada (D1).
// ---------------------------------------------------------------------------

export const OnlineSoftwareIntegrationConfigSchema = z.object({
	tipo: z.literal("ONLINE-SOFTWARE"),
	token: z.string({ invalid_type_error: "Tipo não válido para o token da integração." }),
	url: z.string({ invalid_type_error: "Tipo não válido para a URL da integração." }),
});
export type TOnlineSoftwareIntegrationConfig = z.infer<typeof OnlineSoftwareIntegrationConfigSchema>;

export const CardapioWebIntegrationConfigSchema = z.object({
	tipo: z.literal("CARDAPIO-WEB"),
	merchantId: z.string({ invalid_type_error: "Tipo não válido para o ID do merchant." }),
	apiKey: z.string({ invalid_type_error: "Tipo não válido para a API Key." }),
});
export type TCardapioWebIntegrationConfig = z.infer<typeof CardapioWebIntegrationConfigSchema>;

export const NuvemshopIntegrationConfigSchema = z.object({
	tipo: z.literal("NUVEM-SHOP"),
	storeId: z.number({ invalid_type_error: "Tipo não válido para o ID da loja Nuvem Shop." }),
	accessToken: z.string({ invalid_type_error: "Tipo não válido para o token de acesso da Nuvem Shop." }),
	tokenType: z.literal("bearer", { invalid_type_error: "Tipo não válido para o tipo do token da Nuvem Shop." }),
	scope: z.array(z.string({ invalid_type_error: "Tipo não válido para o escopo da Nuvem Shop." })),
});
export type TNuvemshopIntegrationConfig = z.infer<typeof NuvemshopIntegrationConfigSchema>;

export const IfoodIntegrationConfigSchema = z.object({
	tipo: z.literal("IFOOD"),
	merchantIds: z.array(z.string({ invalid_type_error: "Tipo não válido para o ID da loja iFood." })).default([]),
	accessToken: z.string({ invalid_type_error: "Tipo não válido para o token de acesso do iFood." }),
	refreshToken: z.string({ invalid_type_error: "Tipo não válido para o token de renovação do iFood." }),
	tokenType: z.literal("bearer", { invalid_type_error: "Tipo não válido para o tipo do token do iFood." }),
	scope: z.array(z.string({ invalid_type_error: "Tipo não válido para o escopo do iFood." })),
	expiresAt: z
		.string({ invalid_type_error: "Tipo não válido para a expiração do token do iFood." })
		.datetime({ message: "Tipo não válido para a expiração do token do iFood." }),
	authorizedAt: z
		.string({ invalid_type_error: "Tipo não válido para a data de autorização do iFood." })
		.datetime({ message: "Tipo não válido para a data de autorização do iFood." })
		.optional()
		.nullable(),
	// Política operacional da conexão: aceite automático de pedidos PLACED na ingestão.
	// Manter em sincronia com IfoodConfigSchema (lib/data-connectors/ifood/types.ts), que é o
	// schema de runtime — lá o campo é obrigatório de declarar para sobreviver ao refresh de token.
	aceiteAutomaticoPedidos: z
		.boolean({ invalid_type_error: "Tipo não válido para o aceite automático de pedidos do iFood." })
		.optional()
		.default(false),
});
export type TIfoodIntegrationConfig = z.infer<typeof IfoodIntegrationConfigSchema>;

export const BlingIntegrationConfigSchema = z.object({
	tipo: z.literal("BLING"),
	accessToken: z.string({ invalid_type_error: "Tipo não válido para o token de acesso do Bling." }),
	refreshToken: z.string({ invalid_type_error: "Tipo não válido para o token de renovação do Bling." }),
	tokenType: z.string({ invalid_type_error: "Tipo não válido para o tipo do token do Bling." }).default("Bearer"),
	scope: z.array(z.string({ invalid_type_error: "Tipo não válido para o escopo do Bling." })).default([]),
	expiresAt: z
		.string({ invalid_type_error: "Tipo não válido para a expiração do token do Bling." })
		.datetime({ message: "Tipo não válido para a expiração do token do Bling." }),
	connectedAt: z
		.string({ invalid_type_error: "Tipo não válido para a data de conexão do Bling." })
		.datetime({ message: "Tipo não válido para a data de conexão do Bling." }),
});
export type TBlingIntegrationConfig = z.infer<typeof BlingIntegrationConfigSchema>;

/**
 * ERPFlex usa HTTP Basic Auth com usuário/senha de API provisionados manualmente pelo time
 * comercial deles (api@erpflex.com.br). `database` é o nome da base do cliente no ERPFlex —
 * identidade estável da conta (vira `refExterno`).
 */
export const ErpFlexIntegrationConfigSchema = z.object({
	tipo: z.literal("ERP-FLEX"),
	username: z.string({ invalid_type_error: "Tipo não válido para o usuário da API do ERPFlex." }),
	password: z.string({ invalid_type_error: "Tipo não válido para a senha da API do ERPFlex." }),
	database: z.string({ invalid_type_error: "Tipo não válido para o nome da base do ERPFlex." }),
});
export type TErpFlexIntegrationConfig = z.infer<typeof ErpFlexIntegrationConfigSchema>;

/** Origem histórica local. Não possui credenciais nem polling. */
export const PhiboIntegrationConfigSchema = z.object({
	tipo: z.literal("PHIBO"),
	modo: z.literal("HISTORICO"),
});
export type TPhiboIntegrationConfig = z.infer<typeof PhiboIntegrationConfigSchema>;

export const DataSourceIntegrationConfigSchema = z.discriminatedUnion("tipo", [
	OnlineSoftwareIntegrationConfigSchema,
	CardapioWebIntegrationConfigSchema,
	NuvemshopIntegrationConfigSchema,
	IfoodIntegrationConfigSchema,
	BlingIntegrationConfigSchema,
	ErpFlexIntegrationConfigSchema,
	PhiboIntegrationConfigSchema,
]);
export type TDataSourceIntegrationConfig = z.infer<typeof DataSourceIntegrationConfigSchema>;

export const IntegrationConfigSchema = z.discriminatedUnion("tipo", [
	MetaAdsIntegrationConfigSchema,
	// MetaCapiIntegrationConfigSchema, TrackingIntegrationConfigSchema — fases futuras.
	OnlineSoftwareIntegrationConfigSchema,
	CardapioWebIntegrationConfigSchema,
	NuvemshopIntegrationConfigSchema,
	IfoodIntegrationConfigSchema,
	BlingIntegrationConfigSchema,
	ErpFlexIntegrationConfigSchema,
	PhiboIntegrationConfigSchema,
]);
export type TIntegrationConfig = z.infer<typeof IntegrationConfigSchema>;
