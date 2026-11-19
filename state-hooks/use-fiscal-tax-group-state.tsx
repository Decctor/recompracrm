import { FiscalTaxGroupRuleSchema, FiscalTaxGroupSchema } from "@/schemas/fiscal";
import { useCallback, useMemo, useState } from "react";
import { z } from "zod";

const FiscalTaxGroupStateSchema = z.object({
	fiscalTaxGroup: FiscalTaxGroupSchema.omit({
		organizacaoId: true,
		dataInsercao: true,
	}),
	regras: z.array(
		FiscalTaxGroupRuleSchema.omit({
			grupoTributarioId: true,
			organizacaoId: true,
			dataInsercao: true,
		}).extend({
			id: z.string({ invalid_type_error: "Tipo não válido para ID da regra." }).optional(),
			deletar: z.boolean({ invalid_type_error: "Tipo não válido para deletar regra." }).optional(),
		}),
	),
});
export type TFiscalTaxGroupState = z.infer<typeof FiscalTaxGroupStateSchema>;
export type TFiscalTaxGroupStateRule = TFiscalTaxGroupState["regras"][number];

type UseFiscalTaxGroupStateProps = {
	initialState?: Partial<TFiscalTaxGroupState>;
};

export function useFiscalTaxGroupState({ initialState }: UseFiscalTaxGroupStateProps = {}) {
	const initialStateHolder = useMemo<TFiscalTaxGroupState>(() => {
		return {
			fiscalTaxGroup: {
				nome: initialState?.fiscalTaxGroup?.nome ?? "",
				descricao: initialState?.fiscalTaxGroup?.descricao ?? "",
				csosn: initialState?.fiscalTaxGroup?.csosn ?? "102",
				csosnComCredito: initialState?.fiscalTaxGroup?.csosnComCredito ?? null,
				csosnSemCredito: initialState?.fiscalTaxGroup?.csosnSemCredito ?? null,
				aliquotaIcms: initialState?.fiscalTaxGroup?.aliquotaIcms ?? 0,
				percentualReducaoBc: initialState?.fiscalTaxGroup?.percentualReducaoBc ?? 0,
				modalidadeBc: initialState?.fiscalTaxGroup?.modalidadeBc ?? 3,
				percentualCreditoSn: initialState?.fiscalTaxGroup?.percentualCreditoSn ?? null,
				temSubstituicaoTributaria: initialState?.fiscalTaxGroup?.temSubstituicaoTributaria ?? false,
				mvaSt: initialState?.fiscalTaxGroup?.mvaSt ?? null,
				aliquotaIcmsSt: initialState?.fiscalTaxGroup?.aliquotaIcmsSt ?? null,
				aliquotaInternaDestino: initialState?.fiscalTaxGroup?.aliquotaInternaDestino ?? null,
				percentualReducaoBcSt: initialState?.fiscalTaxGroup?.percentualReducaoBcSt ?? null,
				aliquotaFcp: initialState?.fiscalTaxGroup?.aliquotaFcp ?? 0,
				aliquotaFcpSt: initialState?.fiscalTaxGroup?.aliquotaFcpSt ?? 0,
				cstPis: initialState?.fiscalTaxGroup?.cstPis ?? "49",
				aliquotaPis: initialState?.fiscalTaxGroup?.aliquotaPis ?? 0,
				cstCofins: initialState?.fiscalTaxGroup?.cstCofins ?? "49",
				aliquotaCofins: initialState?.fiscalTaxGroup?.aliquotaCofins ?? 0,
				ativo: initialState?.fiscalTaxGroup?.ativo ?? true,
			},
			regras: initialState?.regras ?? [],
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const [state, setState] = useState<TFiscalTaxGroupState>(initialStateHolder);

	const updateFiscalTaxGroup = useCallback((patch: Partial<TFiscalTaxGroupState["fiscalTaxGroup"]>) => {
		setState((prev) => ({ ...prev, fiscalTaxGroup: { ...prev.fiscalTaxGroup, ...patch } }));
	}, []);

	const addRegra = useCallback((regra: TFiscalTaxGroupStateRule) => {
		setState((prev) => ({ ...prev, regras: [...prev.regras, regra] }));
	}, []);

	const updateRegra = useCallback(({ index, regra }: { index: number; regra: Partial<TFiscalTaxGroupStateRule> }) => {
		setState((prev) => ({
			...prev,
			regras: prev.regras.map((r, rIndex) => (rIndex === index ? { ...r, ...regra } : r)),
		}));
	}, []);

	const removeRegra = useCallback(({ index }: { index: number }) => {
		setState((prev) => {
			const regraInArray = prev.regras[index];
			if (!regraInArray) return prev;
			// Item existente (com id) é marcado para deletar; item novo é removido do array.
			if (regraInArray.id) {
				return { ...prev, regras: prev.regras.map((r, rIndex) => (rIndex === index ? { ...r, deletar: true } : r)) };
			}
			return { ...prev, regras: prev.regras.filter((_, rIndex) => rIndex !== index) };
		});
	}, []);

	const redefineState = useCallback((nextState: TFiscalTaxGroupState) => {
		setState(nextState);
	}, []);

	const resetState = useCallback(() => {
		setState(initialStateHolder);
	}, [initialStateHolder]);

	return {
		state,
		updateFiscalTaxGroup,
		addRegra,
		updateRegra,
		removeRegra,
		redefineState,
		resetState,
	};
}

export type TUseFiscalTaxGroupState = ReturnType<typeof useFiscalTaxGroupState>;
