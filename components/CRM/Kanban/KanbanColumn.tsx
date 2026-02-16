"use client";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { TInternalLeadEntity } from "@/services/drizzle/schema";
import KanbanCard from "./KanbanCard";
import { cn } from "@/lib/utils";
import { formatToMoney } from "@/lib/formatting";

const STAGE_LABELS: Record<string, string> = {
	NOVO: "Novo",
	CONTATO_INICIAL: "Contato Inicial",
	QUALIFICADO: "Qualificado",
	PROPOSTA: "Proposta",
	NEGOCIACAO: "Negociação",
	GANHO: "Ganho",
	PERDIDO: "Perdido",
};

const STAGE_COLORS: Record<string, string> = {
	NOVO: "bg-blue-500",
	CONTATO_INICIAL: "bg-cyan-500",
	QUALIFICADO: "bg-amber-500",
	PROPOSTA: "bg-purple-500",
	NEGOCIACAO: "bg-orange-500",
	GANHO: "bg-emerald-500",
	PERDIDO: "bg-red-500",
};

type KanbanColumnProps = {
	stage: string;
	leads: (TInternalLeadEntity & { responsavel?: { nome: string } | null })[];
};

export default function KanbanColumn({ stage, leads }: KanbanColumnProps) {
	const { setNodeRef, isOver } = useDroppable({ id: stage });
	const totalValor = leads.reduce((acc, l) => acc + (l.valor ?? 0), 0);

	return (
		<div className="flex flex-col w-72 min-w-72 shrink-0">
			<div className="flex items-center gap-2 mb-2 px-1">
				<div className={cn("w-2.5 h-2.5 rounded-full", STAGE_COLORS[stage] ?? "bg-gray-500")} />
				<h3 className="text-sm font-semibold">{STAGE_LABELS[stage] ?? stage}</h3>
				<span className="text-xs text-muted-foreground ml-auto">{leads.length}</span>
			</div>
			{totalValor > 0 && (
				<div className="text-xs text-muted-foreground px-1 mb-2">{formatToMoney(totalValor)}</div>
			)}
			<div
				ref={setNodeRef}
				className={cn(
					"flex flex-col gap-2 p-2 rounded-lg bg-muted/50 min-h-32 flex-1 transition-colors",
					isOver && "bg-muted",
				)}
			>
				<SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
					{leads.map((lead) => (
						<KanbanCard key={lead.id} lead={lead} />
					))}
				</SortableContext>
			</div>
		</div>
	);
}

export { STAGE_LABELS, STAGE_COLORS };
