"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { getErrorMessage } from "@/lib/errors";
import { useVisualKitById } from "@/lib/queries/visual-kits";
import type { TVisualKitBrand } from "@/lib/visual-kits/types";
import type { TVisualKitState } from "@/state-hooks/use-visual-kit-state";
import { useMemo } from "react";
import KitBuilder from "./kit-builder";
import type { TKitStageId } from "./stages";

type KitBuilderLoaderProps = {
	kitId: string;
	initialStage: TKitStageId;
	marca: TVisualKitBrand;
	orgHasERPAccess: boolean;
};

/** Carrega o kit uma vez e entrega o estado inicial ao construtor (que daí em diante salva sozinho). */
export default function KitBuilderLoader({ kitId, initialStage, marca, orgHasERPAccess }: KitBuilderLoaderProps) {
	const { data: kit, isLoading, isError, error } = useVisualKitById({ id: kitId });

	const initialState = useMemo<TVisualKitState | null>(() => {
		if (!kit) return null;
		return {
			kit: {
				nome: kit.nome,
				chamada: kit.chamada,
				validadeFim: kit.validadeFim ? new Date(kit.validadeFim).toISOString() : null,
				canalVendaId: kit.canalVendaId,
				configuracao: kit.configuracao,
			},
			pecas: kit.pecas.map((piece) => ({ formato: piece.formato, saida: piece.saida, configuracao: piece.configuracao })),
			itens: kit.itens.map((item) => ({ produtoId: item.produtoId, produtoVarianteId: item.produtoVarianteId })),
		};
	}, [kit]);

	if (isLoading) return <LoadingComponent />;
	if (isError || !initialState) return <ErrorComponent msg={getErrorMessage(error)} />;
	return <KitBuilder kitId={kitId} initialState={initialState} initialStage={initialStage} marca={marca} orgHasERPAccess={orgHasERPAccess} />;
}
