import { z } from "zod";
import {
	PaymentAttemptEvidenceTypeEnum,
	PaymentAttemptNotApprovedReasonEnum,
	PaymentAttemptOperationEnum,
	PaymentAttemptProviderEnum,
	PaymentAttemptStatusEnum,
	PaymentInstallmentPartyEnum,
	PaymentMethodEnum,
} from "./enums";

// Entidade da tentativa de pagamento em terminal (services/drizzle/schema/payment-attempts.ts).
export const PaymentAttemptSchema = z.object({
	id: z.string({ required_error: "ID da tentativa não informado.", invalid_type_error: "Tipo não válido para o ID da tentativa." }),
	organizacaoId: z.string({ required_error: "Organização não informada.", invalid_type_error: "Tipo não válido para a organização." }),
	vendaId: z.string({ required_error: "Venda não informada.", invalid_type_error: "Tipo não válido para a venda." }),
	dispositivoId: z.string({ required_error: "Dispositivo não informado.", invalid_type_error: "Tipo não válido para o dispositivo." }),
	sessaoVendaId: z.string({ invalid_type_error: "Tipo não válido para a sessão de venda." }).optional().nullable(),
	tentativaOrigemId: z.string({ invalid_type_error: "Tipo não válido para a tentativa de origem." }).optional().nullable(),
	operacao: PaymentAttemptOperationEnum,
	provedor: PaymentAttemptProviderEnum,
	metodo: PaymentMethodEnum,
	valor: z.number({ required_error: "Valor não informado.", invalid_type_error: "Tipo não válido para o valor." }).positive("O valor da cobrança deve ser maior que zero."),
	moeda: z.string({ invalid_type_error: "Tipo não válido para a moeda." }).default("BRL"),
	totalParcelas: z.number({ invalid_type_error: "Tipo não válido para o total de parcelas." }).int().optional().nullable(),
	parcelamentoResponsavel: PaymentInstallmentPartyEnum.optional().nullable(),
	status: PaymentAttemptStatusEnum,
	motivoNaoAprovacao: PaymentAttemptNotApprovedReasonEnum.optional().nullable(),
	ordemProvedorId: z.number({ invalid_type_error: "Tipo não válido para a ordem do provedor." }).int().optional().nullable(),
	transacaoFinanceiraId: z.string({
		required_error: "Transação financeira não informada.",
		invalid_type_error: "Tipo não válido para a transação financeira.",
	}),
	versao: z.number({ invalid_type_error: "Tipo não válido para a versão." }).int(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime()
		.transform((val) => new Date(val)),
});
export type TPaymentAttempt = z.infer<typeof PaymentAttemptSchema>;

// Fato observado pelo terminal após a execução (docs/04 §2 e docs/07 "Evidência allowlisted").
// Chaves fora da allowlist são descartadas pelo Zod antes de qualquer persistência; o corpo
// nunca carrega um status interno — o backend deriva a transição a partir de `tipo`.
const evidenceText = (label: string, max: number) =>
	z.string({ invalid_type_error: `Tipo não válido para ${label}.` }).trim().max(max, `Valor de ${label} excede o tamanho permitido.`).optional().nullable();

export const PaymentAttemptEvidenceSchema = z.object({
	tipo: PaymentAttemptEvidenceTypeEnum,
	provedorStatus: evidenceText("o status do provedor", 64),
	itk: evidenceText("o ITK", 128),
	atk: evidenceText("o ATK", 128),
	codigoAutorizacao: evidenceText("o código de autorização", 64),
	codigoResposta: evidenceText("o código de resposta", 32),
	bandeira: evidenceText("a bandeira", 64),
	panMascarado: evidenceText("o PAN mascarado", 32),
	modoEntrada: evidenceText("o modo de entrada", 32),
	valorAutorizado: z
		.number({ invalid_type_error: "Tipo não válido para o valor autorizado." })
		.nonnegative("O valor autorizado não pode ser negativo.")
		.optional()
		.nullable(),
	totalParcelas: z.number({ invalid_type_error: "Tipo não válido para o total de parcelas." }).int().min(1).max(99).optional().nullable(),
	dataAutorizacao: z.string({ invalid_type_error: "Tipo não válido para a data de autorização." }).datetime().optional().nullable(),
	// `order_id` devolvido pela adquirente, quando o adapter o repassa — permite correlacionar com
	// `ordemProvedorId` e recusar callback de outra cobrança.
	ordemProvedorId: evidenceText("a ordem do provedor", 32),
	// Mensagem humana da adquirente em recusas/falhas. Sanitizada e limitada; nunca a URI bruta.
	mensagem: evidenceText("a mensagem", 500),
});
export type TPaymentAttemptEvidence = z.infer<typeof PaymentAttemptEvidenceSchema>;

// Item da venda nascida no terminal (Fluxo A): referência, quantidade, adicionais escolhidos e
// observação. Preço e regras de grupo são do servidor. Compartilhado pela criação da venda e pela
// leitura dos benefícios do cliente, que avalia cupons sobre o mesmo carrinho precificado.
export const TerminalSaleItemInputSchema = z.object({
	produtoId: z.string({ required_error: "Produto não informado.", invalid_type_error: "Tipo inválido para o produto." }),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo inválido para a variação." }).optional().nullable(),
	quantidade: z.number({ required_error: "Quantidade não informada.", invalid_type_error: "Tipo inválido para a quantidade." }).positive("A quantidade deve ser positiva."),
	modificadores: z
		.array(
			z.object({
				opcaoId: z.string({ required_error: "Opção do adicional não informada.", invalid_type_error: "Tipo inválido para a opção do adicional." }),
				quantidade: z
					.number({ required_error: "Quantidade do adicional não informada.", invalid_type_error: "Tipo inválido para a quantidade do adicional." })
					.int()
					.positive("A quantidade do adicional deve ser positiva."),
			}),
		)
		.max(50, "O item excede o número máximo de adicionais.")
		.optional()
		.nullable(),
	observacoes: z.string({ invalid_type_error: "Tipo inválido para a observação do item." }).max(500).optional().nullable(),
});

export const TerminalSaleItemsInputSchema = z.array(TerminalSaleItemInputSchema).max(200, "A venda excede o número máximo de itens.");

// Benefícios escolhidos no terminal: o cupom vai só pelo id (o servidor avalia e define o
// desconto), o cashback pelo valor que a tela mostrou, as recompensas por id e quantidade.
export const TerminalSaleBenefitsInputSchema = z.object({
	cupomId: z.string({ invalid_type_error: "Tipo inválido para o cupom." }).optional().nullable(),
	cashbackResgate: z.number({ invalid_type_error: "Tipo inválido para o resgate de cashback." }).min(0, "O resgate de cashback não pode ser negativo.").optional().nullable(),
	recompensas: z
		.array(
			z.object({
				recompensaId: z.string({ required_error: "Recompensa não informada.", invalid_type_error: "Tipo inválido para a recompensa." }),
				quantidade: z.number({ invalid_type_error: "Tipo inválido para a quantidade da recompensa." }).int().positive("A quantidade da recompensa deve ser positiva.").optional().nullable(),
			}),
		)
		.max(20, "A venda excede o número máximo de recompensas.")
		.optional()
		.nullable(),
});
