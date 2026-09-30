import z from "zod";

export const IFOOD_API_BASE_URL = "https://merchant-api.ifood.com.br";
export const IFOOD_AUTH_BASE_URL = `${IFOOD_API_BASE_URL}/authentication/v1.0`;
export const IFOOD_EVENTS_BASE_URL = `${IFOOD_API_BASE_URL}/events/v1.0`;
export const IFOOD_ORDER_BASE_URL = `${IFOOD_API_BASE_URL}/order/v1.0`;
export const IFOOD_MERCHANT_BASE_URL = `${IFOOD_API_BASE_URL}/merchant/v1.0`;

export const IfoodConfigSchema = z.object({
	tipo: z.literal("IFOOD"),
	merchantIds: z.array(z.string()).default([]),
	accessToken: z.string(),
	refreshToken: z.string(),
	tokenType: z.literal("bearer"),
	scope: z.array(z.string()).default([]),
	expiresAt: z.string().datetime(),
	authorizedAt: z.string().datetime().optional().nullable(),
	// Política operacional da conexão (não credencial): aceitar pedidos PLACED automaticamente
	// na ingestão. PRECISA estar declarada aqui: o refresh de token reescreve o blob inteiro a
	// partir do parse deste schema — campo não declarado seria descartado no strip do Zod.
	// Escritas do toggle usam patch cirúrgico jsonb_set (padrão do merchantIds em context.ts).
	aceiteAutomaticoPedidos: z.boolean().optional().default(false),
});
export type TIfoodConfig = z.infer<typeof IfoodConfigSchema>;

export const IfoodUserCodeResponseSchema = z
	.object({
		userCode: z.string(),
		authorizationCodeVerifier: z.string(),
		verificationUrl: z.string().optional().nullable(),
		verificationUrlComplete: z.string().optional().nullable(),
		expiresIn: z.number().optional().nullable(),
	})
	.passthrough();
export type TIfoodUserCodeResponse = z.infer<typeof IfoodUserCodeResponseSchema>;

const IfoodTokenRawResponseSchema = z
	.object({
		accessToken: z.string().optional(),
		access_token: z.string().optional(),
		refreshToken: z.string().optional(),
		refresh_token: z.string().optional(),
		tokenType: z.string().optional(),
		token_type: z.string().optional(),
		expiresIn: z.number().optional(),
		expires_in: z.number().optional(),
		scope: z.union([z.string(), z.array(z.string())]).optional(),
	})
	.passthrough();

export const IfoodTokenResponseSchema = IfoodTokenRawResponseSchema.transform((value, ctx) => {
	const accessToken = value.accessToken ?? value.access_token;
	const refreshToken = value.refreshToken ?? value.refresh_token;
	const expiresIn = value.expiresIn ?? value.expires_in ?? 60 * 60 * 6;

	if (!accessToken || !refreshToken) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Resposta de autenticação do iFood sem tokens.",
		});
		return z.NEVER;
	}

	return {
		accessToken,
		refreshToken,
		tokenType: "bearer" as const,
		expiresIn,
		scope: Array.isArray(value.scope)
			? value.scope
			: value.scope
				? value.scope
						.split(/[,\s]+/)
						.map((scope) => scope.trim())
						.filter(Boolean)
				: [],
	};
});
export type TIfoodTokenResponse = z.infer<typeof IfoodTokenResponseSchema>;

export const IfoodMerchantSchema = z
	.object({
		id: z.string(),
		name: z.string().optional().nullable(),
	})
	.passthrough();
export type TIfoodMerchant = z.infer<typeof IfoodMerchantSchema>;

export const IfoodMerchantsOutputSchema = z.union([
	z.array(IfoodMerchantSchema),
	z.object({ merchants: z.array(IfoodMerchantSchema) }).passthrough(),
]);

export const IfoodEventSchema = z
	.object({
		id: z.string(),
		code: z.string(),
		fullCode: z.string().optional().nullable(),
		orderId: z.string().optional().nullable(),
		createdAt: z.string().optional().nullable(),
		metadata: z.record(z.unknown()).optional().nullable(),
	})
	.passthrough();
