import { CashbackProgramSchema } from "@/schemas/cashback-programs";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

const CashbackProgramStateSchema = z.object({
	cashbackProgram: CashbackProgramSchema.omit({ dataInsercao: true, dataAtualizacao: true }),
});
type TCashbackProgramState = z.infer<typeof CashbackProgramStateSchema>;

type TUseCashbackProgramStateProps = {
	initialState?: Partial<TCashbackProgramState>;
};
export function useCashbackProgramState({ initialState }: TUseCashbackProgramStateProps) {
	const initialStateHolder = useMemo(() => {
		return {
			cashbackProgram: {
				ativo: initialState?.cashbackProgram?.ativo ?? true,
				titulo: initialState?.cashbackProgram?.titulo ?? "",
				descricao: initialState?.cashbackProgram?.descricao ?? "",
				acumuloTipo: initialState?.cashbackProgram?.acumuloTipo ?? "FIXO",
				acumuloValor: initialState?.cashbackProgram?.acumuloValor ?? 0,
				acumuloValorParceiro: initialState?.cashbackProgram?.acumuloValorParceiro ?? 0,
				acumuloRegraValorMinimo: initialState?.cashbackProgram?.acumuloRegraValorMinimo ?? 0,
				acumuloPermitirViaIntegracao: initialState?.cashbackProgram?.acumuloPermitirViaIntegracao ?? false,
				acumuloPermitirViaPontoIntegracao: initialState?.cashbackProgram?.acumuloPermitirViaPontoIntegracao ?? false,
				expiracaoRegraValidadeValor: initialState?.cashbackProgram?.expiracaoRegraValidadeValor ?? 0,
				resgateLimiteTipo: initialState?.cashbackProgram?.resgateLimiteTipo ?? null,
				resgateLimiteValor: initialState?.cashbackProgram?.resgateLimiteValor ?? null,
			},
		};
	}, []);
	const [state, setState] = useState<TCashbackProgramState>(initialStateHolder);

	const updateCashbackProgram = useCallback((cashbackProgram: Partial<TCashbackProgramState["cashbackProgram"]>) => {
		setState((prev) => ({
			...prev,
			cashbackProgram: { ...prev.cashbackProgram, ...cashbackProgram },
		}));
	}, []);

	const resetState = useCallback(() => {
		setState(initialStateHolder);
	}, [initialStateHolder]);

	const redefineState = useCallback((state: TCashbackProgramState) => {
		setState(state);
	}, []);
	return {
		state,
		updateCashbackProgram,
		resetState,
		redefineState,
	};
}
export type TUseCashbackProgramState = ReturnType<typeof useCashbackProgramState>;
