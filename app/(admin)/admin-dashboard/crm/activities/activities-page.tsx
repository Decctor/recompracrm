"use client";
import ActivityCard from "@/components/CRM/ActivityCard";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { completeActivity } from "@/lib/mutations/crm";
import { useInternalLeadActivities } from "@/lib/queries/crm";
import { useQueryClient } from "@tanstack/react-query";
import { Filter } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ActivitiesPageProps = {
	user: TAuthUserSession["user"];
};

export default function ActivitiesPage({ user }: ActivitiesPageProps) {
	const queryClient = useQueryClient();
	const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
	const {
		data: activitiesData,
		isLoading,
		isError,
		error,
		queryParams,
		updateQueryParams,
	} = useInternalLeadActivities({
		initialParams: { page: 1, status: statusFilter },
	});

	const statusOptions = [
		{ label: "Todas", value: undefined },
		{ label: "Pendentes", value: "PENDENTE" },
		{ label: "Concluídas", value: "CONCLUIDA" },
		{ label: "Canceladas", value: "CANCELADA" },
	];

	return (
		<div className="w-full flex flex-col gap-3">
			<h1 className="text-lg font-semibold">Atividades</h1>

			<div className="flex items-center gap-2 flex-wrap">
				{statusOptions.map((opt) => (
					<Button
						key={opt.label}
						variant={statusFilter === opt.value ? "default" : "outline"}
						size="sm"
						onClick={() => {
							setStatusFilter(opt.value);
							updateQueryParams({ status: opt.value, page: 1 });
						}}
					>
						{opt.label}
					</Button>
				))}
			</div>

			{isLoading && <LoadingComponent />}
			{isError && <ErrorComponent msg={getErrorMessage(error)} />}

			{activitiesData && (
				<>
					<div className="flex flex-col gap-2">
						{activitiesData.activities.map((activity) => (
							<ActivityCard key={activity.id} activity={activity as any} />
						))}
						{activitiesData.activities.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhuma atividade encontrada.</p>}
					</div>
					<GeneralPaginationComponent
						activePage={queryParams.page}
						selectPage={(page) => updateQueryParams({ page })}
						totalPages={Math.ceil(activitiesData.totalCount / (queryParams.pageSize ?? 25))}
						queryLoading={isLoading}
					/>
				</>
			)}
		</div>
	);
}
