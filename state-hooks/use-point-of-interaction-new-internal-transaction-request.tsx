import { ClientSchema } from "@/schemas/clients";
import { SaleSchema } from "@/schemas/sales";
import { addPoiPrizeLine, setPoiPrizeLineQuantity } from "@/lib/point-of-interaction/prize-lines";
import { useCallback, useState } from "react";
import z from "zod";

export const PointOfInteractionNewInternalTransactionRequestStateSchema = z.object({
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
			// Uma linha por recompensa distinta, com quantidade (valores por unidade, informativos).
			prizeRedemptions: z.array(
				z.object({
					prizeId: z.string(),
					prizeValue: z.number(),
					prizeSaleValue: z.number(),
					quantity: z.number().int().min(1),
				}),
			),
		})
		.refine((data) => data.valor >= 0, {
			message: "Valor da venda deve ser positivo.",
			path: ["valor"],
		}),
	operatorIdentifier: z.string({
		required_error: "Identificador do operador não informado.",
		invalid_type_error: "Tipo não válido para identificador do operador.",
	}),
	operatorConfirmedSaleValue: z.number({ invalid_type_error: "Tipo não válido para o valor confirmado pelo operador." }).nullable(),
});
export type TPointOfInteractionNewInternalTransactionRequestState = z.infer<typeof PointOfInteractionNewInternalTransactionRequestStateSchema>;

export function usePointOfInteractionNewInternalTransactionRequestState() {
	const [state, setState] = useState<TPointOfInteractionNewInternalTransactionRequestState>({
		client: { id: null, nome: "", cpfCnpj: null, telefone: "" },
		sale: { valor: 0, cashback: { aplicar: false, valor: 0 }, partnerCode: null, prizeRedemptions: [] },
		operatorIdentifier: "",
		operatorConfirmedSaleValue: null,
	});

	const updateClient = useCallback((client: Partial<TPointOfInteractionNewInternalTransactionRequestState["client"]>) => {
		setState((prev) => ({
			...prev,
			client: { ...prev.client, ...client },
		}));
	}, []);

	const updateSale = useCallback((sale: Partial<TPointOfInteractionNewInternalTransactionRequestState["sale"]>) => {
		setState((prev) => ({
			...prev,
			sale: { ...prev.sale, ...sale },
			operatorConfirmedSaleValue: sale.valor !== undefined ? null : prev.operatorConfirmedSaleValue,
		}));
	}, []);

	const updateCashback = useCallback((cashback: Partial<TPointOfInteractionNewInternalTransactionRequestState["sale"]["cashback"]>) => {
		setState((prev) => ({
			...prev,
			sale: { ...prev.sale, cashback: { ...prev.sale.cashback, ...cashback } },
		}));
	}, []);

	const updatePrizeRedemptions = useCallback((prizeRedemptions: TPointOfInteractionNewInternalTransactionRequestState["sale"]["prizeRedemptions"]) => {
		setState((prev) => ({
			...prev,
			sale: { ...prev.sale, prizeRedemptions },
		}));
	}, []);

	/** Adiciona uma unidade da recompensa (incrementa a linha existente ou cria uma nova). */
	const addPrizeRedemption = useCallback((prize: { id: string; valor: number; valorVenda: number }) => {
		setState((prev) => ({
			...prev,
			sale: { ...prev.sale, prizeRedemptions: addPoiPrizeLine(prev.sale.prizeRedemptions, prize) },
		}));
	}, []);

	/** Quantidade < 1 remove a linha. */
	const setPrizeRedemptionQuantity = useCallback((prizeId: string, quantity: number) => {
		setState((prev) => ({
			...prev,
			sale: { ...prev.sale, prizeRedemptions: setPoiPrizeLineQuantity(prev.sale.prizeRedemptions, prizeId, quantity) },
		}));
	}, []);

	const updateOperatorIdentifier = useCallback((operatorIdentifier: string) => {
		setState((prev) => ({
			...prev,
			operatorIdentifier,
		}));
	}, []);

	const updateOperatorConfirmedSaleValue = useCallback((operatorConfirmedSaleValue: number | null) => {
		setState((prev) => ({ ...prev, operatorConfirmedSaleValue }));
	}, []);

	const resetState = useCallback(() => {
		setState({
			client: { id: null, nome: "", cpfCnpj: null, telefone: "" },
			sale: { valor: 0, cashback: { aplicar: false, valor: 0 }, partnerCode: null, prizeRedemptions: [] },
			operatorIdentifier: "",
			operatorConfirmedSaleValue: null,
		});
	}, []);

	const redefineState = useCallback((newState: TPointOfInteractionNewInternalTransactionRequestState) => {
		setState(newState);
	}, []);

	return {
		state,
		updateClient,
		updateSale,
		updateCashback,
		updatePrizeRedemptions,
		addPrizeRedemption,
		setPrizeRedemptionQuantity,
		updateOperatorIdentifier,
		updateOperatorConfirmedSaleValue,
		resetState,
		redefineState,
	};
}
export type TUsePointOfInteractionNewInternalTransactionRequestState = ReturnType<typeof usePointOfInteractionNewInternalTransactionRequestState>;
