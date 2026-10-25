import { DEFAULT_FIXED_ASSET_USEFUL_LIFE_MONTHS, FixedAssetSchema } from "@/schemas/fixed-assets";
import { useCallback, useState } from "react";
import z from "zod";

// O formulário guarda datas como Date; a serialização para a API acontece no submit.
const FixedAssetStateSchema = z.object({
	asset: FixedAssetSchema.omit({
		organizacaoId: true,
		compraId: true,
		compraItemId: true,
		dataBaixa: true,
		motivoBaixa: true,
		valorBaixa: true,
		autorId: true,
		dataInsercao: true,
		dataAtualizacao: true,
		dataInicioUso: true,
	}).extend({
		dataInicioUso: z.date(),
		// Só exibição: nome do produto escolhido no cadastro manual.
		produtoNome: z.string().optional().nullable(),
	}),
});
export type TFixedAssetState = z.infer<typeof FixedAssetStateSchema>;

function getDefaultState(initialState?: Partial<TFixedAssetState>): TFixedAssetState {
	return {
		asset: {
			produtoId: null,
			produtoVarianteId: null,
			produtoNome: null,
			codigoPatrimonio: null,
			descricao: "",
			numeroSerie: null,
			localizacao: null,
			responsavelId: null,
			status: "EM_USO",
			quantidade: 1,
			valorAquisicao: 0,
			dataInicioUso: new Date(),
			vidaUtilMeses: DEFAULT_FIXED_ASSET_USEFUL_LIFE_MONTHS,
			valorResidual: 0,
			depreciacaoAcumuladaInicial: 0,
			creditoIcmsCiap: null,
			anotacoes: null,
			...initialState?.asset,
		},
	};
}

export function useInternalFixedAssetState({ initialState }: { initialState?: Partial<TFixedAssetState> } = {}) {
	const [state, setState] = useState<TFixedAssetState>(() => getDefaultState(initialState));

	const updateAsset = useCallback((asset: Partial<TFixedAssetState["asset"]>) => {
		setState((previous) => ({ ...previous, asset: { ...previous.asset, ...asset } }));
	}, []);
	const redefineState = useCallback((next: TFixedAssetState) => setState(next), []);
	const resetState = useCallback(() => setState(getDefaultState()), []);

	return { state, updateAsset, redefineState, resetState };
}
export type TUseInternalFixedAssetState = ReturnType<typeof useInternalFixedAssetState>;

/** Payload da API: datas em ISO, sem o campo de exibição. */
export function serializeFixedAssetState(asset: TFixedAssetState["asset"]) {
	const { produtoNome: _produtoNome, ...rest } = asset;
	return { ...rest, dataInicioUso: asset.dataInicioUso.toISOString() };
}
