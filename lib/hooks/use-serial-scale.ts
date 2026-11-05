"use client";

import {
	serialScale,
	type TSerialScaleDiagnosticsSnapshot,
	type TSerialScaleLiveSnapshot,
	type TSerialScaleStatusSnapshot,
} from "@/lib/pos/serial-scale-connection";
import type { TSerialScaleSettings } from "@/lib/pos/serial-scale-protocol";
import { getWebSerial } from "@/lib/pos/web-serial";
import { useCallback, useEffect, useSyncExternalStore } from "react";

const SERVER_STATUS: TSerialScaleStatusSnapshot = {
	status: "DISCONNECTED",
	isPaired: false,
	hasAnswered: false,
	settings: null,
	error: null,
	detecting: null,
};
const SERVER_LIVE: TSerialScaleLiveSnapshot = { frame: null, receivedAt: null };
const SERVER_DIAGNOSTICS: TSerialScaleDiagnosticsSnapshot = { totalBytes: 0, recentBytes: [], errors: [], detection: null };

function subscribeNothing() {
	return () => {};
}

/** A Web Serial só existe no Chrome e no Edge de computador; no servidor, nunca. */
export function useWebSerialSupport() {
	return useSyncExternalStore(
		subscribeNothing,
		() => getWebSerial() !== null,
		() => false,
	);
}

type UseSerialScaleOptions = {
	/** `preferencias.balancaCaixa.habilitado` e a regra da tela (ex.: venda editável). */
	enabled: boolean;
};

/**
 * Balança do caixa deste computador para uma tela. Enquanto a tela está montada, a balança pareada
 * reabre sozinha; computador sem pareamento não abre nada.
 *
 * Expõe só o estado da conexão, que muda raramente. O peso ao vivo muda quatro vezes por segundo e
 * fica em `useSerialScaleLiveReading`, para que só o componente que o exibe renderize nesse ritmo.
 */
export function useSerialScale({ enabled }: UseSerialScaleOptions) {
	const isSupported = useWebSerialSupport();
	const isActive = enabled && isSupported;

	useEffect(() => {
		if (!isActive) return;
		return serialScale.retain();
	}, [isActive]);

	const status = useSyncExternalStore(serialScale.subscribeStatus, serialScale.getStatusSnapshot, () => SERVER_STATUS);

	const pair = useCallback(() => serialScale.pair(), []);
	const redetect = useCallback(() => serialScale.redetect(), []);
	const reconnect = useCallback(() => serialScale.reconnect({ interactive: true }), []);
	const updateSettings = useCallback((partial: Partial<TSerialScaleSettings>) => serialScale.updateSettings(partial), []);
	const forget = useCallback(() => serialScale.forget(), []);
	const disconnect = useCallback(() => serialScale.disconnect(), []);
	const readStableWeight = useCallback((options?: { timeoutMs?: number }) => serialScale.readStableWeight(options), []);

	return {
		isSupported,
		isEnabled: enabled,
		isActive,
		...status,
		/** Balança pareada, porta aberta e já respondeu: só então o PDV oferece a pesagem. */
		isDetected: isActive && status.isPaired && status.status === "CONNECTED" && status.hasAnswered,
		pair,
		redetect,
		reconnect,
		updateSettings,
		forget,
		disconnect,
		readStableWeight,
	};
}

export type TUseSerialScale = ReturnType<typeof useSerialScale>;

/** Último quadro lido e quando chegou. Só para quem exibe o peso ao vivo. */
export function useSerialScaleLiveReading() {
	return useSyncExternalStore(serialScale.subscribeLive, serialScale.getLiveSnapshot, () => SERVER_LIVE);
}

/** Bytes crus, erros de leitura e o relatório da última detecção falha. Só para a tela de pareamento. */
export function useSerialScaleDiagnostics() {
	return useSyncExternalStore(serialScale.subscribeDiagnostics, serialScale.getDiagnosticsSnapshot, () => SERVER_DIAGNOSTICS);
}
