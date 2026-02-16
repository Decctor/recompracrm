"use client";
import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	MouseSensor,
	TouchSensor,
	closestCorners,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import type { TInternalLeadEntity, TInternalLeadStatusCRM } from "@/services/drizzle/schema";
import { useInternalLeadsKanban } from "@/lib/queries/crm";
import { moveInternalLead } from "@/lib/mutations/crm";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import KanbanColumn from "./KanbanColumn";
import KanbanCard from "./KanbanCard";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { getErrorMessage } from "@/lib/errors";
import type { TGetKanbanLeadsOutput } from "@/app/api/admin/crm/leads/kanban/route";

type LeadWithRelations = TInternalLeadEntity & { responsavel?: { nome: string } | null; autor?: { nome: string } | null };

export default function KanbanBoard() {
	const queryClient = useQueryClient();
	const { data: kanbanData, isLoading, isError, error } = useInternalLeadsKanban();
	const [activeLead, setActiveLead] = useState<LeadWithRelations | null>(null);

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
	);

	function handleDragStart(event: DragStartEvent) {
		const lead = event.active.data.current?.lead as LeadWithRelations | undefined;
		setActiveLead(lead ?? null);
	}

	async function handleDragEnd(event: DragEndEvent) {
		setActiveLead(null);
		const { active, over } = event;
		if (!over || !kanbanData) return;

		const leadId = active.id as string;
		const targetStage = over.id as string;

		// Find which column the lead was in
		let sourceStage: string | null = null;
		for (const [stage, leads] of Object.entries(kanbanData.columns)) {
			if (leads.some((l) => l.id === leadId)) {
				sourceStage = stage;
				break;
			}
		}

		if (!sourceStage || sourceStage === targetStage) return;

		// Optimistic update
		const previousData = queryClient.getQueryData<TGetKanbanLeadsOutput>(["internal-leads-kanban"]);
		queryClient.setQueryData<TGetKanbanLeadsOutput>(["internal-leads-kanban"], (old) => {
			if (!old) return old;
			const newColumns = { ...old.data.columns };
			const lead = newColumns[sourceStage as TInternalLeadStatusCRM]?.find((l) => l.id === leadId);
			if (!lead) return old;

			newColumns[sourceStage as TInternalLeadStatusCRM] = newColumns[sourceStage as TInternalLeadStatusCRM].filter(
				(l) => l.id !== leadId,
			);
			newColumns[targetStage as TInternalLeadStatusCRM] = [
				...newColumns[targetStage as TInternalLeadStatusCRM],
				{ ...lead, statusCRM: targetStage as TInternalLeadStatusCRM },
			];

			return { ...old, data: { ...old.data, columns: newColumns } };
		});

		try {
			await moveInternalLead({
				leadId,
				novoStatus: targetStage,
				novaPosicao: (kanbanData.columns[targetStage as TInternalLeadStatusCRM]?.length ?? 0),
			});
			queryClient.invalidateQueries({ queryKey: ["internal-leads-kanban"] });
		} catch {
			queryClient.setQueryData(["internal-leads-kanban"], previousData);
			toast.error("Erro ao mover lead.");
		}
	}

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!kanbanData) return null;

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCorners}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			<div className="flex gap-4 overflow-x-auto pb-4 h-full">
				{kanbanData.stages.map((stage) => (
					<KanbanColumn
						key={stage}
						stage={stage}
						leads={(kanbanData.columns[stage] ?? []) as LeadWithRelations[]}
					/>
				))}
			</div>
			<DragOverlay>
				{activeLead ? <KanbanCard lead={activeLead} /> : null}
			</DragOverlay>
		</DndContext>
	);
}
