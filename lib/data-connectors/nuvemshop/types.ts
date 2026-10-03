import z from "zod";

export const NuvemshopConfigSchema = z.object({
	tipo: z.literal("NUVEM-SHOP"),
	storeId: z.string({
		required_error: "ID da loja Nuvem Shop não informado.",
		invalid_type_error: "Tipo inválido para ID da loja Nuvem Shop.",
	}),
	accessToken: z.string({
		required_error: "Token de acesso da Nuvem Shop não informado.",
		invalid_type_error: "Tipo inválido para token de acesso da Nuvem Shop.",
	}),
	tokenType: z.literal("bearer", {
		invalid_type_error: "Tipo inválido para tipo do token da Nuvem Shop.",
	}),
	scope: z.array(z.string({ invalid_type_error: "Tipo inválido para escopo da Nuvem Shop." })),
});
export type TNuvemshopConfig = z.infer<typeof NuvemshopConfigSchema>;

const NuvemshopNullableStringSchema = z
	.union([z.string(), z.number(), z.boolean()])
	.nullable()
	.optional()
	.transform((value) => {
		if (value === null || value === undefined) return null;
		return String(value);
	});

const NuvemshopMoneySchema = z
	.union([z.string(), z.number()])
	.nullable()
	.optional()
	.transform((value) => {
		if (value === null || value === undefined || value === "") return 0;
		const numberValue = Number(value);
		return Number.isFinite(numberValue) ? numberValue : 0;
	});

const NuvemshopNullableMoneySchema = z
	.union([z.string(), z.number()])
	.nullable()
	.optional()
	.transform((value) => {
		if (value === null || value === undefined || value === "") return null;
		const numberValue = Number(value);
		return Number.isFinite(numberValue) ? numberValue : null;
	});

const NuvemshopStockSchema = z
	.union([z.string(), z.number()])
	.nullable()
	.optional()
	.transform((value) => {
		if (value === null || value === undefined || value === "") return null;
		const numberValue = Number(value);
		return Number.isFinite(numberValue) ? numberValue : null;
	});

const NuvemshopLocalizedStringSchema = z
	.record(z.string().nullable().optional())
	.nullable()
	.optional()
	.transform((value) => value ?? {});

const NuvemshopCompletedAtSchema = z
	.object({
		date: z.string({ invalid_type_error: "Tipo inválido para data de conclusão do pedido." }).optional().nullable(),
		timezone: z.string({ invalid_type_error: "Tipo inválido para timezone do pedido." }).optional().nullable(),
	})
	.passthrough()
	.nullable()
	.optional();

export const NuvemshopCustomerSchema = z
	.object({
		id: z.union([z.string(), z.number()]).optional().nullable(),
		name: NuvemshopNullableStringSchema,
		email: NuvemshopNullableStringSchema,
		identification: NuvemshopNullableStringSchema,
		phone: NuvemshopNullableStringSchema,
		billing_name: NuvemshopNullableStringSchema,
		billing_phone: NuvemshopNullableStringSchema,
		billing_address: NuvemshopNullableStringSchema,
		billing_number: NuvemshopNullableStringSchema,
		billing_floor: NuvemshopNullableStringSchema,
		billing_locality: NuvemshopNullableStringSchema,
		billing_zipcode: NuvemshopNullableStringSchema,
		billing_city: NuvemshopNullableStringSchema,
		billing_province: NuvemshopNullableStringSchema,
	})
	.passthrough();
export type TNuvemshopCustomer = z.infer<typeof NuvemshopCustomerSchema>;

export const NuvemshopOrderProductSchema = z
	.object({
		id: z.union([z.string(), z.number()]).optional().nullable(),
		product_id: z.union([z.string(), z.number()]).optional().nullable(),
		variant_id: z.union([z.string(), z.number()]).optional().nullable(),
		name: NuvemshopNullableStringSchema,
		name_without_variants: NuvemshopNullableStringSchema,
		sku: NuvemshopNullableStringSchema,
		barcode: NuvemshopNullableStringSchema,
		price: NuvemshopMoneySchema,
		cost: NuvemshopMoneySchema,
		quantity: z
			.union([z.string(), z.number()])
			.nullable()
			.optional()
			.transform((value) => {
				if (value === null || value === undefined || value === "") return 0;
				const numberValue = Number(value);
				return Number.isFinite(numberValue) ? numberValue : 0;
			}),
		properties: z
			.union([z.array(z.unknown()), z.record(z.unknown())])
			.optional()
			.default([])
			.transform((value) => (Array.isArray(value) ? value : [value])),
	})
	.passthrough();
export type TNuvemshopOrderProduct = z.infer<typeof NuvemshopOrderProductSchema>;

