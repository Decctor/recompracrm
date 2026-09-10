"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PIPELINE_STATUSES, type TPipelineStatus } from "./config";

const STORAGE_PREFIX = "ampmais:fulfillment-board-compaction:v1";

/**
 * Escolhas explicitas do operador. A ausencia de uma etapa aqui significa "nunca tocada", e e o que
 * abre espaco para a semente automatica. Assim que o operador recolhe ou expande uma etapa, ela
 * passa a existir neste mapa e a semente nunca mais decide por ela.
 */
type TStageCompactionChoices = Partial<Record<TPipelineStatus, boolean>>;

function storageKey(organizationId: string) {
	return `${STORAGE_PREFIX}:${organizationId}`;
}

/** Le e valida o mapa persistido. Chaves desconhecidas e valores nao-booleanos sao descartados. */
function readStoredChoices(organizationId: string): TStageCompactionChoices {
	try {
		const raw = window.localStorage.getItem(storageKey(organizationId));
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return {};
		const choices: TStageCompactionChoices = {};
		for (const status of PIPELINE_STATUSES) {
			const value = (parsed as Record<string, unknown>)[status];
			if (typeof value === "boolean") choices[status] = value;
		}
		return choices;
	} catch {
		return {};
	}
}

function writeStoredChoices(organizationId: string, choices: TStageCompactionChoices) {
	try {
		window.localStorage.setItem(storageKey(organizationId), JSON.stringify(choices));
	} catch {
		// Modo privativo ou cota estourada: a compactacao continua valendo nesta sessao.
	}
}

type UseFulfillmentBoardCompactionParams = {
	organizationId: string;
	stageCounts: Record<TPipelineStatus, number>;
	/** Vira true no primeiro render com dados carregados. E o gatilho da semente automatica. */
	seedReady: boolean;
	/**
	 * Desligada, todas as etapas resolvem como expandidas, mas as escolhas continuam sendo lidas e
	 * gravadas. E o que faz o layout do operador reaparecer intacto ao voltar para o desktop.
	 */
	enabled: boolean;
};

/**
 * Resolve o estado recolhido de cada etapa a partir de duas fontes, nesta ordem de precedencia:
 *
 * 1. Escolha explicita do operador, persistida por organizacao no dispositivo.
 * 2. Semente automatica: etapas vazias comecam recolhidas.
 *
 * A semente e calculada UMA UNICA VEZ, no primeiro render com dados. Nao ha reavaliacao continua de
 * propósito: uma etapa que recolhe e expande sozinha conforme os pedidos entram e saem reflowaria o
 * quadro debaixo da mao do operador. Um card chegando numa etapa auto-recolhida a abre uma vez e ela
 * fica aberta; a partir do primeiro toque, so o operador decide.
 */
export function useFulfillmentBoardCompaction({ organizationId, stageCounts, seedReady, enabled }: UseFulfillmentBoardCompactionParams) {
	const [choices, setChoices] = useState<TStageCompactionChoices>({});
	const [autoSeed, setAutoSeed] = useState<TStageCompactionChoices>({});
	const [hydratedFor, setHydratedFor] = useState<string | null>(null);
	const seededRef = useRef(false);

	// Hidratacao pos-mount (localStorage nao existe no servidor). Trocar de organizacao recomeca do zero.
	useEffect(() => {
		seededRef.current = false;
		setAutoSeed({});
		setChoices(readStoredChoices(organizationId));
		setHydratedFor(organizationId);
	}, [organizationId]);

	const isHydrated = hydratedFor === organizationId;

	useEffect(() => {
		// Guarda contra gravar as escolhas da organizacao anterior na chave da nova.
		if (!isHydrated) return;
		writeStoredChoices(organizationId, choices);
	}, [isHydrated, organizationId, choices]);

	useEffect(() => {
		if (!isHydrated || !seedReady || seededRef.current) return;
		seededRef.current = true;
		const seed: TStageCompactionChoices = {};
		for (const status of PIPELINE_STATUSES) {
			if (stageCounts[status] === 0) seed[status] = true;
		}
		setAutoSeed(seed);
	}, [isHydrated, seedReady, stageCounts]);

	// A semente vale enquanto a etapa continua vazia. O primeiro pedido a chegar numa etapa
	// auto-recolhida descarta a semente dela para sempre: a etapa abre uma vez e fica aberta, mesmo
	// que esvazie de novo depois. Sem isso, um quadro que carrega vazio recolheria as cinco etapas e
	// engoliria o primeiro pedido do dia atras de uma trilha fechada.
	useEffect(() => {
		setAutoSeed((prev) => {
			const next = { ...prev };
			let changed = false;
			for (const status of PIPELINE_STATUSES) {
				if (next[status] && stageCounts[status] > 0) {
					delete next[status];
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [stageCounts]);

	const collapsedByStage = useMemo(
		() =>
			Object.fromEntries(PIPELINE_STATUSES.map((status) => [status, enabled ? (choices[status] ?? autoSeed[status] ?? false) : false])) as Record<
				TPipelineStatus,
				boolean
			>,
		[choices, autoSeed, enabled],
	);

	const setStageCollapsed = useCallback((status: TPipelineStatus, collapsed: boolean) => {
		setChoices((prev) => ({ ...prev, [status]: collapsed }));
	}, []);

	/** Recolhe todas as outras etapas e garante que a escolhida fique aberta. Fixa as cinco de uma vez. */
	const focusStage = useCallback((status: TPipelineStatus) => {
		setChoices(Object.fromEntries(PIPELINE_STATUSES.map((item) => [item, item !== status])) as TStageCompactionChoices);
	}, []);

	const allCollapsed = useMemo(() => PIPELINE_STATUSES.every((status) => collapsedByStage[status]), [collapsedByStage]);

	return { collapsedByStage, setStageCollapsed, focusStage, allCollapsed };
}
