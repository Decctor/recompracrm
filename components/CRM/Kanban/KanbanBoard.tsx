"use client";
import type { TGetKanbanLeadsOutput } from "@/app/api/admin/crm/leads/kanban/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { getErrorMessage } from "@/lib/errors";
import { moveInternalLead } from "@/lib/mutations/crm";
import { useInternalLeadsKanban } from "@/lib/queries/crm";
import type { TInternalLeadEntity } from "@/services/drizzle/schema";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import KanbanCard from "./KanbanCard";
import KanbanColumn from "./KanbanColumn";

type LeadWithRelations = TInternalLeadEntity & { responsavel?: { nome: string } | null; autor?: { nome: string } | null };
type KanbanData = TGetKanbanLeadsOutput["data"];
type Stage = keyof KanbanData["columns"];

type MoveLeadPayload = {
	leadId: string;
	previousStatus: Stage;
	previousPosition: number;
	newStatus: Stage;
	newPosition: number;
	// Compatibilidade com payload já usado no backend atual.
	novoStatus: Stage;
	novaPosicao: number;
};

function findLeadLocation(columns: KanbanData["columns"], leadId: string): { stage: Stage; index: number } | null {
	for (const [stage, leads] of Object.entries(columns) as [Stage, LeadWithRelations[]][]) {
		const index = leads.findIndex((lead) => lead.id === leadId);
		if (index >= 0) return { stage, index };
	}
	return null;
}

export default function KanbanBoard() {
	const queryClient = useQueryClient();
	const { data: kanbanData, queryKey, isLoading, isError, error } = useInternalLeadsKanban();
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

		const leadId = String(active.id);
		const overId = String(over.id);
		const source = findLeadLocation(kanbanData.columns, leadId);
		if (!source) return;

		let destinationStage: Stage | null = null;
		let destinationIndex = -1;

		// Drop sobre a coluna vazia ou área da coluna.
		if (Object.hasOwn(kanbanData.columns, overId)) {
			destinationStage = overId as Stage;
			destinationIndex = kanbanData.columns[destinationStage].length;
		} else {
			// Drop sobre outro card.
			const overLocation = findLeadLocation(kanbanData.columns, overId);
			if (overLocation) {
				destinationStage = overLocation.stage;
				destinationIndex = overLocation.index;
			}
		}
		if (!destinationStage || destinationIndex < 0) return;
		if (source.stage === destinationStage && source.index === destinationIndex) return;

		handleMoveLeadMutation({
			leadId,
			previousStatus: source.stage,
			previousPosition: source.index,
			newStatus: destinationStage,
			newPosition: destinationIndex,
			novoStatus: destinationStage,
			novaPosicao: destinationIndex,
		});
	}

	const { mutate: handleMoveLeadMutation } = useMutation({
		mutationKey: ["move-internal-lead"],
		mutationFn: (variables: MoveLeadPayload) => moveInternalLead(variables as never),
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey });
			const previousData = queryClient.getQueryData<KanbanData>(queryKey);
			if (!previousData) return { previousData: null };

			queryClient.setQueryData<KanbanData>(queryKey, (old) => {
				if (!old) return old;

				const sourceStage = variables.previousStatus;
				const targetStage = variables.novoStatus;
				const sourceLeads = [...(old.columns[sourceStage] as LeadWithRelations[])];
				const targetLeads = sourceStage === targetStage ? sourceLeads : [...(old.columns[targetStage] as LeadWithRelations[])];
				const leadIndex = sourceLeads.findIndex((lead) => lead.id === variables.leadId);
				if (leadIndex < 0) return old;

				const [movedLead] = sourceLeads.splice(leadIndex, 1);
				const nextLead = { ...movedLead, statusCRM: targetStage as LeadWithRelations["statusCRM"] };
				const requestedIndex = Math.max(0, variables.novaPosicao);

				if (sourceStage === targetStage) {
					const insertIndex = Math.min(
						requestedIndex > leadIndex ? requestedIndex - 1 : requestedIndex,
						sourceLeads.length,
					);
					sourceLeads.splice(insertIndex, 0, nextLead);
				} else {
					const insertIndex = Math.min(requestedIndex, targetLeads.length);
					targetLeads.splice(insertIndex, 0, nextLead);
				}

				return {
					...old,
					columns: {
						...old.columns,
						[sourceStage]: sourceLeads,
						[targetStage]: sourceStage === targetStage ? sourceLeads : targetLeads,
					},
				};
			});

			return { previousData };
		},
		onError: (error, variables, context) => {
			if (context?.previousData) queryClient.setQueryData(queryKey, context.previousData);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey });
		},
	});

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!kanbanData) return null;

	return (
		<DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
			<div className="flex gap-4 overflow-x-auto pb-4 h-full">
				{kanbanData.stages.map((stage) => (
					<KanbanColumn
						key={stage.value}
						stage={stage.value}
						leads={(kanbanData.columns[stage.value as keyof typeof kanbanData.columns] ?? []) as LeadWithRelations[]}
					/>
				))}
			</div>
			<DragOverlay>{activeLead ? <KanbanCard lead={activeLead} /> : null}</DragOverlay>
		</DndContext>
	);
}
