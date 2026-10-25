import { z } from "zod";
import {
	AccountChartNatureEnum,
	AccountingEntryLineNatureEnum,
	AccountingEntryOriginTypeEnum,
	BankAccountTypeEnum,
	FinancialAccountTypeEnum,
	FinancialTransactionTypeEnum,
	FiscalDocumentStatusEnum,
	FiscalDocumentTypeEnum,
	PaymentMethodEnum,
	StockMovementTypeEnum,
} from "./enums";

// ============================================================================
// ACCOUNTS CHARTS (Plano de Contas)
// ============================================================================

export const AccountChartSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organizacao nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da organizacao.",
	}),
	nome: z.string({
		required_error: "Nome da conta contabil nao informado.",
		invalid_type_error: "Tipo nao valido para o nome da conta contabil.",
	}),
	codigo: z.string({ invalid_type_error: "Tipo nao valido para o codigo da conta contabil." }).optional().nullable(),
	natureza: AccountChartNatureEnum,
	idContaPai: z.string({ invalid_type_error: "Tipo nao valido para o ID da conta pai." }).optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de insercao." })
		.datetime({ message: "Tipo nao valido para a data de insercao." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TAccountChart = z.infer<typeof AccountChartSchema>;

// ============================================================================
// ACCOUNTING ENTRIES (Lancamentos Contabeis)
// ============================================================================

export const AccountingEntrySchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organizacao nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da organizacao.",
	}),
	vendaId: z.string({ invalid_type_error: "Tipo nao valido para o ID da venda." }).optional().nullable(),
	loteId: z.string({ invalid_type_error: "Tipo nao valido para o ID do lote." }).optional().nullable(),
	// Contraparte do lançamento (ADR-0002, decisão 5): quem deve ou a quem se deve. No máximo um.
	clienteId: z.string({ invalid_type_error: "Tipo nao valido para o ID do cliente." }).optional().nullable(),
	fornecedorId: z.string({ invalid_type_error: "Tipo nao valido para o ID do fornecedor." }).optional().nullable(),
	origemTipo: AccountingEntryOriginTypeEnum,
	titulo: z.string({
		required_error: "Titulo do lancamento contabil nao informado.",
		invalid_type_error: "Tipo nao valido para o titulo do lancamento contabil.",
	}),
	anotacoes: z.string({ invalid_type_error: "Tipo nao valido para as anotacoes do lancamento contabil." }).optional().nullable(),
	idContaDebito: z.string({
		required_error: "Conta de debito nao informada.",
		invalid_type_error: "Tipo nao valido para o ID da conta de debito.",
	}),
	idContaCredito: z.string({
		required_error: "Conta de credito nao informada.",
		invalid_type_error: "Tipo nao valido para o ID da conta de credito.",
	}),
	valor: z.number({
		required_error: "Valor do lancamento contabil nao informado.",
		invalid_type_error: "Tipo nao valido para o valor do lancamento contabil.",
	}),
	valorPrevisto: z.number({ invalid_type_error: "Tipo nao valido para o valor previsto do lancamento contabil." }).optional().nullable(),
	dataCompetencia: z
		.string({
			required_error: "Data de competencia nao informada.",
			invalid_type_error: "Tipo nao valido para a data de competencia.",
		})
		.datetime({ message: "Tipo nao valido para a data de competencia." })
		.transform((val) => new Date(val)),
	autorId: z.string({ invalid_type_error: "Tipo nao valido para o ID do autor." }).optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de insercao." })
		.datetime({ message: "Tipo nao valido para a data de insercao." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TAccountingEntry = z.infer<typeof AccountingEntrySchema>;

export const AccountingEntryLineSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	lancamentoContabilId: z.string({
		required_error: "ID do lançamento contábil não informado.",
		invalid_type_error: "Tipo não válido para o ID do lançamento contábil.",
	}),
	contaContabilId: z.string({
		required_error: "Conta contábil da linha não informada.",
		invalid_type_error: "Tipo não válido para a conta contábil da linha.",
	}),
	natureza: AccountingEntryLineNatureEnum,
	valor: z
		.number({
			required_error: "Valor da linha contábil não informado.",
			invalid_type_error: "Tipo não válido para o valor da linha contábil.",
		})
		.positive("O valor da linha contábil deve ser maior que zero."),
	valorPrevisto: z.number({ invalid_type_error: "Tipo não válido para o valor previsto da linha contábil." }).positive().optional().nullable(),
	descricao: z.string({ invalid_type_error: "Tipo não válido para a descrição da linha contábil." }).optional().nullable(),
	ordem: z.number({ invalid_type_error: "Tipo não válido para a ordem da linha contábil." }).int().nonnegative().default(0),
	metadados: z.record(z.unknown()).optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção da linha contábil." })
		.datetime({ message: "Tipo não válido para a data de inserção da linha contábil." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TAccountingEntryLine = z.infer<typeof AccountingEntryLineSchema>;

// ============================================================================
// FINANCIAL ACCOUNTS (Contas Financeiras)
// ============================================================================

const FinancialAccountConfigurationBankSchema = z.object({
	categoria: z.literal("BANCO"),
	tipo: BankAccountTypeEnum.optional().nullable(),
	codigo: z.string({ invalid_type_error: "Tipo não válido para o código do banco." }).optional().nullable(),
	nome: z.string({ invalid_type_error: "Tipo não válido para o nome do banco." }).optional().nullable(),
	agencia: z.string({ invalid_type_error: "Tipo não válido para a agência." }).optional().nullable(),
	contaNumero: z.string({ invalid_type_error: "Tipo não válido para o número da conta." }).optional().nullable(),
	contaDigito: z.string({ invalid_type_error: "Tipo não válido para o dígito da conta." }).optional().nullable(),
});

const FinancialAccountConfigurationCashSchema = z.object({
	categoria: z.literal("CAIXA"),
});

const FinancialAccountConfigurationDigitalWalletSchema = z.object({
	categoria: z.literal("CARTEIRA_DIGITAL"),
	integracaoAtiva: z.boolean({ invalid_type_error: "Tipo não válido para integração ativa." }).optional(),
	ultimaSincronizacao: z
		.string({ invalid_type_error: "Tipo não válido para a última sincronização." })
		.datetime({ message: "Tipo não válido para a última sincronização." })
		.optional()
		.nullable(),
});

const FinancialAccountConfigurationCreditCardSchema = z.object({
	categoria: z.literal("CARTAO_CREDITO"),
	limiteCredito: z.number({ invalid_type_error: "Tipo não válido para o limite de crédito." }).nonnegative().optional().nullable(),
	diaFechamentoFatura: z
		.number({ required_error: "Dia de fechamento da fatura não informado.", invalid_type_error: "Tipo não válido para o dia de fechamento da fatura." })
		.int()
		.min(1)
		.max(31),
	diaVencimentoFatura: z
		.number({ required_error: "Dia de vencimento da fatura não informado.", invalid_type_error: "Tipo não válido para o dia de vencimento da fatura." })
		.int()
		.min(1)
		.max(31),
	contaPagamentoPadraoId: z.string({ invalid_type_error: "Tipo não válido para a conta de pagamento padrão." }).optional().nullable(),
	taxaJurosMensal: z.number({ invalid_type_error: "Tipo não válido para a taxa de juros mensal." }).nonnegative().optional().nullable(),
	taxaMulta: z.number({ invalid_type_error: "Tipo não válido para a taxa de multa." }).nonnegative().optional().nullable(),
	taxaFixa: z.number({ invalid_type_error: "Tipo não válido para a taxa fixa." }).nonnegative().optional().nullable(),
});

const FinancialAccountConfigurationInvestmentSchema = z.object({
	categoria: z.literal("INVESTIMENTO"),
});

const FinancialAccountConfigurationOtherSchema = z.object({
	categoria: z.literal("OUTRO"),
});

export const FinancialAccountConfigurationSchema = z.discriminatedUnion("categoria", [
	FinancialAccountConfigurationBankSchema,
	FinancialAccountConfigurationCashSchema,
	FinancialAccountConfigurationDigitalWalletSchema,
	FinancialAccountConfigurationCreditCardSchema,
	FinancialAccountConfigurationInvestmentSchema,
	FinancialAccountConfigurationOtherSchema,
]);
export type TFinancialAccountConfiguration = z.infer<typeof FinancialAccountConfigurationSchema>;

export const FinancialAccountSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organizacao nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da organizacao.",
	}),
	nome: z.string({
		required_error: "Nome da conta financeira nao informado.",
		invalid_type_error: "Tipo nao valido para o nome da conta financeira.",
	}),
	descricao: z.string({ invalid_type_error: "Tipo nao valido para a descricao da conta financeira." }).optional().nullable(),
	tipo: FinancialAccountTypeEnum,
	chaveSistema: z.string({ invalid_type_error: "Tipo não válido para a chave de sistema." }).optional().nullable(),
	moeda: z.string({ invalid_type_error: "Tipo nao valido para a moeda da conta financeira." }).default("BRL"),
	ativo: z.boolean({ invalid_type_error: "Tipo nao valido para o status ativo da conta financeira." }).default(true),
	contaContabilId: z.string({ invalid_type_error: "Tipo nao valido para o ID da conta contabil vinculada." }).optional().nullable(),
	saldoInicial: z
		.number({
			required_error: "Saldo inicial nao informado.",
			invalid_type_error: "Tipo nao valido para o saldo inicial.",
		})
		.default(0),
	dataSaldoInicial: z
		.string({
			required_error: "Data do saldo inicial nao informada.",
			invalid_type_error: "Tipo nao valido para a data do saldo inicial.",
		})
		.datetime({ message: "Tipo nao valido para a data do saldo inicial." })
		.transform((val) => new Date(val)),
	configuracao: FinancialAccountConfigurationSchema,
	codigoBanco: z.string({ invalid_type_error: "Tipo nao valido para o codigo do banco." }).optional().nullable(),
	nomeBanco: z.string({ invalid_type_error: "Tipo nao valido para o nome do banco." }).optional().nullable(),
	agencia: z.string({ invalid_type_error: "Tipo nao valido para a agencia." }).optional().nullable(),
	numeroConta: z.string({ invalid_type_error: "Tipo nao valido para o numero da conta." }).optional().nullable(),
	digitoConta: z.string({ invalid_type_error: "Tipo nao valido para o digito da conta." }).optional().nullable(),
	tipoConta: BankAccountTypeEnum.optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de insercao." })
		.datetime({ message: "Tipo nao valido para a data de insercao." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TFinancialAccount = z.infer<typeof FinancialAccountSchema>;

// ============================================================================
// FINANCIAL TRANSACTIONS (Transacoes Financeiras)
// ============================================================================

export const FinancialTransactionModifierMetadataSchema = z.object({
	origem: z.string({ invalid_type_error: "Tipo nao valido para a origem dos modificadores." }).optional().nullable(),
	regra: z.string({ invalid_type_error: "Tipo nao valido para a regra dos modificadores." }).optional().nullable(),
	observacoes: z.string({ invalid_type_error: "Tipo nao valido para as observacoes dos modificadores." }).optional().nullable(),
	parametros: z.record(z.unknown()).optional().nullable(),
});
export type TFinancialTransactionModifierMetadata = z.infer<typeof FinancialTransactionModifierMetadataSchema>;

export const FinancialTransactionSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organizacao nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da organizacao.",
	}),
	lancamentoContabilId: z.string({
		required_error: "ID do lancamento contabil nao informado.",
		invalid_type_error: "Tipo nao valido para o ID do lancamento contabil.",
	}),
	contaFinanceiraId: z.string({ invalid_type_error: "Tipo nao valido para o ID da conta financeira." }).optional().nullable(),
	titulo: z.string({
		required_error: "Titulo da transacao financeira nao informado.",
		invalid_type_error: "Tipo nao valido para o titulo da transacao financeira.",
	}),
	tipo: FinancialTransactionTypeEnum,
	valor: z.number({
		required_error: "Valor da transacao financeira nao informado.",
		invalid_type_error: "Tipo nao valido para o valor da transacao financeira.",
	}),
	valorBase: z.number({ invalid_type_error: "Tipo nao valido para o valor base da transacao financeira." }).optional().nullable(),
	valorJuros: z.number({ invalid_type_error: "Tipo nao valido para os juros da transacao financeira." }).optional().nullable(),
	valorMulta: z.number({ invalid_type_error: "Tipo nao valido para a multa da transacao financeira." }).optional().nullable(),
	valorTaxas: z.number({ invalid_type_error: "Tipo nao valido para as taxas da transacao financeira." }).optional().nullable(),
	valorDesconto: z.number({ invalid_type_error: "Tipo nao valido para o desconto da transacao financeira." }).optional().nullable(),
	modificadoresMetadata: FinancialTransactionModifierMetadataSchema.optional().nullable(),
	metodo: PaymentMethodEnum,
	dataPrevisao: z
		.string({
			required_error: "Data de previsao nao informada.",
			invalid_type_error: "Tipo nao valido para a data de previsao.",
		})
		.datetime({ message: "Tipo nao valido para a data de previsao." })
		.transform((val) => new Date(val)),
	dataEfetivacao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de efetivacao." })
		.datetime({ message: "Tipo nao valido para a data de efetivacao." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	parcela: z.number({ invalid_type_error: "Tipo nao valido para o numero da parcela." }).optional().nullable(),
	totalParcelas: z.number({ invalid_type_error: "Tipo nao valido para o total de parcelas." }).optional().nullable(),
	// Anexos da parcela no catálogo `files`: boleto/guia e comprovante (ADR-0002, decisão 5).
	documentoCobrancaArquivoId: z.string({ invalid_type_error: "Tipo nao valido para o arquivo de cobranca da transacao." }).optional().nullable(),
	comprovanteArquivoId: z.string({ invalid_type_error: "Tipo nao valido para o comprovante da transacao." }).optional().nullable(),
	autorId: z.string({ invalid_type_error: "Tipo nao valido para o ID do autor." }).optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de insercao." })
		.datetime({ message: "Tipo nao valido para a data de insercao." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TFinancialTransaction = z.infer<typeof FinancialTransactionSchema>;

// ============================================================================
// FISCAL DOCUMENTS (Documentos Fiscais)
// ============================================================================

export const FiscalDocumentSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organizacao nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da organizacao.",
	}),
	compraId: z.string({ invalid_type_error: "Tipo nao valido para o ID da compra." }).optional().nullable(),
	vendaId: z.string({ invalid_type_error: "Tipo nao valido para o ID da venda." }).optional().nullable(),
	lancamentoContabilId: z.string({ invalid_type_error: "Tipo nao valido para o ID do lancamento contabil." }).optional().nullable(),
	tipo: FiscalDocumentTypeEnum,
	status: FiscalDocumentStatusEnum.default("PENDENTE"),
	chaveAcesso: z
		.string({ invalid_type_error: "Tipo nao valido para a chave de acesso." })
		.max(44, { message: "Chave de acesso deve ter no maximo 44 caracteres." })
		.optional()
		.nullable(),
	numero: z.string({ invalid_type_error: "Tipo nao valido para o numero do documento fiscal." }).optional().nullable(),
	serie: z.string({ invalid_type_error: "Tipo nao valido para a serie do documento fiscal." }).optional().nullable(),
	protocolo: z.string({ invalid_type_error: "Tipo nao valido para o protocolo do documento fiscal." }).optional().nullable(),
	xmlUrl: z.string({ invalid_type_error: "Tipo nao valido para a URL do XML." }).optional().nullable(),
	pdfUrl: z.string({ invalid_type_error: "Tipo nao valido para a URL do PDF." }).optional().nullable(),
	emissorReferencia: z.string({ invalid_type_error: "Tipo nao valido para a referencia do emissor." }).optional().nullable(),
	emissorServico: z.string({ invalid_type_error: "Tipo nao valido para o servico emissor." }).optional().nullable(),
	documentoOrigemId: z.string({ invalid_type_error: "Tipo nao valido para o ID do documento de origem." }).optional().nullable(),
	chaveAcessoReferencia: z
		.string({ invalid_type_error: "Tipo nao valido para a chave de acesso de referencia." })
		.max(44, { message: "Chave de acesso de referencia deve ter no maximo 44 caracteres." })
		.optional()
		.nullable(),
	dataEmissao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de emissao." })
		.datetime({ message: "Tipo nao valido para a data de emissao." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de insercao." })
		.datetime({ message: "Tipo nao valido para a data de insercao." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TFiscalDocument = z.infer<typeof FiscalDocumentSchema>;

// ============================================================================
// PRODUCT STOCK MOVEMENTS (Movimentacoes de Estoque)
// ============================================================================

export const ProductStockTransactionSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organizacao nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da organizacao.",
	}),
	produtoId: z.string({ invalid_type_error: "Tipo nao valido para o ID do produto." }).optional().nullable(),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo nao valido para o ID da variante do produto." }).optional().nullable(),
	tipo: StockMovementTypeEnum.default("SAIDA"),
	quantidade: z.number({
		required_error: "Quantidade nao informada.",
		invalid_type_error: "Tipo nao valido para a quantidade.",
	}),
	motivo: z.string({ invalid_type_error: "Tipo nao valido para o motivo da movimentacao." }).optional().nullable(),
	vendaId: z.string({ invalid_type_error: "Tipo nao valido para o ID da venda." }).optional().nullable(),
	vendaItemId: z.string({ invalid_type_error: "Tipo nao valido para o ID do item de venda." }).optional().nullable(),
	saldoAnterior: z.number({ invalid_type_error: "Tipo nao valido para o saldo anterior." }).optional().nullable(),
	saldoPosterior: z.number({ invalid_type_error: "Tipo nao valido para o saldo posterior." }).optional().nullable(),
	operadorId: z.string({ invalid_type_error: "Tipo nao valido para o ID do operador." }).optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de insercao." })
		.datetime({ message: "Tipo nao valido para a data de insercao." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TProductStockTransaction = z.infer<typeof ProductStockTransactionSchema>;
