import { z } from "zod";
import {
	PurchaseCostAllocationMethodEnum,
	PurchaseCostModifierEffectEnum,
	PurchaseCostModifierKeyEnum,
	PurchaseCostModifierOriginEnum,
	PurchaseCostTreatmentEnum,
	PurchaseImportedDocumentOriginEnum,
	PurchaseStatusEnum,
} from "./enums";

export const PurchaseCostAllocationSchema = z.object({
	metodo: PurchaseCostAllocationMethodEnum,
});
export type TPurchaseCostAllocation = z.infer<typeof PurchaseCostAllocationSchema>;

export const PurchaseCostModifierSchema = z
	.object({
		chave: PurchaseCostModifierKeyEnum,
		valorCentavos: z
			.number({
				required_error: "Valor do modificador de custo não informado.",
				invalid_type_error: "Tipo não válido para o valor do modificador de custo.",
			})
			.int("O valor do modificador de custo deve ser informado em centavos inteiros.")
			.positive("O valor do modificador de custo deve ser maior que zero."),
		efeito: PurchaseCostModifierEffectEnum,
		tratamento: PurchaseCostTreatmentEnum,
		origem: PurchaseCostModifierOriginEnum,
		documentoRef: z.string({ invalid_type_error: "Tipo não válido para a referência do documento do modificador." }).optional().nullable(),
		descricao: z.string({ invalid_type_error: "Tipo não válido para a descrição do modificador de custo." }).optional().nullable(),
		rateio: PurchaseCostAllocationSchema.optional().nullable(),
	})
	.superRefine((modifier, ctx) => {
		if (modifier.chave === "OUTRO" && !modifier.descricao?.trim()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Descrição obrigatória para modificadores de custo do tipo OUTRO.",
				path: ["descricao"],
			});
		}
	});
export type TPurchaseCostModifier = z.infer<typeof PurchaseCostModifierSchema>;

export const PurchaseCostModifiersSnapshotSchema = z.object({
	versao: z.literal(1, {
		required_error: "Versão da composição de custo não informada.",
		invalid_type_error: "Tipo não válido para a versão da composição de custo.",
	}),
	modificadores: z.array(PurchaseCostModifierSchema, {
		required_error: "Lista de modificadores de custo não informada.",
		invalid_type_error: "Tipo não válido para a lista de modificadores de custo.",
	}),
});
export type TPurchaseCostModifiersSnapshot = z.infer<typeof PurchaseCostModifiersSnapshotSchema>;

export const EMPTY_PURCHASE_COST_MODIFIERS: TPurchaseCostModifiersSnapshot = { versao: 1, modificadores: [] };

export const PurchaseImportedDocumentSchema = z.object({
	referencia: z.string({
		required_error: "Referência do documento importado não informada.",
		invalid_type_error: "Tipo não válido para a referência do documento importado.",
	}),
	origem: PurchaseImportedDocumentOriginEnum,
	// Linha em `fiscal_inbound_documents` quando o documento tem chave de acesso (ADR-0002).
	documentoFiscalId: z.string({ invalid_type_error: "Tipo não válido para o ID do documento fiscal." }).optional().nullable(),
	// Arquivo no catálogo `files`. O servidor resolve por este id, conferindo a organização da linha.
	arquivoId: z.string({ invalid_type_error: "Tipo não válido para o ID do arquivo do documento importado." }).optional().nullable(),
	chaveAcesso: z.string({ invalid_type_error: "Tipo não válido para a chave de acesso do documento importado." }).optional().nullable(),
	numero: z.string({ invalid_type_error: "Tipo não válido para o número do documento importado." }).optional().nullable(),
	serie: z.string({ invalid_type_error: "Tipo não válido para a série do documento importado." }).optional().nullable(),
	dataEmissao: z.string({ invalid_type_error: "Tipo não válido para a data de emissão do documento importado." }).optional().nullable(),
	// Sem `bucket` nem `caminho`: o objeto é localizado por `arquivoId` (catálogo `files`, com
	// checagem de organização) ou, para snapshots anteriores ao backfill, por `referencia` +
	// organização da sessão (lib/purchase/imported-documents.ts). Um caminho no payload seria forjável.
	arquivo: z
		.object({
			nomeOriginal: z.string({ invalid_type_error: "Tipo não válido para o nome original do documento importado." }).optional().nullable(),
			sha256: z.string({
				required_error: "Hash do documento importado não informado.",
				invalid_type_error: "Tipo não válido para o hash do documento importado.",
			}),
			mimeType: z.string({ invalid_type_error: "Tipo não válido para o MIME do documento importado." }).optional().nullable(),
			tamanhoBytes: z.number({ invalid_type_error: "Tipo não válido para o tamanho do documento importado." }).int().nonnegative().optional().nullable(),
		})
		.optional()
		.nullable(),
	totaisOriginais: z
		.object({
			produtosCentavos: z.number({ invalid_type_error: "Tipo não válido para o total de produtos do documento." }).int().optional().nullable(),
			descontoCentavos: z.number({ invalid_type_error: "Tipo não válido para o desconto do documento." }).int().optional().nullable(),
			freteCentavos: z.number({ invalid_type_error: "Tipo não válido para o frete do documento." }).int().optional().nullable(),
			seguroCentavos: z.number({ invalid_type_error: "Tipo não válido para o seguro do documento." }).int().optional().nullable(),
			despesasAcessoriasCentavos: z
				.number({ invalid_type_error: "Tipo não válido para as despesas acessórias do documento." })
				.int()
				.optional()
				.nullable(),
			ipiCentavos: z.number({ invalid_type_error: "Tipo não válido para o IPI do documento." }).int().optional().nullable(),
			icmsStCentavos: z.number({ invalid_type_error: "Tipo não válido para o ICMS-ST do documento." }).int().optional().nullable(),
			fcpStCentavos: z.number({ invalid_type_error: "Tipo não válido para o FCP-ST do documento." }).int().optional().nullable(),
			documentoCentavos: z.number({ invalid_type_error: "Tipo não válido para o total do documento." }).int().optional().nullable(),
		})
		.optional()
		.nullable(),
});
export type TPurchaseImportedDocument = z.infer<typeof PurchaseImportedDocumentSchema>;

