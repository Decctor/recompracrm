import { z } from "zod";
import {
	AccountingEntryOriginTypeEnum,
	BankAccountTypeEnum,
	FinancialAccountTypeEnum,
	FinancialTransactionTypeEnum,
	FiscalDocumentStatusEnum,
	FiscalDocumentTypeEnum,
	StockMovementTypeEnum,
} from "./enums";

// ============================================================================
// ACCOUNTS CHARTS (Plano de Contas)
// ============================================================================

export const AccountChartSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	nome: z.string({
		required_error: "Nome da conta contábil não informado.",
		invalid_type_error: "Tipo não válido para o nome da conta contábil.",
	}),
	codigo: z
		.string({ invalid_type_error: "Tipo não válido para o código da conta contábil." })
		.optional()
		.nullable(),
	idContaPai: z
		.string({ invalid_type_error: "Tipo não válido para o ID da conta pai." })
		.optional()
		.nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TAccountChart = z.infer<typeof AccountChartSchema>;

// ============================================================================
// ACCOUNTING ENTRIES (Lançamentos Contábeis)
// ============================================================================

export const AccountingEntrySchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	vendaId: z
		.string({ invalid_type_error: "Tipo não válido para o ID da venda." })
		.optional()
		.nullable(),
	origemTipo: AccountingEntryOriginTypeEnum,
	titulo: z.string({
		required_error: "Título do lançamento contábil não informado.",
		invalid_type_error: "Tipo não válido para o título do lançamento contábil.",
	}),
	anotacoes: z
		.string({ invalid_type_error: "Tipo não válido para as anotações do lançamento contábil." })
		.optional()
		.nullable(),
	idContaDebito: z.string({
		required_error: "Conta de débito não informada.",
		invalid_type_error: "Tipo não válido para o ID da conta de débito.",
	}),
	idContaCredito: z.string({
		required_error: "Conta de crédito não informada.",
		invalid_type_error: "Tipo não válido para o ID da conta de crédito.",
	}),
	valor: z.number({
		required_error: "Valor do lançamento contábil não informado.",
		invalid_type_error: "Tipo não válido para o valor do lançamento contábil.",
	}),
	valorPrevisto: z
		.number({ invalid_type_error: "Tipo não válido para o valor previsto do lançamento contábil." })
		.optional()
		.nullable(),
	dataCompetencia: z
		.string({
			required_error: "Data de competência não informada.",
			invalid_type_error: "Tipo não válido para a data de competência.",
		})
		.datetime({ message: "Tipo não válido para a data de competência." })
		.transform((val) => new Date(val)),
	autorId: z
		.string({ invalid_type_error: "Tipo não válido para o ID do autor." })
		.optional()
		.nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TAccountingEntry = z.infer<typeof AccountingEntrySchema>;

// ============================================================================
// FINANCIAL ACCOUNTS (Contas Financeiras)
// ============================================================================

export const FinancialAccountSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	nome: z.string({
		required_error: "Nome da conta financeira não informado.",
		invalid_type_error: "Tipo não válido para o nome da conta financeira.",
	}),
	descricao: z
		.string({ invalid_type_error: "Tipo não válido para a descrição da conta financeira." })
		.optional()
		.nullable(),
	tipo: FinancialAccountTypeEnum,
	moeda: z
		.string({ invalid_type_error: "Tipo não válido para a moeda da conta financeira." })
		.default("BRL"),
	ativo: z
		.boolean({ invalid_type_error: "Tipo não válido para o status ativo da conta financeira." })
		.default(true),
	contaContabilId: z
		.string({ invalid_type_error: "Tipo não válido para o ID da conta contábil vinculada." })
		.optional()
		.nullable(),
	saldoInicial: z.number({
		required_error: "Saldo inicial não informado.",
		invalid_type_error: "Tipo não válido para o saldo inicial.",
	}).default(0),
	dataSaldoInicial: z
		.string({
			required_error: "Data do saldo inicial não informada.",
			invalid_type_error: "Tipo não válido para a data do saldo inicial.",
		})
		.datetime({ message: "Tipo não válido para a data do saldo inicial." })
		.transform((val) => new Date(val)),
	// Bank details (optional)
	codigoBanco: z
		.string({ invalid_type_error: "Tipo não válido para o código do banco." })
		.optional()
		.nullable(),
	nomeBanco: z
		.string({ invalid_type_error: "Tipo não válido para o nome do banco." })
		.optional()
		.nullable(),
	agencia: z
		.string({ invalid_type_error: "Tipo não válido para a agência." })
		.optional()
		.nullable(),
	numeroConta: z
		.string({ invalid_type_error: "Tipo não válido para o número da conta." })
		.optional()
		.nullable(),
	digitoConta: z
		.string({ invalid_type_error: "Tipo não válido para o dígito da conta." })
		.optional()
		.nullable(),
	tipoConta: BankAccountTypeEnum.optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TFinancialAccount = z.infer<typeof FinancialAccountSchema>;

// ============================================================================
// FINANCIAL TRANSACTIONS (Transações Financeiras)
// ============================================================================

