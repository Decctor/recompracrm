"use client";
import KanbanBoard from "@/components/CRM/Kanban/KanbanBoard";
import LeadCard from "@/components/CRM/LeadCard";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { useInternalLeads } from "@/lib/queries/crm";
import { Kanban, List, Plus } from "lucide-react";
import { useState } from "react";
import NewLead from "@/components/Modals/CRM/NewLead";

type CrmPageProps = {
	user: TAuthUserSession["user"];
};

export default function CrmPage({ user }: CrmPageProps) {
	const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
	const [newLeadModalIsOpen, setNewLeadModalIsOpen] = useState(false);

	return (
		<div className="w-full h-full flex flex-col gap-3">
			<div className="flex items-center justify-between gap-3">
				<h1 className="text-lg font-semibold">CRM Interno</h1>
				<div className="flex items-center gap-2">
					<Tabs value={viewMode} onValueChange={(v: string) => setViewMode(v as "kanban" | "list")}>
						<TabsList className="h-fit">
							<TabsTrigger value="kanban" className="flex items-center gap-1.5 px-2 py-1.5">
								<Kanban className="w-4 h-4" />
								Kanban
							</TabsTrigger>
							<TabsTrigger value="list" className="flex items-center gap-1.5 px-2 py-1.5">
								<List className="w-4 h-4" />
								Lista
							</TabsTrigger>
						</TabsList>
					</Tabs>
					<Button size="sm" onClick={() => setNewLeadModalIsOpen(true)}>
						<Plus className="w-4 h-4 mr-1" />
						Novo Lead
					</Button>
				</div>
			</div>

			{viewMode === "kanban" ? <KanbanView /> : <ListView />}

			{newLeadModalIsOpen && (
				<NewLead closeMenu={() => setNewLeadModalIsOpen(false)} />
			)}
		</div>
	);
}

function KanbanView() {
	return (
		<div className="flex-1 overflow-hidden">
			<KanbanBoard />
		</div>
	);
}

function ListView() {
	const {
		data: leadsResult,
		isLoading,
		isError,
		error,
		queryParams,
		updateQueryParams,
	} = useInternalLeads({
		initialParams: { search: "", page: 1 },
	});

	return (
		<div className="flex flex-col gap-3">
			<Input
				placeholder="Buscar por nome, CNPJ, e-mail..."
				value={queryParams.search ?? ""}
				onChange={(e) => updateQueryParams({ search: e.target.value, page: 1 })}
				className="max-w-sm"
			/>

			{isLoading && <LoadingComponent />}
			{isError && <ErrorComponent msg={getErrorMessage(error)} />}

			{leadsResult && (
				<>
					<div className="flex flex-col gap-2">
						{leadsResult.leads.map((lead) => (
							<LeadCard key={lead.id} lead={lead as any} />
						))}
						{leadsResult.leads.length === 0 && (
							<p className="text-sm text-muted-foreground text-center py-8">Nenhum lead encontrado.</p>
						)}
					</div>
					<GeneralPaginationComponent
						activePage={queryParams.page}
						selectPage={(page) => updateQueryParams({ page })}
						totalPages={Math.ceil(leadsResult.totalCount / (queryParams.pageSize ?? 25))}
						queryLoading={isLoading}
					/>
				</>
			)}
		</div>
	);
}
