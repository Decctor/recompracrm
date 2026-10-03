"use client";

import type { TGetProductsOutputById } from "@/app/api/products/route";
import NumberInput from "@/components/Inputs/NumberInput";
import { ProductInactiveChannelsCallout } from "@/components/Products/Shared/ProductActiveStatus";
import { AvailabilityCycleButton, ChannelPriceInput } from "@/components/SalesChannels/ProductChannelControls";
import { SalesChannelMark, salesChannelLabel } from "@/components/SalesChannels/SalesChannelMark";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Section } from "@/components/ui/section";
import { DataList } from "@/components/ui/data-list";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS, resolvePromotion } from "@/lib/products/pricing";
import { Button } from "@/components/ui/button";
import { productChannelNodeKey } from "@/lib/products/product-registry-state";
import { useIfoodMerchantNames } from "@/lib/queries/ifood";
import { useProductChannelSettings } from "@/lib/queries/product-channel-settings";
import { useProductPricingSectionEditor } from "@/state-hooks/use-product-section-editor";
import { BadgeDollarSign, Percent } from "lucide-react";

type PricesAndChannelsSectionProps = {
	product: TGetProductsOutputById;
	orgHasERPAccess: boolean;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/**
 * Preços base do produto e a matriz de canais na mesma seção: os dois respondem à mesma pergunta —
 * por quanto e onde este produto é vendido —, então o override por canal fica ao lado do preço que
 * ele sobrescreve, sob uma única barra de aplicar.
 *
 * A herança é explícita: sem linha no canal vale o modo do canal (e o preço base); a linha da
 * variante só restringe dentro de produto visível.
 */
export default function PricesAndChannelsSection({ product, orgHasERPAccess, callbacks }: PricesAndChannelsSectionProps) {
	const { data, isLoading, isError } = useProductChannelSettings({ produtoId: product.id, enabled: orgHasERPAccess });
	const merchantNames = useIfoodMerchantNames({ enabled: !!data?.channels.some((channel) => channel.canal === "IFOOD") });
	const editor = useProductPricingSectionEditor({ product, channelData: data, callbacks });

	const activeVariants = product.variantes.filter((variant) => variant.ativo);
	const { precoCusto, precoVenda } = editor.basePrices;
	// Margem sobre o custo, em pontos percentuais — sem custo não há margem a calcular.
	const marginLabel =
		precoCusto != null && precoCusto > 0 && precoVenda != null ? `${formatDecimalPlaces(((precoVenda - precoCusto) / precoCusto) * 100, 0, 1)}%` : "—";

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<BadgeDollarSign className="h-4 w-4 min-h-4 min-w-4" />
				</Section.Icon>
				<Section.Title>PREÇOS E CANAIS DE VENDA</Section.Title>
			</Section.Header>
			<Section.Body>
				<div className="flex w-full flex-col gap-3">
					<h2 className="text-xs leading-none tracking-tight">PREÇOS BASE</h2>
					<div className="flex w-full items-center gap-2 lg:flex-row">
						<div className="w-full lg:w-1/2">
							<NumberInput
								label="PREÇO DE CUSTO"
								value={precoCusto}
								placeholder="Preencha aqui o preço de custo do produto."
								handleChange={(value) => editor.updateBasePrices({ precoCusto: value })}
							/>
						</div>
						<div className="w-full lg:w-1/2">
							<NumberInput
								label="PREÇO DE VENDA"
								value={precoVenda}
								placeholder="Preencha aqui o preço de venda do produto."
								handleChange={(value) => editor.updateBasePrices({ precoVenda: value })}
							/>
						</div>
					</div>
					<PreviousPriceField
						product={product}
						value={editor.basePrices.precoVendaAnterior}
						onChange={(precoVendaAnterior) => editor.updateBasePrices({ precoVendaAnterior })}
					/>
					<DataList.Line icon={<Percent className="h-4 w-4" />} label="MARGEM DE LUCRO" value={marginLabel} />
				</div>

				{orgHasERPAccess ? (
					<div className="flex w-full flex-col gap-3">
						<h2 className="text-xs leading-none tracking-tight">CANAIS DE VENDA</h2>

						{product.ativo === false ? (
							<ProductInactiveChannelsCallout />
						) : product.vendavel === false ? (
							<p className="text-xs text-muted-foreground">
								Produto marcado como <span className="font-semibold">não vendável</span> — ele não aparece em nenhum canal, independentemente das
								configurações abaixo.
							</p>
						) : null}

						{isLoading ? <p className="text-xs text-muted-foreground">Carregando canais...</p> : null}
						{!isLoading && (isError || !data) ? (
							<p className="text-xs text-muted-foreground">Não foi possível carregar os canais de venda. Os preços base seguem editáveis.</p>
						) : null}

						{data ? (
							<div className="flex flex-col gap-2">
								{data.channels.map((channel) => {
									const inheritedVisible = channel.catalogoModo === "TODOS";
									const channelNodeKey = productChannelNodeKey(channel.id, null);
									return (
										<div key={channel.id} className="flex flex-col gap-1.5 rounded-lg bg-primary/5 px-3 py-2">
											<div className="flex items-center justify-between gap-2">
												<div className="flex items-center gap-2">
													<SalesChannelMark canal={channel.canal} />
													<div className="flex flex-col gap-0.5">
														<span className="text-xs font-semibold leading-none">{salesChannelLabel(channel, merchantNames)}</span>
														<span className="text-[0.6rem] leading-none text-muted-foreground">padrão do canal: {inheritedVisible ? "visível" : "oculto"}</span>
													</div>
												</div>
												<div className="flex items-center gap-2">
													{activeVariants.length === 0 ? (
														<ChannelPriceInput
															value={editor.channelPrices.get(channelNodeKey) ?? null}
															basePrice={precoVenda}
															onChange={(value) => editor.updateChannelPrice(channelNodeKey, value)}
														/>
													) : null}
													<AvailabilityCycleButton
														choice={editor.choices.get(channelNodeKey) ?? null}
														inheritedVisible={inheritedVisible}
														onCycle={() => editor.cycleChannelChoice(channelNodeKey)}
													/>
												</div>
											</div>
											{activeVariants.length > 0 ? (
												<div className="flex flex-col gap-1 border-l border-border pl-3">
													{activeVariants.map((variant) => {
														const variantNodeKey = productChannelNodeKey(channel.id, variant.id);
														return (
															<div key={variant.id} className="flex items-center justify-between gap-2">
																<span className="text-[0.65rem] text-muted-foreground">{variant.nome}</span>
																<div className="flex items-center gap-2">
																	<ChannelPriceInput
																		value={editor.channelPrices.get(variantNodeKey) ?? null}
																		basePrice={variant.precoVenda}
																		onChange={(value) => editor.updateChannelPrice(variantNodeKey, value)}
																	/>
																	<AvailabilityCycleButton
																		choice={editor.choices.get(variantNodeKey) ?? null}
																		inheritedVisible
																		variantLevel
																		onCycle={() => editor.cycleChannelChoice(variantNodeKey)}
																	/>
																</div>
															</div>
														);
													})}
												</div>
											) : null}
										</div>
									);
								})}
							</div>
						) : null}
					</div>
				) : null}

				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />
			</Section.Body>
		</Section.Root>
	);
}

