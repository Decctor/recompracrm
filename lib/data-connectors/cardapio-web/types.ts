import { formatToPhone } from "@/lib/formatting";
import z from "zod";

// -----------------------------------------------------------------------------
// CARDAPIO WEB CONFIGURATION & AUTH
// -----------------------------------------------------------------------------

export const CardapioWebConfigSchema = z.object({
	merchantId: z.string({
		required_error: "ID do merchant não informado.",
		invalid_type_error: "Tipo inválido para ID do merchant.",
	}),
	apiKey: z.string({
		required_error: "API Key não informada.",
		invalid_type_error: "Tipo inválido para API Key.",
	}),
});
export type TCardapioWebConfig = z.infer<typeof CardapioWebConfigSchema>;

// -----------------------------------------------------------------------------
// ORDER HISTORY
// -----------------------------------------------------------------------------

export const GetCardapioWebOrderHistoryInputSchema = z.object({
	page: z
		.number({
			required_error: "Página não informada.",
			invalid_type_error: "Tipo inválido para página.",
		})
		.optional()
		.default(1),
	per_page: z
		.number({
			required_error: "Quantidade de pedidos por página não informada.",
			invalid_type_error: "Tipo inválido para quantidade de pedidos por página.",
		})
		.min(1)
		.max(100)
		.optional()
		.default(100),
	status: z.array(z.enum(["closed", "canceled"])).optional(),
	start_date: z.string({
		required_error: "Período não informado.",
		invalid_type_error: "Tipo inválido para período.",
	}),
	// .datetime({ message: "Tipo inválido para período." }),
	end_date: z.string({
		required_error: "Período não informado.",
		invalid_type_error: "Tipo inválido para período.",
	}),
	// .datetime({ message: "Tipo inválido para período." }),
});
export type TGetCardapioWebOrderHistoryInput = z.infer<typeof GetCardapioWebOrderHistoryInputSchema>;

const CardapioWebOrderStatusSchema = z.enum(
	[
		"waiting_confirmation",
		"pending_payment",
		"pending_online_payment",
		"scheduled_confirmed",
		"confirmed",
		"ready",
		"released",
		"waiting_to_catch",
		"delivered",
		"canceling",
		"canceled",
		"closed",
	],
	{
		required_error: "Status do pedido não informado.",
		invalid_type_error: "Tipo inválido para status do pedido.",
	},
);

const CardapioWebOrderTypeSchema = z.enum(["delivery", "takeout", "onsite", "closed_table"], {
	required_error: "Tipo de pedido não informado.",
	invalid_type_error: "Tipo inválido para tipo de pedido.",
});

const CardapioWebOrderTimingSchema = z.enum(["immediate", "scheduled"], {
	required_error: "Tipo de timing não informado.",
	invalid_type_error: "Tipo inválido para tipo de timing.",
});

const CardapioWebSalesChannelSchema = z.enum(["catalog", "store_front_catalog", "portal", "whatsapp_extension", "ifood"], {
	required_error: "Canal de venda não informado.",
	invalid_type_error: "Tipo inválido para canal de venda.",
});

const CardapioWebOrderSummarySchema = z.object({
	id: z
		.number({
			required_error: "ID do pedido não informado.",
			invalid_type_error: "Tipo inválido para ID do pedido.",
		})
		.int(),
	status: CardapioWebOrderStatusSchema,
	order_type: CardapioWebOrderTypeSchema,
	order_timing: CardapioWebOrderTimingSchema,
	sales_channel: CardapioWebSalesChannelSchema,
	created_at: z.string({
		required_error: "Data de criação não informada.",
		invalid_type_error: "Tipo inválido para data de criação.",
	}),
	// .datetime({
	// 	message: "Tipo inválido para data de criação.",
	// }),
	updated_at: z.string({
		required_error: "Data de atualização não informada.",
		invalid_type_error: "Tipo inválido para data de atualização.",
	}),
	// .datetime({
	// 	message: "Tipo inválido para data de atualização.",
	// }),
});

