import { CashbackProgramPrizeSchema, CashbackProgramSchema } from "@/schemas/cashback-programs";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

const CashbackProgramStateSchema = z.object({
	cashbackProgram: CashbackProgramSchema.omit({ dataInsercao: true, dataAtualizacao: true }),
	cashbackProgramPrizes: z.array(
		CashbackProgramPrizeSchema.omit({
			dataInsercao: true,
			dataAtualizacao: true,
			organizacaoId: true,
			programaId: true,
		}).extend({
			id: z
				.string({
					invalid_type_error: "Tipo não válido para o ID do prêmio do programa de cashback.",
				})
				.optional()
				.nullable(),
			deletar: z
				.boolean({
					required_error: "Deletar prêmio do programa de cashback não informado.",
					invalid_type_error: "Tipo não válido para deletar prêmio do programa de cashback.",
				})
				.optional()
				.nullable(),
		}),
	),
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
				modalidadeDescontosPermitida: initialState?.cashbackProgram?.modalidadeDescontosPermitida ?? true,
				modalidadeRecompensasPermitida: initialState?.cashbackProgram?.modalidadeRecompensasPermitida ?? false,
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
			cashbackProgramPrizes: initialState?.cashbackProgramPrizes ?? [],
		};
	}, []);
	const [state, setState] = useState<TCashbackProgramState>(initialStateHolder);

	const updateCashbackProgram = useCallback((cashbackProgram: Partial<TCashbackProgramState["cashbackProgram"]>) => {
		setState((prev) => ({
			...prev,
			cashbackProgram: { ...prev.cashbackProgram, ...cashbackProgram },
		}));
	}, []);

	const addCashbackProgramPrize = useCallback((cashbackProgramPrize: TCashbackProgramState["cashbackProgramPrizes"][number]) => {
		setState((prev) => ({
			...prev,
			cashbackProgramPrizes: [...prev.cashbackProgramPrizes, cashbackProgramPrize],
		}));
	}, []);

	const updateCashbackProgramPrize = useCallback(
		(index: number, cashbackProgramPrize: Partial<TCashbackProgramState["cashbackProgramPrizes"][number]>) => {
			setState((prev) => ({
				...prev,
				cashbackProgramPrizes: prev.cashbackProgramPrizes.map((item, i) => (i === index ? { ...item, ...cashbackProgramPrize } : item)),
			}));
		},
		[],
	);
	const deleteCashbackProgramPrize = useCallback((index: number) => {
		setState((prev) => {
			// Validating existence (id defined)
			const isExistingUpdateItem = prev.cashbackProgramPrizes.find((c, i) => i === index && !!c.id);
			if (!isExistingUpdateItem)
				// If not an existing instance, just filtering it out
				return { ...prev, cashbackProgramPrizes: prev.cashbackProgramPrizes.filter((_, i) => i !== index) };
			// Else, marking it with a deletar flag
			return {
				...prev,
				cashbackProgramPrizes: prev.cashbackProgramPrizes.map((item, i) => (i === index ? { ...item, deletar: true } : item)),
			};
		});
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
		addCashbackProgramPrize,
		updateCashbackProgramPrize,
		deleteCashbackProgramPrize,
		resetState,
		redefineState,
	};
}
export type TUseCashbackProgramState = ReturnType<typeof useCashbackProgramState>;
