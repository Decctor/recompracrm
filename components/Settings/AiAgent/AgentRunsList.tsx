import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale } from "@/lib/formatting";
import { formatUsd } from "@/lib/ai/providers/pricing";
import { type TAiAgentRunsFilters, useAiAgentRuns, useAiAgentSpend } from "@/lib/queries/ai-agents";
import { cn } from "@/lib/utils";
import type { TAiAgentRunStatusEnum, TAiAgentRunTriggerEnum } from "@/schemas/enums";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { AI_RUN_TRIGGER_LABELS } from "@/components/Chats/ai-run-meta";
import AgentRunDrawer from "./AgentRunDrawer";

const TRIGGER_FILTERS: Array<{ value: TAiAgentRunTriggerEnum | null; label: string }> = [
	{ value: null, label: "TODAS AS ORIGENS" },
	{ value: "CHAT_MENSAGEM", label: "MENSAGENS" },
	{ value: "ATRIBUICAO_HUB", label: "ENTREGUES PELO HUB" },
	{ value: "RETOMADA", label: "RETOMADAS" },
	{ value: "SUGESTAO_HUB", label: "ASSISTÊNCIA" },
	{ value: "PLAYGROUND", label: "TESTES" },
];

const STATUS_FILTERS: Array<{ value: TAiAgentRunStatusEnum | null; label: string }> = [
	{ value: null, label: "TODAS" },
	{ value: "CONCLUIDO", label: "CONCLUÍDAS" },
	{ value: "FALHA", label: "COM FALHA" },
	{ value: "CANCELADO", label: "CANCELADAS" },
];

export default function AgentRunsList() {
	const [filters, setFilters] = useState<TAiAgentRunsFilters>({ page: 1, gatilho: null, status: null });
	const [openRunId, setOpenRunId] = useState<string | null>(null);
	const { data, isLoading, isError, error } = useAiAgentRuns({ filters });
	const { data: spend } = useAiAgentSpend();

	return (
		<div className="flex w-full flex-col gap-4">
			{spend ? <AgentSpendSummary mes={spend.mes} /> : null}
			<div className="flex flex-wrap items-center gap-2">
				{TRIGGER_FILTERS.map((filter) => (
					<Button
						key={filter.label}
						size="sm"
						variant={filters.gatilho === filter.value ? "secondary" : "ghost"}
						onClick={() => setFilters((prev) => ({ ...prev, gatilho: filter.value, page: 1 }))}
					>
						{filter.label}
					</Button>
				))}
			</div>
			<div className="flex items-center gap-2">
				{STATUS_FILTERS.map((filter) => (
					<Button
						key={filter.label}
						size="sm"
						variant={filters.status === filter.value ? "secondary" : "ghost"}
						onClick={() => setFilters((prev) => ({ ...prev, status: filter.value, page: 1 }))}
					>
						{filter.label}
					</Button>
				))}
			</div>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}

			{data && data.runs.length === 0 ? (
				<div className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
					<p className="text-sm font-medium">Nenhuma execução registrada</p>
					<p className="text-xs text-muted-foreground">
						Cada resposta do agente aparece aqui com o que ele consultou, quantos tokens gastou e o que deu errado, se algo deu.
					</p>
				</div>
			) : null}

			{data && data.runs.length > 0 ? (
				<div className="flex w-full flex-col gap-2">
					{data.runs.map((run) => (
						<button
							key={run.id}
							type="button"
							onClick={() => setOpenRunId(run.id)}
							className="flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
						>
							<div className="flex min-w-0 flex-col">
								<div className="flex items-center gap-2">
									<span
										className={cn(
											"text-xs font-bold",
											run.status === "CONCLUIDO" && "text-emerald-600",
											run.status === "FALHA" && "text-destructive",
											run.status === "CANCELADO" && "text-muted-foreground",
											(run.status === "RODANDO" || run.status === "PENDENTE") && "text-amber-600",
										)}
									>
										{run.status}
									</span>
									<span className="text-xs text-muted-foreground">{AI_RUN_TRIGGER_LABELS[run.gatilho]}</span>
								</div>
								<p className="truncate text-sm">{run.erro ?? run.outputResumo ?? "—"}</p>
							</div>
							<div className="flex shrink-0 flex-col items-end">
								<span className="text-xs text-muted-foreground">{formatDateAsLocale(run.dataInsercao, true)}</span>
								<span className="text-xs text-muted-foreground">
									{run.uso?.tokensTotal ? `${run.uso.tokensTotal} tokens` : "—"}
									{typeof run.uso?.custoUsd === "number" ? ` · ${formatUsd(run.uso.custoUsd)}` : ""}
								</span>
							</div>
						</button>
					))}
				</div>
			) : null}

			{data && data.pagination.totalPages > 1 ? (
				<div className="flex items-center justify-center gap-3">
					<Button
						size="icon-sm"
						variant="ghost"
						disabled={filters.page <= 1}
						onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
						aria-label="Página anterior"
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-xs text-muted-foreground">
						{data.pagination.page} de {data.pagination.totalPages}
					</span>
					<Button
						size="icon-sm"
						variant="ghost"
						disabled={filters.page >= data.pagination.totalPages}
						onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
						aria-label="Próxima página"
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			) : null}

			{openRunId ? <AgentRunDrawer runId={openRunId} closeModal={() => setOpenRunId(null)} /> : null}
		</div>
	);
}

/**
 * Gasto do mês contra o limite. Sem limite configurado mostra só o gasto: o número existe para a
 * organização saber quanto a IA custa, com ou sem teto.
 */
function AgentSpendSummary({ mes }: { mes: NonNullable<ReturnType<typeof useAiAgentSpend>["data"]>["mes"] }) {
	const percentual = mes.percentual ?? 0;
	return (
		<div className="flex w-full flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<div className="flex items-baseline gap-2">
					<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Este mês</span>
					<span className="text-sm font-bold">{formatUsd(mes.custoUsd)}</span>
					<span className="text-xs text-muted-foreground">· {mes.runs} execuções</span>
				</div>
				<span className="text-xs text-muted-foreground">
					{mes.limiteUsd ? `limite ${formatUsd(mes.limiteUsd)} · ${percentual}%` : "sem limite configurado"} · valores estimados
				</span>
			</div>
			{mes.limiteUsd ? (
				<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
					<div
						className={cn("h-full rounded-full", percentual >= 100 ? "bg-destructive" : percentual >= 80 ? "bg-amber-500" : "bg-primary")}
						style={{ width: `${Math.min(100, percentual)}%` }}
					/>
				</div>
			) : null}
		</div>
	);
}
