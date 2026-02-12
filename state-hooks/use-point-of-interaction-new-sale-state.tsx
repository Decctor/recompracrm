import { ClientSchema } from "@/schemas/clients";
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
		})
		.refine((data) => data.valor > 0, {
			message: "Valor da venda deve ser positivo.",
			path: ["valor"],
		}),
	operatorIdentifier: z.string({
		required_error: "Identificador do operador não informado.",
		invalid_type_error: "Tipo não válido para identificador do operador.",
	}),
});
export type TPointOfInteractionNewSaleState = z.infer<typeof PointOfInteractionNewSaleStateSchema>;

export function usePointOfInteractionNewSaleState(initialOrgId: string) {
	const [state, setState] = useState<TPointOfInteractionNewSaleState>({
		orgId: initialOrgId,
		client: { id: null, nome: "", cpfCnpj: null, telefone: "" },
		sale: { valor: 0, cashback: { aplicar: false, valor: 0 }, partnerCode: null },
		operatorIdentifier: "",
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
		}));
	}, []);

	const updateCashback = useCallback((cashback: Partial<TPointOfInteractionNewSaleState["sale"]["cashback"]>) => {
		setState((prev) => ({
			...prev,
			sale: { ...prev.sale, cashback: { ...prev.sale.cashback, ...cashback } },
		}));
	}, []);

	const updateOperatorIdentifier = useCallback((operatorIdentifier: string) => {
		setState((prev) => ({
			...prev,
			operatorIdentifier,
		}));
	}, []);

	const resetState = useCallback(() => {
		setState({
			orgId: initialOrgId,
			client: { id: null, nome: "", cpfCnpj: null, telefone: "" },
			sale: { valor: 0, cashback: { aplicar: false, valor: 0 }, partnerCode: null },
			operatorIdentifier: "",
		});
	}, [initialOrgId]);

	const redefineState = useCallback((newState: TPointOfInteractionNewSaleState) => {
		setState(newState);
	}, []);

	return {
		state,
		updateClient,
		updateSale,
		updateCashback,
		updateOperatorIdentifier,
		resetState,
		redefineState,
	};
}
export type TUsePointOfInteractionNewSaleState = ReturnType<typeof usePointOfInteractionNewSaleState>;
