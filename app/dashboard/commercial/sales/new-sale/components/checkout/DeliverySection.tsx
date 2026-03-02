import SelectInput from "@/components/Inputs/SelectInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import { SaleFullfilmentModesOptions } from "@/utils/select-options";
import { TruckIcon } from "lucide-react";

type DeliverySectionProps = {
	saleState: TUseSaleState;
	locationOptions: { id: string; value: string; label: string }[];
	onOpenNewLocation: () => void;
};

export default function DeliverySection({ saleState, locationOptions, onOpenNewLocation }: DeliverySectionProps) {
	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs">
			<div className="flex items-center gap-1.5">
				<TruckIcon className="w-4 h-4 text-primary" />
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
							onClick={() => saleState.setEntregaModalidade(mode.value)}
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
					<Button type="button" variant="outline" size="sm" disabled={!saleState.state.cliente} onClick={onOpenNewLocation}>
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
