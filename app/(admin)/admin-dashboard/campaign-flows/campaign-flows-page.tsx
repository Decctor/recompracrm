"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { NewCampaignAudience } from "@/components/Modals/Internal/CampaignAudiences/NewCampaignAudience";
import { ControlCampaignAudience } from "@/components/Modals/Internal/CampaignAudiences/ControlCampaignAudience";
import { NewCampaignFlow } from "@/components/Modals/Internal/CampaignFlows/NewCampaignFlow";
import { ControlCampaignFlow } from "@/components/Modals/Internal/CampaignFlows/ControlCampaignFlow";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { deleteCampaignFlow } from "@/lib/mutations/campaign-flows";
import { deleteCampaignAudience } from "@/lib/mutations/campaign-audiences";
import { useCampaignFlows } from "@/lib/queries/campaign-flows";
import { useCampaignAudiences } from "@/lib/queries/campaign-audiences";
import type { TGetCampaignFlowsOutputDefault } from "@/app/api/campaign-flows/route";
import type { TGetCampaignAudiencesOutputDefault } from "@/app/api/campaign-audiences/route";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, GitBranch, Megaphone, Pencil, Plus, Repeat, Search, Trash2, Users, Zap } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

type CampaignFlowsPageProps = {
	user: TAuthUserSession["user"];
};

export default function CampaignFlowsPage({ user }: CampaignFlowsPageProps) {
	const [activeTab, setActiveTab] = useState<string>("flows");

	return (
		<div className="w-full h-full flex flex-col gap-3">
			<Tabs value={activeTab} onValueChange={setActiveTab}>
				<TabsList className="h-fit">
					<TabsTrigger value="flows" className="flex items-center gap-1.5 px-2 py-1.5">
						<GitBranch className="w-4 h-4" />
						FLUXOS
					</TabsTrigger>
					<TabsTrigger value="audiences" className="flex items-center gap-1.5 px-2 py-1.5">
						<Users className="w-4 h-4" />
						PÚBLICOS
					</TabsTrigger>
				</TabsList>
				<TabsContent value="flows">
					<FlowsTab />
				</TabsContent>
				<TabsContent value="audiences">
					<AudiencesTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}

// ============================================================================
// FLOWS TAB
// ============================================================================

function FlowsTab() {
	const queryClient = useQueryClient();
	const [newFlowModalIsOpen, setNewFlowModalIsOpen] = useState(false);
	const [controlFlowId, setControlFlowId] = useState<string | null>(null);

	const {
		data: flowsResult,
		isLoading,
		isError,
		error,
		filters,
		updateFilters,
		queryKey,
	} = useCampaignFlows({
		initialFilters: { search: "", page: 1 },
	});

	const { mutate: handleDeleteFlow, isPending: isDeleting } = useMutation({
		mutationKey: ["delete-campaign-flow"],
		mutationFn: deleteCampaignFlow,
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey });
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-3">
				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
					<Input
						placeholder="Buscar fluxos de campanha..."
						value={filters.search ?? ""}
						onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
						className="pl-9 w-full"
					/>
				</div>
				<Button size="sm" onClick={() => setNewFlowModalIsOpen(true)}>
					<Plus className="w-4 h-4 mr-1" />
					NOVO FLUXO
				</Button>
			</div>

			{isLoading && <LoadingComponent />}
			{isError && <ErrorComponent msg={getErrorMessage(error)} />}

			{flowsResult && (
				<>
					<div className="flex flex-col gap-2">
						{flowsResult.campaignFlows.map((flow) => (
							<CampaignFlowCard
								key={flow.id}
								flow={flow}
								onEdit={() => setControlFlowId(flow.id)}
								onDelete={() => {
									if (confirm("Tem certeza que deseja excluir este fluxo?")) {
										handleDeleteFlow(flow.id);
									}
								}}
								isDeleting={isDeleting}
							/>
						))}
						{flowsResult.campaignFlows.length === 0 && (
							<p className="text-sm text-muted-foreground text-center py-8">Nenhum fluxo de campanha encontrado.</p>
						)}
					</div>
					<GeneralPaginationComponent
						activePage={filters.page ?? 1}
						selectPage={(page) => updateFilters({ page })}
						totalPages={flowsResult.totalPages}
						queryLoading={isLoading}
					/>
				</>
			)}

			{newFlowModalIsOpen && (
				<NewCampaignFlow
					closeModal={() => setNewFlowModalIsOpen(false)}
					callbacks={{
						onSettled: () => queryClient.invalidateQueries({ queryKey }),
					}}
				/>
			)}

			{controlFlowId && (
				<ControlCampaignFlow
					flowId={controlFlowId}
					closeModal={() => setControlFlowId(null)}
					callbacks={{
						onSettled: () => queryClient.invalidateQueries({ queryKey }),
					}}
				/>
			)}
		</div>
	);
}

// ============================================================================
// AUDIENCES TAB
// ============================================================================

