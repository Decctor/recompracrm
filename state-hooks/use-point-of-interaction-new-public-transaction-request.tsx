import { ClientSchema } from "@/schemas/clients";
import { DeliveryModeEnum, PoiTransactionRequestStatusEnum } from "@/schemas/enums";
import { SaleSchema } from "@/schemas/sales";
import { useCallback, useState } from "react";
import z from "zod";

export const PointOfInteractionNewSaleStateSchema = z.object({
	orgId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	client: ClientSchema.pick({
		nome: true,
		cpfCnpj: true,
	}).extend({
		id: z
			.string({
				invalid_type_error: "Tipo não válido para ID do cliente.",
			})
			.optional()
			.nullable(),
		telefone: z.string({
			required_error: "Telefone não informado.",
			invalid_type_error: "Tipo não válido para telefone.",
		}),
	}),
	sale: SaleSchema.pick({
		valor: true,
	})
		.extend({
			entregaModalidade: DeliveryModeEnum.optional().nullable(),
			cashback: z.object({
				aplicar: z
					.boolean({
						required_error: "Se deve aplicar cashback não informado.",
						invalid_type_error: "Tipo não válido para se deve aplicar cashback.",
					})
					.default(false),
				valor: z
					.number({
						required_error: "Valor do cashback não informado.",
						invalid_type_error: "Tipo não válido para valor do cashback.",
					})
					.nonnegative()
					.default(0),
			}),
			partnerCode: z
				.string({
					invalid_type_error: "Tipo não válido para código de parceiro.",
				})
				.optional()
				.nullable(),
			prizeRedemption: z
				.object({
					prizeId: z.string(),
					prizeValue: z.number(),
					prizeSaleValue: z.number(),
				})
				.optional()
				.nullable(),
			// Cupom selecionado: em cupons AUTOMATICA o valorDesconto vem do servidor;
			// em cupons MANUAL ele é informado pelo operador (na confirmação do totem ou na aprovação da solicitação).
			coupon: z
				.object({
					cupomId: z.string({
						required_error: "ID do cupom não informado.",
						invalid_type_error: "Tipo não válido para ID do cupom.",
					}),
					valorDesconto: z.number({ invalid_type_error: "Tipo não válido para o valor de desconto do cupom." }).optional().nullable(),
				})
				.optional()
				.nullable(),
		})
		.refine((data) => data.valor > 0, {
			message: "Valor da venda deve ser positivo.",
			path: ["valor"],
		}),
	operatorIdentifier: z.string({
		required_error: "Identificador do operador não informado.",
		invalid_type_error: "Tipo não válido para identificador do operador.",
	}),
	operatorConfirmedSaleValue: z.number({ invalid_type_error: "Tipo não válido para o valor confirmado pelo operador." }).nullable(),
	interfaceMode: z.enum(["kiosk", "mobile"]),
	watchTransactionRequestToken: z.string({ invalid_type_error: "Tipo não válido para token da solicitação." }).nullable(),
	watchTransactionRequestStatus: PoiTransactionRequestStatusEnum.nullable(),
});
export type TPointOfInteractionNewSaleState = z.infer<typeof PointOfInteractionNewSaleStateSchema>;

export function usePointOfInteractionNewSaleState(initialOrgId: string, initialInterfaceMode: "kiosk" | "mobile" = "kiosk") {
	const [state, setState] = useState<TPointOfInteractionNewSaleState>({
		orgId: initialOrgId,
		client: { id: null, nome: "", cpfCnpj: null, telefone: "" },
		sale: { valor: 0, entregaModalidade: "PRESENCIAL", cashback: { aplicar: false, valor: 0 }, partnerCode: null, prizeRedemption: null, coupon: null },
		operatorIdentifier: "",
		operatorConfirmedSaleValue: null,
		interfaceMode: initialInterfaceMode,
		watchTransactionRequestToken: null,
		watchTransactionRequestStatus: null,
	});

	const updateClient = useCallback((client: Partial<TPointOfInteractionNewSaleState["client"]>) => {
		setState((prev) => ({
			...prev,
			client: { ...prev.client, ...client },
		}));
	}, []);

	const updateSale = useCallback((sale: Partial<TPointOfInteractionNewSaleState["sale"]>) => {
		setState((prev) => ({
			...prev,
			sale: { ...prev.sale, ...sale },
			operatorConfirmedSaleValue: sale.valor !== undefined ? null : prev.operatorConfirmedSaleValue,
		}));
	}, []);

	const updateCashback = useCallback((cashback: Partial<TPointOfInteractionNewSaleState["sale"]["cashback"]>) => {
		setState((prev) => ({
			...prev,
			sale: { ...prev.sale, cashback: { ...prev.sale.cashback, ...cashback } },
		}));
	}, []);

	const updatePrizeRedemption = useCallback((prizeRedemption: TPointOfInteractionNewSaleState["sale"]["prizeRedemption"]) => {
		setState((prev) => ({
			...prev,
			sale: { ...prev.sale, prizeRedemption },
		}));
	}, []);

	const updateCoupon = useCallback((coupon: TPointOfInteractionNewSaleState["sale"]["coupon"]) => {
		setState((prev) => ({
			...prev,
			sale: { ...prev.sale, coupon },
		}));
	}, []);

	const updateOperatorIdentifier = useCallback((operatorIdentifier: string) => {
		setState((prev) => ({
			...prev,
			operatorIdentifier,
		}));
	}, []);

	const updateOperatorConfirmedSaleValue = useCallback((operatorConfirmedSaleValue: number | null) => {
		setState((prev) => ({
			...prev,
			operatorConfirmedSaleValue,
		}));
	}, []);

	const updateWatchTransactionRequest = useCallback(
		({ token, status }: { token?: string | null; status?: TPointOfInteractionNewSaleState["watchTransactionRequestStatus"] }) => {
			setState((prev) => ({
				...prev,
				watchTransactionRequestToken: token !== undefined ? token : prev.watchTransactionRequestToken,
				watchTransactionRequestStatus: status !== undefined ? status : prev.watchTransactionRequestStatus,
			}));
		},
		[],
	);

	const resetState = useCallback(() => {
		setState({
			orgId: initialOrgId,
			client: { id: null, nome: "", cpfCnpj: null, telefone: "" },
			sale: { valor: 0, entregaModalidade: "PRESENCIAL", cashback: { aplicar: false, valor: 0 }, partnerCode: null, prizeRedemption: null, coupon: null },
			operatorIdentifier: "",
			operatorConfirmedSaleValue: null,
			interfaceMode: initialInterfaceMode,
			watchTransactionRequestToken: null,
			watchTransactionRequestStatus: null,
		});
	}, [initialOrgId, initialInterfaceMode]);

	const redefineState = useCallback((newState: TPointOfInteractionNewSaleState) => {
		setState(newState);
	}, []);

	return {
		state,
		updateClient,
		updateSale,
		updateCashback,
		updatePrizeRedemption,
		updateCoupon,
		updateOperatorIdentifier,
		updateOperatorConfirmedSaleValue,
		updateWatchTransactionRequest,
		resetState,
		redefineState,
	};
}
export type TUsePointOfInteractionNewSaleState = ReturnType<typeof usePointOfInteractionNewSaleState>;
