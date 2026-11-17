"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { formatDateAsLocale, formatDecimalPlaces, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TGetGoalsOutputDefaultGoal } from "@/app/api/goals/route";
import dayjs from "dayjs";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeDollarSign, ChevronDown, ChevronUp, Pencil, ShoppingCart, UserPlus } from "lucide-react";
import { useState } from "react";
import GoalPaceChip from "./GoalPaceChip";

type GoalStatusBadgeProps = {
	dataInicio: Date;
	dataFim: Date;
};
function GoalStatusBadge({ dataInicio, dataFim }: GoalStatusBadgeProps) {
	const now = dayjs();
	// Inclusivo nas duas pontas: uma meta que começa ou termina hoje ainda está ativa.
	const isActive = !dayjs(dataInicio).isAfter(now) && !dayjs(dataFim).isBefore(now);
	const isFuture = dayjs(dataInicio).isAfter(now);

	if (isActive) {
		return (
			<span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-primary">
				Ativa
			</span>
		);
	}
	if (isFuture) {
		return (
			<span className="rounded-full border border-brand/35 bg-brand/15 px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-foreground">
				Futura
			</span>
		);
	}
	return (
		<span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
			Encerrada
		</span>
	);
}

type MetricBarProps = {
	label: string;
	icon: React.ReactNode;
	valueHit: number;
	valueGoal: number;
	formattedHit: string;
	formattedGoal: string;
	barColor?: string;
};
function MetricBar({ label, icon, valueHit, valueGoal, formattedHit, formattedGoal, barColor }: MetricBarProps) {
	const percentage = valueGoal > 0 ? Math.min((valueHit / valueGoal) * 100, 100) : 0;
	const displayPercent = valueGoal > 0 ? (valueHit / valueGoal) * 100 : 0;
	const isOver = displayPercent > 100;

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					{icon}
					<span className="uppercase tracking-tight font-medium">{label}</span>
				</div>
				<div className="flex items-center gap-1.5">
					<span className={cn("text-xs font-bold tabular-nums", isOver ? "text-success" : "text-foreground")}>{formatDecimalPlaces(displayPercent)}%</span>
					<span className="text-[0.65rem] text-muted-foreground">
						{formattedHit} / {formattedGoal}
					</span>
				</div>
			</div>
			<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
				{/* scaleX em vez de width: transform é composto, width dispara layout a cada frame. */}
				<motion.div
					className="h-full w-full origin-left rounded-full"
					style={{ backgroundColor: isOver ? "var(--color-success)" : (barColor ?? "var(--color-primary)") }}
					initial={{ transform: "scaleX(0)" }}
					animate={{ transform: `scaleX(${percentage / 100})` }}
					transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
				/>
			</div>
		</div>
	);
}

type SellerRowProps = {
	vendedor: TGetGoalsOutputDefaultGoal["vendedores"][number];
	goal: TGetGoalsOutputDefaultGoal;
};
function SellerRow({ vendedor, goal }: SellerRowProps) {
	const { colors } = useOrgColors();
	return (
		<div className="flex flex-col gap-2 py-3 px-3 rounded-lg bg-muted/50 border border-border/60">
			<div className="flex items-center gap-2">
				<Avatar className="w-5 h-5 min-w-5 min-h-5">
					<AvatarImage src={vendedor.vendedor.avatarUrl ?? undefined} />
					<AvatarFallback className="text-[0.5rem]">{formatNameAsInitials(vendedor.vendedor.nome)}</AvatarFallback>
				</Avatar>
				<span className="text-xs font-semibold uppercase tracking-tight">{vendedor.vendedor.nome}</span>
			</div>
			<div className="flex flex-col gap-1.5 pl-1">
				<MetricBar
					label="Valor"
					icon={<BadgeDollarSign className="w-3 h-3" />}
					valueHit={vendedor.realizadoValor}
					valueGoal={vendedor.objetivoValor}
					formattedHit={formatToMoney(vendedor.realizadoValor)}
					formattedGoal={formatToMoney(vendedor.objetivoValor)}
					barColor={colors.primary}
				/>
				{goal.objetivoQtdeVendas && vendedor.objetivoQtdeVendas ? (
					<MetricBar
						label="Qtde Vendas"
						icon={<ShoppingCart className="w-3 h-3" />}
						valueHit={vendedor.realizadoQtdeVendas}
						valueGoal={vendedor.objetivoQtdeVendas}
						formattedHit={formatDecimalPlaces(vendedor.realizadoQtdeVendas)}
						formattedGoal={formatDecimalPlaces(vendedor.objetivoQtdeVendas)}
					/>
				) : null}
				{goal.objetivoNovosClientes && vendedor.objetivoNovosClientes ? (
					<MetricBar
						label="Novos Clientes"
						icon={<UserPlus className="w-3 h-3" />}
						valueHit={vendedor.realizadoNovosClientes}
						valueGoal={vendedor.objetivoNovosClientes}
						formattedHit={formatDecimalPlaces(vendedor.realizadoNovosClientes)}
						formattedGoal={formatDecimalPlaces(vendedor.objetivoNovosClientes)}
					/>
				) : null}
			</div>
		</div>
	);
}