export type TIfoodEvent = z.infer<typeof IfoodEventSchema>;

export const IfoodEventsPollingOutputSchema = z.union([z.array(IfoodEventSchema), z.object({ events: z.array(IfoodEventSchema) }).passthrough()]);

const NullableStringSchema = z
	.union([z.string(), z.number(), z.boolean()])
	.optional()
	.nullable()
	.transform((value) => {
		if (value === null || value === undefined) return null;
		return String(value);
	});

const IfoodPhoneSchema = z
	.union([
		z.string(),
		z.number(),
		z.boolean(),
		z
			.object({
				number: z.union([z.string(), z.number(), z.boolean()]).optional().nullable(),
				localizer: z.union([z.string(), z.number(), z.boolean()]).optional().nullable(),
				localizerExpiration: NullableStringSchema,
			})
			.passthrough(),
	])
	.optional()
	.nullable()
	.transform((value) => {
		if (value === null || value === undefined) return null;
		if (typeof value !== "object") return { number: String(value), localizer: null, localizerExpiration: null };
		return {
			number: value.number === null || value.number === undefined ? null : String(value.number),
			localizer: value.localizer === null || value.localizer === undefined ? null : String(value.localizer),
			localizerExpiration: value.localizerExpiration,
		};
	});

const MoneySchema = z
	.union([z.string(), z.number()])
	.optional()
	.nullable()
	.transform((value) => {
		if (value === null || value === undefined || value === "") return 0;
		const numberValue = Number(value);
		return Number.isFinite(numberValue) ? numberValue : 0;
	});

export const IfoodOrderCustomerSchema = z
	.object({
		id: NullableStringSchema,
		name: NullableStringSchema,
		documentNumber: NullableStringSchema,
		phone: IfoodPhoneSchema,
		email: NullableStringSchema,
	})
	.passthrough();
export type TIfoodOrderCustomer = z.infer<typeof IfoodOrderCustomerSchema>;

export const IfoodOrderDeliveryAddressSchema = z
	.object({
		postalCode: NullableStringSchema,
		state: NullableStringSchema,
		city: NullableStringSchema,
		neighborhood: NullableStringSchema,
		streetName: NullableStringSchema,
		streetNumber: NullableStringSchema,
		complement: NullableStringSchema,
		// Ponto de referência ("próximo ao mercado") — por pedido, não vai para o cadastro do cliente.
		reference: NullableStringSchema,
		coordinates: z
			.object({
				latitude: NullableStringSchema,
				longitude: NullableStringSchema,
			})
			.passthrough()
			.optional()
			.nullable(),
	})
	.passthrough();

export const IfoodOrderDeliverySchema = z
	.object({
		deliveredBy: NullableStringSchema,
		deliveryAddress: IfoodOrderDeliveryAddressSchema.optional().nullable(),
		deliveryDateTime: NullableStringSchema,
		mode: NullableStringSchema,
		// Instrução do cliente para a entrega ("tocar a campainha", "deixar na portaria").
		observations: NullableStringSchema,
	})
	.passthrough();

export const IfoodOrderItemOptionSchema = z
	.object({
		id: NullableStringSchema,
		name: NullableStringSchema,
		externalCode: NullableStringSchema,
		quantity: MoneySchema,
		unitPrice: MoneySchema,
		totalPrice: MoneySchema,
		groupName: NullableStringSchema,
		groupId: NullableStringSchema,
	})
	.passthrough();

export const IfoodOrderItemSchema = z
	.object({
		// Posição do item no pedido — referenciada por benefits com target ITEM (targetId = index).
		index: NullableStringSchema,
		id: NullableStringSchema,
		uniqueId: NullableStringSchema,
		name: NullableStringSchema,
		externalCode: NullableStringSchema,
		quantity: MoneySchema,
		unitPrice: MoneySchema,
		totalPrice: MoneySchema,
		observations: NullableStringSchema,
		options: z.array(IfoodOrderItemOptionSchema).optional().default([]),
	})
	.passthrough();
export type TIfoodOrderItem = z.infer<typeof IfoodOrderItemSchema>;

