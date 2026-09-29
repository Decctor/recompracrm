import { z } from "zod";
import { ClientDuplicateSignalTypeEnum, ClientTagIconEnum, FiscalClientTaxIndicatorEnum } from "./enums";
import type { TSale } from "./sales";

export const ClientTagMetadataSchema = z.discriminatedUnion("tipo", [
	z.object({
		tipo: z.literal("MANUAL"),
		descricao: z.string().max(255).nullable().optional(),
	}),
]);
export type TClientTagMetadata = z.infer<typeof ClientTagMetadataSchema>;
export const ClientTagSchema = z.object({
	organizacaoId: z.string({
		invalid_type_error: "Tipo não válido para ID da organização.",
		required_error: "ID da organização não informado.",
	}),
	titulo: z
		.string({
			required_error: "Título do tag não informado.",
			invalid_type_error: "Tipo não válido para o título do tag.",
		})
		.min(1)
		.max(50),
	tituloNormalizado: z
		.string({
			required_error: "Título normalizado do tag não informado.",
			invalid_type_error: "Tipo não válido para o título normalizado do tag.",
		})
		.min(1)
		.max(80),
	icone: ClientTagIconEnum.default("Tag"),
	cor: z
		.string({
			required_error: "Cor do tag não informada.",
			invalid_type_error: "Tipo não válido para a cor do tag.",
		})
		.max(15),
	corForeground: z
		.string({
			required_error: "Cor do tag não informada.",
			invalid_type_error: "Tipo não válido para a cor do tag.",
		})
		.max(15),
	metadados: ClientTagMetadataSchema.default({ tipo: "MANUAL" }),
	autorId: z.string({
		required_error: "ID do autor do tag não informado.",
		invalid_type_error: "Tipo não válido para o ID do autor do tag.",
	}),
	dataInsercao: z
		.date({
			required_error: "Data de inserção do tag não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção do tag.",
		})
		.optional(),
});

export const ClientTagReferenceSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para ID do cliente.",
	}),
	clienteTagId: z.string({
		required_error: "ID do tag não informado.",
		invalid_type_error: "Tipo não válido para ID do tag.",
	}),
});

export const ClientSchema = z.object({
	idExterno: z.string({ invalid_type_error: "Tipo não válido para ID externo." }).optional().nullable(),
	organizacaoId: z.string({ invalid_type_error: "Tipo não válido para ID da organização." }),
	nome: z.string({
		required_error: "Nome do cliente não informado.",
		invalid_type_error: "Tipo não válido para o nome do cliente.",
	}),
	cpfCnpj: z.string({ invalid_type_error: "Tipo não válido para CPF/CNPJ." }).optional().nullable(),
	anotacoes: z.string({ invalid_type_error: "Tipo nao valido para anotacoes." }).optional().nullable(),
	inscricaoEstadual: z.string({ invalid_type_error: "Tipo nao valido para inscricao estadual." }).optional().nullable(),
	indicadorInscricaoEstadual: FiscalClientTaxIndicatorEnum.default("NAO_CONTRIBUINTE"),
	suframa: z.string({ invalid_type_error: "Tipo nao valido para SUFRAMA." }).optional().nullable(),
	// Communication
	telefone: z.string({ invalid_type_error: "Tipo não válido para telefone." }).optional().nullable(),
	telefoneBase: z.string({ invalid_type_error: "Tipo não válido para telefone base." }),
	email: z.string({ invalid_type_error: "Tipo não válido para email." }).optional().nullable(),
	// Socials
	websiteUrl: z.string({ invalid_type_error: "Tipo nao valido para website." }).optional().nullable(),
	instagram: z.string({ invalid_type_error: "Tipo nao valido para Instagram." }).optional().nullable(),
	linkedin: z.string({ invalid_type_error: "Tipo nao valido para LinkedIn." }).optional().nullable(),
	twitter: z.string({ invalid_type_error: "Tipo nao valido para X/Twitter." }).optional().nullable(),
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
	primeiraCompraId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da primeira compra.",
		})
		.optional()
		.nullable(),
	ultimaCompraData: z
		.date({
			invalid_type_error: "Tipo não válido para data da ultima compra.",
		})
		.optional()
		.nullable(),
	ultimaCompraId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da ultima compra.",
		})
		.optional()
		.nullable(),
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

	// Consentimento explícito de marketing (LGPD): a DATA do aceite, nunca um booleano — é ela
	// que serve de prova. Null = nunca consentiu. Sempre opcional na entrada: nenhum cadastro é
	// bloqueado por falta de consentimento, e nenhuma superfície pode exigi-lo.
	consentimentoMarketingData: z
		.string({
			invalid_type_error: "Tipo não válido para a data de consentimento de marketing.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),

	// Autoria do cadastro: sempre resolvida no servidor (sessão / operador / pipeline),
	// nunca aceita diretamente do payload — exceto autorVendedorId nos fluxos de venda e POI,
	// onde é validada contra a organização antes de persistir.
	autorId: z.string({ invalid_type_error: "Tipo não válido para o ID do autor." }).optional().nullable(),
	autorVendedorId: z.string({ invalid_type_error: "Tipo não válido para o ID do vendedor autor." }).optional().nullable(),
	dataNascimento: z
		.string({
			invalid_type_error: "Tipo não válido para data de nascimento.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	dataFundacao: z
		.string({
			invalid_type_error: "Tipo nao valido para data de fundacao.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	profissao: z.string({ invalid_type_error: "Tipo nao valido para profissao." }).optional().nullable(),
	ondeTrabalha: z.string({ invalid_type_error: "Tipo nao valido para local de trabalho." }).optional().nullable(),
	estadoCivil: z.string({ invalid_type_error: "Tipo nao valido para estado civil." }).optional().nullable(),
	deficiencia: z.string({ invalid_type_error: "Tipo nao valido para deficiencia." }).optional().nullable(),
	dataSincronizacaoExterna: z
		.string({
			invalid_type_error: "Tipo nao valido para data de sincronizacao externa.",
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
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null))
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

// O cupom de entrega imprime rua/número/bairro/cidade, nunca o título: um endereço cadastrado só
// com título sai em branco na mão do entregador. A regra vale para endereços NOVOS — os antigos sem
// rua continuam editáveis, senão o cadastro do cliente travaria até alguém corrigi-los.
export const CLIENT_LOCATION_STREET_REQUIRED_MESSAGE = "Informe o logradouro da localização.";
export function hasClientLocationStreet(location: { localizacaoLogradouro?: string | null }) {
	return Boolean(location.localizacaoLogradouro?.trim());
}

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
	cpfCnpj: z
		.string({ invalid_type_error: "CPF/CNPJ deve ser um texto." })
		.optional()
		.nullable()
		.transform((val) => val?.replace(/\D/g, "") || null),
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

// ─── Reconciliação de clientes duplicados ────────────────────────────────────
// Enums em /schemas/enums.ts (ClientDuplicateSignalTypeEnum, ClientDuplicateStatusEnum).

export const ClientDuplicateReasonSchema = z.object({
	tipo: ClientDuplicateSignalTypeEnum,
	valor: z.string({ invalid_type_error: "Tipo não válido para o valor do sinal de duplicidade." }),
});
export type TClientDuplicateReason = z.infer<typeof ClientDuplicateReasonSchema>;

// Escolha explícita por campo quando keeper e origem conflitam na UI de mesclagem.
export const ClientMergeFieldChoicesSchema = z.record(z.enum(["keeper", "source"]));
export type TClientMergeFieldChoices = z.infer<typeof ClientMergeFieldChoicesSchema>;
