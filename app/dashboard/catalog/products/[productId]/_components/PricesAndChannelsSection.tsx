"use client";

import type { TGetProductsOutputById } from "@/app/api/products/route";
import NumberInput from "@/components/Inputs/NumberInput";
import { AvailabilityCycleButton, ChannelPriceInput } from "@/components/SalesChannels/ProductChannelControls";
import { SALES_CHANNEL_LABELS, SalesChannelMark } from "@/components/SalesChannels/SalesChannelMark";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Section } from "@/components/ui/section";
import { DataList } from "@/components/ui/data-list";
import { formatDecimalPlaces } from "@/lib/formatting";
import { productChannelNodeKey } from "@/lib/products/product-registry-state";
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
					<DataList.Line icon={<Percent className="h-4 w-4" />} label="MARGEM DE LUCRO" value={marginLabel} />
				</div>

				{orgHasERPAccess ? (
					<div className="flex w-full flex-col gap-3">
						<h2 className="text-xs leading-none tracking-tight">CANAIS DE VENDA</h2>

						{product.vendavel === false ? (
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
														<span className="text-xs font-semibold leading-none">{SALES_CHANNEL_LABELS[channel.canal] ?? channel.canal}</span>
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
