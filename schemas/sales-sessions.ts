import { z } from "zod";
import { PaymentMethodEnum, SalesSessionMovementTypeEnum, SalesSessionPolicyEnum, SalesSessionStatusEnum } from "./enums";

// ============================================================================
// SALES SESSIONS (Sessões de Venda)
// ============================================================================

export const SalesSessionSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organizacao nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da organizacao.",
	}),
	contaFinanceiraId: z.string({ invalid_type_error: "Tipo nao valido para o ID da conta financeira." }).optional().nullable(),
	politica: SalesSessionPolicyEnum.default("VENDEDOR_UNICO"),
	vendedorPadraoId: z.string({ invalid_type_error: "Tipo nao valido para o ID do vendedor padrao." }).optional().nullable(),
	abertaPorUsuarioId: z.string({ invalid_type_error: "Tipo nao valido para o ID do usuario que abriu a sessao." }).optional().nullable(),
	fechadaPorUsuarioId: z.string({ invalid_type_error: "Tipo nao valido para o ID do usuario que fechou a sessao." }).optional().nullable(),
	conferidaPorUsuarioId: z.string({ invalid_type_error: "Tipo nao valido para o ID do usuario que conferiu a sessao." }).optional().nullable(),
	status: SalesSessionStatusEnum.default("ABERTA"),
	saldoInicial: z.number({ invalid_type_error: "Tipo nao valido para o saldo inicial." }).default(0),
	dataAbertura: z
		.string({ invalid_type_error: "Tipo nao valido para a data de abertura." })
		.datetime({ message: "Tipo nao valido para a data de abertura." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
	dataFechamento: z
		.string({ invalid_type_error: "Tipo nao valido para a data de fechamento." })
		.datetime({ message: "Tipo nao valido para a data de fechamento." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	totalEsperado: z.number({ invalid_type_error: "Tipo nao valido para o total esperado." }).optional().nullable(),
	totalInformado: z.number({ invalid_type_error: "Tipo nao valido para o total informado." }).optional().nullable(),
	diferencaTotal: z.number({ invalid_type_error: "Tipo nao valido para a diferenca total." }).optional().nullable(),
	observacoesAbertura: z.string({ invalid_type_error: "Tipo nao valido para as observacoes de abertura." }).optional().nullable(),
	observacoesFechamento: z.string({ invalid_type_error: "Tipo nao valido para as observacoes de fechamento." }).optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de insercao." })
		.datetime({ message: "Tipo nao valido para a data de insercao." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TSalesSession = z.infer<typeof SalesSessionSchema>;

// ============================================================================
// SALES SESSION RECONCILIATIONS (Conferência por método)
// ============================================================================

export const SalesSessionReconciliationSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organizacao nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da organizacao.",
	}),
	sessaoVendaId: z.string({
		required_error: "ID da sessao de venda nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da sessao de venda.",
	}),
	metodo: PaymentMethodEnum,
	valorEsperado: z.number({
		required_error: "Valor esperado nao informado.",
		invalid_type_error: "Tipo nao valido para o valor esperado.",
	}),
	valorInformado: z.number({ invalid_type_error: "Tipo nao valido para o valor informado." }).optional().nullable(),
	diferenca: z.number({ invalid_type_error: "Tipo nao valido para a diferenca." }).optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de insercao." })
		.datetime({ message: "Tipo nao valido para a data de insercao." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TSalesSessionReconciliation = z.infer<typeof SalesSessionReconciliationSchema>;

// ============================================================================
// API INPUTS
// ============================================================================

// Abertura de sessão.
export const OpenSalesSessionInputSchema = z
	.object({
		contaFinanceiraId: z.string({ invalid_type_error: "Tipo nao valido para o ID da conta financeira." }).optional().nullable(),
		politica: SalesSessionPolicyEnum,
		vendedorPadraoId: z.string({ invalid_type_error: "Tipo nao valido para o ID do vendedor padrao." }).optional().nullable(),
		saldoInicial: z
			.number({ invalid_type_error: "Tipo nao valido para o saldo inicial." })
			.min(0, { message: "Saldo inicial nao pode ser negativo." })
			.default(0),
		observacoesAbertura: z.string({ invalid_type_error: "Tipo nao valido para as observacoes de abertura." }).optional().nullable(),
	})
	.superRefine((input, ctx) => {
		if (input.politica === "VENDEDOR_UNICO" && !input.vendedorPadraoId) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vendedorPadraoId"], message: "Vendedor padrao nao informado." });
		}
	});
export type TOpenSalesSessionInput = z.infer<typeof OpenSalesSessionInputSchema>;

// Conferência informada no fechamento (uma linha por método contado).
export const CloseSalesSessionReconciliationInputSchema = z.object({
	metodo: PaymentMethodEnum,
	valorInformado: z.number({
		required_error: "Valor informado nao informado.",
		invalid_type_error: "Tipo nao valido para o valor informado.",
	}),
});
export type TCloseSalesSessionReconciliationInput = z.infer<typeof CloseSalesSessionReconciliationInputSchema>;

// Fechamento de sessão.
export const CloseSalesSessionInputSchema = z.object({
	sessaoVendaId: z.string({
		required_error: "ID da sessao de venda nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da sessao de venda.",
	}),
	conferencias: z.array(CloseSalesSessionReconciliationInputSchema).default([]),
	observacoesFechamento: z.string({ invalid_type_error: "Tipo nao valido para as observacoes de fechamento." }).optional().nullable(),
});
export type TCloseSalesSessionInput = z.infer<typeof CloseSalesSessionInputSchema>;

// Conferência (revisão do gestor) de sessão fechada.
export const ReviewSalesSessionInputSchema = z.object({
	sessaoVendaId: z.string({
		required_error: "ID da sessao de venda nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da sessao de venda.",
	}),
});
export type TReviewSalesSessionInput = z.infer<typeof ReviewSalesSessionInputSchema>;

// Movimento manual de caixa. Sangria leva o dinheiro para outra conta (cofre, banco); suprimento traz
// troco de uma conta. Nos dois a conta é opcional — a organização pode não ter outra conta além do
// caixa —, e o modal a pede sempre que houver uma. Despesa exige a categoria.
export const RegisterSalesSessionMovementInputSchema = z
	.object({
		sessaoVendaId: z.string({
			required_error: "ID da sessao de venda nao informado.",
			invalid_type_error: "Tipo nao valido para o ID da sessao de venda.",
		}),
		tipo: SalesSessionMovementTypeEnum,
		valor: z
			.number({
				required_error: "Valor do movimento nao informado.",
				invalid_type_error: "Tipo nao valido para o valor do movimento.",
			})
			.positive({ message: "Valor do movimento deve ser positivo." }),
		observacoes: z.string({ invalid_type_error: "Tipo nao valido para as observacoes do movimento." }).optional().nullable(),
		contaFinanceiraId: z.string({ invalid_type_error: "Tipo nao valido para a conta financeira do movimento." }).optional().nullable(),
		categoriaContaId: z.string({ invalid_type_error: "Tipo nao valido para a categoria da despesa." }).optional().nullable(),
	})
	.superRefine((input, ctx) => {
		if (input.tipo === "DESPESA" && !input.categoriaContaId) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoriaContaId"], message: "Informe a categoria da despesa." });
		}
	});
export type TRegisterSalesSessionMovementInput = z.infer<typeof RegisterSalesSessionMovementInputSchema>;
