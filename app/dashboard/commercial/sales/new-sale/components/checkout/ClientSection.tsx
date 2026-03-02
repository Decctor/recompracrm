import { Button } from "@/components/ui/button";
import { formatToPhone } from "@/lib/formatting";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import { HatGlasses, User, UserRound, X } from "lucide-react";

type ClientSectionProps = {
	saleState: TUseSaleState;
	onOpenVinculationMenu: () => void;
};

export default function ClientSection({ saleState, onOpenVinculationMenu }: ClientSectionProps) {
	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<UserRound className="w-4 h-4 text-primary" />
					<h3 className="font-bold text-xs tracking-wide">CLIENTE</h3>
				</div>
				<div className="flex items-center gap-1">
					<Button
						type="button"
						size="fit"
						className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
						variant={saleState.state.modoCliente === "CONSUMIDOR" ? "brand" : "ghost"}
						onClick={() => saleState.setModoCliente("CONSUMIDOR")}
					>
						<HatGlasses className="w-3 h-3" /> AO CONSUMIDOR
					</Button>
					<Button
						type="button"
						size="fit"
						className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
						variant={saleState.state.modoCliente === "VINCULADO" ? "brand" : "ghost"}
						onClick={() => {
							saleState.setModoCliente("VINCULADO");
							onOpenVinculationMenu();
						}}
					>
						<User className="w-3 h-3" /> VINCULAR
					</Button>
				</div>
			</div>

			{saleState.state.modoCliente === "VINCULADO" && saleState.state.cliente ? (
				<div className="w-full flex items-center justify-between rounded-lg bg-primary/10 px-2 py-1.5">
					<div>
						<p className="text-sm font-semibold leading-none">{saleState.state.cliente.nome}</p>
						<p className="text-xs text-muted-foreground">{formatToPhone(saleState.state.cliente.telefone)}</p>
					</div>
					<Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => saleState.clearCliente()}>
						<X className="w-3 h-3" />
					</Button>
				</div>
			) : null}
		</div>
	);
}
