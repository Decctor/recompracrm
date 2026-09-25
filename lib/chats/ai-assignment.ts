import { isAiSpendLimitReached } from "@/lib/ai/agent/spend";
import { parseJsonbWithFallback } from "@/lib/ai/shared/json";
import { AiAgentScopeSchema, isClientInAgentScope } from "@/schemas/ai-agents";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { DB, DBTransaction } from "@/services/drizzle";
import { aiAgents, chats, whatsappConnectionPhones } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";

/**
 * Disponibilidade do agente de IA para assumir **um** chat.
 *
 * Existe para sustentar uma invariante: o hub não pode produzir um estado que o runtime
 * recusa. Os webhooks checam a mesma cadeia antes de executar o agente
 * (`app/api/integrations/whatsapp/route.ts`), e atribuir a conversa a um agente que o
 * webhook vai ignorar deixaria o cliente esperando uma resposta que nunca vem.
 *
 * A ordem dos gates é a mesma dos webhooks, e o gate que se erra com facilidade é o do
 * telefone: a habilitação é **por número**, não por organização — depende de por onde a
 * conversa entrou. Duas conversas da mesma organização podem ter respostas diferentes.
 *
 * `hubAtendimentos.acesso` não entra aqui: quem chama já passou por `assertChatAccess`.
 */

type TDb = DB | DBTransaction;

export type TAiAssignmentBlockReason = "RECURSO_INDISPONIVEL" | "TELEFONE_SEM_IA" | "AGENTE_PAUSADO" | "CLIENTE_FORA_DO_ESCOPO" | "LIMITE_CREDITOS";

export type TAiAssignmentAvailability =
	| { disponivel: true; agenteId: string | null; agenteNome: string | null }
	| { disponivel: false; motivo: TAiAssignmentBlockReason };

export const AI_ASSIGNMENT_BLOCK_MESSAGES: Record<TAiAssignmentBlockReason, string> = {
	RECURSO_INDISPONIVEL: "O recurso de atendimento com IA não está disponível no plano da sua organização.",
	TELEFONE_SEM_IA: "O atendimento com IA não está habilitado para o número desta conversa.",
	AGENTE_PAUSADO: "O agente de IA da organização está pausado.",
	CLIENTE_FORA_DO_ESCOPO: "O cliente desta conversa está fora do escopo de atendimento do agente de IA.",
	LIMITE_CREDITOS: "A organização atingiu o limite mensal de créditos de IA.",
};

export async function resolveAiAssignmentAvailability(
	db: TDb,
	input: { organizacaoId: string; chatId: string; configuracao: TOrganizationConfiguration | null | undefined },
): Promise<TAiAssignmentAvailability> {
	if (!input.configuracao?.recursos?.iaAtendimento?.acesso) return { disponivel: false, motivo: "RECURSO_INDISPONIVEL" };
	// Mesmo freio que o runtime aplica em `prepareAgentExecution`: entregar a conversa a um agente
	// que vai recusar por limite deixaria o cliente esperando uma resposta que nunca vem.
	if (await isAiSpendLimitReached(db, { organizacaoId: input.organizacaoId, configuracao: input.configuracao })) {
		return { disponivel: false, motivo: "LIMITE_CREDITOS" };
	}

	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, input.chatId), eq(chats.organizacaoId, input.organizacaoId)),
		columns: { whatsappConexaoTelefoneId: true, clienteId: true },
	});
	if (!chat?.whatsappConexaoTelefoneId) return { disponivel: false, motivo: "TELEFONE_SEM_IA" };

	const telefone = await db.query.whatsappConnectionPhones.findFirst({
		where: eq(whatsappConnectionPhones.id, chat.whatsappConexaoTelefoneId),
		columns: { permitirAtendimentoIa: true },
	});
	if (!telefone?.permitirAtendimentoIa) return { disponivel: false, motivo: "TELEFONE_SEM_IA" };

	// Só leitura: o provisionamento lazy (`ensureOrganizationAgent`) fica no caminho de
	// escrita. Este resolvedor também alimenta o GET da thread, e criar o agente da
	// organização como efeito de abrir uma conversa seria um efeito colateral em caminho quente.
	const agente = await db.query.aiAgents.findFirst({
		where: eq(aiAgents.organizacaoId, input.organizacaoId),
		columns: { id: true, nome: true, status: true, escopo: true },
	});
	// Ausência de linha não é indisponibilidade: a organização tem o recurso e o número
	// habilitados, e a atribuição provisiona o agente na primeira vez.
	if (!agente) return { disponivel: true, agenteId: null, agenteNome: null };
	if (agente.status !== "ATIVO") return { disponivel: false, motivo: "AGENTE_PAUSADO" };

	// Mesma invariante dos demais gates: o hub não pode entregar ao agente uma conversa que o
	// runtime vai recusar (`confirmClientInAgentScope`). Sem isto o botão existiria e a
	// atribuição viraria silêncio para o cliente.
	const escopo = parseJsonbWithFallback(AiAgentScopeSchema, agente.escopo);
	if (!isClientInAgentScope(escopo, chat.clienteId)) return { disponivel: false, motivo: "CLIENTE_FORA_DO_ESCOPO" };

	return { disponivel: true, agenteId: agente.id, agenteNome: agente.nome };
}
