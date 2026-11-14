"use client";

import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/utils";
import { Package, PackageCheck, RefreshCcw, Sparkles } from "lucide-react";
import {
	formatQuantity,
	formatValidity,
	getInitials,
	getItemName,
	getItemUnit,
	getQuantityDiff,
	isWeighed,
	type TProductionById,
	type TProductionInputRow,
	type TProductionOutputRow,
	type TWeighItemKey,
	type TWeighItemKind,
} from "../helpers/production-detail";

type ItemsPanelProps = {
	production: TProductionById;
	/** Só com a produção em andamento as linhas são tocáveis e mostram a seleção. */
	selectable: boolean;
	selected: TWeighItemKey | null;
	onSelect: (key: TWeighItemKey) => void;
};

export default function ItemsPanel({ production, selectable, selected, onSelect }: ItemsPanelProps) {
	const weighedInputs = production.entradas.filter(isWeighed).length;
	const isSelected = (kind: TWeighItemKind, id: string) => selectable && selected?.kind === kind && selected.id === id;

	return (
		<Section.Root className="gap-4 p-3.5">
			<ResponsiveMenuSection
				title="ENTRADAS CONSUMIDAS"
				icon={<Package className="h-4 min-h-4 w-4 min-w-4" />}
				action={
					production.entradas.length > 0 ? (
						<span className="text-xs font-semibold text-muted-foreground">
							{weighedInputs} de {production.entradas.length} conferidos
						</span>
					) : null
				}
			>
				{production.entradas.length > 0 ? (
					production.entradas.map((input) => (
						<ItemRow
							key={input.id}
							kind="ENTRADA"
							item={input}
							sub={getInputSub(input)}
							reincorporated={input.reincorporado}
							selectable={selectable}
							selected={isSelected("ENTRADA", input.id)}
							onSelect={onSelect}
						/>
					))
				) : (
					<EmptyRows text="Nenhuma entrada nesta produção." />
				)}
			</ResponsiveMenuSection>
			<ResponsiveMenuSection title="SAÍDAS PRODUZIDAS" icon={<PackageCheck className="h-4 min-h-4 w-4 min-w-4" />}>
				{production.saidas.length > 0 ? (
					production.saidas.map((output) => (
						<ItemRow
							key={output.id}
							kind="SAIDA"
							item={output}
							sub={getOutputSub(output)}
							reincorporated={false}
							selectable={selectable}
							selected={isSelected("SAIDA", output.id)}
							onSelect={onSelect}
						/>
					))
				) : (
					<EmptyRows text="Nenhuma saída nesta produção." />
				)}
			</ResponsiveMenuSection>
		</Section.Root>
	);
}

function getInputSub(input: TProductionInputRow) {
	const planned = formatQuantity(input.quantidadePrevista, getItemUnit(input));
	if (!input.reincorporado) return `Previsto ${planned}`;
	return `Saldo reincorporado · ${input.lote?.codigoLote ?? "Sem lote específico"} · previsto ${planned}`;
}

function getOutputSub(output: TProductionOutputRow) {
	const validity = formatValidity(output);
	const planned = `Previsto ${formatQuantity(output.quantidadePrevista, getItemUnit(output))}`;
	return validity ? `${planned} · ${validity}` : planned;
}

type ItemRowProps = {
	kind: TWeighItemKind;
	item: TProductionInputRow | TProductionOutputRow;
	sub: string;
	reincorporated: boolean;
	selectable: boolean;
	selected: boolean;
	onSelect: (key: TWeighItemKey) => void;
};

function ItemRow({ kind, item, sub, reincorporated, selectable, selected, onSelect }: ItemRowProps) {
	const name = getItemName(item);
	const unit = getItemUnit(item);
	const weighed = isWeighed(item);
	const diff = getQuantityDiff(item);
	const shownQuantity = item.quantidadeReal ?? item.quantidadePrevista;

	const content = (
		<>
			<span
				className={cn(
					"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-[11px] font-semibold",
					reincorporated ? "bg-warning-surface text-warning-surface-foreground" : "bg-muted text-muted-foreground",
				)}
			>
				{reincorporated ? <RefreshCcw className="h-4 w-4" /> : getInitials(name)}
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="text-[15px] font-semibold leading-tight">{name}</span>
				<span className={cn("text-xs", reincorporated ? "text-warning-surface-foreground" : "text-muted-foreground")}>{sub}</span>
			</span>
			{diff ? (
				<span
					className={cn(
						"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
						diff.tone === "ok" ? "bg-success-surface text-success-surface-foreground" : "bg-warning-surface text-warning-surface-foreground",
					)}
				>
					{diff.label}
				</span>
			) : null}
			<span
				className={cn(
					"flex min-w-[110px] shrink-0 items-center justify-end gap-1.5 text-xl font-extrabold tracking-tight tabular-nums",
					weighed ? "text-foreground" : "text-muted-foreground",
				)}
			>
				{!weighed ? <PlannedChip /> : null}
				{formatQuantity(shownQuantity, unit)}
			</span>
		</>
	);

	const className = cn(
		"flex min-h-[68px] w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left",
		selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card",
	);

	if (!selectable) return <div className={className}>{content}</div>;
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={() => onSelect({ kind, id: item.id })}
			className={cn(className, "transition-colors", !selected && "hover:bg-muted/40")}
		>
			{content}
		</button>
	);
}

export function PlannedChip() {
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-info-surface px-2 py-0.5 text-[0.65rem] font-semibold tracking-normal text-info-surface-foreground">
			<Sparkles className="h-3 w-3" />
			Previsto
		</span>
	);
}

function EmptyRows({ text }: { text: string }) {
	return <p className="rounded-xl border border-dashed border-border px-3.5 py-4 text-sm text-muted-foreground">{text}</p>;
}
