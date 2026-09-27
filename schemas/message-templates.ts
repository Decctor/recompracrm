import z from "zod";
import { MessageTemplatePhoneQualityEnum, MessageTemplatePhoneStatusEnum } from "./enums";

export const MessageTemplateStatusEnum = z.enum(["RASCUNHO", "ATIVO", "ARQUIVADO"]);
export const MessageTemplateCategoryEnum = z.enum(["AUTENTICAÇÃO", "MARKETING", "UTILIDADE"]);
export const MessageTemplateButtonPresetEnum = z.enum(["CLIENT_POI_PROFILE"]);
export const MessageTemplateDynamicHeaderPresetEnum = z.enum(["CASHBACK_AVAILABLE_BALANCE"]);

export const MessageTemplateContentSchema = z.object({
	// Email only
	assunto: z.string({
		required_error: "Assunto não informado.",
		invalid_type_error: "Tipo não válido para o assunto.",
	}),
	preheader: z.string({
		required_error: "Preheader não informado.",
		invalid_type_error: "Tipo não válido para o preheader.",
	}),

	cabecalho: z
		.object({
			tipo: z.enum(["NENHUM", "TEXTO", "IMAGEM", "VIDEO", "DOCUMENTO", "IMAGEM_DINAMICA", "LOCALIZAÇÃO"], {
				required_error: "Tipo de cabeçalho não informado.",
				invalid_type_error: "Tipo não válido para o tipo de cabeçalho.",
			}),
			imagemDinamicaPreset: MessageTemplateDynamicHeaderPresetEnum.optional().nullable(),
			// Applicable to "TEXTO" type
			conteudoTexto: z
				.string({
					required_error: "Conteúdo do cabeçalho não informado.",
					invalid_type_error: "Tipo não válido para o conteúdo do cabeçalho.",
				})
				.optional()
				.nullable(),

			// Applicable to "IMAGEM", "VIDEO" and "DOCUMENTO" types
			conteudoMidiaUrl: z
				.string({
					required_error: "URL do conteúdo do cabeçalho não informada.",
					invalid_type_error: "Tipo não válido para a URL do conteúdo do cabeçalho.",
				})
				.optional()
				.nullable(),
			conteudoMidiaHandle: z
				.string({
					required_error: "Handle do cabeçalho não informado.",
					invalid_type_error: "Tipo não válido para o handle do cabeçalho.",
				})
				.optional()
				.nullable(),

			// Applicable to "LOCALIZAÇÃO" type
			conteudoLocalizacao: z
				.object({
					titulo: z.string({
						required_error: "Título do cabeçalho não informado.",
						invalid_type_error: "Tipo não válido para o título do cabeçalho.",
					}),
					endereco: z.string({
						required_error: "Endereço do cabeçalho não informado.",
						invalid_type_error: "Tipo não válido para o endereço do cabeçalho.",
					}),
					latitude: z.number({
						required_error: "Latitude do cabeçalho não informada.",
						invalid_type_error: "Tipo não válido para a latitude do cabeçalho.",
					}),
					longitude: z.number({
						required_error: "Longitude do cabeçalho não informada.",
						invalid_type_error: "Tipo não válido para a longitude do cabeçalho.",
					}),
				})
				.optional()
				.nullable(),
		})
		.optional()
		.nullable(),
	corpo: z.object({
		conteudo: z.string({
			required_error: "Conteúdo do corpo não informado.",
			invalid_type_error: "Tipo não válido para o conteúdo do corpo.",
		}),
		parametros: z.array(
			z.object({
				identificadorInterno: z
					.string({
						required_error: "Identificador interno do parâmetro não informado.",
						invalid_type_error: "Tipo não válido para o identificador interno do parâmetro.",
					})
					.describe("Identificador da variável no sistema."),
				identificadorExterno: z
					.string({
						required_error: "Identificador externo do parâmetro não informado.",
						invalid_type_error: "Tipo não válido para o identificador externo do parâmetro.",
					})
					.optional()
					.nullable()
					.describe("Identificador da variável na plataforma de integração (Whatsapp)."),
				exemplo: z.string({
					required_error: "Exemplo do parâmetro não informado.",
					invalid_type_error: "Tipo não válido para o exemplo do parâmetro.",
				}),
			}),
		),
	}),
	rodape: z
		.string({
			required_error: "Rodapé não informado.",
			invalid_type_error: "Tipo não válido para o rodapé.",
		})
		.optional()
		.nullable(),
	botoes: z.array(
		z.discriminatedUnion("tipo", [
			z.object({
				tipo: z.literal("URL", {
					required_error: "Tipo de botão não informado.",
					invalid_type_error: "Tipo não válido para o tipo de botão.",
				}),
				texto: z.string({
					required_error: "Texto do botão não informado.",
					invalid_type_error: "Tipo não válido para o texto do botão.",
				}),
				url: z.string({
					required_error: "URL do botão não informada.",
					invalid_type_error: "Tipo não válido para a URL do botão.",
				}),
			}),
			z.object({
				tipo: z.literal("URL_PRESET", {
					required_error: "Tipo de botão não informado.",
					invalid_type_error: "Tipo não válido para o tipo de botão.",
				}),
				preset: MessageTemplateButtonPresetEnum,
				texto: z.string({
					required_error: "Texto do botão não informado.",
					invalid_type_error: "Tipo não válido para o texto do botão.",
				}),
				exemplo: z.string({
					required_error: "Exemplo do parâmetro do botão não informado.",
					invalid_type_error: "Tipo não válido para o exemplo do parâmetro do botão.",
				}),
			}),
			z.object({
				tipo: z.literal("RESPOSTA RÁPIDA", {
					required_error: "Tipo de botão não informado.",
					invalid_type_error: "Tipo não válido para o tipo de botão.",
				}),
				texto: z.string({
					required_error: "Texto do botão não informado.",
					invalid_type_error: "Tipo não válido para o texto do botão.",
				}),
			}),
			// Botão de pesquisa: uma resposta rápida que a plataforma entende. O toque do cliente grava
			// `opcaoValor` no campo personalizado `campoId` (docs/dev-planning/survey-campaigns-plan.md §2.3).
			// Para a Meta é um QUICK_REPLY comum; o vínculo com o campo fica só aqui.
			z.object({
				tipo: z.literal("RESPOSTA_PESQUISA", {
					required_error: "Tipo de botão não informado.",
					invalid_type_error: "Tipo não válido para o tipo de botão.",
				}),
				texto: z.string({
					required_error: "Texto do botão não informado.",
					invalid_type_error: "Tipo não válido para o texto do botão.",
				}),
				campoId: z.string({
					required_error: "Campo personalizado do botão de pesquisa não informado.",
					invalid_type_error: "Tipo não válido para o campo personalizado do botão de pesquisa.",
				}),
				opcaoValor: z.string({
					required_error: "Opção do botão de pesquisa não informada.",
					invalid_type_error: "Tipo não válido para a opção do botão de pesquisa.",
				}),
			}),
			z.object({
				tipo: z.literal("TELEFONE", {
					required_error: "Tipo de botão não informado.",
					invalid_type_error: "Tipo não válido para o tipo de botão.",
				}),
				texto: z.string({
					required_error: "Texto do botão não informado.",
					invalid_type_error: "Tipo não válido para o texto do botão.",
				}),
				telefone: z.string({
					required_error: "Telefone do botão não informado.",
					invalid_type_error: "Tipo não válido para o telefone do botão.",
				}),
			}),
		]),
	),
});
export type TMessageTemplateContent = z.infer<typeof MessageTemplateContentSchema>;
export const MessageTemplateMetadataSchema = z.object({
	porNumeroTelefone: z.record(
		z.string({
			required_error: "ID da integração não informado.",
			invalid_type_error: "Tipo não válido para o ID da integração.",
		}),
		z.object({
			idExterno: z.string({
				required_error: "ID externo do template não informado.",
				invalid_type_error: "Tipo não válido para o ID externo do template.",
			}),
			status: MessageTemplatePhoneStatusEnum,
			qualidade: MessageTemplatePhoneQualityEnum,
		}),
	),
});
export type TMessageTemplateMetadata = z.infer<typeof MessageTemplateMetadataSchema>;
export const MessageTemplateSchema = z.object({
	nome: z.string({ invalid_type_error: "Tipo inválido para nome." }),
	status: MessageTemplateStatusEnum,
	alerta: z.string({ invalid_type_error: "Tipo inválido para alerta." }).optional().nullable(),
	metadados: MessageTemplateMetadataSchema,
	conteudo: MessageTemplateContentSchema,
	linguagem: z.string({ invalid_type_error: "Tipo inválido para linguagem." }),
	categoria: MessageTemplateCategoryEnum,
	dataInsercao: z
		.string({ invalid_type_error: "Tipo inválido para data de inserção." })
		.datetime({ message: "Formato inválido para data de inserção." })
		.transform((val) => new Date(val)),
	autorId: z.string({ invalid_type_error: "Tipo inválido para ID do autor." }),
});