export const PurchaseImportedDocumentsSnapshotSchema = z.object({
	versao: z.literal(1, {
		required_error: "Versão dos documentos importados não informada.",
		invalid_type_error: "Tipo não válido para a versão dos documentos importados.",
	}),
	documentos: z.array(PurchaseImportedDocumentSchema, {
		required_error: "Lista de documentos importados não informada.",
		invalid_type_error: "Tipo não válido para a lista de documentos importados.",
	}),
});
export type TPurchaseImportedDocumentsSnapshot = z.infer<typeof PurchaseImportedDocumentsSnapshotSchema>;

export const PurchaseSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	idExterno: z.string({ invalid_type_error: "Tipo não válido para o ID externo da compra." }).optional().nullable(),
	status: PurchaseStatusEnum.default("RASCUNHO"),
	titulo: z.string({
		required_error: "Título da compra não informado.",
		invalid_type_error: "Tipo não válido para o título da compra.",
	}),
	anotacoes: z.string({ invalid_type_error: "Tipo não válido para as anotações da compra." }).optional().nullable(),
	documentosImportados: PurchaseImportedDocumentsSnapshotSchema.optional().nullable(),
	lancamentoContabilId: z.string({ invalid_type_error: "Tipo não válido para o ID do lançamento contábil." }).optional().nullable(),
	pedidoData: z
		.string({ invalid_type_error: "Tipo não válido para a data do pedido." })
		.datetime({ message: "Tipo não válido para a data do pedido." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	fornecedorId: z.string({ invalid_type_error: "Tipo não válido para o ID do fornecedor." }).optional().nullable(),
	pedidoFornecedorNome: z.string({ invalid_type_error: "Tipo não válido para o nome do fornecedor do pedido." }).optional().nullable(),
	pedidoFornecedorCnpj: z.string({ invalid_type_error: "Tipo não válido para o CNPJ do fornecedor do pedido." }).optional().nullable(),
	pedidoFornecedorTelefone: z.string({ invalid_type_error: "Tipo não válido para o telefone do fornecedor do pedido." }).optional().nullable(),
	pedidoFornecedorEmail: z.string({ invalid_type_error: "Tipo não válido para o email do fornecedor do pedido." }).optional().nullable(),
	transporteTransportadoraNome: z.string({ invalid_type_error: "Tipo não válido para o nome da transportadora." }).optional().nullable(),
	transporteTransportadoraCnpj: z.string({ invalid_type_error: "Tipo não válido para o CNPJ da transportadora." }).optional().nullable(),
	transporteTransportadoraTelefone: z.string({ invalid_type_error: "Tipo não válido para o telefone da transportadora." }).optional().nullable(),
	transporteTransportadoraEmail: z.string({ invalid_type_error: "Tipo não válido para o email da transportadora." }).optional().nullable(),
	transporteLinkRastreio: z.string({ invalid_type_error: "Tipo não válido para o link de rastreio." }).optional().nullable(),
	entregaDataEnvio: z
		.string({ invalid_type_error: "Tipo não válido para a data de envio." })
		.datetime({ message: "Tipo não válido para a data de envio." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	entregaDataRecebimentoPrevisao: z
		.string({ invalid_type_error: "Tipo não válido para a data prevista de recebimento." })
		.datetime({ message: "Tipo não válido para a data prevista de recebimento." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	entregaDataRecebimentoEfetivacao: z
		.string({ invalid_type_error: "Tipo não válido para a data de efetivação do recebimento." })
		.datetime({ message: "Tipo não válido para a data de efetivação do recebimento." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
	dataEfetivacao: z
		.string({ invalid_type_error: "Tipo não válido para a data de efetivação." })
		.datetime({ message: "Tipo não válido para a data de efetivação." })
		.nullable()
		.default(new Date().toISOString())
		.transform((val) => (val ? new Date(val) : null)),
	dataUltimaAtualizacao: z
		.string({ invalid_type_error: "Tipo não válido para a data da última atualização." })
		.datetime({ message: "Tipo não válido para a data da última atualização." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
	autorId: z.string({ invalid_type_error: "Tipo não válido para o ID do autor." }).optional().nullable(),
});
export type TPurchase = z.infer<typeof PurchaseSchema>;

export function refinePurchaseStatusAndDeliveryDate(data: { status?: unknown; entregaDataRecebimentoEfetivacao?: unknown }, ctx: z.RefinementCtx) {
	const isReceived = data.status === "RECEBIDA";
	const hasReceiptDate = !!data.entregaDataRecebimentoEfetivacao;
	if (isReceived && !hasReceiptDate) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Compras com status RECEBIDA precisam ter a data de recebimento informada.",
			path: ["entregaDataRecebimentoEfetivacao"],
		});
	}
	if (!isReceived && hasReceiptDate) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Data de recebimento só pode ser preenchida quando o status for RECEBIDA.",
			path: ["entregaDataRecebimentoEfetivacao"],
		});
	}
}

export const PurchaseItemSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	compraId: z.string({
		required_error: "ID da compra não informado.",
		invalid_type_error: "Tipo não válido para o ID da compra.",
	}),
	produtoId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo não válido para o ID do produto.",
	}),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo não válido para o ID da variante do produto." }).optional().nullable(),
	snapshotProdutoDescricao: z.string({
		required_error: "Descrição do snapshot do produto não informada.",
		invalid_type_error: "Tipo não válido para a descrição do snapshot do produto.",
	}),
	snapshotProdutoCodigo: z.string({
		required_error: "Código do snapshot do produto não informado.",
		invalid_type_error: "Tipo não válido para o código do snapshot do produto.",
	}),
	quantidade: z.number({
		required_error: "Quantidade do item da compra não informada.",
		invalid_type_error: "Tipo não válido para a quantidade do item da compra.",
	}),
	valorUnitarioBruto: z.number({
		required_error: "Valor unitário bruto não informado.",
		invalid_type_error: "Tipo não válido para o valor unitário bruto.",
	}),
	valorUnitarioLiquido: z.number({ invalid_type_error: "Tipo não válido para o valor unitário líquido." }).optional().nullable(),
	valorTotalBruto: z.number({
		required_error: "Valor total bruto não informado.",
		invalid_type_error: "Tipo não válido para o valor total bruto.",
	}),
	valorTotalLiquido: z.number({ invalid_type_error: "Tipo não válido para o valor total líquido." }).optional().nullable(),
	descontosTotal: z.number({ invalid_type_error: "Tipo não válido para o total de descontos." }).optional().nullable(),
	acrescimosTotal: z.number({ invalid_type_error: "Tipo não válido para o total de acréscimos." }).optional().nullable(),
	modificadoresCusto: PurchaseCostModifiersSnapshotSchema.optional().nullable(),
	valorTotalCusto: z.number({ invalid_type_error: "Tipo não válido para o valor total de custo." }).nonnegative().optional().nullable(),
	valorUnitarioCusto: z.number({ invalid_type_error: "Tipo não válido para o valor unitário de custo." }).nonnegative().optional().nullable(),
	externoQtde: z.number({ invalid_type_error: "Tipo não válido para a quantidade externa." }).optional().nullable(),
	externoValor: z.number({ invalid_type_error: "Tipo não válido para o valor externo." }).optional().nullable(),
	externoUnidade: z.string({ invalid_type_error: "Tipo não válido para a unidade externa." }).optional().nullable(),
	externoFatorConversao: z.number({ invalid_type_error: "Tipo não válido para o fator de conversão externo." }).optional().nullable(),
	anotacoes: z.string({ invalid_type_error: "Tipo não válido para as anotações do item da compra." }).optional().nullable(),
	documentoRef: z.string({ invalid_type_error: "Tipo não válido para a referência do documento do item." }).optional().nullable(),
	documentoItem: z
		.number({ invalid_type_error: "Tipo não válido para o número do item no documento." })
		.int("O número do item no documento deve ser inteiro.")
		.positive("O número do item no documento deve ser maior que zero.")
		.optional()
		.nullable(),
	dataValidade: z
		.string({ invalid_type_error: "Tipo não válido para a data de validade do item da compra." })
		.datetime({ message: "Tipo não válido para a data de validade do item da compra." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TPurchaseItem = z.infer<typeof PurchaseItemSchema>;
