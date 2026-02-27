import { z } from "zod";
import { SaleNatureEnum } from "./enums";
import type { TSale } from "./sales";

export const ClientSchema = z.object({
	idExterno: z.string({ invalid_type_error: "Tipo não válido para ID externo." }).optional().nullable(),
	nome: z.string({
		required_error: "Nome do cliente não informado.",
		invalid_type_error: "Tipo não válido para o nome do cliente.",
	}),
	cpfCnpj: z.string({ invalid_type_error: "Tipo não válido para CPF/CNPJ." }).optional().nullable(),
	// Communication
	telefone: z.string({ invalid_type_error: "Tipo não válido para telefone." }).optional().nullable(),
	telefoneBase: z.string({ invalid_type_error: "Tipo não válido para telefone base." }),
	email: z.string({ invalid_type_error: "Tipo não válido para email." }),
	// Clients main location
	localizacaoCep: z.string({ invalid_type_error: "Tipo não válido para CEP." }).optional().nullable(),
	localizacaoEstado: z.string({ invalid_type_error: "Tipo não válido para estado." }).optional().nullable(),
	localizacaoCidade: z.string({ invalid_type_error: "Tipo não válido para cidade." }).optional().nullable(),
	localizacaoBairro: z.string({ invalid_type_error: "Tipo não válido para bairro." }).optional().nullable(),
	localizacaoLogradouro: z.string({ invalid_type_error: "Tipo não válido para logradouro." }).optional().nullable(),
	localizacaoNumero: z.string({ invalid_type_error: "Tipo não válido para número." }).optional().nullable(),
	localizacaoComplemento: z.string({ invalid_type_error: "Tipo não válido para complemento." }).optional().nullable(),
	// Others
	canalAquisicao: z.string({ invalid_type_error: "Tipo não válido para canal de aquisição." }).optional().nullable(),
	primeiraCompraData: z
		.date({
			invalid_type_error: "Tipo não válido para data da primeira compra.",
		})
		.optional()
		.nullable(),
	primeiraCompraId: z.string({
		invalid_type_error: "Tipo não válido para ID da primeira compra.",
	}),
	ultimaCompraData: z
		.date({
			invalid_type_error: "Tipo não válido para data da ultima compra.",
		})
		.optional()
		.nullable(),
	ultimaCompraId: z.string({
		invalid_type_error: "Tipo não válido para ID da ultima compra.",
	}),
	analiseRFMTitulo: z
		.string({
			invalid_type_error: "Tipo não válido para título RFM.",
		})
		.optional()
		.nullable(),
	analiseRFMNotasRecencia: z
		.string({
			invalid_type_error: "Tipo não válido para notas de recência.",
		})
		.optional()
		.nullable(),
	analiseRFMNotasFrequencia: z
		.string({
			invalid_type_error: "Tipo não válido para notas de frequência.",
		})
		.optional()
		.nullable(),
	analiseRFMNotasMonetario: z
		.string({
			invalid_type_error: "Tipo não válido para notas monetárias.",
		})
		.optional()
		.nullable(),
	analiseRFMUltimaAtualizacao: z
		.date({
			invalid_type_error: "Tipo não válido para data de atualização.",
		})
		.optional()
		.nullable(),

	dataNascimento: z
		.string({
			invalid_type_error: "Tipo não válido para data de nascimento.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	dataInsercao: z
		.string({
			required_error: "Data de inserção do cliente não informada.",
			invalid_type_error: "Tipo não válido para data de inserção.",
		})
		.datetime({ message: "Tipo não válido para data de inserção." })
		.transform((val) => new Date(val))
		.default(new Date().toISOString()),
});

export const ClientLocationSchema = z.object({
	organizacaoId: z.string({ invalid_type_error: "Tipo não válido para o ID da organização." }),
	clienteId: z.string({ invalid_type_error: "Tipo não válido para o ID do cliente." }),
	titulo: z.string({
		required_error: "Título da localização não informado.",
		invalid_type_error: "Tipo não válido para o título da localização.",
	}),
	localizacaoCep: z.string({ invalid_type_error: "Tipo não válido para o CEP da localização." }).optional().nullable(),
	localizacaoEstado: z.string({ invalid_type_error: "Tipo não válido para o estado da localização." }).optional().nullable(),
	localizacaoCidade: z.string({ invalid_type_error: "Tipo não válido para a cidade da localização." }).optional().nullable(),
	localizacaoBairro: z.string({ invalid_type_error: "Tipo não válido para o bairro da localização." }).optional().nullable(),
	localizacaoLogradouro: z.string({ invalid_type_error: "Tipo não válido para o logradouro da localização." }).optional().nullable(),
	localizacaoNumero: z.string({ invalid_type_error: "Tipo não válido para o número da localização." }).optional().nullable(),
	localizacaoComplemento: z.string({ invalid_type_error: "Tipo não válido para o complemento da localização." }).optional().nullable(),
	localizacaoLatitude: z.string({ invalid_type_error: "Tipo não válido para a latitude da localização." }).optional().nullable(),
	localizacaoLongitude: z.string({ invalid_type_error: "Tipo não válido para a longitude da localização." }).optional().nullable(),
	dataInsercao: z
		.string({
			required_error: "Data de inserção da localização não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção da localização.",
		})
		.datetime({ message: "Tipo não válido para a data de inserção da localização." })
		.transform((val) => new Date(val))
		.default(new Date().toISOString()),
});

export type TClient = z.infer<typeof ClientSchema>;
export type TClientDTO = TClient & { _id: string };

export const ClientSearchQueryParams = z.object({
	page: z
		.number({
			required_error: "Parâmetro de páginação não informado.",
			invalid_type_error: "Tipo não válido para o parâmetro de páginização.",
		})
		.min(1, "Parâmetro de páginação inválido."),
	name: z.string({
		required_error: "Filtro por nome não informado.",
		invalid_type_error: "Tipo não válido para filtro por nome.",
	}),
	phone: z.string({
		invalid_type_error: "Tipo não válido para filtro por telefone.",
	}),
	acquisitionChannels: z.array(
		z.string({
			invalid_type_error: "Tipo não válido para filtro por canal de aquisição.",
		}),
	),
	rfmTitles: z.array(
		z.string({
			invalid_type_error: "Tipo não válido para filtro por título RFM.",
		}),
	),
	total: z.object({
		min: z.number({ invalid_type_error: "Tipo não válido para valor mínimo da venda." }).optional().nullable(),
		max: z.number({ invalid_type_error: "Tipo não válido para valor máximo da venda." }).optional().nullable(),
	}),
	saleNatures: z.array(
		z.enum(["SN08", "SN03", "SN11", "SN20", "SN04", "SN09", "SN02", "COND", "SN99", "SN01", "SN05"], {
			required_error: "Natureza de venda não informado.",
			invalid_type_error: "Tipo não válido para natureza de venda.",
		}),
	),
	excludedSalesIds: z.array(z.string({ required_error: "ID da venda não informado.", invalid_type_error: "Tipo não válido para o ID da venda." })),
	period: z.object({
		after: z
			.string({
				invalid_type_error: "Tipo não válido para parâmetro de período.",
			})
			.optional()
			.nullable(),
		before: z
			.string({
				invalid_type_error: "Tipo não válido para parâmetro de período.",
			})
			.optional()
			.nullable(),
	}),
});

export type TClientSearchQueryParams = z.infer<typeof ClientSearchQueryParams>;

// Bulk Import Schema - for importing clients from .xlsx or .csv files
export const BulkClientImportRowSchema = z.object({
	nome: z
		.string({
			required_error: "Nome do cliente é obrigatório.",
			invalid_type_error: "Nome do cliente deve ser um texto.",
		})
		.min(1, "Nome do cliente é obrigatório."),
	telefone: z
		.string({ invalid_type_error: "Telefone deve ser um texto." })
		.optional()
		.nullable()
		.transform((val) => val?.replace(/\D/g, "") || null),
	email: z.string({ invalid_type_error: "Email deve ser um texto." }).email("Email inválido.").optional().nullable().or(z.literal("")),
	dataNascimento: z
		.string({ invalid_type_error: "Data de nascimento deve ser um texto." })
		.optional()
		.nullable()
		.transform((val) => {
			if (!val || val.trim() === "") return null;
			const date = new Date(val);
			return Number.isNaN(date.getTime()) ? null : date;
		}),
	canalAquisicao: z.string({ invalid_type_error: "Canal de aquisição deve ser um texto." }).optional().nullable(),
	localizacaoCidade: z.string({ invalid_type_error: "Cidade deve ser um texto." }).optional().nullable(),
	localizacaoEstado: z.string({ invalid_type_error: "Estado deve ser um texto." }).optional().nullable(),
	localizacaoBairro: z.string({ invalid_type_error: "Bairro deve ser um texto." }).optional().nullable(),
	localizacaoCep: z.string({ invalid_type_error: "CEP deve ser um texto." }).optional().nullable(),
});
export type TBulkClientImportRow = z.infer<typeof BulkClientImportRowSchema>;

export const BulkClientImportInputSchema = z.object({
	clients: z.array(BulkClientImportRowSchema).min(1, "É necessário pelo menos 1 cliente para importar."),
});
export type TBulkClientImportInput = z.infer<typeof BulkClientImportInputSchema>;