const CardapioWebPaginationSchema = z.object({
	current_page: z.number({
		required_error: "Página atual não informada.",
		invalid_type_error: "Tipo inválido para página atual.",
	}),
	total_pages: z.number({
		required_error: "Total de páginas não informado.",
		invalid_type_error: "Tipo inválido para total de páginas.",
	}),
	total_orders: z.number({
		required_error: "Total de pedidos não informado.",
		invalid_type_error: "Tipo inválido para total de pedidos.",
	}),
});

export const GetCardapioWebOrderHistoryOutputSchema = z.object({
	orders: z.array(CardapioWebOrderSummarySchema),
	pagination: CardapioWebPaginationSchema,
});
export type TGetCardapioWebOrderHistoryOutput = z.infer<typeof GetCardapioWebOrderHistoryOutputSchema>;

export const GetCardapioWebOrderDetailsInputSchema = z.object({
	order_id: z.number({
		required_error: "ID do pedido não informado.",
		invalid_type_error: "Tipo inválido para ID do pedido.",
	}),
});
export type TGetCardapioWebOrderDetailsInput = z.infer<typeof GetCardapioWebOrderDetailsInputSchema>;

const CardapioWebDeliveredBySchema = z.enum(["merchant", "ifood", "ifood_shipping", "foody_delivery"], {
	required_error: "Responsável pela entrega não informado.",
	invalid_type_error: "Tipo inválido para responsável pela entrega.",
});

const CardapioWebScheduleSchema = z.object({
	scheduled_date_time_start: z.string({
		required_error: "Data e hora de início do agendamento não informadas.",
		invalid_type_error: "Tipo inválido para data e hora de início do agendamento.",
	}),
	// .datetime({
	// 	message: "Tipo inválido para data e hora de início do agendamento.",
	// }),
	scheduled_date_time_end: z.string({
		required_error: "Data e hora de fim do agendamento não informadas.",
		invalid_type_error: "Tipo inválido para data e hora de fim do agendamento.",
	}),
	// .datetime({
	// 	message: "Tipo inválido para data e hora de fim do agendamento.",
	// }),
});

const CardapioWebCustomerSchema = z.object({
	id: z
		.number({
			required_error: "ID do cliente não informado.",
			invalid_type_error: "Tipo inválido para ID do cliente.",
		})
		.int(),
	name: z.string({
		required_error: "Nome do cliente não informado.",
		invalid_type_error: "Tipo inválido para nome do cliente.",
	}),
	phone: z
		.string({
			required_error: "Telefone do cliente não informado.",
			invalid_type_error: "Tipo inválido para telefone do cliente.",
		})
		.nullable()
		.transform((v) => (v ? formatToPhone(v) : null)),
});

const CardapioWebDeliveryAddressSchema = z.object({
	street: z.string({
		required_error: "Logradouro não informado.",
		invalid_type_error: "Tipo inválido para logradouro.",
	}),
	number: z
		.string({
			invalid_type_error: "Tipo inválido para número do endereço.",
		})
		.nullable(),
	address_block: z
		.string({
			invalid_type_error: "Tipo inválido para quadra do endereço.",
		})
		.nullable(),
	address_lot: z
		.string({
			invalid_type_error: "Tipo inválido para lote do endereço.",
		})
		.nullable(),
	neighborhood: z.string({
		required_error: "Bairro não informado.",
		invalid_type_error: "Tipo inválido para bairro.",
	}),
	complement: z
		.string({
			invalid_type_error: "Tipo inválido para complemento do endereço.",
		})
		.nullable(),
	reference: z
		.string({
			invalid_type_error: "Tipo inválido para ponto de referência.",
		})
		.nullable(),
	postal_code: z
		.string({
			invalid_type_error: "Tipo inválido para CEP.",
		})
		.nullable(),
	city: z.string({
		required_error: "Cidade não informada.",
		invalid_type_error: "Tipo inválido para cidade.",
	}),
	state: z.string({
		required_error: "Estado não informado.",
		invalid_type_error: "Tipo inválido para estado.",
	}),
	latitude: z
		.string({
			invalid_type_error: "Tipo inválido para latitude.",
		})
		.nullable(),
	longitude: z
		.string({
			invalid_type_error: "Tipo inválido para longitude.",
		})
		.nullable(),
});

