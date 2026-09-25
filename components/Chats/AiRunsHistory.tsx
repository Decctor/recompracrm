"use client";

import AgentRunDrawer from "@/components/Settings/AiAgent/AgentRunDrawer";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatUsd } from "@/lib/ai/providers/pricing";
import { stripCatalogMemory } from "@/lib/ai/agent/run-memory";
import { useAiAgentRuns } from "@/lib/queries/ai-agents";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { AI_RUN_STATUS_META, AI_RUN_TRIGGER_LABELS } from "./ai-run-meta";

function formatRelative(date: Date | string) {
	const value = new Date(date);
	const minutes = Math.floor((Date.now() - value.getTime()) / 60_000);
	if (minutes < 1) return "agora";
	if (minutes < 60) return `há ${minutes}min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `há ${hours}h`;
	return `há ${Math.floor(hours / 24)}d`;
}

/**
 * Execuções da IA nesta conversa, em três níveis de detalhe: a linha fechada diz quantas e
 * quando foi a última; aberta, lista cada uma com status, origem, custo e a primeira linha do
 * resumo; o clique abre o mesmo drawer de Configurações, com a timeline de ferramentas.
 *
 * A contagem vem da própria consulta paginada (`pagination.total`), então o bloco fechado custa
 * a mesma query que o aberto — uma por conversa, com `staleTime` curto e invalidação pelo
 * realtime de `ai_agent_runs` na thread.
 */
export function AiRunsHistory({ chatId }: { chatId: string }) {
	const [page, setPage] = useState(1);
	const [open, setOpen] = useState(false);
	const [openRunId, setOpenRunId] = useState<string | null>(null);
	const { data } = useAiAgentRuns({ filters: { page, gatilho: null, status: null, chatId }, staleTime: 30_000 });

	if (!data || data.pagination.total === 0) return null;
	const ultima = data.runs[0];

	return (
		<Collapsible open={open} onOpenChange={setOpen} className="mt-2">
			<CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-sm text-left text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
				<Sparkles className="h-3 w-3 shrink-0 text-primary" aria-hidden />
				<span className="min-w-0 flex-1 truncate">
					<span className="font-medium text-foreground">
						{data.pagination.total} {data.pagination.total === 1 ? "execução da IA" : "execuções da IA"}
					</span>
					{ultima ? <span className="text-muted-foreground"> · última {formatRelative(ultima.dataInsercao)}</span> : null}
				</span>
				<ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-1.5 flex flex-col gap-1">
				{data.runs.map((run) => {
					const status = AI_RUN_STATUS_META[run.status];
					const resumo = run.erro ?? (run.outputResumo ? stripCatalogMemory(run.outputResumo) : null);
					return (
						<button
							key={run.id}
							type="button"
							onClick={() => setOpenRunId(run.id)}
							className="flex w-full flex-col gap-0.5 rounded-md border border-border bg-card px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-muted/50"
						>
							<span className="flex items-center gap-1.5">
								<span className={cn("font-bold", status.tone)}>{status.label}</span>
								<span className="text-muted-foreground">{AI_RUN_TRIGGER_LABELS[run.gatilho]}</span>
								<span className="ml-auto shrink-0 text-muted-foreground">
									{formatRelative(run.dataInsercao)}
									{typeof run.uso?.custoUsd === "number" ? ` · ${formatUsd(run.uso.custoUsd)}` : ""}
								</span>
							</span>
							{resumo ? <span className={cn("line-clamp-2 leading-snug", run.erro ? "text-destructive" : "text-muted-foreground")}>{resumo}</span> : null}
						</button>
					);
				})}
				{data.pagination.totalPages > 1 ? (
					<div className="flex items-center justify-center gap-2 pt-1">
						<Button
							size="icon-sm"
							variant="ghost"
							disabled={page <= 1}
							onClick={() => setPage((current) => current - 1)}
							aria-label="Execuções mais recentes"
						>
							<ChevronLeft className="h-3.5 w-3.5" />
						</Button>
						<span className="text-[11px] text-muted-foreground">
							{data.pagination.page} de {data.pagination.totalPages}
						</span>
						<Button
							size="icon-sm"
							variant="ghost"
							disabled={page >= data.pagination.totalPages}
							onClick={() => setPage((current) => current + 1)}
							aria-label="Execuções mais antigas"
						>
							<ChevronRight className="h-3.5 w-3.5" />
						</Button>
					</div>
				) : null}
			</CollapsibleContent>
			{openRunId ? <AgentRunDrawer runId={openRunId} closeModal={() => setOpenRunId(null)} /> : null}
		</Collapsible>
	);
}
