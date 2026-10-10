import { QUOTE_STALE_AFTER_DAYS, resolveQuoteFreshness } from "@/lib/sales/quote-freshness";
import { FileText, Headset, Sparkles, Store } from "lucide-react";
import type { ComponentType } from "react";

/**
 * Vocabulário compartilhado das superfícies de orçamento no hub: a pill do header, o popover e o
 * bloco do painel de contexto leem daqui para não divergirem em rótulo, ícone ou tom.
 */

/**
 * Os três gates de orçamento no hub. Ficam em um objeto só porque atravessam seis níveis de props
 * (página → `ChatsMain` → `ChatsInbox` → `ChatHub` → `ChatThread` → header/painel), e três
 * booleanos soltos multiplicariam esse encadeamento por três.
 *
 * Os nomes espelham as permissões de origem em `membership.permissoes.vendas`.
 */
export type TQuotePermissions = {
	/** `vendas.criar` — montar orçamento a partir da conversa. */
	criar: boolean;
	/** `vendas.editar` — abrir o checkout do orçamento; mesmo gate da listagem de vendas. */
	editar: boolean;
	/** `vendas.criar || vendas.excluir` — descartar um rascunho, que não tem trilha contábil. */
	cancelar: boolean;
};

export type TQuoteOriginDisplay = {
	label: string;
	Icon: ComponentType<{ className?: string }>;
};

export const QUOTE_ORIGIN_DISPLAY: Record<string, TQuoteOriginDisplay> = {
	AGENTE_IA: { label: "Agente de IA", Icon: Sparkles },
	HUB: { label: "Atendimento", Icon: Headset },
	POS: { label: "Balcão", Icon: Store },
	OUTRO: { label: "Orçamento", Icon: FileText },
};

export function getQuoteOriginDisplay(origem: string): TQuoteOriginDisplay {
	return QUOTE_ORIGIN_DISPLAY[origem] ?? QUOTE_ORIGIN_DISPLAY.OUTRO;
}

/**
 * Idade legível de um orçamento, ou `null` quando a data de criação é desconhecida — `sales` não tem
 * coluna de criação e rascunhos antigos não deixaram carimbo. Nesse caso a interface omite a idade
 * em vez de exibir "há 0 dias".
 */
export function formatQuoteAge(criadoEm: Date | null): string | null {
	if (!criadoEm) return null;

	const minutes = Math.floor((Date.now() - criadoEm.getTime()) / 60_000);
	if (minutes < 1) return "agora";
	if (minutes < 60) return `há ${minutes}min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `há ${hours}h`;
	const days = Math.floor(hours / 24);
	return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

export function isQuoteStale(criadoEm: Date | null): boolean {
	return resolveQuoteFreshness(criadoEm)?.envelhecido ?? false;
}

export { QUOTE_STALE_AFTER_DAYS };
