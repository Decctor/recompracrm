import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { cn } from "@/lib/utils";
import type { TManualStockMovementTypeEnum } from "@/schemas/enums";
import type { TStockTransactionState } from "@/state-hooks/use-internal-stock-transaction-state";
import { ArrowLeftRight, Factory, PackagePlus, RotateCcw, ShoppingBag, ShoppingCart, Trash2 } from "lucide-react";

export const MANUAL_STOCK_MOVEMENT_OPTIONS: {
	group: "ENTRADAS" | "SAÍDAS";
	types: { type: TManualStockMovementTypeEnum; label: string; description: string; icon: typeof ShoppingCart }[];
}[] = [
	{
		group: "ENTRADAS",
		types: [
			{ type: "ENTRADA_AQUISICAO", label: "COMPRA", description: "Mercadoria comprada fora do app.", icon: ShoppingCart },
			{ type: "ENTRADA_PRODUCAO", label: "PRODUÇÃO", description: "Itens produzidos fora do módulo de produção.", icon: PackagePlus },
			{ type: "ENTRADA_DEVOLUCAO", label: "DEVOLUÇÃO", description: "Mercadoria que retornou ao estoque.", icon: RotateCcw },
		],
	},
	{
		group: "SAÍDAS",
		types: [
			{ type: "SAIDA", label: "USO / CONSUMO", description: "Uso interno, consumo, brindes e outras saídas.", icon: ShoppingBag },
			{ type: "SAIDA_PRODUCAO", label: "CONSUMO EM PRODUÇÃO", description: "Insumos usados em produção feita fora do app.", icon: Factory },
			{ type: "DESCARTE", label: "DESCARTE / PERDA", description: "Vencimento, avaria ou perda. Gera lançamento de perda.", icon: Trash2 },
		],
	},
];

type StockTransactionMovementTypeBlockProps = {
	type: TStockTransactionState["type"];
	reason: TStockTransactionState["reason"];
	updateType: (type: TManualStockMovementTypeEnum) => void;
	updateReason: (reason: string) => void;
};

export default function StockTransactionMovementTypeBlock({ type, reason, updateType, updateReason }: StockTransactionMovementTypeBlockProps) {
	return (
		<ResponsiveMenuSection title="TIPO DE MOVIMENTAÇÃO" icon={<ArrowLeftRight className="h-4 w-4 min-h-4 min-w-4" />}>
			{MANUAL_STOCK_MOVEMENT_OPTIONS.map((group) => (
				<div key={group.group} className="flex w-full flex-col gap-1.5">
					<span className="text-muted-foreground text-[0.65rem] font-bold tracking-wide">{group.group}</span>
					<div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
						{group.types.map((option) => {
							const Icon = option.icon;
							const selected = option.type === type;
							return (
								<button
									key={option.type}
									type="button"
									aria-pressed={selected}
									onClick={() => updateType(option.type)}
									className={cn(
										"flex flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition-colors",
										selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/60",
									)}
								>
									<span className="flex items-center gap-1.5 text-xs font-bold tracking-tight">
										<Icon className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
										{option.label}
									</span>
									<span className="text-muted-foreground text-[0.7rem] leading-tight">{option.description}</span>
								</button>
							);
						})}
					</div>
				</div>
			))}
			<TextareaInput
				label="MOTIVO"
				placeholder="Ex.: Consumo da cozinha no dia, avaria no transporte, compra no atacado sem nota..."
				value={reason}
				handleChange={updateReason}
				required
			/>
		</ResponsiveMenuSection>
	);
}
