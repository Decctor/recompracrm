import { cn } from "@/lib/utils";

/** Etiqueta "NOVO" ao lado de um item recém-lançado da sidebar. Some com a sidebar recolhida. */
export function SidebarNewBadge({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"bg-primary/10 text-primary ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold tracking-wide group-data-[collapsible=icon]:hidden",
				className,
			)}
		>
			NOVO
		</span>
	);
}
