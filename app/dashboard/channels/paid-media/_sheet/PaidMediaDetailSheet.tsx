"use client";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { ArrowLeft, ChevronLeft, ChevronRight, X } from "lucide-react";
import { usePaidMedia } from "../_components/paid-media-context";
import { AdSheetBody } from "./AdSheetBody";
import { CampaignSheetBody } from "./CampaignSheetBody";

/**
 * Painel de detalhe da Mídia paga, montado uma vez na página. Lateral no desktop e gaveta de baixo no
 * celular, como o `ResponsiveMenu`. O corpo é chaveado por `tipo:id`, então trocar de item reinicia o
 * estado interno (aba, métrica) em vez de herdar o do item anterior.
 */
export function PaidMediaDetailSheet() {
	const { sheet } = usePaidMedia();
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const frame = sheet.current;
	const open = !!frame;

	const content = frame ? (
		<div className="flex h-full min-h-0 flex-col">
			<SheetNavigation />
			<div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/30">
				{frame.entry.type === "campaign" ? (
					<CampaignSheetBody key={`campaign:${frame.entry.id}`} campaignId={frame.entry.id} fallbackName={frame.entry.name} />
				) : (
					<AdSheetBody key={`ad:${frame.entry.id}`} adId={frame.entry.id} fallbackName={frame.entry.name} />
				)}
			</div>
		</div>
	) : null;

	if (isDesktop) {
		return (
			<Sheet open={open} onOpenChange={(next) => (!next ? sheet.close() : undefined)}>
				<SheetContent side="right" showCloseButton={false} className="w-full p-0 data-[side=right]:sm:max-w-[760px]">
					<SheetTitle className="sr-only">{frame?.entry.name ?? "Detalhe"}</SheetTitle>
					{content}
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<Drawer open={open} onOpenChange={(next) => (!next ? sheet.close() : undefined)}>
			<DrawerContent className="h-[92dvh]">
				<DrawerTitle className="sr-only">{frame?.entry.name ?? "Detalhe"}</DrawerTitle>
				{content}
			</DrawerContent>
		</Drawer>
	);
}

function SheetNavigation() {
	const { sheet } = usePaidMedia();
	const frame = sheet.current;
	if (!frame) return null;
	const total = frame.siblings.length;
	return (
		<div className="flex items-center gap-1 border-border border-b px-3 py-2">
			{sheet.canGoBack ? (
				<Button type="button" variant="ghost" size="icon-sm" onClick={sheet.back} aria-label="Voltar">
					<ArrowLeft />
				</Button>
			) : null}
			<span className="text-label text-muted-foreground">{frame.entry.type === "campaign" ? "Campanha" : "Anúncio"}</span>
			<div className="ml-auto flex items-center gap-1">
				{total > 1 ? (
					<>
						<Button type="button" variant="ghost" size="icon-sm" disabled={sheet.index <= 0} onClick={() => sheet.step(-1)} aria-label="Anterior">
							<ChevronLeft />
						</Button>
						<span className="text-micro text-numeric min-w-12 text-center text-muted-foreground">
							{sheet.index + 1} / {total}
						</span>
						<Button type="button" variant="ghost" size="icon-sm" disabled={sheet.index >= total - 1} onClick={() => sheet.step(1)} aria-label="Próximo">
							<ChevronRight />
						</Button>
					</>
				) : null}
				<Button type="button" variant="ghost" size="icon-sm" onClick={sheet.close} aria-label="Fechar">
					<X />
				</Button>
			</div>
		</div>
	);
}
