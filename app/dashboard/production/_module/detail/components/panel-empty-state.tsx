import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Estado vazio do painel lateral: ícone, uma frase e, quando cabe, uma ação. */
export function PanelEmptyState({ icon: Icon, text, children }: { icon: LucideIcon; text: string; children?: ReactNode }) {
	return (
		<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-8 text-center">
			<span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<Icon className="h-5 w-5" />
			</span>
			<p className="max-w-xs text-sm text-muted-foreground">{text}</p>
			{children}
		</div>
	);
}