const IfoodBenefitSponsorshipValueSchema = z
	.object({
		/** IFOOD | MERCHANT | EXTERNAL | CHAIN */
		name: NullableStringSchema,
		value: MoneySchema,
		description: NullableStringSchema,
	})
	.passthrough();

export const IfoodOrderBenefitSchema = z
	.object({
		value: MoneySchema,
		/** CART | DELIVERY_FEE | ITEM | PROGRESSIVE_DISCOUNT_ITEM */
		target: NullableStringSchema,
		targetId: NullableStringSchema,
		// `.catch(null)`: payloads antigos/inesperados não derrubam o parse do pedido inteiro.
		sponsorshipValues: z.array(IfoodBenefitSponsorshipValueSchema).optional().nullable().catch(null),
	})
	.passthrough();
export type TIfoodOrderBenefit = z.infer<typeof IfoodOrderBenefitSchema>;

export const IfoodOrderAdditionalFeeSchema = z
	.object({
		type: NullableStringSchema,
		value: MoneySchema,
		liabilities: z
			.array(z.object({ name: NullableStringSchema, percentage: MoneySchema }).passthrough())
			.optional()
			.nullable()
			.catch(null),
	})
	.passthrough();
export type TIfoodOrderAdditionalFee = z.infer<typeof IfoodOrderAdditionalFeeSchema>;

export const IfoodOrderTotalSchema = z
	.object({
		subTotal: MoneySchema,
		deliveryFee: MoneySchema,
		benefits: MoneySchema,
		orderAmount: MoneySchema,
		additionalFees: MoneySchema,
	})
	.passthrough();

export const IfoodOrderPaymentMethodSchema = z
	.object({
		value: MoneySchema,
		currency: NullableStringSchema,
		/** CREDIT, DEBIT, PIX, CASH, MEAL_VOUCHER, FOOD_VOUCHER, DIGITAL_WALLET, ... */
		method: NullableStringSchema,
		/** ONLINE (pago no app) | OFFLINE (pago na entrega/retirada) */
		type: NullableStringSchema,
		prepaid: z.boolean().optional().nullable(),
		card: z
			.object({
				brand: NullableStringSchema,
			})
			.passthrough()
			.optional()
			.nullable(),
		/** Pagamento em dinheiro na entrega: `changeFor` = nota com que o cliente vai pagar. */
		cash: z
			.object({
				changeFor: MoneySchema,
			})
			.passthrough()
			.optional()
			.nullable()
			.catch(null),
	})
	.passthrough();
export type TIfoodOrderPaymentMethod = z.infer<typeof IfoodOrderPaymentMethodSchema>;

export const IfoodOrderPaymentsSchema = z
	.object({
		methods: z.array(IfoodOrderPaymentMethodSchema).optional().default([]),
		pending: MoneySchema,
		prepaid: MoneySchema,
	})
	.passthrough();

export const IfoodOrderSchema = z
	.object({
		id: z.string(),
		displayId: NullableStringSchema,
		merchant: z
			.object({
				id: NullableStringSchema,
				name: NullableStringSchema,
			})
			.passthrough()
			.optional()
			.nullable(),
		orderType: NullableStringSchema,
		orderTiming: NullableStringSchema,
		category: NullableStringSchema,
		salesChannel: NullableStringSchema,
		status: NullableStringSchema,
		createdAt: NullableStringSchema,
		confirmedAt: NullableStringSchema,
		concludedAt: NullableStringSchema,
		cancelledAt: NullableStringSchema,
		customer: IfoodOrderCustomerSchema.optional().nullable(),
		delivery: IfoodOrderDeliverySchema.optional().nullable(),
		items: z.array(IfoodOrderItemSchema).optional().default([]),
		total: IfoodOrderTotalSchema.optional().default({ subTotal: 0, deliveryFee: 0, benefits: 0, orderAmount: 0, additionalFees: 0 }),
		benefits: z.array(IfoodOrderBenefitSchema).optional().default([]),
		additionalFees: z.array(IfoodOrderAdditionalFeeSchema).optional().default([]),
		payments: IfoodOrderPaymentsSchema.optional().nullable(),
	})
	.passthrough();
export type TIfoodOrder = z.infer<typeof IfoodOrderSchema>;
