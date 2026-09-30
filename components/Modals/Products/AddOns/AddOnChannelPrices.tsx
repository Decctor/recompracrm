"use client";

import { ChannelPriceInput } from "@/components/SalesChannels/ProductChannelControls";
import { SalesChannelMark, salesChannelLabel } from "@/components/SalesChannels/SalesChannelMark";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { useIfoodMerchantNames } from "@/lib/queries/ifood";
import { cn } from "@/lib/utils";
import type { TUseAddOnChannelSettingsState } from "@/state-hooks/use-add-on-channel-settings-state";
import type { TUseProductAddOnState } from "@/state-hooks/use-product-state";
import { BadgeDollarSign } from "lucide-react";
import { useMemo, useState } from "react";

type AddOnChannelPricesProps = {
	options: TUseProductAddOnState["state"]["opcoes"];
	channelSettings: TUseAddOnChannelSettingsState;
};

/**
 * Preço e disponibilidade das opções do grupo em cada canal. Célula vazia herda o Δ preço da opção
 * (mostrado no placeholder); pausar aqui tira a opção só deste canal — a opção inativa no cadastro
 * continua inativa em todos. Salvo junto com o grupo, pela ação do modal.
 */
export default function AddOnChannelPrices({ options, channelSettings }: AddOnChannelPricesProps) {
	const channels = channelSettings.data?.channels ?? [];
	const merchantNames = useIfoodMerchantNames({ enabled: channels.some((channel) => channel.canal === "IFOOD") });
	const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
	const [increment, setIncrement] = useState<number | null>(null);
	const channel = channels.find((candidate) => candidate.id === selectedChannelId) ?? channels[0] ?? null;

	// Só opções já salvas têm id para ganhar linha no canal; as novas entram depois do primeiro save.
	const savedOptions = useMemo(() => options.filter((option) => !option.deletar && option.id), [options]);
	const unsavedCount = options.filter((option) => !option.deletar && !option.id).length;

	if (channelSettings.isLoading) {
		return (
			<ResponsiveMenuSection title="PREÇOS POR CANAL" icon={<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />}>
				<p className="w-full py-2 text-center text-xs text-muted-foreground">Carregando canais...</p>
			</ResponsiveMenuSection>
		);
	}
	if (channelSettings.isError || !channel) {
		return (
			<ResponsiveMenuSection title="PREÇOS POR CANAL" icon={<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />}>
				<p className="w-full py-2 text-center text-xs text-muted-foreground">
					{channelSettings.isError ? getErrorMessage(channelSettings.error) : "Nenhum canal de venda configurado."}
				</p>
			</ResponsiveMenuSection>
		);
	}

	function applyIncrement() {
		if (!channel || increment == null) return;
		channelSettings.updateCells(
			channel.id,
			savedOptions
				.filter((option) => option.ativo)
				.map((option) => ({ opcaoId: option.id as string, partial: { precoDelta: Math.max(0, option.precoDelta + increment) } })),
		);
	}

	function clearChannel() {
		if (!channel) return;
		channelSettings.updateCells(
			channel.id,
			savedOptions.map((option) => ({ opcaoId: option.id as string, partial: { precoDelta: null, disponivel: null } })),
		);
	}

	return (
		<ResponsiveMenuSection title="PREÇOS POR CANAL" icon={<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="flex w-full flex-col gap-2">
				<p className="text-xs tracking-tight text-muted-foreground">Vazio usa o Δ preço da opção. Pausar tira a opção só do canal escolhido.</p>
				<div role="tablist" aria-label="Canal de venda" className="flex w-full gap-1 overflow-x-auto">
					{channels.map((candidate) => {
						const selected = candidate.id === channel.id;
						const count = channelSettings.overrideCount(candidate.id);
						return (
							<button
								key={candidate.id}
								type="button"
								role="tab"
								aria-selected={selected}
								onClick={() => setSelectedChannelId(candidate.id)}
								className={cn(
									"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold uppercase tracking-tight transition-colors",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
									selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								<SalesChannelMark canal={candidate.canal} className="size-5" />
								{salesChannelLabel(candidate, merchantNames)}
								{count > 0 ? (
									<span className={cn("text-numeric text-[0.65rem] font-semibold", selected ? "text-primary-foreground/80" : "text-muted-foreground/80")}>
										{count}
									</span>
								) : null}
							</button>
						);
					})}
				</div>

				<div className="flex w-full flex-wrap items-center gap-2">
					<span className="text-[0.68rem] font-medium uppercase text-muted-foreground">Somar às ativas</span>
					<ChannelPriceInput value={increment} basePrice={null} onChange={setIncrement} />
					<Button type="button" variant="outline" size="xs" disabled={increment == null} onClick={applyIncrement}>
						APLICAR
					</Button>
					<Button type="button" variant="ghost" size="xs" className="ml-auto" onClick={clearChannel}>
						VOLTAR A HERDAR TUDO
					</Button>
				</div>

				<div className="w-full overflow-hidden rounded-lg border border-border">
					<div className="grid grid-cols-[1fr_5.5rem_6.5rem_7.5rem] items-center gap-2 border-b border-border px-2 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground">
						<p>Opção</p>
						<p className="text-center">Δ Preço</p>
						<p className="text-center">No canal</p>
						<p className="text-center">Status no canal</p>
					</div>
					{savedOptions.length === 0 ? <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhuma opção salva neste grupo.</p> : null}
					{savedOptions.map((option, index) => {
						const opcaoId = option.id as string;
						const cell = channelSettings.getCell(channel.id, opcaoId);
						const paused = cell.disponivel === false;
						return (
							<div
								key={opcaoId}
								className={cn(
									"grid grid-cols-[1fr_5.5rem_6.5rem_7.5rem] items-center gap-2 border-t border-border px-2 py-1 text-xs first:border-t-0",
									index % 2 === 1 && "bg-muted/10",
									(!option.ativo || paused) && "bg-muted/40",
								)}
							>
								<p className="min-w-0 truncate font-medium tracking-tight">{option.nome}</p>
								<p className="text-center tabular-nums text-muted-foreground">{option.precoDelta > 0 ? formatToMoney(option.precoDelta) : "-"}</p>
								<div className="flex justify-center">
									<ChannelPriceInput
										value={cell.precoDelta}
										basePrice={option.precoDelta}
										onChange={(precoDelta) => channelSettings.updateCell(channel.id, opcaoId, { precoDelta })}
									/>
								</div>
								<div className="flex justify-center">
									{option.ativo ? (
										<button
											type="button"
											onClick={() => channelSettings.updateCell(channel.id, opcaoId, { disponivel: paused ? null : false })}
											className={cn(
												"rounded-full px-2.5 py-1 text-[0.6rem] font-semibold tracking-wide transition-colors",
												paused ? "bg-red-500/15 text-red-600" : "bg-primary/10 text-primary/70",
											)}
										>
											{paused ? "PAUSADA NO CANAL" : "HERDAR (ATIVA)"}
										</button>
									) : (
										<span className="text-[0.6rem] font-semibold tracking-wide text-muted-foreground">INATIVA NO CADASTRO</span>
									)}
								</div>
							</div>
						);
					})}
				</div>
				{unsavedCount > 0 ? (
					<p className="text-[0.7rem] text-muted-foreground">
						{unsavedCount === 1 ? "1 opção nova" : `${unsavedCount} opções novas`} ganham preço por canal depois que o grupo for salvo.
					</p>
				) : null}
			</div>
		</ResponsiveMenuSection>
	);
}
