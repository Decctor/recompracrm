"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatToMoney } from "@/lib/formatting";
import { ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

type MobileCheckoutBarProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	itemCount: number;
	total: number;
	icon: ReactNode;
	// Verbo do gatilho e do título do Sheet: "CHECKOUT" na venda nova, "EDITAR VENDA" na edição.
	title: string;
	description: string;
	ariaLabel: string;
	children: ReactNode;
};

// Gatilho do checkout no mobile. Vive em fluxo, como última linha da coluna da página — e não
// como um botão `fixed` no canto: com o documento rolável, o Samsung Internet (e o Chrome com a
// barra de ferramentas no rodapé) posiciona o `fixed` em relação à viewport "grande", atrás da
// barra do navegador, e o botão só reaparecia depois de rolar. A página do POS já é a altura da
// viewport (`100dvh`), então a última linha da coluna é o rodapé visível em qualquer navegador.
export default function MobileCheckoutBar({
	open,
	onOpenChange,
	itemCount,
	total,
	icon,
	title,
	description,
	ariaLabel,
	children,
}: MobileCheckoutBarProps) {
	return (
		<div className="shrink-0 pb-[env(safe-area-inset-bottom)] lg:hidden">
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetTrigger
					render={
						// O total fica no gatilho: no mobile o painel nasce fechado, e sem o valor aqui o
						// total do carrinho não está apenas fora do scroll, está invisível o tempo inteiro.
						<Button className="h-12 w-full justify-between rounded-xl px-4 shadow-lg" aria-label={ariaLabel} />
					}
				>
					<span className="flex items-center gap-2">
						{icon}
						<span className="font-extrabold tabular-nums">{itemCount}</span>
						<span className="text-xs font-semibold uppercase opacity-80">{itemCount === 1 ? "item" : "itens"}</span>
					</span>
					<span className="flex items-center gap-2">
						<span className="text-base font-extrabold tabular-nums">{formatToMoney(total)}</span>
						<ChevronUp className="h-4 w-4 opacity-80" />
					</span>
				</SheetTrigger>
				<SheetContent
					side="bottom"
					className="flex h-[92dvh] max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 data-[side=bottom]:h-[92dvh]"
				>
					<SheetHeader className="shrink-0 border-b p-4 text-left">
						<SheetTitle className="text-lg font-black">{title}</SheetTitle>
						<SheetDescription>{description}</SheetDescription>
					</SheetHeader>
					<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
						{children}
					</div>
				</SheetContent>
			</Sheet>
		</div>
	);
}
