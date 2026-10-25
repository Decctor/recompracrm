import { FinancialTransactionTypeEnum, PaymentMethodEnum } from "./enums";
import { z } from "zod";

export const FinancialRecurringRuleFrequencySchema = z.enum(["DIARIA", "SEMANAL", "MENSAL", "ANUAL"]);
export const FinancialRecurringRuleStatusSchema = z.enum(["ATIVA", "PAUSADA", "ENCERRADA"]);

export const FinancialRecurringRuleConfigSchema = z.object({
	frequencia: FinancialRecurringRuleFrequencySchema.default("MENSAL"),
	intervalo: z
		.number({ required_error: "Intervalo da recorrência não informado.", invalid_type_error: "Tipo não válido para o intervalo da recorrência." })
		.int()
		.min(1)
		.default(1),
	inicio: z
		.string({
			required_error: "Data de início da recorrência não informada.",
			invalid_type_error: "Tipo não válido para a data de início da recorrência.",
		})
		.datetime()
		.transform((value) => new Date(value)),
	fim: z
		.string({ invalid_type_error: "Tipo não válido para a data final da recorrência." })
		.datetime()
		.transform((value) => new Date(value))
		.optional()
		.nullable(),
	diaDoMes: z.number({ invalid_type_error: "Tipo não válido para o dia do mês." }).int().min(1).max(31).optional().nullable(),
	diaDaSemana: z.number({ invalid_type_error: "Tipo não válido para o dia da semana." }).int().min(0).max(6).optional().nullable(),
	gerarComAntecedenciaDias: z.number({ invalid_type_error: "Tipo não válido para a antecedência de geração." }).int().min(0).max(730).default(90),
	timezone: z.string({ invalid_type_error: "Tipo não válido para o fuso horário." }).default("America/Sao_Paulo"),
});

export const FinancialRecurringRuleAccountingEntryTemplateSchema = z.object({
	// Contraparte copiada do lançamento de origem (ADR-0002, decisão 5).
	clienteId: z.string({ invalid_type_error: "Tipo não válido para o cliente do lançamento recorrente." }).optional().nullable(),
	fornecedorId: z.string({ invalid_type_error: "Tipo não válido para o fornecedor do lançamento recorrente." }).optional().nullable(),
	titulo: z.string({
		required_error: "Título do lançamento recorrente não informado.",
		invalid_type_error: "Tipo não válido para o título do lançamento recorrente.",
	}),
	anotacoes: z.string({ invalid_type_error: "Tipo não válido para as anotações do lançamento recorrente." }).nullable(),
	idContaDebito: z.string({
		required_error: "Conta de débito do lançamento recorrente não informada.",
		invalid_type_error: "Tipo não válido para a conta de débito do lançamento recorrente.",
	}),
	idContaCredito: z.string({
		required_error: "Conta de crédito do lançamento recorrente não informada.",
		invalid_type_error: "Tipo não válido para a conta de crédito do lançamento recorrente.",
	}),
	valor: z.number({
		required_error: "Valor do lançamento recorrente não informado.",
		invalid_type_error: "Tipo não válido para o valor do lançamento recorrente.",
	}),
	valorPrevisto: z.number({ invalid_type_error: "Tipo não válido para o valor previsto do lançamento recorrente." }).nullable(),
	dataCompetencia: z.date({
		required_error: "Data de competência do lançamento recorrente não informada.",
		invalid_type_error: "Tipo não válido para a data de competência do lançamento recorrente.",
	}),
});

export const FinancialRecurringRuleTransactionTemplateSchema = z.object({
	contaFinanceiraId: z.string({ invalid_type_error: "Tipo não válido para a conta financeira da recorrência." }).nullable(),
	titulo: z.string({
		required_error: "Título da transação recorrente não informado.",
		invalid_type_error: "Tipo não válido para o título da transação recorrente.",
	}),
	tipo: FinancialTransactionTypeEnum,
	valor: z.number({
		required_error: "Valor da transação recorrente não informado.",
		invalid_type_error: "Tipo não válido para o valor da transação recorrente.",
	}),
	valorBase: z.number({ invalid_type_error: "Tipo nÃ£o vÃ¡lido para o valor base da recorrÃªncia." }).optional().nullable(),
	valorJuros: z.number({ invalid_type_error: "Tipo nÃ£o vÃ¡lido para os juros da recorrÃªncia." }).optional().nullable(),
	valorMulta: z.number({ invalid_type_error: "Tipo nÃ£o vÃ¡lido para a multa da recorrÃªncia." }).optional().nullable(),
	valorTaxas: z.number({ invalid_type_error: "Tipo nÃ£o vÃ¡lido para as taxas da recorrÃªncia." }).optional().nullable(),
	valorDesconto: z.number({ invalid_type_error: "Tipo nÃ£o vÃ¡lido para o desconto da recorrÃªncia." }).optional().nullable(),
	modificadoresMetadata: z.record(z.unknown()).optional().nullable(),
	metodo: PaymentMethodEnum,
	diaPrevisao: z.number({ invalid_type_error: "Tipo não válido para o dia de previsão." }).int().min(1).max(31).nullable(),
	previsaoModo: z.enum(["DIA_FIXO", "INFERIR_PELA_CONTA"]).default("DIA_FIXO"),
});

export const FinancialRecurringRuleSchema = z.object({
	organizacaoId: z.string({ required_error: "ID da organização não informado.", invalid_type_error: "Tipo não válido para a organização." }),
	autorId: z.string({ invalid_type_error: "Tipo não válido para o autor da recorrência." }).nullable(),
	lancamentoContabilOrigemId: z.string({
		required_error: "Lançamento de origem da recorrência não informado.",
		invalid_type_error: "Tipo não válido para o lançamento de origem da recorrência.",
	}),
	status: FinancialRecurringRuleStatusSchema,
	config: FinancialRecurringRuleConfigSchema,
	templateLancamento: FinancialRecurringRuleAccountingEntryTemplateSchema,
	templateTransacoes: z.array(FinancialRecurringRuleTransactionTemplateSchema),
});

export const CreateFinancialRecurringRuleInputSchema = z.object({
	accountingEntryId: z.string({
		required_error: "ID do lançamento contábil não informado.",
		invalid_type_error: "Tipo não válido para o lançamento contábil.",
	}),
	config: FinancialRecurringRuleConfigSchema,
});

export const UpdateFinancialRecurringRuleInputSchema = z.object({
	ruleId: z.string({
		required_error: "ID da regra de recorrência não informado.",
		invalid_type_error: "Tipo não válido para a regra de recorrência.",
	}),
	config: FinancialRecurringRuleConfigSchema.optional(),
	status: FinancialRecurringRuleStatusSchema.optional(),
});

export type TFinancialRecurringRuleFrequency = z.infer<typeof FinancialRecurringRuleFrequencySchema>;
export type TFinancialRecurringRuleStatus = z.infer<typeof FinancialRecurringRuleStatusSchema>;
export type TFinancialRecurringRuleConfig = z.infer<typeof FinancialRecurringRuleConfigSchema>;
export type TFinancialRecurringRuleAccountingEntryTemplate = z.infer<typeof FinancialRecurringRuleAccountingEntryTemplateSchema>;
export type TFinancialRecurringRuleTransactionTemplate = z.infer<typeof FinancialRecurringRuleTransactionTemplateSchema>;
export type TCreateFinancialRecurringRuleInput = z.infer<typeof CreateFinancialRecurringRuleInputSchema>;
export type TUpdateFinancialRecurringRuleInput = z.infer<typeof UpdateFinancialRecurringRuleInputSchema>;