function AudiencesTab() {
	const queryClient = useQueryClient();
	const [newAudienceModalIsOpen, setNewAudienceModalIsOpen] = useState(false);
	const [controlAudienceId, setControlAudienceId] = useState<string | null>(null);

	const {
		data: audiencesResult,
		isLoading,
		isError,
		error,
		filters,
		updateFilters,
		queryKey,
	} = useCampaignAudiences({
		initialFilters: { search: "", page: 1 },
	});

	const { mutate: handleDeleteAudience, isPending: isDeleting } = useMutation({
		mutationKey: ["delete-campaign-audience"],
		mutationFn: deleteCampaignAudience,
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey });
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-3">
				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
					<Input
						placeholder="Buscar públicos..."
						value={filters.search ?? ""}
						onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
						className="pl-9 w-full"
					/>
				</div>
				<Button size="sm" onClick={() => setNewAudienceModalIsOpen(true)}>
					<Plus className="w-4 h-4 mr-1" />
					NOVO PÚBLICO
				</Button>
			</div>

			{isLoading && <LoadingComponent />}
			{isError && <ErrorComponent msg={getErrorMessage(error)} />}

			{audiencesResult && (
				<>
					<div className="flex flex-col gap-2">
						{audiencesResult.audiences.map((audience) => (
							<CampaignAudienceCard
								key={audience.id}
								audience={audience}
								onEdit={() => setControlAudienceId(audience.id)}
								onDelete={() => {
									if (confirm("Tem certeza que deseja excluir este público?")) {
										handleDeleteAudience(audience.id);
									}
								}}
								isDeleting={isDeleting}
							/>
						))}
						{audiencesResult.audiences.length === 0 && (
							<p className="text-sm text-muted-foreground text-center py-8">Nenhum público encontrado.</p>
						)}
					</div>
					<GeneralPaginationComponent
						activePage={filters.page ?? 1}
						selectPage={(page) => updateFilters({ page })}
						totalPages={audiencesResult.totalPages}
						queryLoading={isLoading}
					/>
				</>
			)}

			{newAudienceModalIsOpen && (
				<NewCampaignAudience
					closeModal={() => setNewAudienceModalIsOpen(false)}
					callbacks={{
						onSettled: () => queryClient.invalidateQueries({ queryKey }),
					}}
				/>
			)}

			{controlAudienceId && (
				<ControlCampaignAudience
					audienceId={controlAudienceId}
					closeModal={() => setControlAudienceId(null)}
					callbacks={{
						onSettled: () => queryClient.invalidateQueries({ queryKey }),
					}}
				/>
			)}
		</div>
	);
}

// ============================================================================
// CARDS
// ============================================================================

const FLOW_STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
	RASCUNHO: { label: "Rascunho", variant: "secondary" },
	ATIVO: { label: "Ativo", variant: "default" },
	PAUSADO: { label: "Pausado", variant: "outline" },
	ARQUIVADO: { label: "Arquivado", variant: "destructive" },
};

const FLOW_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
	EVENTO: { label: "Evento", icon: <Zap className="w-3.5 h-3.5" /> },
	RECORRENTE: { label: "Recorrente", icon: <Repeat className="w-3.5 h-3.5" /> },
	UNICA: { label: "Única", icon: <CalendarClock className="w-3.5 h-3.5" /> },
};

type CampaignFlowCardProps = {
	flow: TGetCampaignFlowsOutputDefault["campaignFlows"][number];
	onEdit: () => void;
	onDelete: () => void;
	isDeleting: boolean;
};

function CampaignFlowCard({ flow, onEdit, onDelete, isDeleting }: CampaignFlowCardProps) {
	const statusConfig = FLOW_STATUS_CONFIG[flow.status] ?? { label: flow.status, variant: "secondary" as const };
	const typeConfig = FLOW_TYPE_CONFIG[flow.tipo] ?? { label: flow.tipo, icon: <Megaphone className="w-3.5 h-3.5" /> };

	return (
		<div className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
			<div className="flex flex-col gap-1 min-w-0 flex-1">
				<div className="flex items-center gap-2 flex-wrap">
					<h3 className="text-sm font-medium truncate">{flow.titulo}</h3>
					<Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
				</div>
				{flow.descricao && <p className="text-xs text-muted-foreground truncate">{flow.descricao}</p>}
				<div className="flex items-center gap-3 mt-1">
					<span className="flex items-center gap-1 text-xs text-muted-foreground">
						{typeConfig.icon}
						{typeConfig.label}
					</span>
					{flow.publico && (
						<span className="flex items-center gap-1 text-xs text-muted-foreground">
							<Users className="w-3.5 h-3.5" />
							{flow.publico.titulo}
						</span>
					)}
					{flow.autor && (
						<span className="text-xs text-muted-foreground">por {flow.autor.nome}</span>
					)}
				</div>
			</div>
			<div className="flex items-center gap-1 shrink-0">
				<Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
					<Pencil className="w-4 h-4" />
				</Button>
				<Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete} disabled={isDeleting}>
					<Trash2 className="w-4 h-4" />
				</Button>
			</div>
		</div>
	);
}

type CampaignAudienceCardProps = {
	audience: TGetCampaignAudiencesOutputDefault["audiences"][number];
	onEdit: () => void;
	onDelete: () => void;
	isDeleting: boolean;
};

function CampaignAudienceCard({ audience, onEdit, onDelete, isDeleting }: CampaignAudienceCardProps) {
	const filterCount = (audience.filtros as any)?.condicoes?.length ?? 0;
	const groupCount = (audience.filtros as any)?.grupos?.length ?? 0;

	return (
		<div className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
			<div className="flex flex-col gap-1 min-w-0 flex-1">
				<h3 className="text-sm font-medium truncate">{audience.titulo}</h3>
				{audience.descricao && <p className="text-xs text-muted-foreground truncate">{audience.descricao}</p>}
				<div className="flex items-center gap-3 mt-1">
					<span className="text-xs text-muted-foreground">
						{filterCount + groupCount} filtro(s)
					</span>
					{audience.autor && (
						<span className="text-xs text-muted-foreground">por {audience.autor.nome}</span>
					)}
				</div>
			</div>
			<div className="flex items-center gap-1 shrink-0">
				<Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
					<Pencil className="w-4 h-4" />
				</Button>
				<Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete} disabled={isDeleting}>
					<Trash2 className="w-4 h-4" />
				</Button>
			</div>
		</div>
	);
}