const CardapioWebItemKindSchema = z.enum(["regular_item", "combo"], {
	required_error: "Tipo do produto não informado.",
	invalid_type_error: "Tipo inválido para tipo do produto.",
});

const CardapioWebItemStatusSchema = z.enum(["pending", "waiting", "production", "ready", "ok", "canceled"], {
	required_error: "Status de produção do item não informado.",
	invalid_type_error: "Tipo inválido para status de produção do item.",
});

const CardapioWebItemOptionSchema = z.object({
	option_id: z
		.number({
			required_error: "ID da opção não informado.",
			invalid_type_error: "Tipo inválido para ID da opção.",
		})
		.int()
		.nullable(),
	external_code: z
		.string({
			invalid_type_error: "Tipo inválido para código externo da opção.",
		})
		.nullable(),
	name: z.string({
		required_error: "Nome da opção não informado.",
		invalid_type_error: "Tipo inválido para nome da opção.",
	}),
	quantity: z
		.number({
			required_error: "Quantidade da opção não informada.",
			invalid_type_error: "Tipo inválido para quantidade da opção.",
		})
		.min(0),
	unit_price: z
		.number({
			required_error: "Preço unitário da opção não informado.",
			invalid_type_error: "Tipo inválido para preço unitário da opção.",
		})
		.min(0),
	option_group_id: z
		.number({
			required_error: "ID do grupo de complementos não informado.",
			invalid_type_error: "Tipo inválido para ID do grupo de complementos.",
		})
		.int()
		.nullable(),
	option_group_name: z
		.string({
			required_error: "Nome do grupo de complementos não informado.",
			invalid_type_error: "Tipo inválido para nome do grupo de complementos.",
		})
		.nullable(),
	option_group_total_selected_options: z
		.number({
			invalid_type_error: "Tipo inválido para número de opções selecionadas no grupo.",
		})
		.int()
		.nullable(),
});

const CardapioWebItemSchema = z.object({
	item_id: z
		.number({
			required_error: "ID do item não informado.",
			invalid_type_error: "Tipo inválido para ID do item.",
		})
		.int()
		.nullable(),
	order_item_id: z
		.number({
			required_error: "ID do item no pedido não informado.",
			invalid_type_error: "Tipo inválido para ID do item no pedido.",
		})
		.int(),
	external_code: z
		.string({
			invalid_type_error: "Tipo inválido para código externo do item.",
		})
		.nullable(),
	name: z.string({
		required_error: "Nome do item não informado.",
		invalid_type_error: "Tipo inválido para nome do item.",
	}),
	quantity: z
		.number({
			required_error: "Quantidade do item não informada.",
			invalid_type_error: "Tipo inválido para quantidade do item.",
		})
		.min(0),
	unit_price: z
		.number({
			required_error: "Preço unitário do item não informado.",
			invalid_type_error: "Tipo inválido para preço unitário do item.",
		})
		.min(0),
	total_price: z
		.number({
			required_error: "Preço total do item não informado.",
			invalid_type_error: "Tipo inválido para preço total do item.",
		})
		.min(0),
	kind: CardapioWebItemKindSchema,
	status: CardapioWebItemStatusSchema,
	observation: z
		.string({
			invalid_type_error: "Tipo inválido para observações do item.",
		})
		.nullable(),
	options: z.array(CardapioWebItemOptionSchema),
});

const CardapioWebDiscountKindSchema = z.enum(["discount", "free_delivery", "item"], {
	required_error: "Tipo de desconto não informado.",
	invalid_type_error: "Tipo inválido para tipo de desconto.",
});

// "cashback" passou a vir do Cardápio Web em 2026-11 (pedidos com resgate de cashback); sem ele o
// pedido inteiro falhava na validação e não era importado. A categoria não é usada no mapeamento.
const CardapioWebDiscountCategorySchema = z.enum(["coupon", "loyalty", "cashback", "other"], {
	required_error: "Categoria do desconto não informada.",
	invalid_type_error: "Tipo inválido para categoria do desconto.",
});