export const FinancialTransactionSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	lancamentoContabilId: z.string({
		required_error: "ID do lançamento contábil não informado.",
		invalid_type_error: "Tipo não válido para o ID do lançamento contábil.",
	}),
	contaFinanceiraId: z
		.string({ invalid_type_error: "Tipo não válido para o ID da conta financeira." })
		.optional()
		.nullable(),
	titulo: z.string({
		required_error: "Título da transação financeira não informado.",
		invalid_type_error: "Tipo não válido para o título da transação financeira.",
	}),
	tipo: FinancialTransactionTypeEnum,
	valor: z.number({
		required_error: "Valor da transação financeira não informado.",
		invalid_type_error: "Tipo não válido para o valor da transação financeira.",
	}),
	metodo: z.string({
		required_error: "Método de pagamento não informado.",
		invalid_type_error: "Tipo não válido para o método de pagamento.",
	}),
	dataPrevisao: z
		.string({
			required_error: "Data de previsão não informada.",
			invalid_type_error: "Tipo não válido para a data de previsão.",
		})
		.datetime({ message: "Tipo não válido para a data de previsão." })
		.transform((val) => new Date(val)),
	dataEfetivacao: z
		.string({ invalid_type_error: "Tipo não válido para a data de efetivação." })
		.datetime({ message: "Tipo não válido para a data de efetivação." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	parcela: z
		.number({ invalid_type_error: "Tipo não válido para o número da parcela." })
		.optional()
		.nullable(),
	totalParcelas: z
		.number({ invalid_type_error: "Tipo não válido para o total de parcelas." })
		.optional()
		.nullable(),
	autorId: z
		.string({ invalid_type_error: "Tipo não válido para o ID do autor." })
		.optional()
		.nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TFinancialTransaction = z.infer<typeof FinancialTransactionSchema>;

// ============================================================================
// FISCAL DOCUMENTS (Documentos Fiscais)
// ============================================================================

export const FiscalDocumentSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	vendaId: z
		.string({ invalid_type_error: "Tipo não válido para o ID da venda." })
		.optional()
		.nullable(),
	lancamentoContabilId: z
		.string({ invalid_type_error: "Tipo não válido para o ID do lançamento contábil." })
		.optional()
		.nullable(),
	tipo: FiscalDocumentTypeEnum,
	status: FiscalDocumentStatusEnum.default("PENDENTE"),
	chaveAcesso: z
		.string({ invalid_type_error: "Tipo não válido para a chave de acesso." })
		.max(44, { message: "Chave de acesso deve ter no máximo 44 caracteres." })
		.optional()
		.nullable(),
	numero: z
		.string({ invalid_type_error: "Tipo não válido para o número do documento fiscal." })
		.optional()
		.nullable(),
	serie: z
		.string({ invalid_type_error: "Tipo não válido para a série do documento fiscal." })
		.optional()
		.nullable(),
	protocolo: z
		.string({ invalid_type_error: "Tipo não válido para o protocolo do documento fiscal." })
		.optional()
		.nullable(),
	xmlUrl: z
		.string({ invalid_type_error: "Tipo não válido para a URL do XML." })
		.optional()
		.nullable(),
	pdfUrl: z
		.string({ invalid_type_error: "Tipo não válido para a URL do PDF." })
		.optional()
		.nullable(),
	emissorReferencia: z
		.string({ invalid_type_error: "Tipo não válido para a referência do emissor." })
		.optional()
		.nullable(),
	emissorServico: z
		.string({ invalid_type_error: "Tipo não válido para o serviço emissor." })
		.optional()
		.nullable(),
	documentoOrigemId: z
		.string({ invalid_type_error: "Tipo não válido para o ID do documento de origem." })
		.optional()
		.nullable(),
	chaveAcessoReferencia: z
		.string({ invalid_type_error: "Tipo não válido para a chave de acesso de referência." })
		.max(44, { message: "Chave de acesso de referência deve ter no máximo 44 caracteres." })
		.optional()
		.nullable(),
	dataEmissao: z
		.string({ invalid_type_error: "Tipo não válido para a data de emissão." })
		.datetime({ message: "Tipo não válido para a data de emissão." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TFiscalDocument = z.infer<typeof FiscalDocumentSchema>;

// ============================================================================
// PRODUCT STOCK MOVEMENTS (Movimentações de Estoque)
// ============================================================================

export const ProductStockTransactionSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	produtoId: z
		.string({ invalid_type_error: "Tipo não válido para o ID do produto." })
		.optional()
		.nullable(),
	produtoVarianteId: z
		.string({ invalid_type_error: "Tipo não válido para o ID da variante do produto." })
		.optional()
		.nullable(),
	tipo: StockMovementTypeEnum.default("SAIDA"),
	quantidade: z.number({
		required_error: "Quantidade não informada.",
		invalid_type_error: "Tipo não válido para a quantidade.",
	}),
	motivo: z
		.string({ invalid_type_error: "Tipo não válido para o motivo da movimentação." })
		.optional()
		.nullable(),
	vendaId: z
		.string({ invalid_type_error: "Tipo não válido para o ID da venda." })
		.optional()
		.nullable(),
	vendaItemId: z
		.string({ invalid_type_error: "Tipo não válido para o ID do item de venda." })
		.optional()
		.nullable(),
	saldoAnterior: z
		.number({ invalid_type_error: "Tipo não válido para o saldo anterior." })
		.optional()
		.nullable(),
	saldoPosterior: z
		.number({ invalid_type_error: "Tipo não válido para o saldo posterior." })
		.optional()
		.nullable(),
	operadorId: z
		.string({ invalid_type_error: "Tipo não válido para o ID do operador." })
		.optional()
		.nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TProductStockTransaction = z.infer<typeof ProductStockTransactionSchema>;
