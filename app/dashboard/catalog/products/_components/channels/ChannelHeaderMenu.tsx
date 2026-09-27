"use client";

import { SalesChannelMark } from "@/components/SalesChannels/SalesChannelMark";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TSalesChannelMatrixChannel } from "@/lib/queries/sales-channels";
import type { TSalesChannelCatalogModeEnum } from "@/schemas/enums";
import { Settings2 } from "lucide-react";

const CATALOG_MODES: { value: TSalesChannelCatalogModeEnum; title: string; description: string }[] = [
	{
		value: "TODOS",
		title: "Todos os produtos ativos",
		description: "Todo produto vendável entra por padrão; marque INDISPONÍVEL nos que não devem aparecer.",
	},
	{
		value: "SELECIONADOS",
		title: "Somente os selecionados",
		description: "Só entra quem estiver DISPONÍVEL; produtos novos ficam de fora até serem marcados.",
	},
];

/**
 * Cabeçalho da coluna-grupo de um canal: marca + rótulo e o menu do que é POR CANAL (o modo do
 * catálogo). O iFood não tem modo a escolher — o cardápio de lá é montado pelos vínculos, e o
 * canal nasce em SELECIONADOS —, então o menu dele só explica isso.
 */
export default function ChannelHeaderMenu({
	channel,
	label,
	catalogoModo,
	linkedCount,
	onCatalogModeChange,
}: {
	channel: TSalesChannelMatrixChannel;
	label: string;
	catalogoModo: TSalesChannelCatalogModeEnum;
	/** Nós vinculados a itens do iFood neste merchant; só faz sentido para o canal IFOOD. */
	linkedCount: number;
	onCatalogModeChange: (catalogoModo: TSalesChannelCatalogModeEnum) => void;
}) {
	const isIfood = channel.canal === "IFOOD";
	const modeLabel = isIfood
		? `${linkedCount} ${linkedCount === 1 ? "vínculo" : "vínculos"}`
		: catalogoModo === "TODOS"
			? "todos por padrão"
			: "só selecionados";

	return (
		<div className="flex min-w-0 items-center justify-between gap-2 px-1">
			<div className="flex min-w-0 items-center gap-2">
				<SalesChannelMark canal={channel.canal} className="size-6" />
				<div className="flex min-w-0 flex-col">
					<span className="truncate text-xs font-semibold normal-case tracking-normal text-foreground">{label}</span>
					<span className="truncate text-[0.6rem] normal-case tracking-normal text-muted-foreground">{modeLabel}</span>
				</div>
			</div>
			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label={`Configurar o canal ${label}`}
					className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<Settings2 className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-72">
					{isIfood ? (
						<DropdownMenuGroup>
							<DropdownMenuLabel>Cardápio do iFood</DropdownMenuLabel>
							<p className="px-3 pb-2 text-xs normal-case tracking-normal text-muted-foreground">
								O que aparece no iFood é o que está vinculado a um item de lá. Disponibilidade e preço definidos aqui são enviados ao iFood pelo vínculo; sem
								vínculo, ficam como estado desejado.
							</p>
						</DropdownMenuGroup>
					) : (
						<>
							<DropdownMenuLabel>Modo do catálogo</DropdownMenuLabel>
							<DropdownMenuRadioGroup value={catalogoModo} onValueChange={(value) => onCatalogModeChange(value as TSalesChannelCatalogModeEnum)}>
								{CATALOG_MODES.map((mode) => (
									<DropdownMenuRadioItem key={mode.value} value={mode.value}>
										<span className="flex flex-col gap-0.5">
											<span className="text-sm font-medium normal-case tracking-normal">{mode.title}</span>
											<span className="text-xs normal-case tracking-normal text-muted-foreground">{mode.description}</span>
										</span>
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
							<DropdownMenuSeparator />
							<p className="px-3 py-1.5 text-xs normal-case tracking-normal text-muted-foreground">
								Trocar o modo preserva o que está visível hoje: muda só o destino dos produtos futuros.
							</p>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
