"use client";

import { AvailabilityCycleButton, ChannelPriceInput, cycleAvailabilityChoice } from "@/components/SalesChannels/ProductChannelControls";
import { SALES_CHANNEL_LABELS, SalesChannelMark } from "@/components/SalesChannels/SalesChannelMark";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { useSalesChannels } from "@/lib/queries/sales-channels";
import type { TProductChannelSettingNodeRef, TProductState, TUseProductState } from "@/state-hooks/use-product-state";
import { Store } from "lucide-react";

type ProductSalesChannelsBlockProps = {
	product: TProductState["product"];
	variants: TProductState["productVariants"];
	channelSettings: TProductState["productChannelSettings"];
	updateProductChannelSetting: TUseProductState["updateProductChannelSetting"];
};

/**
 * A matriz de canais do produto ainda em cadastro — a mesma que PricesAndChannelsSection edita
 * no produto salvo, com a mesma herança: sem override vale o modo do canal (e o preço base), e a
 * linha da variante só restringe dentro de produto visível.
 *
 * Só é montado para organizações com o módulo de ERP: quem não o tem não possui canais para
 * configurar, então o bloco não existe (nem desabilitado, nem vazio) e o payload segue sem a matriz.
 */
export default function ProductSalesChannelsBlock({
	product,
	variants,
	channelSettings,
	updateProductChannelSetting,
}: ProductSalesChannelsBlockProps) {
	const { data: channels, isLoading, isError } = useSalesChannels();

	// Variantes vivas do formulário: a ordem é a do estado, e a chave local é o que amarra o override.
	// O preço nível-produto só existe sem variantes (regra do servidor); as linhas mostram só as ativas.
	const liveVariants = variants.filter((variant) => !variant.deletar);
	const activeVariants = liveVariants.filter((variant) => variant.ativo);

	const findSetting = (node: TProductChannelSettingNodeRef) =>
		channelSettings.find(
			(setting) => setting.canalVendaId === node.canalVendaId && setting.produtoVarianteReferenciaId === node.produtoVarianteReferenciaId,
		) ?? null;

	return (
		<ResponsiveMenuSection title="CANAIS DE VENDA" icon={<Store className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="flex w-full flex-col gap-3">
				<p className="text-xs text-muted-foreground">
					Defina onde o produto fica disponível e por quanto. Sem ajuste, cada canal segue o próprio padrão e o preço base.
				</p>

				{product.vendavel === false ? (
					<p className="text-xs text-muted-foreground">
						Produto marcado como <span className="font-semibold">não vendável</span> — ele não aparece em nenhum canal, independentemente das configurações
						abaixo.
					</p>
				) : null}

				{isLoading ? <p className="text-xs text-muted-foreground">Carregando canais...</p> : null}
				{!isLoading && (isError || !channels) ? (
					<p className="text-xs text-muted-foreground">
						Não foi possível carregar os canais de venda. Você pode configurá-los depois, na página do produto.
					</p>
				) : null}

				{channels ? (
					<div className="flex flex-col gap-2">
						{channels.map((channel) => {
							const inheritedVisible = channel.catalogoModo === "TODOS";
							const productNode: TProductChannelSettingNodeRef = { canalVendaId: channel.id, produtoVarianteReferenciaId: null };
							const productSetting = findSetting(productNode);
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
											{liveVariants.length === 0 ? (
												<ChannelPriceInput
													value={productSetting?.precoVenda ?? null}
													basePrice={product.precoVenda ?? null}
													onChange={(value) => updateProductChannelSetting(productNode, { precoVenda: value })}
												/>
											) : null}
											<AvailabilityCycleButton
												choice={productSetting?.disponivel ?? null}
												inheritedVisible={inheritedVisible}
												onCycle={() => updateProductChannelSetting(productNode, { disponivel: cycleAvailabilityChoice(productSetting?.disponivel ?? null) })}
											/>
										</div>
									</div>
									{activeVariants.length > 0 ? (
										<div className="flex flex-col gap-1 border-l border-border pl-3">
											{activeVariants.map((variant) => {
												const variantNode: TProductChannelSettingNodeRef = {
													canalVendaId: channel.id,
													produtoVarianteReferenciaId: variant.referenciaId,
												};
												const variantSetting = findSetting(variantNode);
												return (
													<div key={variant.referenciaId} className="flex items-center justify-between gap-2">
														<span className="text-[0.65rem] text-muted-foreground">{variant.nome || "Variante sem nome"}</span>
														<div className="flex items-center gap-2">
															<ChannelPriceInput
																value={variantSetting?.precoVenda ?? null}
																basePrice={variant.precoVenda ?? null}
																onChange={(value) => updateProductChannelSetting(variantNode, { precoVenda: value })}
															/>
															<AvailabilityCycleButton
																choice={variantSetting?.disponivel ?? null}
																inheritedVisible
																variantLevel
																onCycle={() => updateProductChannelSetting(variantNode, { disponivel: cycleAvailabilityChoice(variantSetting?.disponivel ?? null) })}
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
		</ResponsiveMenuSection>
	);
}
