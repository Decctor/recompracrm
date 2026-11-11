"use client";

import type { TGetCampaignDispatchesOutputItems } from "@/app/api/campaigns/dispatches/route";
import {
	DISPATCH_ORIGIN_LABELS,
	DISPATCH_SKIP_REASON_LABELS,
	DISPATCH_STATUS_LABELS,
	QUOTA_SKIP_REASONS,
	formatDispatchMoment,
} from "@/app/dashboard/growth/campaigns/_module/detail/helpers/dispatch-labels";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces } from "@/lib/formatting";
import { retryCampaignDispatch } from "@/lib/mutations/campaigns";
import { useCampaignDispatches } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import type { TCampaignDispatchSkipReasonEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, RefreshCw, Rocket, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DispatchInterruptionCallout } from "../../shared/dispatch-interruption-callout";
import { DispatchRecipientsPanel } from "./dispatch-recipients-panel";

/**
 * Painel de disparos da campanha: cada rodada (janela agendada, recorrência, evento) com status,
 * totais e o motivo de cada pulo. Responde "por que o cliente não recebeu?" sem arqueologia em
 * logs, e permite reexecutar um disparo parado ou reenfileirar quem falhou.
 */
export default function CampaignDispatchesSection({ campaignId }: { campaignId: string }) {
	const [page, setPage] = useState(1);
	const { data, isLoading, isError, isSuccess, error } = useCampaignDispatches({ campaignId, page });
	const items = data?.items ?? [];

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Rocket />
				</Section.Icon>
				<Section.Title>Disparos</Section.Title>
				<Section.Count>{formatDecimalPlaces(data?.dispatchesMatched ?? 0)}</Section.Count>
				<Section.Actions>
					<div className="flex items-center gap-3 text-[0.65rem] font-semibold text-muted-foreground uppercase">
						<span className="flex items-center gap-1">
							<span className="size-2 rounded-full bg-green-500" />
							Enviados
						</span>
						<span className="flex items-center gap-1">
							<span className="size-2 rounded-full bg-red-500" />
							Falhas
						</span>
						<span className="flex items-center gap-1">
							<span className="size-2 rounded-full bg-amber-500" />
							Pulados
						</span>
					</div>
				</Section.Actions>
				<p className="w-full text-[0.7rem] text-muted-foreground">Cada rodada da campanha: quem entrou, quem recebeu e por que alguém ficou de fora.</p>
			</Section.Header>
			<Section.Bleed>
				{isLoading ? <LoadingComponent /> : null}
				{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
				{isSuccess ? (
					items.length > 0 ? (
						<ul className="divide-y divide-border">
							{items.map((dispatch) => (
								<CampaignDispatchRow key={dispatch.id} dispatch={dispatch} />
							))}
						</ul>
					) : (
						<p className="flex w-full items-center justify-center py-6 text-sm text-muted-foreground">Nenhum disparo registrado para esta campanha.</p>
					)
				) : null}
				{(data?.totalPages ?? 0) > 1 ? (
					<div className="border-t border-border px-3 py-2">
						<GeneralPaginationComponent
							activePage={page}
							queryLoading={isLoading}
							selectPage={setPage}
							totalPages={data?.totalPages ?? 0}
							itemsMatchedText={data?.dispatchesMatched === 1 ? "1 disparo encontrado" : `${data?.dispatchesMatched ?? 0} disparos encontrados`}
							itemsShowingText={`mostrando ${items.length}`}
							sticky={false}
						/>
					</div>
				) : null}
			</Section.Bleed>
		</Section.Root>
	);
}

