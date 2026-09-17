"use client";

import type { TGetCampaignDispatchesOutputItems } from "@/app/api/campaigns/dispatches/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces } from "@/lib/formatting";
import { retryCampaignDispatch } from "@/lib/mutations/campaigns";
import { useCampaignDispatches } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import type { TCampaignDispatchOriginEnum, TCampaignDispatchSkipReasonEnum, TCampaignDispatchStatusEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, RefreshCw, Rocket } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Painel de disparos da campanha: cada rodada (janela agendada, recorrência, evento) com status,
 * totais e o motivo de cada pulo. Responde "por que o cliente não recebeu?" sem arqueologia em
 * logs, e permite reexecutar um disparo parado ou reenfileirar quem falhou.
 */

const STATUS_LABELS: Record<TCampaignDispatchStatusEnum, { label: string; className: string }> = {
	PENDENTE: { label: "AGENDADO", className: "bg-blue-500 text-white" },
	RESOLVENDO: { label: "RESOLVENDO AUDIÊNCIA", className: "bg-blue-500 text-white" },
	ENFILEIRADA: { label: "NA FILA", className: "bg-blue-500 text-white" },
	ENVIANDO: { label: "ENVIANDO", className: "bg-amber-500 text-white" },
	CONCLUIDA: { label: "CONCLUÍDO", className: "bg-green-500 text-white" },
	FALHOU: { label: "FALHOU", className: "bg-red-500 text-white" },
	CANCELADA: { label: "CANCELADO", className: "bg-muted text-muted-foreground" },
};

const ORIGIN_LABELS: Record<TCampaignDispatchOriginEnum, string> = {
	AGENDADA: "Agendado",
	RECORRENTE: "Recorrência",
	EVENTO: "Evento",
};

const SKIP_REASON_LABELS: Record<TCampaignDispatchSkipReasonEnum, string> = {
	QUOTA_ORG_DIARIO: "limite diário da organização",
	QUOTA_ORG_SEMANAL: "limite semanal da organização",
	QUOTA_CAMPANHA_DIARIO: "limite diário da campanha",
	QUOTA_CAMPANHA_SEMANAL: "limite semanal da campanha",
	SEM_CONTATO: "sem telefone nem e-mail",
	COMUNICACAO_PAUSADA: "comunicação pausada",
	FREQUENCIA: "já recebeu no intervalo",
	CAMPANHA_INATIVA: "campanha pausada",
};

const RETRYABLE_SKIP_REASONS: TCampaignDispatchSkipReasonEnum[] = [
	"QUOTA_ORG_DIARIO",
	"QUOTA_ORG_SEMANAL",
	"QUOTA_CAMPANHA_DIARIO",
	"QUOTA_CAMPANHA_SEMANAL",
];

