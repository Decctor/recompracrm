import {
	DeliveryModeEnum,
	PaymentMethodEnum,
	SaleFinancialDerivedStatusEnum,
	SaleFiscalDerivedStatusEnum,
	SaleStatusEnum,
	type TDeliveryModeEnum,
	type TPaymentMethodEnum,
	type TSaleFinancialDerivedStatusEnum,
	type TSaleFiscalDerivedStatusEnum,
	type TSaleStatusEnum,
} from "@/schemas/enums";
import { z } from "zod";

/**
 * Filtros do histórico de vendas como chegam na query string (strings cruas, transformadas aqui).
 * Uma única definição para `GET /api/sales` e `GET /api/sales/export`: os dois recortes aceitam
 * os mesmos filtros e, via `buildSalesHistoryConditions`, produzem o mesmo conjunto de vendas.
 */
export const SalesHistoryFiltersSchema = z.object({
	search: z
		.string({
			required_error: "Busca não informada.",
			invalid_type_error: "Tipo inválido para busca.",
		})
		.optional()
		.nullable(),
	periodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	sellersIds: z
		.string({
			invalid_type_error: "Tipo inválido para ID do vendedor.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	partnersIds: z
		.string({
			invalid_type_error: "Tipo inválido para ID do parceiro.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : null)),
	integrationsIds: z
		.string({
			invalid_type_error: "Tipo inválido para os IDs de integração.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	clientId: z
		.string({
			invalid_type_error: "Tipo inválido para ID do cliente.",
		})
		.optional()
		.nullable(),
	productGroups: z
		.string({
			invalid_type_error: "Tipo inválido para grupos de produto.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	productIds: z
		.string({
			invalid_type_error: "Tipo inválido para IDs de produto.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	totalMin: z
		.string({
			invalid_type_error: "Tipo inválido para valor mínimo.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
	totalMax: z
		.string({
			invalid_type_error: "Tipo inválido para valor máximo.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
	financialStatuses: z
		.string({ invalid_type_error: "Tipo inválido para os status financeiros." })
		.optional()
		.nullable()
		.transform((val) =>
			val ? val.split(",").filter((status): status is TSaleFinancialDerivedStatusEnum => SaleFinancialDerivedStatusEnum.safeParse(status).success) : [],
		),
	fiscalStatuses: z
		.string({ invalid_type_error: "Tipo inválido para os status fiscais." })
		.optional()
		.nullable()
		.transform((val) =>
			val ? val.split(",").filter((status): status is TSaleFiscalDerivedStatusEnum => SaleFiscalDerivedStatusEnum.safeParse(status).success) : [],
		),
	// Vendas com ao menos um recebimento em algum dos métodos informados (OR entre os métodos).
	paymentMethods: z
		.string({ invalid_type_error: "Tipo inválido para os métodos de pagamento." })
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",").filter((method): method is TPaymentMethodEnum => PaymentMethodEnum.safeParse(method).success) : [])),
	// Modalidade de atendimento da venda (presencial, retirada, entrega, comanda): qualquer uma das informadas.
	deliveryModes: z
		.string({ invalid_type_error: "Tipo inválido para as modalidades de atendimento." })
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",").filter((mode): mode is TDeliveryModeEnum => DeliveryModeEnum.safeParse(mode).success) : [])),
	// Status comercial da venda. O histórico mistura orçamento, condicional e venda confirmada de
	// propósito — quem acabou de criar um orçamento espera achá-lo aqui. O filtro é para triagem.
	saleStatuses: z
		.string({ invalid_type_error: "Tipo inválido para os status de venda." })
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",").filter((status): status is TSaleStatusEnum => SaleStatusEnum.safeParse(status).success) : [])),
	// Presença de desconto na venda: "true" só as com desconto, "false" só as sem; ausente não filtra.
	hasDiscount: z
		.string({ invalid_type_error: "Tipo inválido para o filtro de desconto." })
		.optional()
		.nullable()
		.transform((val) => (val === "true" ? true : val === "false" ? false : null)),
});
export type TSalesHistoryFiltersInput = z.infer<typeof SalesHistoryFiltersSchema>;
