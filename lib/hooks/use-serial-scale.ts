"use client";

import { serialScale, type TSerialScaleConnectMode, type TSerialScaleStatusSnapshot } from "@/lib/pos/serial-scale-connection";
import type { TSerialScaleConfig, TSerialScaleSettings } from "@/lib/pos/serial-scale-protocol";
import { getWebSerial } from "@/lib/pos/web-serial";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

const SERVER_STATUS: TSerialScaleStatusSnapshot = { status: "DISCONNECTED", error: null, velocidade: null };
const SERVER_LIVE = { frame: null, receivedAt: null };

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
	/** `preferencias.balancaCaixa` (ou o rascunho dela na tela de configuração). */
	config: TSerialScaleConfig;
	/** Desliga a balança nesta tela sem mexer na configuração (ex.: teste só depois do clique). */
	enabled?: boolean;
};

/**
 * Balança do caixa para uma tela. Enquanto a tela está montada (e a balança habilitada), a porta
 * autorizada é reaberta sozinha; a primeira autorização precisa de um clique (`connect`).
 *
 * Expõe só o estado da conexão, que muda raramente. O peso ao vivo muda quatro vezes por segundo e
 * fica em `useSerialScaleLiveReading`, para que só o componente que o exibe renderize nesse ritmo.
 */
export function useSerialScale({ config, enabled = true }: UseSerialScaleOptions) {
	const isSupported = useWebSerialSupport();
	const isEnabled = enabled && config.habilitado;
	const isActive = isEnabled && isSupported;

	const { velocidade, bitsDados, paridade, bitsParada, casasDecimais } = config;
	const settings = useMemo<TSerialScaleSettings>(
		() => ({ velocidade, bitsDados, paridade, bitsParada, casasDecimais }),
		[velocidade, bitsDados, paridade, bitsParada, casasDecimais],
	);

	// A configuração entra antes do `retain`, que já tenta reabrir a porta com ela.
	useEffect(() => {
		if (isActive) serialScale.configure(settings);
	}, [isActive, settings]);

	useEffect(() => {
		if (!isActive) return;
		return serialScale.retain();
	}, [isActive]);

	const status = useSyncExternalStore(serialScale.subscribeStatus, serialScale.getStatusSnapshot, () => SERVER_STATUS);

	const connect = useCallback(
		(mode: TSerialScaleConnectMode = "INTERACTIVE") => {
			serialScale.configure(settings);
			return serialScale.connect({ mode });
		},
		[settings],
	);
	const disconnect = useCallback(() => serialScale.disconnect(), []);
	const readStableWeight = useCallback((options?: { timeoutMs?: number }) => serialScale.readStableWeight(options), []);
	const detectBaudRate = useCallback((candidates: readonly number[]) => serialScale.detectBaudRate(candidates), []);

	return { isSupported, isEnabled, isActive, ...status, connect, disconnect, readStableWeight, detectBaudRate };
}

export type TUseSerialScale = ReturnType<typeof useSerialScale>;

/** Último quadro lido e quando chegou. Só para quem exibe o peso ao vivo. */
export function useSerialScaleLiveReading() {
	return useSyncExternalStore(serialScale.subscribeLive, serialScale.getLiveSnapshot, () => SERVER_LIVE);
}
