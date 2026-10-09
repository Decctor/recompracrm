import "dotenv/config";
import { createPlaygroundDeliverer } from "@/lib/ai/agent/delivery";
import { createPlaygroundChat } from "@/lib/ai/agent/playground";
import { ensureOrganizationAgent } from "@/lib/ai/agent/provisioning";
import { respondToChatWithAgent } from "@/lib/ai/agent/respond-to-chat";
import { connection, db } from "@/services/drizzle";
import { aiAgentToolCalls, chatMessages, chats } from "@/services/drizzle/schema";
import { asc, eq } from "drizzle-orm";

/**
 * Roda um roteiro de conversa contra o agente real: mesmo runtime, mesmas ferramentas, mesmo
 * registro de execução que a produção. Cada mensagem do roteiro entra como mensagem do cliente e
 * o agente responde de verdade — inclusive gastando tokens.
 *
 * Existe para fechar o ciclo de diagnóstico: `analyze-ai-agent-runs.ts` mostra o que aconteceu
 * nos testes manuais, e este script reproduz o roteiro que falhou depois de um ajuste, sem
 * depender de alguém digitar no playground.
 *
 * O roteiro padrão é o caso real de julho/2026 que expôs as três falhas de uma vez: filtro de
 * preço inventado, resposta pela amostra da consulta anterior e orçamento prometido e não criado.
 *
 * Uso:
 *   npx tsx ./scripts/test-ai-agent-conversation.ts --orgId=<uuid>
 *   npx tsx ./scripts/test-ai-agent-conversation.ts --orgId=<uuid> --roteiro="Oi|Quanto custa X?"
 *   npx tsx ./scripts/test-ai-agent-conversation.ts --orgId=<uuid> --batch --roteiro="Oi|Bom dia|Qual cardápio de hj ?"
 */

const LOG = "[AI_AGENT_CONVERSATION]";

/** O roteiro que quebrou em 2026-07-29, turno a turno. */
const DEFAULT_SCRIPT = [
	"Boa noite, quanto custa um chuveiro de 127V ?",
	"Quero todas as opções",
	"Quero um de uns 6000W",
	"Pode ser o de 5500W",
	"Quero até 500 reais",
	"Quais são ?",
	"Quero o primeiro. Vamos fechar !",
];

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const inlineArg = process.argv.find((argument) => argument.startsWith(prefix));
	if (inlineArg) return inlineArg.slice(prefix.length);

	const index = process.argv.indexOf(`--${name}`);
	if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) return process.argv[index + 1];
	return null;
}

async function main() {
	const organizacaoId = getArgValue("orgId");
	if (!organizacaoId) {
		console.error(`${LOG} --orgId é obrigatório.`);
		process.exitCode = 1;
		return;
	}

	const roteiro =
		getArgValue("roteiro")
			?.split("|")
			.map((message) => message.trim())
			.filter(Boolean) ?? DEFAULT_SCRIPT;
	// Reproduz a rajada recebida antes do debounce: todas as mensagens entram no mesmo turno.
	const batch = process.argv.includes("--batch");

	const agent = await ensureOrganizationAgent(db, organizacaoId);
	console.log(`${LOG} Agente ${agent.nome} (${agent.id}) | modelo: ${JSON.stringify(agent.modeloConfig)}`);

	// Chat novo: um roteiro não deve herdar o contexto do anterior.
	const { chatId, clienteId } = await createPlaygroundChat({ organizacaoId, agenteId: agent.id });
	console.log(`${LOG} Chat de teste ${chatId}\n`);

	const runIds: string[] = [];

	for (const [index, texto] of roteiro.entries()) {
		const now = new Date();
		const [inserted] = await db
			.insert(chatMessages)
			.values({
				organizacaoId,
				chatId,
				clienteId,
				autorTipo: "CLIENTE",
				autorClienteId: clienteId,
				conteudoTexto: texto,
				conteudoMidiaTipo: "TEXTO",
				statusEntrega: "ENTREGUE",
				dataEnvio: now,
			})
			.returning({ id: chatMessages.id, dataEnvio: chatMessages.dataEnvio });

		await db
			.update(chats)
			.set({ ultimaMensagemId: inserted.id, ultimaMensagemData: inserted.dataEnvio, ultimaMensagemEntradaData: inserted.dataEnvio })
			.where(eq(chats.id, chatId));

		console.log(`\n${"─".repeat(90)}`);
		console.log(`[${index + 1}/${roteiro.length}] 🧑 CLIENTE: ${texto}`);
		if (batch && index < roteiro.length - 1) continue;

		const startedAt = Date.now();
		try {
			const result = await respondToChatWithAgent({
				organizacaoId,
				chatId,
				gatilho: "PLAYGROUND",
				mensagemGatilhoId: inserted.id,
				deliver: createPlaygroundDeliverer({ organizacaoId, chatId }),
			});
			runIds.push(result.runId);

			const toolCalls = await db
				.select({ ferramentaNome: aiAgentToolCalls.ferramentaNome, status: aiAgentToolCalls.status, input: aiAgentToolCalls.input })
				.from(aiAgentToolCalls)
				.where(eq(aiAgentToolCalls.runId, result.runId))
				.orderBy(asc(aiAgentToolCalls.dataInsercao));

			console.log(`         ⏱️  ${((Date.now() - startedAt) / 1000).toFixed(1)}s | run ${result.runId}`);
			if (toolCalls.length === 0) {
				console.log("         🔧 nenhuma tool call");
			} else {
				for (const call of toolCalls) {
					console.log(`         🔧 ${call.ferramentaNome} [${call.status}] ${JSON.stringify(call.input)}`);
				}
			}
			console.log(`         🤖 AGENTE: ${result.mensagem ?? "(null — nada enviado ao cliente)"}`);
			console.log(`         ANEXO: ${JSON.stringify(result.anexo)}`);
		} catch (error) {
			console.error(`         ❌ FALHA: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	console.log(`\n${"─".repeat(90)}`);
	console.log(`${LOG} Roteiro concluído. ${runIds.length} de ${batch ? 1 : roteiro.length} turnos responderam.`);
	console.log(`${LOG} Relatório completo: npm run ai:runs-report -- --chatId=${chatId} --out=report.md`);
}

main()
	.catch((error) => {
		console.error(`${LOG} Falha:`, error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
