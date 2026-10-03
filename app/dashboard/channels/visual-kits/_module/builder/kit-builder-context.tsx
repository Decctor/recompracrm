"use client";

import { getErrorMessage } from "@/lib/errors";
import { createVisualKit, updateVisualKit } from "@/lib/mutations/visual-kits";
import { appRoutes } from "@/lib/navigation/routes";
import { useVisualKitCatalogItems } from "@/lib/queries/visual-kits";
import { type TVisualKitBrand, type TVisualKitCatalogItem, type TVisualKitPieceItem, toVisualKitPieceItem } from "@/lib/visual-kits/types";
import { buildVisualKitPayload, type TUseVisualKitState, type TVisualKitState, useVisualKitState } from "@/state-hooks/use-visual-kit-state";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { KIT_STAGE_IDS, type TKitStageId } from "./stages";

export type TKitSaveStatus = "NEW" | "SAVED" | "PENDING" | "SAVING" | "ERROR";

type KitBuilderContextValue = TUseVisualKitState & {
	kitId: string | null;
	stage: TKitStageId;
	setStage: (stage: TKitStageId) => void;
	next: () => void;
	back: () => void;
	brand: TVisualKitBrand;
	orgHasERPAccess: boolean;
	// Itens escolhidos com preços atuais (do canal do kit), na ordem do kit.
	selectedItems: TVisualKitCatalogItem[];
	selectedItemsLoading: boolean;
	// Só os que têm preço: são os que entram nas peças.
	pieceItems: TVisualKitPieceItem[];
	saveStatus: TKitSaveStatus;
	// Cria o rascunho (se ainda não existe) e grava o que estiver pendente.
	saveNow: () => Promise<string | null>;
};

const KitBuilderContext = createContext<KitBuilderContextValue | null>(null);

const AUTOSAVE_DELAY_MS = 1200;

type KitBuilderProviderProps = {
	kitId: string | null;
	initialState?: TVisualKitState;
	initialStage: TKitStageId;
	brand: TVisualKitBrand;
	orgHasERPAccess: boolean;
	children: ReactNode;
};