function DispatchProgressBar({ dispatch }: { dispatch: TGetCampaignDispatchesOutputItems[number] }) {
	const total = Math.max(dispatch.totalDestinatarios, dispatch.totalEnviados + dispatch.totalFalhados + dispatch.totalPulados, 1);
	const segments = [
		{ key: "sent", value: dispatch.totalEnviados, className: "bg-green-500" },
		{ key: "failed", value: dispatch.totalFalhados, className: "bg-red-500" },
		{ key: "skipped", value: dispatch.totalPulados, className: "bg-amber-500" },
	].filter((segment) => segment.value > 0);
	return (
		<div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
			{segments.map((segment) => (
				<div key={segment.key} className={cn("h-full", segment.className)} style={{ width: `${(segment.value / total) * 100}%` }} />
			))}
		</div>
	);
}

function CampaignDispatchRow({ dispatch }: { dispatch: TGetCampaignDispatchesOutputItems[number] }) {
	const queryClient = useQueryClient();
	const status = DISPATCH_STATUS_LABELS[dispatch.status];
	const { mutate: handleRetry, isPending } = useMutation({
		mutationKey: ["retry-campaign-dispatch", dispatch.id],
		mutationFn: (skipReasons: TCampaignDispatchSkipReasonEnum[] | null) => retryCampaignDispatch({ dispatchId: dispatch.id, skipReasons }),
		onSuccess: async (response) => {
			toast.success(response.message);
			await queryClient.invalidateQueries({ queryKey: ["campaign-dispatches"] });
			await queryClient.invalidateQueries({ queryKey: ["campaign-dispatch-recipients", dispatch.id] });
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	const quotaSkips = dispatch.pulosPorMotivo.filter((skip) => QUOTA_SKIP_REASONS.includes(skip.motivo)).reduce((acc, skip) => acc + skip.qtde, 0);
	const isStuck =
		(dispatch.status === "ENFILEIRADA" || dispatch.status === "ENVIANDO" || dispatch.status === "RESOLVENDO") &&
		Date.now() - new Date(dispatch.dataAtualizacao).getTime() > 30 * 60_000;
	const canRetry = dispatch.status === "FALHOU" || (dispatch.status === "CONCLUIDA" && dispatch.totalFalhados > 0) || isStuck;
	const canRetryQuotaSkips = quotaSkips > 0 && dispatch.status === "CONCLUIDA";
	const isInterrupted = dispatch.status === "INTERROMPIDA" && !!dispatch.motivoInterrupcao;
	// Evento interrompido não é retomado: a mensagem perderia o momento do gatilho.
	const canResume = isInterrupted && dispatch.origem !== "EVENTO";
	const notContacted = (dispatch.pulosPorMotivo.find((skip) => skip.motivo === "ENVIO_INTERROMPIDO")?.qtde ?? 0) + dispatch.totalFalhados;
	const timestamp = dispatch.dataConclusao
		? `concluído em ${formatDateAsLocale(dispatch.dataConclusao, true)}`
		: dispatch.dataAgendada
			? `agendado para ${formatDateAsLocale(dispatch.dataAgendada, true)}`
			: null;

	return (
		<li className="flex flex-col gap-3 px-4 py-4">
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-[14rem_minmax(0,1fr)_auto] lg:items-start">
				<div className="flex flex-col gap-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className={cn("rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold uppercase", status.className)}>{status.label}</span>
						<span className="flex items-center gap-1 text-xs font-medium">
							<Zap className="size-3.5 min-h-3.5 min-w-3.5" />
							{DISPATCH_ORIGIN_LABELS[dispatch.origem]}
						</span>
					</div>
					<span className="text-sm font-bold tabular-nums">{formatDispatchMoment(dispatch)}</span>
					{timestamp ? <span className="text-[0.65rem] text-muted-foreground italic">{timestamp}</span> : null}
				</div>
				<div className="flex min-w-0 flex-col gap-1.5">
					<DispatchProgressBar dispatch={dispatch} />
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
						<span>
							<span className="text-muted-foreground">destinatários</span> {formatDecimalPlaces(dispatch.totalDestinatarios)}
						</span>
						<span className="text-green-600 dark:text-green-500">
							<span className="text-muted-foreground">enviados</span> {formatDecimalPlaces(dispatch.totalEnviados)}
						</span>
						<span className={cn({ "text-red-500": dispatch.totalFalhados > 0 })}>
							<span className="text-muted-foreground">falhas</span> {formatDecimalPlaces(dispatch.totalFalhados)}
							{dispatch.totalFalhasPosEnvio > 0 ? (
								<span className="text-red-500" title="Falhas reportadas pela Meta depois do envio">
									{" "}
									+{formatDecimalPlaces(dispatch.totalFalhasPosEnvio)} após envio
								</span>
							) : null}
						</span>
						<span className={cn({ "text-amber-600": dispatch.totalPulados > 0 })}>
							<span className="text-muted-foreground">pulados</span> {formatDecimalPlaces(dispatch.totalPulados)}
						</span>
					</div>
					{dispatch.pulosPorMotivo.length > 0 ? (
						<div className="flex flex-wrap items-center gap-1.5">
							{dispatch.pulosPorMotivo.map((skip) => (
								<span key={skip.motivo} className="rounded-lg bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-medium text-amber-700 dark:text-amber-400">
									{formatDecimalPlaces(skip.qtde)} · {DISPATCH_SKIP_REASON_LABELS[skip.motivo]}
								</span>
							))}
						</div>
					) : null}
					{dispatch.erro && !isInterrupted ? (
						<span className="flex items-center gap-1 text-[0.7rem] font-semibold text-red-500">
							<CircleAlert className="size-3.5 min-h-3.5 min-w-3.5 shrink-0" />
							ERRO · {dispatch.erro}
						</span>
					) : null}
				</div>
				<div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-end">
					{dispatch.totalDestinatarios > 0 ? (
						<DispatchRecipientsPanel
							dispatch={dispatch}
							onRetryQuotaSkips={canRetryQuotaSkips ? () => handleRetry(QUOTA_SKIP_REASONS) : null}
							retryIsPending={isPending}
						/>
					) : null}
					{canRetry ? (
						<Button size="sm" variant="outline" disabled={isPending} className="h-7 text-[0.65rem] font-semibold" onClick={() => handleRetry(null)}>
							<RefreshCw className={cn("size-3.5", { "animate-spin": isPending })} />
							{dispatch.status === "CONCLUIDA" ? "REENVIAR FALHAS" : "REEXECUTAR"}
						</Button>
					) : null}
					{canRetryQuotaSkips ? (
						<Button
							size="sm"
							variant="outline"
							disabled={isPending}
							className="h-7 text-[0.65rem] font-semibold"
							onClick={() => handleRetry(QUOTA_SKIP_REASONS)}
						>
							<RefreshCw className={cn("size-3.5", { "animate-spin": isPending })} />
							REENVIAR PULADOS POR LIMITE
						</Button>
					) : null}
				</div>
			</div>
			{isInterrupted && dispatch.motivoInterrupcao ? (
				<DispatchInterruptionCallout
					motivo={dispatch.motivoInterrupcao}
					codigo={dispatch.interrupcao?.codigo ?? null}
					tituloMeta={dispatch.interrupcao?.titulo}
					detalhesMeta={dispatch.interrupcao?.detalhes}
					impacto={
						notContacted > 0
							? `${formatDecimalPlaces(notContacted)} ${notContacted === 1 ? "cliente ficou" : "clientes ficaram"} sem receber. Mensagens que falharam não são cobradas pela Meta.${canResume ? " Ao retomar, eles voltam para a fila." : ""}`
							: null
					}
				>
					{canResume ? (
						<Button size="sm" disabled={isPending} className="h-7 text-[0.65rem] font-semibold" onClick={() => handleRetry(null)}>
							<RefreshCw className={cn("size-3.5", { "animate-spin": isPending })} />
							RETOMAR ENVIO
						</Button>
					) : dispatch.origem === "EVENTO" ? (
						<span className="text-xs text-muted-foreground">Disparos por evento não são retomados: a mensagem perderia o momento do gatilho.</span>
					) : null}
				</DispatchInterruptionCallout>
			) : null}
		</li>
	);
}
