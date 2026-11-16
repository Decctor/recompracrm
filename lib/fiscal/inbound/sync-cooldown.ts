import type { TInboundSyncRequestResult, TInboundSyncStatus } from "./types";

// Reserva curta enquanto a API responde. Também protege o intervalo entre o aceite
// assíncrono e a publicação da próxima janela pela Spedy (ou uma falha de rede ambígua).
export const INBOUND_SYNC_RESERVATION_MS = 60_000;

export type TInboundSyncDependencies = {
	reserve: (until: Date) => Promise<{ acquired: boolean; nextAllowedSyncAt: Date | null }>;
	persist: (nextAllowedSyncAt: Date, status: TInboundSyncStatus | null) => Promise<void>;
	getStatus: () => Promise<TInboundSyncStatus | null>;
	request: () => Promise<TInboundSyncRequestResult>;
	onStatusError: (error: unknown) => void;
	now?: () => number;
};

export async function requestSyncWithCooldown(deps: TInboundSyncDependencies) {
	const now = deps.now ?? Date.now;
	const reservedUntil = new Date(now() + INBOUND_SYNC_RESERVATION_MS);
	const reservation = await deps.reserve(reservedUntil);
	if (!reservation.acquired) return { accepted: false, nextAllowedSyncAt: reservation.nextAllowedSyncAt };

	// Só quem ganhou a reserva consulta o provedor. Uma falha mantém a reserva curta,
	// sem liberar outro POST enquanto o resultado da chamada anterior é desconhecido.
	let status = await deps.getStatus();
	if (status?.nextAllowedSyncAt && status.nextAllowedSyncAt.getTime() > now()) {
		await deps.persist(status.nextAllowedSyncAt, status);
		return { accepted: false, nextAllowedSyncAt: status.nextAllowedSyncAt };
	}

	const result = await deps.request();
	try {
		status = await deps.getStatus();
	} catch (error) {
		// Uma falha de telemetria não transforma um POST já aceito em erro para o usuário.
		deps.onStatusError(error);
	}
	const candidates = [
		reservedUntil.getTime(),
		result.nextAllowedSyncAt?.getTime() ?? 0,
		status?.nextAllowedSyncAt?.getTime() ?? 0,
		result.retryAfterSeconds != null && Number.isFinite(result.retryAfterSeconds) && result.retryAfterSeconds >= 0
			? now() + result.retryAfterSeconds * 1000
			: 0,
	];
	const nextAllowedSyncAt = new Date(Math.max(...candidates));
	await deps.persist(nextAllowedSyncAt, status);
	return { accepted: result.accepted, nextAllowedSyncAt };
}