export function KitBuilderProvider({ kitId: initialKitId, initialState, initialStage, brand, orgHasERPAccess, children }: KitBuilderProviderProps) {
	const queryClient = useQueryClient();
	const kitState = useVisualKitState(initialState);
	const { state, itemKeys } = kitState;

	const [kitId, setKitId] = useState<string | null>(initialKitId);
	const [stage, setStageState] = useState<TKitStageId>(initialStage);
	const [saveStatus, setSaveStatus] = useState<TKitSaveStatus>(initialKitId ? "SAVED" : "NEW");

	const payloadJson = useMemo(() => JSON.stringify(buildVisualKitPayload(state)), [state]);
	const lastSavedJsonRef = useRef<string | null>(initialKitId ? payloadJson : null);
	const kitIdRef = useRef(kitId);
	kitIdRef.current = kitId;
	const stateRef = useRef(state);
	stateRef.current = state;
	const inFlightRef = useRef<Promise<string | null> | null>(null);

	// URL acompanha o kit e a etapa sem remontar a página (o construtor já tem o estado).
	useEffect(() => {
		const url = kitId ? `${appRoutes.channels.visualKit(kitId)}?stage=${stage}` : `${appRoutes.channels.newVisualKit()}?stage=${stage}`;
		window.history.replaceState(window.history.state, "", url);
	}, [kitId, stage]);

	const persist = useCallback(async (): Promise<string | null> => {
		// Um salvamento por vez: o seguinte espera e grava o estado mais recente.
		if (inFlightRef.current) await inFlightRef.current.catch(() => null);

		const current = stateRef.current;
		const withName = current.kit.nome.trim() ? current : { ...current, kit: { ...current.kit, nome: `Kit de ${dayjs().format("DD/MM")}` } };
		if (withName !== current) kitState.updateKit({ nome: withName.kit.nome });
		const payload = buildVisualKitPayload(withName);
		const json = JSON.stringify(payload);
		const currentKitId = kitIdRef.current;
		if (currentKitId && json === lastSavedJsonRef.current) return currentKitId;

		const run = (async () => {
			setSaveStatus("SAVING");
			try {
				let savedId = currentKitId;
				if (savedId) {
					await updateVisualKit({ id: savedId, ...payload });
				} else {
					const result = await createVisualKit(payload);
					savedId = result.data.insertedId;
					setKitId(savedId);
				}
				lastSavedJsonRef.current = json;
				setSaveStatus("SAVED");
				await queryClient.invalidateQueries({ queryKey: ["visual-kits"] });
				return savedId;
			} catch (error) {
				setSaveStatus("ERROR");
				toast.error(getErrorMessage(error));
				return null;
			}
		})();
		inFlightRef.current = run;
		try {
			return await run;
		} finally {
			if (inFlightRef.current === run) inFlightRef.current = null;
		}
	}, [kitState, queryClient]);

	// Salvamento automático: só depois que o rascunho existe (criado ao sair da etapa Peças).
	useEffect(() => {
		if (!kitId) return;
		if (payloadJson === lastSavedJsonRef.current) return;
		setSaveStatus("PENDING");
		const timeout = window.setTimeout(() => void persist(), AUTOSAVE_DELAY_MS);
		return () => window.clearTimeout(timeout);
	}, [kitId, payloadJson, persist]);

	// Alteração ainda não gravada ao fechar a aba: o navegador pergunta antes de sair.
	useEffect(() => {
		if (saveStatus !== "PENDING" && saveStatus !== "SAVING") return;
		const handler = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [saveStatus]);

	const setStage = useCallback((next: TKitStageId) => {
		setStageState(next);
		window.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	const next = useCallback(() => {
		const index = KIT_STAGE_IDS.indexOf(stage);
		const target = KIT_STAGE_IDS[index + 1];
		if (!target) return;
		// Sair de Peças cria o rascunho: a partir daí o kit aparece em Meus kits e salva sozinho.
		if (!kitIdRef.current) void persist();
		setStage(target);
	}, [persist, setStage, stage]);

	const back = useCallback(() => {
		const index = KIT_STAGE_IDS.indexOf(stage);
		const target = KIT_STAGE_IDS[index - 1];
		if (target) setStage(target);
	}, [setStage, stage]);

	const { data: selectedItemsData, isLoading: selectedItemsLoading } = useVisualKitCatalogItems({
		keys: itemKeys,
		salesChannelId: state.kit.canalVendaId,
	});
	const selectedItems = useMemo(() => (itemKeys.length ? (selectedItemsData ?? []) : []), [itemKeys.length, selectedItemsData]);
	const pieceItems = useMemo(
		() => selectedItems.map(toVisualKitPieceItem).filter((item): item is TVisualKitPieceItem => item !== null),
		[selectedItems],
	);

	const value = useMemo<KitBuilderContextValue>(
		() => ({
			...kitState,
			kitId,
			stage,
			setStage,
			next,
			back,
			brand,
			orgHasERPAccess,
			selectedItems,
			selectedItemsLoading: itemKeys.length > 0 && selectedItemsLoading,
			pieceItems,
			saveStatus,
			saveNow: persist,
		}),
		[
			kitState,
			kitId,
			stage,
			setStage,
			next,
			back,
			brand,
			orgHasERPAccess,
			selectedItems,
			itemKeys.length,
			selectedItemsLoading,
			pieceItems,
			saveStatus,
			persist,
		],
	);

	return <KitBuilderContext.Provider value={value}>{children}</KitBuilderContext.Provider>;
}

export function useKitBuilder() {
	const context = useContext(KitBuilderContext);
	if (!context) throw new Error("useKitBuilder must be used within KitBuilderProvider");
	return context;
}
