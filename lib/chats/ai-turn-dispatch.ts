import type { TAiTurnPayload } from "@/lib/chats/ai-turn-runner";

/**
 * Transporte do turno de IA disparado por mensagem.
 *
 * - `inline` (default): sleep de debounce e run na própria função, sob o waitUntil do
 *   webhook. Sem dependência de infraestrutura além do banco.
 * - `queue` (`AI_TURN_TRANSPORT=queue`): publica em Vercel Queues com o debounce como
 *   delaySeconds; o consumer em `app/api/queues/ai-chat-turn` executa o runner, com retry
 *   automático se a função morrer no meio do turno.
 *
 * A env var é o rollback: voltar para inline não requer deploy de código, só de
 * configuração. As garantias de idempotência não vivem aqui — vivem no banco, dentro de
 * `runAiTurnForMessage` — então trocar de transporte não muda a correção, só a
 * durabilidade.
 */
export async function dispatchAiTurn(payload: TAiTurnPayload, { delayMs }: { delayMs: number }): Promise<void> {
	if (process.env.AI_TURN_TRANSPORT === "queue") {
		// Import dinâmico: o SDK da fila só carrega quando o transporte está ativo.
		const { sendAiTurnToQueue } = await import("@/lib/chats/ai-turn-queue");
		await sendAiTurnToQueue(payload, { delayMs });
		return;
	}

	// Import dinâmico também aqui: o runner arrasta o grafo inteiro do agente (SDK de IA, tools,
	// renderização de imagem do handoff), e o webhook só precisa dele no transporte inline.
	const [{ runAiTurnForMessage }] = await Promise.all([
		import("@/lib/chats/ai-turn-runner"),
		new Promise((resolve) => setTimeout(resolve, delayMs)),
	]);
	await runAiTurnForMessage(payload);
}
