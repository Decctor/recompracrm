import { SaleFiscalDocumentSchema } from "@/schemas/fiscal";
import { CheckoutPaymentSplitSchema } from "@/lib/payments";
import { saleRewardRedemptionInputFields } from "@/schemas/cashback-programs";
import { AppliedCouponSchema } from "@/schemas/coupons";
import z from "zod";

// Entrada da criação + confirmação de venda (lib/sales/create-and-confirm-sale.ts). Vive aqui, e
// não na rota do PDV, porque dois atores a usam: o operador no PDV web e a maquininha (Fluxo A do
// RecompraCRM POS), que monta este mesmo shape a partir do catálogo do canal.

export const SaleCheckoutItemModifierInputSchema = z.object({
	opcaoId: z.string({ required_error: "ID da opção não informado.", invalid_type_error: "Tipo não válido para ID da opção." }),
	nome: z.string({ required_error: "Nome do modificador não informado.", invalid_type_error: "Tipo não válido para nome do modificador." }),
	quantidade: z.number({ required_error: "Quantidade do modificador não informada.", invalid_type_error: "Tipo não válido para quantidade do modificador." }),
	valorUnitario: z.number({
		required_error: "Valor unitário do modificador não informado.",
		invalid_type_error: "Tipo não válido para valor unitário do modificador.",
	}),
	valorTotal: z.number({ required_error: "Valor total do modificador não informado.", invalid_type_error: "Tipo não válido para valor total do modificador." }),
});

export const SaleCheckoutItemInputSchema = z.object({
	produtoId: z.string({ required_error: "ID do produto não informado.", invalid_type_error: "Tipo não válido para ID do produto." }),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo não válido para ID da variante." }).optional().nullable(),
	nome: z.string({ required_error: "Nome do item não informado.", invalid_type_error: "Tipo não válido para nome do item." }),
	codigo: z.string({ required_error: "Código do item não informado.", invalid_type_error: "Tipo não válido para código do item." }),
	imagemUrl: z.string({ invalid_type_error: "Tipo não válido para URL da imagem." }).optional().nullable(),
	quantidade: z.number({ required_error: "Quantidade não informada.", invalid_type_error: "Tipo não válido para quantidade." }).min(1),
	valorUnitarioBase: z.number({ required_error: "Valor unitário base não informado.", invalid_type_error: "Tipo não válido para valor unitário base." }),
	valorModificadores: z.number({ required_error: "Valor de modificadores não informado.", invalid_type_error: "Tipo não válido para valor de modificadores." }),
	valorUnitarioFinal: z.number({ required_error: "Valor unitário final não informado.", invalid_type_error: "Tipo não válido para valor unitário final." }),
	valorTotalBruto: z.number({ required_error: "Valor total bruto não informado.", invalid_type_error: "Tipo não válido para valor total bruto." }),
	valorDesconto: z.number({ invalid_type_error: "Tipo não válido para desconto." }).default(0),
	valorTotalLiquido: z.number({ required_error: "Valor total líquido não informado.", invalid_type_error: "Tipo não válido para valor total líquido." }),
	modificadores: z.array(SaleCheckoutItemModifierInputSchema),
	observacoes: z.string({ invalid_type_error: "Tipo não válido para observações do item." }).max(500).optional().nullable(),
});
export type TSaleCheckoutItemInput = z.infer<typeof SaleCheckoutItemInputSchema>;

export const CreateAndConfirmSaleInputSchema = z.object({
	clienteId: z.string({ invalid_type_error: "Tipo não válido para ID do cliente." }).optional().nullable(),
	vendedorId: z.string({ invalid_type_error: "Tipo não válido para ID do vendedor." }).optional().nullable(),
	vendedorNome: z.string({ invalid_type_error: "Tipo não válido para nome do vendedor." }).optional().nullable(),
	entregaModalidade: z.enum(["PRESENCIAL", "RETIRADA", "ENTREGA", "COMANDA"]).optional().nullable(),
	entregaLocalizacaoId: z.string({ invalid_type_error: "Tipo não válido para ID da localização." }).optional().nullable(),
	comandaNumero: z.string({ invalid_type_error: "Tipo não válido para comanda." }).optional().nullable(),
	observacoes: z.string({ invalid_type_error: "Tipo não válido para observações." }).optional().nullable(),
	descontosTotal: z.number({ invalid_type_error: "Tipo não válido para desconto." }).optional().nullable(),
	acrescimosTotal: z.number({ invalid_type_error: "Tipo não válido para acréscimo." }).optional().nullable(),
	rascunhoMetadados: z.unknown().optional().nullable(),
	pagamentos: z.array(CheckoutPaymentSplitSchema.omit({ id: true })),
	cashbackResgate: z.number({ invalid_type_error: "Tipo não válido para resgate de cashback." }).default(0),
	cashbackProgramaId: z.string({ invalid_type_error: "Tipo não válido para ID do programa de cashback." }).optional().nullable(),
	cupomResgate: AppliedCouponSchema.optional().nullable(),
	// Resgate de recompensas (prêmios) via saldo de cashback. Os itens das recompensas NÃO vêm
	// em `itens` — o servidor valida cada prêmio contra o catálogo e constrói os itens ele mesmo.
	...saleRewardRedemptionInputFields,
	sessaoVendaId: z.string({ invalid_type_error: "Tipo não válido para o ID da sessão de venda." }).optional().nullable(),
	// Override tri-state da emissão fiscal automática. null/ausente = herda a preferência da organização.
	emissaoFiscalDocumento: SaleFiscalDocumentSchema.optional(),
	emissaoFiscalAutomatica: z.boolean({ invalid_type_error: "Tipo não válido para emissão fiscal automática." }).optional().nullable(),
	// Aprovação VENDA_DESCONTO exigida quando o desconto agregado excede o teto do vendedor.
	descontoAprovacaoId: z.string({ invalid_type_error: "Tipo não válido para o ID da aprovação de desconto." }).optional().nullable(),
	// Venda só-recompensas é permitida (carrinho vazio + recompensasResgate); a exigência de
	// pelo menos um item quando não há recompensa é validada no service.
	itens: z.array(SaleCheckoutItemInputSchema),
});
export type TCreateAndConfirmSaleInput = z.infer<typeof CreateAndConfirmSaleInputSchema>;