/**
 * Preço "De" das peças de comunicação visual. Preenchido sozinho quando o preço de venda muda
 * (`buildPrecoVendaUpdate`); editável para corrigir digitação ou declarar o "De" explicitamente.
 * O status reflete o que está salvo, não o rascunho.
 */
function PreviousPriceField({
	product,
	value,
	onChange,
}: {
	product: TGetProductsOutputById;
	value: number | null;
	onChange: (value: number | null) => void;
}) {
	const promotion = resolvePromotion({
		currentPrice: product.precoVenda,
		precoVendaAnterior: product.precoVendaAnterior,
		dataAlteracaoPrecoVenda: product.dataAlteracaoPrecoVenda,
	});

	let status = "Preenchido automaticamente quando o preço de venda muda. É o “De” das peças quando o produto está em promoção.";
	if (promotion.emPromocao && product.precoVenda != null && product.dataAlteracaoPrecoVenda) {
		const promotionEnd = new Date(new Date(product.dataAlteracaoPrecoVenda).getTime() + PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
		status = `Em promoção: de ${formatToMoney(promotion.precoDe ?? 0)} por ${formatToMoney(product.precoVenda)} (−${promotion.percentualDesconto}%) até ${formatDateAsLocale(promotionEnd)}.`;
	} else if (product.precoVendaAnterior != null) {
		status = `Sem promoção: o preço anterior não é maior que o atual ou mudou há mais de ${PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS} dias.`;
	}

	return (
		<div className="flex w-full flex-col gap-1">
			<div className="flex w-full items-end gap-2">
				<div className="grow">
					<NumberInput
						label="PREÇO ANTERIOR (DE)"
						value={value}
						placeholder="Sem preço anterior."
						handleChange={(next) => onChange(next > 0 ? next : null)}
					/>
				</div>
				{value != null ? (
					<Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
						LIMPAR
					</Button>
				) : null}
			</div>
			<p className="text-[0.65rem] tracking-tight text-muted-foreground">{status}</p>
		</div>
	);
}