const CardapioWebDiscountSchema = z.object({
	kind: CardapioWebDiscountKindSchema,
	category: CardapioWebDiscountCategorySchema,
	total: z
		.number({
			required_error: "Valor do desconto não informado.",
			invalid_type_error: "Tipo inválido para valor do desconto.",
		})
		.min(0),
	total_points: z
		.number({
			invalid_type_error: "Tipo inválido para quantidade de pontos.",
		})
		.int()
		.min(0)
		.nullable()
		.default(0),
	coupon_id: z
		.number({
			invalid_type_error: "Tipo inválido para ID do cupom.",
		})
		.int()
		.nullable(),
	coupon_name: z
		.string({
			invalid_type_error: "Tipo inválido para nome do cupom.",
		})
		.nullable(),
	coupon_code: z
		.string({
			invalid_type_error: "Tipo inválido para código do cupom.",
		})
		.nullable(),
	item_id: z
		.number({
			invalid_type_error: "Tipo inválido para ID do item resgatado.",
		})
		.int()
		.nullable(),
	item_name: z
		.string({
			invalid_type_error: "Tipo inválido para nome do item resgatado.",
		})
		.nullable(),
});

const CardapioWebPaymentMethodSchema = z.enum(
	[
		"money",
		"credit_card",
		"debit_card",
		"pix",
		"pix_auto",
		"meal_voucher",
		"food_voucher",
		"bank_transfer",
		"bank_slip",
		"picpay",
		"debt_book",
		"online_credit_card",
		"ifood",
		"ifood_voucher",
		"food99",
		"food99_voucher",
	],
	{
		required_error: "Método de pagamento não informado.",
		invalid_type_error: "Tipo inválido para método de pagamento.",
	},
);

const CardapioWebPaymentTypeSchema = z.enum(["online", "offline"], {
	required_error: "Tipo de pagamento não informado.",
	invalid_type_error: "Tipo inválido para tipo de pagamento.",
});

const CardapioWebPaymentStatusSchema = z.enum(["pending", "paid", "authorized", "refunded", "cancelled", "abandoned"], {
	required_error: "Status do pagamento não informado.",
	invalid_type_error: "Tipo inválido para status do pagamento.",
});

const CardapioWebPaymentSchema = z.object({
	total: z
		.number({
			required_error: "Valor do pagamento não informado.",
			invalid_type_error: "Tipo inválido para valor do pagamento.",
		})
		.min(0),
	payment_method: CardapioWebPaymentMethodSchema,
	payment_type: CardapioWebPaymentTypeSchema,
	payment_fee: z
		.number({
			invalid_type_error: "Tipo inválido para taxa de pagamento.",
		})
		.min(0)
		.default(0),
	change_for: z
		.number({
			invalid_type_error: "Tipo inválido para valor do troco.",
		})
		.min(0)
		.nullable(),
	status: CardapioWebPaymentStatusSchema.default("pending"),
	card_brand: z
		.string({
			invalid_type_error: "Tipo inválido para bandeira do cartão.",
		})
		.nullable(),
	card_number: z
		.string({
			invalid_type_error: "Tipo inválido para número do cartão.",
		})
		.nullable(),
	observation: z
		.string({
			invalid_type_error: "Tipo inválido para observações do pagamento.",
		})
		.nullable(),
});

