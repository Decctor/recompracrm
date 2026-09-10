import SelectInput from "@/components/Inputs/SelectInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import { resolveShopDeliveryFee } from "@/lib/shop/config";
import { useShopSettings } from "@/lib/queries/shop";
import { SaleFullfilmentModesOptions } from "@/utils/select-options";
import { TruckIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

type DeliverySectionProps = {
	saleState: TUseSaleState;
	locationOptions: { id: string; value: string; label: string }[];
	onOpenNewLocation: () => void;
	onPreloadNewLocation?: () => void;
};

export default function DeliverySection({ saleState, locationOptions, onOpenNewLocation, onPreloadNewLocation }: DeliverySectionProps) {
	const { data: shopSettings } = useShopSettings();
	const configuracoes = shopSettings?.configuracoes ?? null;
	// Mesma regra da loja digital, aplicada ao subtotal de itens do PDV.
	const deliveryFee = configuracoes ? resolveShopDeliveryFee({ configuracoes, modalidade: "ENTREGA", subtotalItens: saleState.totalItens }) : 0;

	const deliveryMode = saleState.state.entregaModalidade;
	const setDeliveryFee = saleState.setTaxaEntrega;
	// Modalidade da renderização anterior. `null` = primeira passada, ou seja, o estado ainda é o que
	// veio da venda persistida (edição/checkout de rascunho) e não pode ser sobrescrito.
	const previousModeRef = useRef<typeof deliveryMode | null>(null);
	// A taxa atual foi aplicada por este prefill? Só nesse caso ela acompanha mudanças da regra.
	// Uma taxa que já estava na venda pertence ao operador — reaplicar a configurada por cima dela
	// somaria a taxa duas vezes em toda venda antiga com acréscimo manual.
	const prefillOwnsFeeRef = useRef(false);
	useEffect(() => {
		const previousMode = previousModeRef.current;
		previousModeRef.current = deliveryMode;

		if (previousMode === null) return;
		if (previousMode !== deliveryMode) {
			prefillOwnsFeeRef.current = deliveryMode === "ENTREGA";
			setDeliveryFee(deliveryMode === "ENTREGA" ? deliveryFee : 0);
			return;
		}
		// Mesma modalidade: acompanha a regra (carrinho cruzou o limite de entrega grátis, ou as
		// configurações da loja acabaram de carregar) apenas sobre a taxa que este prefill aplicou.
		if (prefillOwnsFeeRef.current) setDeliveryFee(deliveryFee);
	}, [deliveryFee, deliveryMode, setDeliveryFee]);

	return (
		<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs">
			<div className="flex items-center gap-1.5">
				<TruckIcon className="w-4 h-4 text-foreground" />
				<h3 className="font-bold text-xs tracking-wide">ENTREGA</h3>
			</div>
			<div className="w-full flex items-center flex-wrap gap-1.5 justify-center">
				{SaleFullfilmentModesOptions.map((mode) => {
					const isEntregaBlocked = mode.value === "ENTREGA" && saleState.state.modoCliente === "CONSUMIDOR";
					return (
						<Button
							key={mode.value}
							type="button"
							size="fit"
							className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
							variant={saleState.state.entregaModalidade === mode.value ? "brand" : "ghost"}
							disabled={isEntregaBlocked}
							onClick={() => {
								// Trocar a modalidade reaplica o default de efetivação dos splits (entrega nasce
								// "receber depois") — o ajuste é silencioso no state, então avisa aqui.
								const rederivedCount = saleState.countPaymentsRederivedByModalidade(mode.value);
								saleState.setEntregaModalidade(mode.value);
								if (rederivedCount > 0) {
									toast.info(
										mode.value === "ENTREGA"
											? "Pagamentos ajustados para receber na entrega. Se algum já foi recebido, marque RECEBER AGORA no pagamento."
											: "Efetivação dos pagamentos ajustada ao padrão de cada método.",
									);
								}
							}}
						>
							{mode.icon}
							{mode.label}
						</Button>
					);
				})}
			</div>

			{saleState.state.entregaModalidade === "ENTREGA" ? (
				<>
					<SelectInput
						label="Local de entrega"
						value={saleState.state.entregaLocalizacaoId}
						options={locationOptions}
						handleChange={(value) => saleState.setEntregaLocalizacaoId(value)}
						onReset={() => saleState.setEntregaLocalizacaoId(null)}
						resetOptionLabel="Selecione um endereço"
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!saleState.state.cliente}
						onPointerEnter={onPreloadNewLocation}
						onFocus={onPreloadNewLocation}
						onClick={onOpenNewLocation}
					>
						NOVA LOCALIZAÇÃO
					</Button>
				</>
			) : null}

			{saleState.state.entregaModalidade === "COMANDA" ? (
				<Input
					placeholder="Número da comanda"
					value={saleState.state.comandaNumero ?? ""}
					onChange={(event) => saleState.setComandaNumero(event.target.value || null)}
				/>
			) : null}
		</div>
	);
}
