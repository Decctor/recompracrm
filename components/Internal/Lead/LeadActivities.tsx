import type { TCreateActivityInput, TGetActivitiesOutputDefault, TUpdateActivityInput } from "@/app/api/admin/crm/activities/route";
import InternalActivityCard from "@/components/CRM/ActivityCard";
import NewActivity from "@/components/Modals/Internal/Activities/NewActivity";
import { Button } from "@/components/ui/button";

import SectionWrapper from "@/components/ui/section-wrapper";
import { useInternalLeadActivities } from "@/lib/queries/crm";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Plus } from "lucide-react";
import { useState } from "react";

type LeadActivitiesProps = {
	leadId: string;
};
export default function LeadActivities({ leadId }: LeadActivitiesProps) {
	const queryClient = useQueryClient();
	const { data: activitiesData } = useInternalLeadActivities({ initialParams: { leadId } });
	const [newActivityModalOpen, setNewActivityModalOpen] = useState(false);

	const handleCreateOnMutate = async (variables: TCreateActivityInput) => {
		await queryClient.cancelQueries({ queryKey: ["internal-lead-activities"] });
		const previousActivities = queryClient.getQueryData(["internal-lead-activities"]) as TGetActivitiesOutputDefault;
		queryClient.setQueryData(["internal-lead-activities"], {
			...previousActivities,
			activities: [...previousActivities.activities, { ...variables.activity, id: "fake-id" }],
		});
		return { previousActivities };
	};
	const handleCreateOnSettled = async () => {
		await queryClient.invalidateQueries({ queryKey: ["internal-lead-activities"] });
	};
	const handleUpdateOnMutate = async (variables: TUpdateActivityInput) => {
		await queryClient.cancelQueries({ queryKey: ["internal-lead-activities"] });
		const previousActivities = queryClient.getQueryData(["internal-lead-activities"]) as TGetActivitiesOutputDefault;
		queryClient.setQueryData(["internal-lead-activities"], {
			...previousActivities,
			activities: previousActivities.activities.map((activity) => {
				if (activity.id === variables.activityId) {
					return {
						...activity,
						...variables.activity,
					};
				}
				return activity;
			}),
		});
		return { previousActivities };
	};
	const handleUpdateOnSettled = async () => {
		await queryClient.invalidateQueries({ queryKey: ["internal-lead-activities"] });
	};
	return (
		<SectionWrapper
			title="Atividades"
			icon={<CheckSquare className="w-4 h-4" />}
			actions={
				<Button variant="ghost" size="xs" onClick={() => setNewActivityModalOpen(true)} className="flex items-center gap-1">
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					ADICIONAR
				</Button>
			}
		>
			<div className="flex flex-col gap-2">
				{activitiesData?.activities.map((activity) => (
					<InternalActivityCard key={activity.id} activity={activity} callbacks={{ onMutate: handleUpdateOnMutate, onSettled: handleUpdateOnSettled }} />
				))}
				{(!activitiesData || activitiesData.activities.length === 0) && (
					<p className="text-sm text-muted-foreground text-center py-8">Nenhuma atividade registrada.</p>
				)}
			</div>
			{newActivityModalOpen ? (
				<NewActivity
					leadId={leadId}
					closeMenu={() => setNewActivityModalOpen(false)}
					callbacks={{ onMutate: handleCreateOnMutate, onSettled: handleCreateOnSettled }}
				/>
			) : null}
		</SectionWrapper>
	);
}