export default function CampaignDispatchesSection({ campaignId }: { campaignId: string }) {
	const [page, setPage] = useState(1);
	const { data, isLoading, isError, isSuccess, error } = useCampaignDispatches({ campaignId, page });
	const items = data?.items ?? [];

	return (
		<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex items-center justify-between">
				<div className="flex flex-col">
					<h1 className="text-xs font-medium tracking-tight uppercase">DISPAROS</h1>
					<p className="text-xs text-muted-foreground">Cada rodada da campanha: quem entrou, quem recebeu e por que alguém ficou de fora.</p>
				</div>
				<Rocket className="w-4 h-4 min-w-4 min-h-4" />
			</div>
			<GeneralPaginationComponent
				activePage={page}
				queryLoading={isLoading}
				selectPage={setPage}
				totalPages={data?.totalPages ?? 0}
				itemsMatchedText={`${data?.dispatchesMatched ?? 0} ${data?.dispatchesMatched === 1 ? "disparo encontrado." : "disparos encontrados."}`}
				itemsShowingText={`${items.length} ${items.length === 1 ? "disparo exibido." : "disparos exibidos."}`}
			/>
			<div className="flex w-full flex-col gap-1.5">
				{isLoading ? <LoadingComponent /> : null}
				{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
				{isSuccess ? (
					items.length > 0 ? (
						items.map((dispatch) => <CampaignDispatchCard key={dispatch.id} dispatch={dispatch} />)
					) : (
						<p className="w-full flex items-center justify-center text-sm text-muted-foreground py-4">Nenhum disparo registrado para esta campanha.</p>
					)
				) : null}
			</div>
		</div>
	);
}

function CampaignDispatchCard({ dispatch }: { dispatch: TGetCampaignDispatchesOutputItems[number] }) {
	const queryClient = useQueryClient();
	const status = STATUS_LABELS[dispatch.status];
	const { mutate: handleRetry, isPending } = useMutation({
		mutationKey: ["retry-campaign-dispatch", dispatch.id],
		mutationFn: (skipReasons: TCampaignDispatchSkipReasonEnum[] | null) => retryCampaignDispatch({ dispatchId: dispatch.id, skipReasons }),
		onSuccess: async (response) => {
			toast.success(response.message);
			await queryClient.invalidateQueries({ queryKey: ["campaign-dispatches"] });
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	const hasQuotaSkips = dispatch.pulosPorMotivo.some((skip) => RETRYABLE_SKIP_REASONS.includes(skip.motivo));
	const isStuck =
		(dispatch.status === "ENFILEIRADA" || dispatch.status === "ENVIANDO" || dispatch.status === "RESOLVENDO") &&
		Date.now() - new Date(dispatch.dataAtualizacao).getTime() > 30 * 60_000;
	const canRetry = dispatch.status === "FALHOU" || dispatch.status === "CONCLUIDA" || isStuck;

	return (
		<div className="bg-background border-border flex w-full flex-col gap-2 rounded-xl border px-3 py-3">
			<div className="flex w-full flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<span className={cn("rounded-md px-1.5 py-1 text-[0.65rem] font-bold uppercase", status.className)}>{status.label}</span>
					<span className="text-xs font-medium tracking-tight">{ORIGIN_LABELS[dispatch.origem]}</span>
					<span className="text-xs text-muted-foreground tabular-nums">{dispatch.janelaReferencia}</span>
				</div>
				<div className="flex items-center gap-2">
					{dispatch.erro ? (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger
									render={
										<span className="flex items-center gap-1 text-[0.65rem] font-bold text-red-500">
											<CircleAlert className="w-4 h-4 min-w-4 min-h-4" />
											ERRO
										</span>
									}
								/>
								<TooltipContent>
									<p className="text-xs font-medium tracking-tight text-red-500">{dispatch.erro}</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					) : null}
					{canRetry ? (
						<Button size="sm" variant="outline" disabled={isPending} className="h-7 text-[0.65rem] font-semibold" onClick={() => handleRetry(null)}>
							<RefreshCw className={cn("w-3.5 h-3.5", { "animate-spin": isPending })} />
							{dispatch.status === "CONCLUIDA" ? "REENVIAR FALHAS" : "REEXECUTAR"}
						</Button>
					) : null}
					{hasQuotaSkips && dispatch.status === "CONCLUIDA" ? (
						<Button
							size="sm"
							variant="outline"
							disabled={isPending}
							className="h-7 text-[0.65rem] font-semibold"
							onClick={() => handleRetry(RETRYABLE_SKIP_REASONS)}
						>
							<RefreshCw className={cn("w-3.5 h-3.5", { "animate-spin": isPending })} />
							REENVIAR PULADOS POR LIMITE
						</Button>
					) : null}
				</div>
			</div>
			<div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
				<span>
					<span className="text-muted-foreground">destinatários</span> {formatDecimalPlaces(dispatch.totalDestinatarios)}
				</span>
				<span className="text-green-600 dark:text-green-500">
					<span className="text-muted-foreground">enviados</span> {formatDecimalPlaces(dispatch.totalEnviados)}
				</span>
				<span className={cn({ "text-red-500": dispatch.totalFalhados > 0 })}>
					<span className="text-muted-foreground">falhas</span> {formatDecimalPlaces(dispatch.totalFalhados)}
				</span>
				<span className={cn({ "text-amber-600": dispatch.totalPulados > 0 })}>
					<span className="text-muted-foreground">pulados</span> {formatDecimalPlaces(dispatch.totalPulados)}
				</span>
			</div>
			{dispatch.pulosPorMotivo.length > 0 ? (
				<div className="flex w-full flex-wrap items-center gap-1.5">
					{dispatch.pulosPorMotivo.map((skip) => (
						<span key={skip.motivo} className="rounded-lg bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-medium text-amber-700 dark:text-amber-400">
							{formatDecimalPlaces(skip.qtde)} · {SKIP_REASON_LABELS[skip.motivo]}
						</span>
					))}
				</div>
			) : null}
			<div className="flex w-full flex-wrap items-center justify-between gap-2 text-[0.65rem] text-muted-foreground italic">
				<span>criado em {formatDateAsLocale(dispatch.dataInsercao, true)}</span>
				{dispatch.dataAgendada && !dispatch.dataConclusao ? <span>agendado para {formatDateAsLocale(dispatch.dataAgendada, true)}</span> : null}
				{dispatch.dataConclusao ? <span>concluído em {formatDateAsLocale(dispatch.dataConclusao, true)}</span> : null}
			</div>
		</div>
	);
}