export const NuvemshopOrderSchema = z
	.object({
		id: z.union([z.string(), z.number()]),
		number: z.union([z.string(), z.number()]).optional().nullable(),
		store_id: z.union([z.string(), z.number()]).optional().nullable(),
		contact_email: NuvemshopNullableStringSchema,
		contact_name: NuvemshopNullableStringSchema,
		contact_phone: NuvemshopNullableStringSchema,
		contact_identification: NuvemshopNullableStringSchema,
		billing_name: NuvemshopNullableStringSchema,
		billing_phone: NuvemshopNullableStringSchema,
		billing_address: NuvemshopNullableStringSchema,
		billing_number: NuvemshopNullableStringSchema,
		billing_floor: NuvemshopNullableStringSchema,
		billing_locality: NuvemshopNullableStringSchema,
		billing_zipcode: NuvemshopNullableStringSchema,
		billing_city: NuvemshopNullableStringSchema,
		billing_province: NuvemshopNullableStringSchema,
		subtotal: NuvemshopMoneySchema,
		discount: NuvemshopMoneySchema,
		discount_coupon: NuvemshopMoneySchema,
		discount_gateway: NuvemshopMoneySchema,
		total: NuvemshopMoneySchema,
		shipping_cost_customer: NuvemshopMoneySchema,
		shipping_cost_owner: NuvemshopMoneySchema,
		storefront: NuvemshopNullableStringSchema,
		note: NuvemshopNullableStringSchema,
		status: NuvemshopNullableStringSchema,
		payment_status: NuvemshopNullableStringSchema,
		shipping_status: NuvemshopNullableStringSchema,
		created_at: z.string({ invalid_type_error: "Tipo inválido para data de criação do pedido Nuvem Shop." }),
		updated_at: z.string({ invalid_type_error: "Tipo inválido para data de atualização do pedido Nuvem Shop." }).optional().nullable(),
		completed_at: NuvemshopCompletedAtSchema,
		customer: NuvemshopCustomerSchema.nullable().optional(),
		products: z.array(NuvemshopOrderProductSchema).optional().default([]),
	})
	.passthrough();
export type TNuvemshopOrder = z.infer<typeof NuvemshopOrderSchema>;

export const NuvemshopOrdersOutputSchema = z.array(NuvemshopOrderSchema);
export type TNuvemshopOrdersOutput = z.infer<typeof NuvemshopOrdersOutputSchema>;

const NuvemshopProductImageSchema = z
	.object({
		id: z.union([z.string(), z.number()]).optional().nullable(),
		src: NuvemshopNullableStringSchema,
		position: z.number({ invalid_type_error: "Tipo inválido para posição da imagem do produto Nuvem Shop." }).optional().nullable(),
	})
	.passthrough();

const NuvemshopProductCategorySchema = z.union([
	z
		.object({
			id: z.union([z.string(), z.number()]).optional().nullable(),
			name: NuvemshopLocalizedStringSchema,
		})
		.passthrough(),
	z.union([z.string(), z.number()]),
]);

const NuvemshopProductVariantValueSchema = NuvemshopLocalizedStringSchema;

export const NuvemshopProductVariantSchema = z
	.object({
		id: z.union([z.string(), z.number()]).optional().nullable(),
		product_id: z.union([z.string(), z.number()]).optional().nullable(),
		values: z.array(NuvemshopProductVariantValueSchema).optional().default([]),
		price: NuvemshopMoneySchema,
		promotional_price: NuvemshopNullableMoneySchema,
		cost: NuvemshopNullableMoneySchema,
		stock_management: z.boolean({ invalid_type_error: "Tipo inválido para controle de estoque do produto Nuvem Shop." }).optional().nullable(),
		stock: NuvemshopStockSchema,
		sku: NuvemshopNullableStringSchema,
		barcode: NuvemshopNullableStringSchema,
	})
	.passthrough();
export type TNuvemshopProductVariant = z.infer<typeof NuvemshopProductVariantSchema>;

export const NuvemshopProductSchema = z
	.object({
		id: z.union([z.string(), z.number()]),
		name: NuvemshopLocalizedStringSchema,
		description: NuvemshopLocalizedStringSchema,
		images: z.array(NuvemshopProductImageSchema).optional().default([]),
		categories: z.array(NuvemshopProductCategorySchema).optional().default([]),
		brand: NuvemshopNullableStringSchema,
		published: z.boolean({ invalid_type_error: "Tipo inválido para publicação do produto Nuvem Shop." }).optional().default(true),
		// Nomes dos eixos de variação ("Cor", "Tamanho"), alinhados posicionalmente com variant.values.
		attributes: z.array(NuvemshopLocalizedStringSchema).optional().default([]),
		variants: z.array(NuvemshopProductVariantSchema).optional().default([]),
	})
	.passthrough();
export type TNuvemshopProduct = z.infer<typeof NuvemshopProductSchema>;

export const NuvemshopProductsOutputSchema = z.array(NuvemshopProductSchema);
export type TNuvemshopProductsOutput = z.infer<typeof NuvemshopProductsOutputSchema>;
