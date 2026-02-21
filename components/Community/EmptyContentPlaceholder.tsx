import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

type EmptyContentPlaceholderProps = {
	icon?: LucideIcon;
	title?: string;
	description?: string;
};

export function EmptyContentPlaceholder({
	icon: Icon = Inbox,
	title = "Nada por aqui por enquanto :(",
	description = "Em breve teremos novos conteúdos disponíveis.",
}: EmptyContentPlaceholderProps) {
	return (
		<div className="flex flex-col items-center justify-center py-16 text-center">
			<div className="rounded-full bg-primary/10 p-5 mb-4">
				<Icon className="w-10 h-10 text-primary/50" />
			</div>
			<h3 className="text-base font-semibold mb-1">{title}</h3>
			<p className="text-sm text-muted-foreground max-w-sm">{description}</p>
		</div>
	);
}
