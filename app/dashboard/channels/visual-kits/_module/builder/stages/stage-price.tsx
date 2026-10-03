"use client";

import { StageShell } from "@/app/dashboard/growth/campaigns/_module/builder/components/stage-shell";
import DateInput from "@/components/Inputs/DateInput";
import { SalesChannelMark } from "@/components/SalesChannels/SalesChannelMark";
import { formatDateForInputValue, formatDateOnInputChange, formatToMoney } from "@/lib/formatting";
import { PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS } from "@/lib/products/pricing";
import { cn } from "@/lib/utils";
import { BadgeDollarSign, Info, List, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { useKitBuilder } from "../kit-builder-context";
import KitToggle from "../kit-toggle";
import { KIT_STAGES } from "../stages";
import { useKitChannels } from "../use-kit-channels";

export default function StagePrice() {
	const { state, updateKit, updateConfig, selectedItems, orgHasERPAccess, next, back } = useKitBuilder();
	const { options } = useKitChannels();
	const { configuracao } = state.kit;
	const priced = selectedItems.filter((item) => item.preco != null);
	const inPromotion = priced.filter((item) => item.promocao.emPromocao).length;

	return (
		<StageShell>
			<StageShell.Title icon={KIT_STAGES.preco.icone} label={KIT_STAGES.preco.titulo} description={KIT_STAGES.preco.descricao} />
			<StageShell.Body className="gap-6">
				{orgHasERPAccess && options.length > 0 ? (
					<section className="flex flex-col gap-3">
						<div className="flex items-center gap-1.5">
							<BadgeDollarSign className="h-4 w-4 opacity-70" />
							<h3 className="text-xs font-semibold tracking-tight">PREÇO DE QUAL CANAL</h3>
						</div>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
							<ChannelCard
								label="Preço base"
								description="O preço de venda do cadastro."
								selected={state.kit.canalVendaId === null}
								onClick={() => updateKit({ canalVendaId: null })}
							/>
							{options.map((option) => (
								<ChannelCard
									key={option.id}
									label={option.label}
									description="Usa o preço do canal quando houver um definido."
									mark={<SalesChannelMark canal={option.canal} />}
									selected={state.kit.canalVendaId === option.id}
									onClick={() => updateKit({ canalVendaId: option.id })}
								/>
							))}
						</div>
					</section>
				) : null}

				<div className="flex items-start gap-3 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3">
					<Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
					<div className="flex flex-col gap-1">
						<span className="text-sm font-semibold">
							{inPromotion} de {priced.length} produtos selecionados estão em promoção
						</span>
						<span className="text-xs text-muted-foreground">
							Toda vez que o preço de venda muda, o anterior fica guardado no produto. Se ele for maior que o preço atual e a mudança tiver sido nos últimos{" "}
							{PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS} dias, o produto está em promoção e sai com De / Por. Sem preço anterior, ou com aumento, a peça mostra
							só o preço atual.
						</span>
					</div>
				</div>

				<section className="flex flex-col gap-3">
					<div className="flex items-center gap-1.5">
						<Tag className="h-4 w-4 opacity-70" />
						<h3 className="text-xs font-semibold tracking-tight">COMO O PREÇO APARECE</h3>
					</div>
					<div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
						<KitToggle
							label='Mostrar preço "De" riscado'
							value={configuracao.mostrarPrecoDe}
							onChange={(mostrarPrecoDe) => updateConfig({ mostrarPrecoDe })}
						/>
						<KitToggle
							label="Mostrar % de desconto"
							value={configuracao.mostrarPercentual}
							onChange={(mostrarPercentual) => updateConfig({ mostrarPercentual })}
						/>
						<DateInput
							label="VÁLIDO ATÉ"
							value={formatDateForInputValue(state.kit.validadeFim) ?? ""}
							handleChange={(value) => updateKit({ validadeFim: formatDateOnInputChange(value) })}
						/>
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<div className="flex items-center gap-1.5">
						<List className="h-4 w-4 opacity-70" />
						<h3 className="text-xs font-semibold tracking-tight">RESULTADO NOS PRODUTOS</h3>
					</div>
					<div className="overflow-hidden rounded-xl border border-border">
						<div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)] gap-2 bg-muted/60 px-3 py-2 text-[11px] font-medium uppercase text-muted-foreground md:grid">
							<span>Produto</span>
							<span>Preço anterior</span>
							<span>Preço atual</span>
							<span>Na peça</span>
						</div>
						{priced.map((item) => {
							const showFrom = item.promocao.emPromocao && configuracao.mostrarPrecoDe;
							const showPercent = item.promocao.emPromocao && configuracao.mostrarPercentual && !!item.promocao.percentualDesconto;
							return (
								<div
									key={item.chave}
									className="grid grid-cols-2 gap-2 border-t border-border px-3 py-2 text-xs first:border-t-0 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)] md:first:border-t"
								>
									<span className="col-span-2 truncate font-medium md:col-span-1">{item.nome}</span>
									<span className="text-muted-foreground">{item.precoVendaAnterior != null ? formatToMoney(item.precoVendaAnterior) : "—"}</span>
									<span>{formatToMoney(item.preco ?? 0)}</span>
									<span className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-1">
										{showFrom ? (
											<span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium">
												De {formatToMoney(item.promocao.precoDe ?? 0)} por {formatToMoney(item.preco ?? 0)}
											</span>
										) : (
											<span className="text-muted-foreground">{formatToMoney(item.preco ?? 0)}</span>
										)}
										{showPercent ? (
											<span className="rounded-full bg-green-500/15 px-2 py-0.5 font-semibold text-green-600 dark:text-green-400">
												-{item.promocao.percentualDesconto}%
											</span>
										) : null}
									</span>
								</div>
							);
						})}
						{priced.length === 0 ? <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhum produto com preço no kit.</p> : null}
					</div>
				</section>
			</StageShell.Body>
			<StageShell.Footer onBack={back} onNext={next} />
		</StageShell>
	);
}

function ChannelCard({
	label,
	description,
	mark,
	selected,
	onClick,
}: {
	label: string;
	description: string;
	mark?: ReactNode;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				"flex items-start gap-2 rounded-xl border bg-card p-3 text-left transition-all hover:border-brand/40",
				selected ? "border-brand ring-2 ring-brand/30" : "border-border",
			)}
		>
			{mark ?? (
				<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
					<BadgeDollarSign className="h-3.5 w-3.5" />
				</span>
			)}
			<span className="flex min-w-0 flex-col">
				<span className="truncate text-xs font-semibold">{label}</span>
				<span className="text-[11px] text-muted-foreground">{description}</span>
			</span>
		</button>
	);
}