export const GetCardapioWebOrderDetailsOutputSchema = z.object({
	id: z
		.number({
			required_error: "ID do pedido não informado.",
			invalid_type_error: "Tipo inválido para ID do pedido.",
		})
		.int(),
	display_id: z
		.number({
			required_error: "ID de exibição do pedido não informado.",
			invalid_type_error: "Tipo inválido para ID de exibição do pedido.",
		})
		.int(),
	external_display_id: z
		.string({
			invalid_type_error: "Tipo inválido para ID de exibição externo do pedido.",
		})
		.nullable(),
	merchant_id: z
		.number({
			required_error: "ID do estabelecimento não informado.",
			invalid_type_error: "Tipo inválido para ID do estabelecimento.",
		})
		.int(),
	status: CardapioWebOrderStatusSchema,
	order_type: CardapioWebOrderTypeSchema,
	order_timing: CardapioWebOrderTimingSchema,
	sales_channel: CardapioWebSalesChannelSchema,
	customer_origin: z
		.string({
			invalid_type_error: "Tipo inválido para origem do cliente.",
		})
		.nullable(),
	delivered_by: CardapioWebDeliveredBySchema.nullable(),
	table_number: z
		.string({
			invalid_type_error: "Tipo inválido para número da mesa.",
		})
		.nullable(),
	estimated_time: z
		.number({
			invalid_type_error: "Tipo inválido para tempo estimado.",
		})
		.int()
		.nullable(),
	cancellation_reason: z
		.string({
			invalid_type_error: "Tipo inválido para motivo do cancelamento.",
		})
		.nullable(),
	fiscal_document: z
		.string({
			invalid_type_error: "Tipo inválido para documento fiscal.",
		})
		.nullable(),
	observation: z
		.string({
			invalid_type_error: "Tipo inválido para observações do pedido.",
		})
		.nullable(),
	delivery_fee: z
		.number({
			invalid_type_error: "Tipo inválido para taxa de entrega.",
		})
		.min(0)
		.default(0),
	service_fee: z
		.number({
			invalid_type_error: "Tipo inválido para taxa de serviço.",
		})
		.min(0)
		.default(0),
	additional_fee: z
		.number({
			invalid_type_error: "Tipo inválido para taxa adicional.",
		})
		.min(0)
		.default(0),
	total: z
		.number({
			required_error: "Valor total do pedido não informado.",
			invalid_type_error: "Tipo inválido para valor total do pedido.",
		})
		.min(0)
		.optional()
		.nullable()
		.default(0),
	created_at: z.string({
		required_error: "Data de criação não informada.",
		invalid_type_error: "Tipo inválido para data de criação.",
	}),
	// .datetime({
	// 	message: "Tipo inválido para data de criação.",
	// }),
	updated_at: z.string({
		required_error: "Data de atualização não informada.",
		invalid_type_error: "Tipo inválido para data de atualização.",
	}),
	// .datetime({
	// 	message: "Tipo inválido para data de atualização.",
	// }),
	schedule: CardapioWebScheduleSchema.nullable(),
	customer: CardapioWebCustomerSchema.nullable(),
	delivery_address: CardapioWebDeliveryAddressSchema.nullable(),
	items: z.array(CardapioWebItemSchema),
	discounts: z.array(CardapioWebDiscountSchema),
	payments: z.array(CardapioWebPaymentSchema),
});
export type TGetCardapioWebOrderDetailsOutput = z.infer<typeof GetCardapioWebOrderDetailsOutputSchema>;

// -----------------------------------------------------------------------------
// CATALOG
// -----------------------------------------------------------------------------

// No input required for catalog endpoint
export const GetCardapioWebCatalogInputSchema = z.object({});
export type TGetCardapioWebCatalogInput = z.infer<typeof GetCardapioWebCatalogInputSchema>;

const CardapioWebCatalogImageSchema = z.object({
	image_url: z.string({
		required_error: "URL da imagem não informada.",
		invalid_type_error: "Tipo inválido para URL da imagem.",
	}),
	thumbnail_url: z.string({
		required_error: "URL da imagem reduzida não informada.",
		invalid_type_error: "Tipo inválido para URL da imagem reduzida.",
	}),
});

const CardapioWebCatalogWeekdaySchema = z.enum(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"], {
	required_error: "Dia da semana não informado.",
	invalid_type_error: "Tipo inválido para dia da semana.",
});

