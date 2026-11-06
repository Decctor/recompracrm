/**
 * Junta uma rajada de eventos numa única chamada de `fn`.
 *
 * Dispara `waitMs` depois do último evento (debounce de borda final), mas nunca mais que
 * `maxWaitMs` depois do primeiro evento ainda pendente: um fluxo contínuo de eventos (uma
 * conversa movimentada, um UPDATE em massa entregue aos poucos pelo realtime) não pode adiar a
 * atualização para sempre.
 *
 * Existe porque o realtime do Postgres entrega um evento por linha alterada. Um UPDATE em 438
 * chats vira 438 eventos em cada aba aberta; reagir a cada um com um refetch derrubou o banco
 * (EMAXCONN no Supavisor, 05/11/2026).
 */
export function createBurstCoalescer(fn: () => void, { waitMs = 600, maxWaitMs = 3000 }: { waitMs?: number; maxWaitMs?: number } = {}) {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let firstPendingAt: number | null = null;

	const clear = () => {
		if (timer) clearTimeout(timer);
		timer = null;
		firstPendingAt = null;
	};

	return {
		schedule() {
			const now = Date.now();
			if (firstPendingAt === null) firstPendingAt = now;
			if (timer) clearTimeout(timer);
			const delay = Math.max(0, Math.min(waitMs, firstPendingAt + maxWaitMs - now));
			timer = setTimeout(() => {
				clear();
				fn();
			}, delay);
		},
		/** Descarta o que estiver pendente sem chamar `fn` (unmount, troca de canal). */
		cancel: clear,
	};
}
