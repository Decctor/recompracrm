import TextInput from "@/components/Inputs/TextInput";
import { ControlClientLocation } from "@/components/Modals/Clients/Locations/ControlClientLocation";
import { NewClientLocation } from "@/components/Modals/Clients/Locations/NewClientLocation";
import { Button } from "@/components/ui/button";
import { useClientLocations } from "@/lib/queries/clients/locations";
import { cn } from "@/lib/utils";
import type { TDeliveryModeEnum } from "@/schemas/enums";
import type { TUseCheckoutState } from "@/state-hooks/use-checkout-state";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardList, MapPin, Package, Store } from "lucide-react";
import { useState } from "react";
import { ClientLocationCard } from "./ClientLocationCard";

type DeliveryStepProps = {
	sale: {
		cliente: { id: string; nome: string } | null;
	};
	checkoutState: TUseCheckoutState;
};

const DELIVERY_MODES: { value: TDeliveryModeEnum; label: string; description: string; icon: typeof Store }[] = [
	{
		value: "PRESENCIAL",
		label: "Presencial",
		description: "Cliente retira no balcão imediatamente",
		icon: Store,
	},
	{
		value: "RETIRADA",
		label: "Retirada",
		description: "Cliente retira em data/horário combinado",
		icon: Package,
	},
	{
		value: "ENTREGA",
		label: "Entrega",
		description: "Envio para endereço do cliente",
		icon: MapPin,
	},
	{
		value: "COMANDA",
		label: "Comanda",
		description: "Mesa ou comanda identificada",
		icon: ClipboardList,
	},
];

export default function DeliveryStep({ sale, checkoutState }: DeliveryStepProps) {
	const queryClient = useQueryClient();
	const [isNewLocationOpen, setIsNewLocationOpen] = useState(false);
	const [editingLocationId, setEditingLocationId] = useState<string | null>(null);

	const { data: clientLocations, isLoading, queryKey } = useClientLocations({ clienteId: sale.cliente?.id });

	return (
		<>
			<div className="flex flex-col gap-6">
				<div>
					<h2 className="text-lg font-black">Modalidade de Entrega</h2>
					<p className="text-sm text-muted-foreground">Selecione como o cliente receberá os produtos.</p>
				</div>

				{/* Mode Selection */}
				<div className="grid grid-cols-2 gap-4">
					{DELIVERY_MODES.map((mode) => {
						const isSelected = checkoutState.state.entregaModalidade === mode.value;
						const Icon = mode.icon;

						return (
							<Button
								key={mode.value}
								variant="outline"
								className={cn(
									"h-auto py-6 px-4 flex flex-col items-center gap-3 rounded-xl transition-all",
									isSelected && "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2",
								)}
								onClick={() => checkoutState.setEntregaModalidade(mode.value)}
							>
								<Icon className={cn("w-8 h-8", isSelected ? "text-primary" : "text-muted-foreground")} />
								<div className="text-center">
									<p className="font-bold">{mode.label}</p>
									<p className="text-xs text-muted-foreground font-normal">{mode.description}</p>
								</div>
							</Button>
						);
					})}
				</div>

				{/* Conditional fields */}
				{checkoutState.state.entregaModalidade === "ENTREGA" && (
					<div className="flex flex-col gap-4 p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5">
						<h3 className="font-bold text-sm uppercase tracking-wide">Endereço de Entrega</h3>
						{sale.cliente ? (
							<div className="flex flex-col gap-2">
								<p className="text-sm text-muted-foreground">Selecione um endereço cadastrado de {sale.cliente.nome} ou informe um novo.</p>

								{isLoading ? <p className="text-sm text-muted-foreground">Carregando localizações...</p> : null}

								{!isLoading && (!clientLocations || clientLocations.length === 0) ? (
									<p className="text-sm text-muted-foreground">Nenhuma localização cadastrada para este cliente.</p>
								) : null}

								{clientLocations?.map((location) => (
									<ClientLocationCard
										key={location.id}
										location={location}
										isSelected={checkoutState.state.entregaLocalizacaoId === location.id}
										onSelect={() => checkoutState.setEntregaLocalizacaoId(location.id)}
										onEdit={() => setEditingLocationId(location.id)}
									/>
								))}

								<div className="pt-1">
									<Button type="button" variant="outline" onClick={() => setIsNewLocationOpen(true)}>
										+ Adicionar Localização
									</Button>
								</div>
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								Nenhum cliente vinculado à venda. Volte e adicione um cliente para habilitar endereços de entrega.
							</p>
						)}
					</div>
				)}

				{checkoutState.state.entregaModalidade === "COMANDA" && (
					<div className="flex flex-col gap-4 p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5">
						<h3 className="font-bold text-sm uppercase tracking-wide">Número da Comanda</h3>
						<TextInput
							label="Comanda / Mesa"
							placeholder="Ex: Mesa 12, Comanda 45"
							value={checkoutState.state.comandaNumero ?? ""}
							handleChange={(value) => checkoutState.setComandaNumero(value || null)}
						/>
					</div>
				)}
			</div>

			{isNewLocationOpen && sale.cliente ? (
				<NewClientLocation
					clienteId={sale.cliente.id}
					closeModal={() => setIsNewLocationOpen(false)}
					callbacks={{
						onSettled: async () => {
							await queryClient.invalidateQueries({ queryKey });
						},
					}}
				/>
			) : null}

			{editingLocationId ? (
				<ControlClientLocation
					clientLocationId={editingLocationId}
					closeModal={() => setEditingLocationId(null)}
					callbacks={{
						onSettled: async () => {
							await queryClient.invalidateQueries({ queryKey });
						},
					}}
				/>
			) : null}
		</>
	);
}