function parseCardapioWebSerializedArray(value: unknown) {
	if (typeof value !== "string") return value;

	const trimmedValue = value.trim();
	if (!trimmedValue) return [];

	try {
		const parsedValue: unknown = JSON.parse(trimmedValue);
		if (Array.isArray(parsedValue)) return parsedValue;
		if (parsedValue === null) return null;
	} catch {
		// Some stores return arrays as comma-separated strings instead of JSON.
	}

	const unwrappedValue =
		(trimmedValue.startsWith("[") && trimmedValue.endsWith("]")) || (trimmedValue.startsWith("{") && trimmedValue.endsWith("}"))
			? trimmedValue.slice(1, -1)
			: trimmedValue;

	return unwrappedValue
		.split(",")
		.map((item) => item.trim().replace(/^["']|["']$/g, ""))
		.filter(Boolean);
}

const CardapioWebCatalogAllowedTimesSchema = z.object({
	weekday: CardapioWebCatalogWeekdaySchema,
	start_at: z.string({
		required_error: "Horário de início não informado.",
		invalid_type_error: "Tipo inválido para horário de início.",
	}),
	end_at: z.string({
		required_error: "Horário de fim não informado.",
		invalid_type_error: "Tipo inválido para horário de fim.",
	}),
});

const CardapioWebCatalogCategoryStatusSchema = z.enum(["ACTIVE", "INACTIVE", "MISSING"], {
	required_error: "Status da categoria não informado.",
	invalid_type_error: "Tipo inválido para status da categoria.",
});

const CardapioWebCatalogItemStatusSchema = z.enum(["ACTIVE", "INACTIVE", "MISSING"], {
	required_error: "Status do item não informado.",
	invalid_type_error: "Tipo inválido para status do item.",
});

const CardapioWebCatalogUnitTypeSchema = z
	.enum(["UN", "KG", "L"], {
		invalid_type_error: "Tipo inválido para unidade de medida.",
	})
	.default("UN");

const CardapioWebCatalogItemKindSchema = z.enum(["regular_item", "combo"], {
	required_error: "Tipo do item não informado.",
	invalid_type_error: "Tipo inválido para tipo do item.",
});

const CardapioWebCatalogAvailableForSchema = z.enum(["delivery", "table", "service_desk", "view_only", "internal_table"], {
	invalid_type_error: "Tipo inválido para local de disponibilidade.",
});

const CardapioWebCatalogAvailableForListSchema = z.preprocess(parseCardapioWebSerializedArray, z.array(CardapioWebCatalogAvailableForSchema));

const CardapioWebCatalogChoiceTypeSchema = z.enum(["SINGLE", "MULTIPLE", "SUMMABLE"], {
	required_error: "Tipo de escolha não informado.",
	invalid_type_error: "Tipo inválido para tipo de escolha.",
});

const CardapioWebCatalogPriceCalculationTypeSchema = z.enum(["SUM", "MEAN", "MAX", "MIN"], {
	required_error: "Tipo de cálculo de preço não informado.",
	invalid_type_error: "Tipo inválido para tipo de cálculo de preço.",
});

const CardapioWebCatalogOptionGroupStatusSchema = z.enum(["ACTIVE", "INACTIVE", "MISSING"], {
	required_error: "Status do grupo de complementos não informado.",
	invalid_type_error: "Tipo inválido para status do grupo de complementos.",
});

const CardapioWebCatalogOptionStatusSchema = z.enum(["ACTIVE", "INACTIVE", "MISSING"], {
	required_error: "Status da opção não informado.",
	invalid_type_error: "Tipo inválido para status da opção.",
});

const CardapioWebCatalogPromotionalPriceScheduleSchema = z.object({
	day: CardapioWebCatalogWeekdaySchema,
	start: z
		.string({
			invalid_type_error: "Tipo inválido para horário inicial da promoção.",
		})
		.nullable()
		.optional(),
	end: z
		.string({
			invalid_type_error: "Tipo inválido para horário final da promoção.",
		})
		.nullable()
		.optional(),
});

const CardapioWebCatalogOptionSchema = z.object({
	id: z
		.number({
			required_error: "ID da opção não informado.",
			invalid_type_error: "Tipo inválido para ID da opção.",
		})
		.int(),
	name: z.string({
		required_error: "Nome da opção não informado.",
		invalid_type_error: "Tipo inválido para nome da opção.",
	}),
	description: z
		.string({
			invalid_type_error: "Tipo inválido para descrição da opção.",
		})
		.nullable(),
	external_code: z
		.string({
			invalid_type_error: "Tipo inválido para código externo da opção.",
		})
		.nullable(),
	price: z
		.number({
			required_error: "Preço da opção não informado.",
			invalid_type_error: "Tipo inválido para preço da opção.",
		})
		.min(0),
	cost_price: z.number({ invalid_type_error: "Tipo inválido para preço de custo da opção." }).min(0).nullable().optional(),
	active_stock_control: z.boolean({ invalid_type_error: "Tipo inválido para indicador de controle de estoque da opção." }).optional(),
	stock: z.union([
		z.number({ invalid_type_error: "Tipo inválido para estoque da opção." }).min(0).nullable().optional(),
		z
			.string({ invalid_type_error: "Tipo inválido para estoque da opção." })
			.transform((val) => Number(val))
			.nullable()
			.optional(),
	]),
	max_quantity: z.number({ invalid_type_error: "Tipo inválido para quantidade máxima da opção." }).int().nullable().optional(),
	status: CardapioWebCatalogOptionStatusSchema,
	index: z
		.number({
			invalid_type_error: "Tipo inválido para índice da opção.",
		})
		.int()
		.nullable(),
	image: CardapioWebCatalogImageSchema.nullable(),
});

const CardapioWebCatalogOptionGroupSchema = z.object({
	id: z
		.number({
			required_error: "ID do grupo de complementos não informado.",
			invalid_type_error: "Tipo inválido para ID do grupo de complementos.",
		})
		.int(),
	name: z.string({
		required_error: "Nome do grupo de complementos não informado.",
		invalid_type_error: "Tipo inválido para nome do grupo de complementos.",
	}),
	status: CardapioWebCatalogOptionGroupStatusSchema,
	choice_type: CardapioWebCatalogChoiceTypeSchema,
	price_calculation_type: CardapioWebCatalogPriceCalculationTypeSchema,
	minimum_quantity: z
		.number({
			required_error: "Quantidade mínima não informada.",
			invalid_type_error: "Tipo inválido para quantidade mínima.",
		})
		.int()
		.min(0),
	maximum_quantity: z
		.number({
			invalid_type_error: "Tipo inválido para quantidade máxima.",
		})
		.int()
		.nullable(),
	index: z
		.number({
			invalid_type_error: "Tipo inválido para índice do grupo.",
		})
		.int()
		.nullable(),
	options: z.array(CardapioWebCatalogOptionSchema),
});

const CardapioWebCatalogComboStepItemSchema = z.object({
	item_id: z
		.number({
			required_error: "ID do item do combo não informado.",
			invalid_type_error: "Tipo inválido para ID do item do combo.",
		})
		.int(),
	index: z
		.number({
			invalid_type_error: "Tipo inválido para índice do item do combo.",
		})
		.int()
		.nullable(),
	additional_price: z
		.number({
			required_error: "Preço adicional não informado.",
			invalid_type_error: "Tipo inválido para preço adicional.",
		})
		.min(0),
});

const CardapioWebCatalogComboStepSchema = z.object({
	id: z
		.number({
			required_error: "ID da etapa do combo não informado.",
			invalid_type_error: "Tipo inválido para ID da etapa do combo.",
		})
		.int(),
	name: z.string({
		required_error: "Nome da etapa do combo não informado.",
		invalid_type_error: "Tipo inválido para nome da etapa do combo.",
	}),
	price: z
		.number({
			required_error: "Preço da etapa do combo não informado.",
			invalid_type_error: "Tipo inválido para preço da etapa do combo.",
		})
		.min(0),
	remove_add_on_prices: z.boolean({
		required_error: "Indicador de remoção de preços de complementos não informado.",
		invalid_type_error: "Tipo inválido para indicador de remoção de preços de complementos.",
	}),
	index: z
		.number({
			invalid_type_error: "Tipo inválido para índice da etapa do combo.",
		})
		.int()
		.nullable(),
	combo_step_items: z.array(CardapioWebCatalogComboStepItemSchema),
});

const CardapioWebCatalogItemSchema = z.object({
	id: z
		.number({
			required_error: "ID do item não informado.",
			invalid_type_error: "Tipo inválido para ID do item.",
		})
		.int(),
	name: z.string({
		required_error: "Nome do item não informado.",
		invalid_type_error: "Tipo inválido para nome do item.",
	}),
	description: z.string({
		required_error: "Descrição do item não informada.",
		invalid_type_error: "Tipo inválido para descrição do item.",
	}),
	image: CardapioWebCatalogImageSchema.nullable(),
	highlighted: z.boolean({
		required_error: "Indicador de destaque não informado.",
		invalid_type_error: "Tipo inválido para indicador de destaque.",
	}),
	external_code: z
		.string({
			required_error: "Código externo não informado.",
			invalid_type_error: "Tipo inválido para código externo.",
		})
		.nullable(),
	price: z
		.number({
			required_error: "Preço do item não informado.",
			invalid_type_error: "Tipo inválido para preço do item.",
		})
		.min(0),
	cost_price: z.number({ invalid_type_error: "Tipo inválido para preço de custo do item." }).min(0).nullable().optional(),
	stock: z
		.number({
			invalid_type_error: "Tipo inválido para estoque.",
		})
		.min(0)
		.nullable(),
	active_stock_control: z.boolean({
		required_error: "Indicador de controle de estoque não informado.",
		invalid_type_error: "Tipo inválido para indicador de controle de estoque.",
	}),
	index: z
		.number({
			invalid_type_error: "Tipo inválido para índice do item.",
		})
		.int()
		.nullable(),
	available_for: CardapioWebCatalogAvailableForListSchema,
	hide_observation_field: z.boolean({
		required_error: "Indicador de campo de observações não informado.",
		invalid_type_error: "Tipo inválido para indicador de campo de observações.",
	}),
	adults_only: z.boolean({
		required_error: "Indicador de maiores de 18 anos não informado.",
		invalid_type_error: "Tipo inválido para indicador de maiores de 18 anos.",
	}),
	promotional_price_active: z.boolean({
		required_error: "Indicador de preço promocional não informado.",
		invalid_type_error: "Tipo inválido para indicador de preço promocional.",
	}),
	promotional_price: z
		.number({
			invalid_type_error: "Tipo inválido para preço promocional.",
		})
		.min(0)
		.nullable(),
	promotional_price_schedules: z
		.preprocess(parseCardapioWebSerializedArray, z.array(CardapioWebCatalogPromotionalPriceScheduleSchema).nullable())
		.optional()
		.default(null),
	status: CardapioWebCatalogItemStatusSchema,
	unit_type: CardapioWebCatalogUnitTypeSchema,
	kind: CardapioWebCatalogItemKindSchema,
	allowed_times: z.array(CardapioWebCatalogAllowedTimesSchema),
	extra_images: z.array(CardapioWebCatalogImageSchema),
	option_groups: z.array(CardapioWebCatalogOptionGroupSchema),
	combo_steps: z.array(CardapioWebCatalogComboStepSchema),
});

const CardapioWebCatalogCategorySchema = z.object({
	id: z
		.number({
			required_error: "ID da categoria não informado.",
			invalid_type_error: "Tipo inválido para ID da categoria.",
		})
		.int(),
	name: z.string({
		required_error: "Nome da categoria não informado.",
		invalid_type_error: "Tipo inválido para nome da categoria.",
	}),
	description: z
		.string({
			invalid_type_error: "Tipo inválido para descrição da categoria.",
		})
		.nullable(),
	status: CardapioWebCatalogCategoryStatusSchema,
	index: z
		.number({
			invalid_type_error: "Tipo inválido para índice da categoria.",
		})
		.int()
		.nullable(),
	image: CardapioWebCatalogImageSchema.nullable(),
	allowed_times: z.array(CardapioWebCatalogAllowedTimesSchema),
	items: z.array(CardapioWebCatalogItemSchema),
});

export const GetCardapioWebCatalogOutputSchema = z.object({
	categories: z.array(CardapioWebCatalogCategorySchema),
});
export type TGetCardapioWebCatalogOutput = z.infer<typeof GetCardapioWebCatalogOutputSchema>;
