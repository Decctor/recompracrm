import type { TAiAgentCapabilities } from "@/schemas/ai-agents";
import type { TAiAgentOperationTypeEnum, TAiAgentRunTriggerEnum, TAiAgentToolNameEnum } from "@/schemas/enums";
import type { DB, DBTransaction } from "@/services/drizzle";
import type z from "zod";

/**
 * Tudo que uma ferramenta precisa saber e que o modelo **não** fornece.
 *
 * Ids de tenant e de entidade vivem aqui, nunca no `inputSchema`: é o que torna o isolamento
 * multi-tenant estrutural (o modelo não tem como apontar para outra organização) e elimina a
 * classe de bug em que o LLM alucina um `clienteId`.
 */
export type TAgentToolContext = {
	db: DB | DBTransaction;
	organizacaoId: string;
	agent: { id: string; nome: string };
	run: { id: string; gatilho: TAiAgentRunTriggerEnum; mensagemGatilhoId: string | null };
	chat: { id: string; clienteId: string };
	/**
	 * Mensagens recentes do cliente, da mais nova para a mais antiga. É uma janela, e não só a
	 * última mensagem, porque pedido e cobrança chegam em turnos separados ("quero até 500
	 * reais" → "quais são?") — ver `normalizeProductQueryInput`.
	 */
	turn: { mensagensRecentesCliente: string[] };
	/**
	 * O que as ferramentas mudaram na conversa durante este turno. Mutável de propósito: é o
	 * único canal de volta das ferramentas para quem entrega a resposta. Hoje carrega o handoff —
	 * o atendimento que a própria run transferiu não pode barrar a entrega do aviso ao cliente,
	 * e uma segunda chamada de transferência na mesma run não pode sortear outro atendente.
	 */
	effects: { handoffAttendanceId: string | null };
	capacidades: TAiAgentCapabilities;
	toolCall?: { id: string };
	operation?: { id: string; tipo: TAiAgentOperationTypeEnum };
};

/**
 * Formato normalizado devolvido ao modelo. `success: false` é um resultado legítimo — uma
 * organização sem programa de cashback não é um erro, é uma informação que o agente deve
 * comunicar ao cliente.
 */
export type TAgentToolOutput = {
	success: boolean;
	message: string;
	result?: unknown;
};

export type TAgentToolDefinition<TInputSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
	name: TAiAgentToolNameEnum;
	/** Descrição rica: é por ela que o modelo decide quais filtros usar. */
	description: string;
	inputSchema: TInputSchema;
	operation?: { tipo: TAiAgentOperationTypeEnum; leaseMs: number };
	execute: (input: z.infer<TInputSchema>, context: TAgentToolContext) => Promise<TAgentToolOutput>;
};

/**
 * Definição com o tipo de input apagado.
 *
 * O registro guarda ferramentas de schemas diferentes lado a lado, e `execute` é
 * contravariante no input — nenhuma delas é atribuível a um `TAgentToolDefinition` concreto.
 * `never` no parâmetro aceita qualquer implementação; quem executa faz o cast único (o input
 * já foi validado pelo `inputSchema` naquele ponto).
 */
export type TAgentToolDefinitionErased = {
	name: TAiAgentToolNameEnum;
	description: string;
	inputSchema: z.ZodTypeAny;
	operation?: { tipo: TAiAgentOperationTypeEnum; leaseMs: number };
	execute: (input: never, context: TAgentToolContext) => Promise<TAgentToolOutput>;
};
