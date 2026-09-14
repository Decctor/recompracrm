import { cn } from "@/lib/utils";

/**
 * Pilula de contagem viva ao lado do titulo de um item da sidebar. Nao renderiza nada em zero —
 * uma badge "0" ocupa espaco para afirmar que nao ha nada a afirmar.
 *
 * O tom carrega o significado e nao e decoracao: `danger` e para pendencia (fiscal travado, fiado
 * vencido), onde o vermelho e a mensagem; `neutral` e para carga de trabalho normal (pedidos em
 * atendimento), que estaria gritando lobo em vermelho — numa cozinha movimentada a badge nunca
 * zeraria, e um alerta permanente deixa de ser alerta.
 */
export function SidebarCountBadge({ count, tone = "danger", className }: { count: number; tone?: "danger" | "neutral"; className?: string }) {
	if (count <= 0) return null;
	return (
		<span
			className={cn(
				"ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums group-data-[collapsible=icon]:hidden",
				tone === "danger" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
				className,
			)}
		>
			{count > 99 ? "99+" : count}
		</span>
	);
}
