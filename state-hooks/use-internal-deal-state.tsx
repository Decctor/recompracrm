import { DealSchema } from "@/schemas/deals";
import { useCallback, useState } from "react";
import z from "zod";

const DealStateSchema = z.object({
	deal: DealSchema.omit({
		// planoBase não é escolhido pelo admin: o servidor grava DEAL_PLAN_KEY na criação.
		planoBase: true,
		status: true,
		stripeConta: true,
		stripePriceId: true,
		stripeCustomerId: true,
		stripeSubscriptionId: true,
		stripeCheckoutSessionId: true,
		stripeSubscriptionStatus: true,
		stripeSubscriptionStatusUltimaAlteracao: true,
		autorId: true,
		dataInsercao: true,
	}),
});
export type TDealState = z.infer<typeof DealStateSchema>;

export function useInternalDealState({ initialState }: { initialState: Partial<TDealState> }) {
	const defaultState: TDealState = {
		deal: {
			nome: "",
			descricao: null,
			usuarioObtentorId: null,
			nomeObtentor: "",
			emailObtentor: "",
			telefoneObtentor: null,
			quantidadeLicencas: 1,
			valorUnitarioCentavos: 0,
			intervalo: "MENSAL",
			...initialState.deal,
		},
	};
	const [state, setState] = useState<TDealState>(defaultState);

	const updateDeal = useCallback((deal: Partial<TDealState["deal"]>) => {
		setState((prev) => ({
			...prev,
			deal: {
				...prev.deal,
				...deal,
			},
		}));
	}, []);

	const resetState = useCallback(() => {
		setState(defaultState);
	}, []);

	const redefineState = useCallback((newState: TDealState) => {
		setState(newState);
	}, []);

	return {
		state,
		updateDeal,
		resetState,
		redefineState,
	};
}
export type TUseInternalDealState = ReturnType<typeof useInternalDealState>;
