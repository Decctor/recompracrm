import type { TAiAgentRunStatusEnum, TAiAgentRunTriggerEnum } from "@/schemas/enums";

/**
 * Vocabulário das execuções da IA nas superfícies do hub e de Configurações. Tipado sobre os
 * enums para que um gatilho ou status novo quebre a build em vez de aparecer cru na tela.
 */
export const AI_RUN_TRIGGER_LABELS: Record<TAiAgentRunTriggerEnum, string> = {
	CHAT_MENSAGEM: "Mensagem do cliente",
	ATRIBUICAO_HUB: "Entregue pelo hub",
	PLAYGROUND: "Teste",
	RETOMADA: "Retomada",
	SUGESTAO_HUB: "Assistência",
};

export const AI_RUN_STATUS_META: Record<TAiAgentRunStatusEnum, { label: string; tone: string }> = {
	PENDENTE: { label: "Na fila", tone: "text-amber-600" },
	RODANDO: { label: "Respondendo", tone: "text-amber-600" },
	CONCLUIDO: { label: "Concluída", tone: "text-emerald-600" },
	FALHA: { label: "Falhou", tone: "text-destructive" },
	CANCELADO: { label: "Descartada", tone: "text-muted-foreground" },
};
