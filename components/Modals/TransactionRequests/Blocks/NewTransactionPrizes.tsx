import { PoiBalanceUsageBar, POI_OPERATION_KINDS } from "@/components/PointOfInteraction/operation-kinds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatCashbackValue, formatToMoney } from "@/lib/formatting";
import { sumPoiPrizeValue, type TPoiPrizeLine } from "@/lib/point-of-interaction/prize-lines";
import { MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE } from "@/lib/sales/sale-reward-snapshot";
import { cn } from "@/lib/utils";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { CheckCircle2, Gift, Minus, Plus, Search } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export type TNewTransactionPrize = {
	id: string;
	titulo: string;
	descricao: string | null;
	imagemCapaUrl: string | null;
	valor: number;
	valorVenda: number;
	produto: { grupo: string | null } | null;
};

type NewTransactionPrizesProps = {
	prizes: TNewTransactionPrize[];
	selectedLines: TPoiPrizeLine[];
	availableCashback: number;
	terminology: TCashbackProgramTerminologyEnum;
	onAddPrize: (prize: TNewTransactionPrize) => void;
	onSetPrizeQuantity: (prizeId: string, quantity: number) => void;
};
export function NewTransactionPrizes({
	prizes,
	selectedLines,
	availableCashback,
	terminology,
	onAddPrize,
	onSetPrizeQuantity,
}: NewTransactionPrizesProps) {
	const meta = POI_OPERATION_KINDS.prize;
	const [searchQuery, setSearchQuery] = useState("");
	const usedCashback = sumPoiPrizeValue(selectedLines);
	const remainingCashback = availableCashback - usedCashback;
	const prizesFiltered = [...prizes]
		.sort((a, b) => a.valor - b.valor)
		.filter((prize) => prize.titulo.toLowerCase().includes(searchQuery.toLowerCase()));
	const selectedQuantityByPrizeId = new Map(selectedLines.map((line) => [line.prizeId, line.quantity]));
	const selectedUnits = selectedLines.reduce((sum, line) => sum + line.quantity, 0);

	return (
		<ResponsiveMenuSection title="RECOMPENSAS" icon={<Gift className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className={cn("flex flex-col gap-1.5 rounded-2xl border px-3.5 py-3", meta.classes.surface)}>
				<PoiBalanceUsageBar kind="prize" used={usedCashback} available={availableCashback} />
				<div className="flex flex-wrap justify-between gap-x-3 text-xs text-foreground/80">
					<span>
						<strong className={meta.classes.amount}>{formatCashbackValue(usedCashback, terminology)}</strong> em{" "}
						{selectedUnits === 0 ? "nenhuma recompensa" : `${selectedUnits} ${selectedUnits === 1 ? "unidade" : "unidades"}`}
					</span>
					<span>
						fica <strong>{formatCashbackValue(Math.max(remainingCashback, 0), terminology)}</strong>
					</span>
				</div>
			</div>
			<div className="relative">
				<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input placeholder="Pesquisar recompensa..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
			</div>
			{prizesFiltered.length === 0 ? (
				<p className="text-sm text-muted-foreground">Nenhuma recompensa ativa encontrada.</p>
			) : (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{prizesFiltered.map((prize) => {
						const quantity = selectedQuantityByPrizeId.get(prize.id) ?? 0;
						const isSelected = quantity > 0;
						const hasNoSaleValue = prize.valorVenda <= 0;
						// "Cabe mais uma?" é sempre contra o saldo restante, nunca contra o saldo total.
						const fitsRemainingBalance = remainingCashback >= prize.valor;
						const reachedQuantityCap = quantity >= MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE;
						const canAddOneMore = !hasNoSaleValue && fitsRemainingBalance && !reachedQuantityCap;
						const isDisabled = !isSelected && !canAddOneMore;
						const blockedReason = hasNoSaleValue
							? "Sem valor comercial configurado"
							: reachedQuantityCap
								? "Quantidade máxima atingida"
								: "Saldo restante insuficiente";
						return (
							<div
								key={prize.id}
								className={cn(
									"flex min-h-28 w-full flex-col gap-3 rounded-2xl border p-3 text-left transition",
									isSelected ? cn("bg-background", meta.classes.selected) : "border-border bg-card",
									isDisabled && "opacity-50",
								)}
							>
								<div className="flex items-center gap-3">
									<div className="relative size-16 min-w-16 overflow-hidden rounded-xl bg-secondary">
										{prize.imagemCapaUrl ? (
											<Image src={prize.imagemCapaUrl} alt={prize.titulo} fill className="object-cover" />
										) : (
											<div className="flex h-full w-full items-center justify-center">
												<Gift className="size-6 text-muted-foreground" />
											</div>
										)}
									</div>
									<div className="flex min-w-0 flex-1 flex-col gap-1">
										<p className="truncate text-sm font-bold uppercase tracking-tight">{prize.titulo}</p>
										<p className={cn("text-xs font-bold", meta.classes.amount)}>{formatCashbackValue(prize.valor, terminology)}</p>
										<p className="text-xs text-muted-foreground">Valor comercial: {formatToMoney(prize.valorVenda)}</p>
									</div>
									{isSelected ? <CheckCircle2 className={cn("size-5 min-w-5", meta.classes.amount)} /> : null}
								</div>
								<div className="flex items-center justify-between gap-2">
									{isSelected ? (
										<div className="flex items-center gap-1">
											<Button
												type="button"
												variant="outline"
												size="icon-sm"
												aria-label={`Remover uma unidade de ${prize.titulo}`}
												onClick={() => onSetPrizeQuantity(prize.id, quantity - 1)}
											>
												<Minus className="size-4" />
											</Button>
											<span className="min-w-8 text-center text-sm font-black tabular-nums">{quantity}</span>
											<Button
												type="button"
												variant="outline"
												size="icon-sm"
												disabled={!canAddOneMore}
												aria-label={`Adicionar uma unidade de ${prize.titulo}`}
												onClick={() => onAddPrize(prize)}
											>
												<Plus className="size-4" />
											</Button>
										</div>
									) : (
										<Button type="button" variant={canAddOneMore ? "default" : "outline"} size="sm" disabled={!canAddOneMore} onClick={() => onAddPrize(prize)}>
											<Plus className="size-4" />
											ADICIONAR
										</Button>
									)}
									{!canAddOneMore ? <p className="text-right text-[0.65rem] font-medium text-muted-foreground">{blockedReason}</p> : null}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</ResponsiveMenuSection>
	);
}