type GoalEnrichedCardProps = {
	goal: TGetGoalsOutputDefaultGoal;
	/** Ausente para quem não pode editar metas: o botão some. */
	onEdit?: ((id: string) => void) | null;
};

export default function GoalEnrichedCard({ goal, onEdit }: GoalEnrichedCardProps) {
	const { colors } = useOrgColors();
	const [expanded, setExpanded] = useState(false);
	const hasVendedores = goal.vendedores.length > 0;

	return (
		<div className="bg-card border border-border rounded-xl shadow-2xs overflow-hidden">
			<div className="px-4 py-4 flex flex-col gap-3">
				{/* Header */}
				<div className="flex items-center justify-between gap-2 flex-wrap">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-xs font-bold tracking-tight uppercase">
							{formatDateAsLocale(goal.dataInicio)} → {formatDateAsLocale(goal.dataFim)}
						</h2>
						<GoalStatusBadge dataInicio={goal.dataInicio} dataFim={goal.dataFim} />
						{/* Ritmo só vem preenchido para a meta em curso: uma meta encerrada não está
						    adiantada nem atrasada, e uma futura ainda não começou. */}
						{goal.ritmo ? <GoalPaceChip situacao={goal.ritmo.situacao} diferenca={goal.ritmo.diferenca} size="sm" /> : null}
					</div>
					{onEdit ? (
						<Button variant="ghost" size="sm" className="flex items-center gap-1.5 h-7 px-2" onClick={() => onEdit(goal.id)}>
							<Pencil className="w-3 h-3" />
							EDITAR
						</Button>
					) : null}
				</div>

				{/* Metric bars */}
				<div className="flex flex-col gap-2.5">
					<MetricBar
						label="Valor vendido"
						icon={<BadgeDollarSign className="w-3 h-3" />}
						valueHit={goal.realizadoValor}
						valueGoal={goal.objetivoValor}
						formattedHit={formatToMoney(goal.realizadoValor)}
						formattedGoal={formatToMoney(goal.objetivoValor)}
						barColor={colors.primary}
					/>
					{goal.objetivoQtdeVendas ? (
						<MetricBar
							label="Qtde de vendas"
							icon={<ShoppingCart className="w-3 h-3" />}
							valueHit={goal.realizadoQtdeVendas}
							valueGoal={goal.objetivoQtdeVendas}
							formattedHit={formatDecimalPlaces(goal.realizadoQtdeVendas)}
							formattedGoal={formatDecimalPlaces(goal.objetivoQtdeVendas)}
						/>
					) : null}
					{goal.objetivoNovosClientes ? (
						<MetricBar
							label="Novos clientes"
							icon={<UserPlus className="w-3 h-3" />}
							valueHit={goal.realizadoNovosClientes}
							valueGoal={goal.objetivoNovosClientes}
							formattedHit={formatDecimalPlaces(goal.realizadoNovosClientes)}
							formattedGoal={formatDecimalPlaces(goal.objetivoNovosClientes)}
						/>
					) : null}
				</div>

				{/* Expand trigger */}
				{hasVendedores ? (
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors self-start pt-1"
					>
						{expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
						{expanded ? "Ocultar vendedores" : `Ver por vendedor (${goal.vendedores.length})`}
					</button>
				) : null}
			</div>

			{/* Expandable seller breakdown */}
			<AnimatePresence initial={false}>
				{expanded && hasVendedores ? (
					<motion.div
						key="sellers"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.25, ease: "easeInOut" }}
						className="overflow-hidden"
					>
						<div className="px-4 pb-4 flex flex-col gap-2 border-t border-border/60 pt-3">
							<p className="text-[0.65rem] text-muted-foreground uppercase font-semibold tracking-wider">Resultados por vendedor</p>
							{goal.vendedores.map((v) => (
								<SellerRow key={v.id} vendedor={v} goal={goal} />
							))}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
