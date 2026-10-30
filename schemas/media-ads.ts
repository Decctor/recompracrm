import { z } from "zod";
import { MediaAdMediaTypeEnum, MediaAdPlatformEnum } from "./enums";

export type { TMediaAdMediaTypeEnum, TMediaAdPlatformEnum } from "./enums";

/** Quantos nomes antigos guardar por nível. Renomear não pode desligar UTMs gravadas com o nome velho. */
export const MEDIA_AD_NAME_HISTORY_LIMIT = 20;

export const MediaAdNameHistorySchema = z.object({
	anuncio: z.array(z.string({ invalid_type_error: "Tipo não válido para o nome anterior do anúncio." })).optional(),
	conjunto: z.array(z.string({ invalid_type_error: "Tipo não válido para o nome anterior do conjunto." })).optional(),
	campanha: z.array(z.string({ invalid_type_error: "Tipo não válido para o nome anterior da campanha." })).optional(),
});
export type TMediaAdNameHistory = z.infer<typeof MediaAdNameHistorySchema>;

/** Cartão de um carrossel. As imagens são da Meta e podem expirar; a capa do anúncio é a que fica no nosso storage. */
export const MediaAdCardSchema = z.object({
	imagemUrl: z.string({ invalid_type_error: "Tipo não válido para a imagem do cartão." }).nullable(),
	videoId: z.string({ invalid_type_error: "Tipo não válido para o vídeo do cartão." }).nullable(),
	titulo: z.string({ invalid_type_error: "Tipo não válido para o título do cartão." }).nullable(),
	descricao: z.string({ invalid_type_error: "Tipo não válido para a descrição do cartão." }).nullable(),
	link: z.string({ invalid_type_error: "Tipo não válido para o link do cartão." }).nullable(),
	cta: z.string({ invalid_type_error: "Tipo não válido para a chamada do cartão." }).nullable(),
});
export type TMediaAdCard = z.infer<typeof MediaAdCardSchema>;

/**
 * Anúncio do catálogo de mídia paga. Espelha a linha de `media_ads` (sem os campos de controle da
 * sincronização), no formato que as rotas devolvem.
 */
export const MediaAdSchema = z.object({
	id: z.string({ required_error: "ID do anúncio não informado.", invalid_type_error: "Tipo não válido para o ID do anúncio." }),
	integracaoId: z.string({ required_error: "Integração não informada.", invalid_type_error: "Tipo não válido para a integração." }),
	plataforma: MediaAdPlatformEnum,
	contaExternaId: z.string({ required_error: "Conta de anúncios não informada.", invalid_type_error: "Tipo não válido para a conta de anúncios." }),
	campanhaId: z.string({ invalid_type_error: "Tipo não válido para o ID da campanha." }).nullable(),
	campanhaNome: z.string({ invalid_type_error: "Tipo não válido para o nome da campanha." }).nullable(),
	campanhaObjetivo: z.string({ invalid_type_error: "Tipo não válido para o objetivo da campanha." }).nullable(),
	campanhaStatus: z.string({ invalid_type_error: "Tipo não válido para o status da campanha." }).nullable(),
	conjuntoId: z.string({ invalid_type_error: "Tipo não válido para o ID do conjunto." }).nullable(),
	conjuntoNome: z.string({ invalid_type_error: "Tipo não válido para o nome do conjunto." }).nullable(),
	conjuntoStatus: z.string({ invalid_type_error: "Tipo não válido para o status do conjunto." }).nullable(),
	anuncioId: z.string({ required_error: "ID do anúncio na plataforma não informado.", invalid_type_error: "Tipo não válido para o ID do anúncio." }),
	anuncioNome: z.string({ required_error: "Nome do anúncio não informado.", invalid_type_error: "Tipo não válido para o nome do anúncio." }),
	status: z.string({ invalid_type_error: "Tipo não válido para o status do anúncio." }).nullable(),
	statusConfigurado: z.string({ invalid_type_error: "Tipo não válido para o status configurado do anúncio." }).nullable(),
	criativoId: z.string({ invalid_type_error: "Tipo não válido para o criativo." }).nullable(),
	titulo: z.string({ invalid_type_error: "Tipo não válido para o título do anúncio." }).nullable(),
	corpo: z.string({ invalid_type_error: "Tipo não válido para o texto do anúncio." }).nullable(),
	tipoMidia: MediaAdMediaTypeEnum,
	cartoes: z.array(MediaAdCardSchema),
	videoId: z.string({ invalid_type_error: "Tipo não válido para o vídeo do anúncio." }).nullable(),
	cta: z.string({ invalid_type_error: "Tipo não válido para a chamada do anúncio." }).nullable(),
	urlDestino: z.string({ invalid_type_error: "Tipo não válido para a URL de destino." }).nullable(),
	permalink: z.string({ invalid_type_error: "Tipo não válido para o link da publicação." }).nullable(),
	urlTags: z.string({ invalid_type_error: "Tipo não válido para os parâmetros de URL." }).nullable(),
	capaUrl: z.string({ invalid_type_error: "Tipo não válido para a capa." }).nullable(),
	criadoNaPlataformaEm: z
		.string({ invalid_type_error: "Tipo não válido para a data de criação na plataforma." })
		.datetime()
		.transform((val) => new Date(val))
		.nullable(),
	atualizadoNaPlataformaEm: z
		.string({ invalid_type_error: "Tipo não válido para a data de atualização na plataforma." })
		.datetime()
		.transform((val) => new Date(val))
		.nullable(),
	sincronizadoEm: z
		.string({ required_error: "Data de sincronização não informada.", invalid_type_error: "Tipo não válido para a data de sincronização." })
		.datetime()
		.transform((val) => new Date(val)),
	removidoEm: z
		.string({ invalid_type_error: "Tipo não válido para a data de remoção." })
		.datetime()
		.transform((val) => new Date(val))
		.nullable(),
});
export type TMediaAd = z.infer<typeof MediaAdSchema>;

/** Estado da sincronização do catálogo, guardado em `configuracao.catalogo` da integração. */
export const MediaAdsCatalogSyncStateSchema = z.object({
	ultimaCompletaEm: z.string({ invalid_type_error: "Tipo não válido para a última sincronização completa." }).datetime().nullable(),
	ultimaTentativaEm: z.string({ invalid_type_error: "Tipo não válido para a última tentativa de sincronização." }).datetime().nullable(),
	anuncios: z.number({ invalid_type_error: "Tipo não válido para a quantidade de anúncios." }),
	truncado: z.boolean({ invalid_type_error: "Tipo não válido para o indicador de catálogo truncado." }),
});
export type TMediaAdsCatalogSyncState = z.infer<typeof MediaAdsCatalogSyncStateSchema>;
