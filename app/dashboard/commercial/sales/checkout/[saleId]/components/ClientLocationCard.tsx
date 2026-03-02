import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Edit3 } from "lucide-react";

type ClientLocationCardProps = {
	location: {
		id: string;
		titulo: string;
		localizacaoLogradouro: string | null;
		localizacaoNumero: string | null;
		localizacaoBairro: string | null;
		localizacaoCidade: string | null;
		localizacaoEstado: string | null;
		localizacaoCep: string | null;
	};
	isSelected: boolean;
	onSelect: () => void;
	onEdit: () => void;
};

function buildAddressSummary(location: ClientLocationCardProps["location"]) {
	const line1 = [location.localizacaoLogradouro, location.localizacaoNumero].filter(Boolean).join(", ");
	const line2 = [location.localizacaoBairro, location.localizacaoCidade, location.localizacaoEstado].filter(Boolean).join(" - ");
	const line3 = location.localizacaoCep ?? "";
	return [line1, line2, line3].filter((value) => value.trim().length > 0).join(" | ");
}

export function ClientLocationCard({ location, isSelected, onSelect, onEdit }: ClientLocationCardProps) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"w-full rounded-xl border p-4 text-left transition-colors",
				isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-start gap-3">
					<div
						className={cn(
							"mt-1 h-5 w-5 rounded-full border-2 transition-colors",
							isSelected ? "border-primary bg-primary" : "border-muted-foreground/40 bg-transparent",
						)}
					/>
					<div className="flex flex-col gap-1">
						<p className="text-sm font-bold">{location.titulo}</p>
						<p className="text-xs text-muted-foreground">{buildAddressSummary(location) || "Endereço sem detalhes."}</p>
					</div>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					onClick={(event) => {
						event.stopPropagation();
						onEdit();
					}}
				>
					<Edit3 className="h-4 w-4" />
				</Button>
			</div>
		</button>
	);
}
