import { ClientSchema } from "@/schemas/clients";
import { SaleSchema } from "@/schemas/sales";
import { addPoiPrizeLine, setPoiPrizeLineQuantity } from "@/lib/point-of-interaction/prize-lines";
import { useCallback, useState } from "react";
import z from "zod";

export const PointOfInteractionNewInternalTransactionRequestStateSchema = z.object({
	client: ClientSchema.pick({
		nome: true,
		cpfCnpj: true,
		email: true,
		autorVendedorId: true,
		localizacaoCep: true,
		localizacaoEstado: true,
		localizacaoCidade: true,
		localizacaoBairro: true,
		localizacaoLogradouro: true,
		localizacaoNumero: true,
		localizacaoComplemento: true,
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
		// Valor do `<input type="date">` (AAAA-MM-DD); vira data só no envio.
		dataNascimento: z.string({ invalid_type_error: "Tipo não válido para data de nascimento." }).optional().nullable(),
	}),
	sale: SaleSchema.pick({
		valor: true,
	})
		.extend({
			// Quem fez a venda (opcional): null = a venda fica com o operador.
			vendedorId: z.string({ invalid_type_error: "Tipo não válido para o vendedor da venda." }).nullable(),
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
			// Recompensa avulsa: item fora do catálogo, descrito pelo operador, com o débito do saldo.
			freeFormReward: z.object({
				descricao: z.string({ invalid_type_error: "Tipo não válido para a descrição da recompensa avulsa." }),
				valor: z.number({ invalid_type_error: "Tipo não válido para o valor da recompensa avulsa." }).nullable(),
			}),
		})
		.refine((data) => data.valor >= 0, {
			message: "Valor da venda deve ser positivo.",
			path: ["valor"],
		}),
	marketingConsent: z.boolean({ invalid_type_error: "Tipo não válido para o consentimento de marketing." }),
	operatorIdentifier: z.string({
		required_error: "Identificador do operador não informado.",
		invalid_type_error: "Tipo não válido para identificador do operador.",
	}),
	operatorConfirmedSaleValue: z.number({ invalid_type_error: "Tipo não válido para o valor confirmado pelo operador." }).nullable(),
});
export type TPointOfInteractionNewInternalTransactionRequestState = z.infer<typeof PointOfInteractionNewInternalTransactionRequestStateSchema>;

const EMPTY_CLIENT: TPointOfInteractionNewInternalTransactionRequestState["client"] = {
	id: null,
	nome: "",
	cpfCnpj: null,
	telefone: "",
	email: null,
	dataNascimento: null,
	autorVendedorId: null,
	localizacaoCep: null,
	localizacaoEstado: null,
	localizacaoCidade: null,
	localizacaoBairro: null,
	localizacaoLogradouro: null,
	localizacaoNumero: null,
	localizacaoComplemento: null,
};

function buildInitialState(): TPointOfInteractionNewInternalTransactionRequestState {
	return {
		client: { ...EMPTY_CLIENT },
		sale: {
			valor: 0,
			cashback: { aplicar: false, valor: 0 },
			partnerCode: null,
			prizeRedemptions: [],
			freeFormReward: { descricao: "", valor: null },
			vendedorId: null,
		},
		marketingConsent: false,
		operatorIdentifier: "",
		operatorConfirmedSaleValue: null,
	};
}

export function usePointOfInteractionNewInternalTransactionRequestState() {
	const [state, setState] = useState<TPointOfInteractionNewInternalTransactionRequestState>(buildInitialState);

	const updateClient = useCallback((client: Partial<TPointOfInteractionNewInternalTransactionRequestState["client"]>) => {
		setState((prev) => ({
			...prev,
			client: { ...prev.client, ...client },
		}));
	}, []);

	/** Troca de telefone: tudo o que foi digitado para o cliente anterior deixa de valer. */
	const resetClient = useCallback((telefone: string) => {
		setState((prev) => ({ ...prev, client: { ...EMPTY_CLIENT, telefone }, marketingConsent: false }));
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

	const updateFreeFormReward = useCallback(
		(freeFormReward: Partial<TPointOfInteractionNewInternalTransactionRequestState["sale"]["freeFormReward"]>) => {
			setState((prev) => ({
				...prev,
				sale: { ...prev.sale, freeFormReward: { ...prev.sale.freeFormReward, ...freeFormReward } },
			}));
		},
		[],
	);

	const updateMarketingConsent = useCallback((marketingConsent: boolean) => {
		setState((prev) => ({ ...prev, marketingConsent }));
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
		setState(buildInitialState());
	}, []);

	const redefineState = useCallback((newState: TPointOfInteractionNewInternalTransactionRequestState) => {
		setState(newState);
	}, []);

	return {
		state,
		updateClient,
		resetClient,
		updateSale,
		updateCashback,
		updatePrizeRedemptions,
		addPrizeRedemption,
		setPrizeRedemptionQuantity,
		updateFreeFormReward,
		updateMarketingConsent,
		updateOperatorIdentifier,
		updateOperatorConfirmedSaleValue,
		resetState,
		redefineState,
	};
}
export type TUsePointOfInteractionNewInternalTransactionRequestState = ReturnType<typeof usePointOfInteractionNewInternalTransactionRequestState>;
