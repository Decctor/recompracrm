"use client";

import type { TTabOrderRequestListItem } from "@/app/api/tabs/order-requests/route";
import SelectInput from "@/components/Inputs/SelectInput";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { decideTabOrderRequest } from "@/lib/mutations/tabs";
import { useServiceSettings, useTabOrderRequests, useTabs } from "@/lib/queries/tabs";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Clock, Inbox, MapPin, TicketCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { URGENCY_META, type TRoundUrgency, tabLabel, useTickingNow } from "./board-meta";

// ============================================================================
// Inbox de solicitacoes do QR. O card e um card do board (neutro, mesma casca
// do TabCard) — quem pende nao esta atrasado. A tinta ambar/vermelha fica para
// a espera do cliente, no mesmo vocabulario de URGENCY_META das rodadas.
// ============================================================================

/** Minutos de espera do cliente ate a solicitacao pedir atencao / virar atraso. */
const REQUEST_ATTENTION_MINUTES = 3;
const REQUEST_DELAY_MINUTES = 8;

function requestWaitMinutes(from: Date | string, now: number) {
	return Math.max(0, Math.floor((now - new Date(from).getTime()) / 60_000));
}

function requestUrgency(minutes: number): TRoundUrgency {
	if (minutes >= REQUEST_DELAY_MINUTES) return "atrasado";
	if (minutes >= REQUEST_ATTENTION_MINUTES) return "atencao";
	return "no-prazo";
}

function formatWait(minutes: number) {
	return minutes < 60 ? `${minutes}min` : `${Math.floor(minutes / 60)}h${(minutes % 60).toString().padStart(2, "0")}`;
}

function RequestCard({ request, now, onDecided }: { request: TTabOrderRequestListItem; now: number; onDecided: () => void }) {
	const { data: settings } = useServiceSettings();
	const { data: openTabs } = useTabs();
	// undefined = ainda usar a sugestao derivada do codigo informado pelo cliente;
	// null = operador limpou explicitamente a selecao.
	const [selectedTabId, setSelectedTabId] = useState<string | null | undefined>(undefined);
	// Divulgacao progressiva: o seletor so aparece quando o caminho sugerido nao serve.
	const [isChoosingTab, setIsChoosingTab] = useState(false);

	const { mutate, isPending } = useMutation({
		mutationKey: ["decide-tab-order-request", request.id],
		mutationFn: decideTabOrderRequest,
		onSuccess: (data) => {
			toast.success(data.message);
			onDecided();
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
			onDecided();
		},
	});

	// O QR do ponto nao escolhe silenciosamente entre varias comandas: quando a
	// solicitacao nao tem tab e o modo nao resolve a implicita, o operador seleciona.
	const autoResolvesTab = settings?.contas.identificacao === "AUTOMATICA" && settings?.contas.maxAbertasPorPonto === 1;
	const needsTabSelection = !request.tabId && !(request.servicePointId && autoResolvesTab);
	const requestedCode = request.payloadSolicitacao.codigoTab?.trim() || null;
	const matchingCodeTab = requestedCode
		? openTabs?.find((tab) => tab.codigo?.trim().toLocaleLowerCase("pt-BR") === requestedCode.toLocaleLowerCase("pt-BR"))
		: undefined;
	const suggestedTab = matchingCodeTab?.servicePointId === request.servicePointId ? matchingCodeTab : undefined;
	const effectiveTabId = selectedTabId === undefined ? (suggestedTab?.id ?? null) : selectedTabId;
	const openTabsAtPoint = (openTabs ?? []).filter((tab) => tab.servicePointId === request.servicePointId).length;
	const pointLimit = settings?.contas.maxAbertasPorPonto ?? null;
	const pointLimitReached = pointLimit !== null && openTabsAtPoint >= pointLimit;
	const codeIsOpenElsewhere = Boolean(matchingCodeTab && matchingCodeTab.servicePointId !== request.servicePointId);
	const canOpenRequestedTab = Boolean(
		needsTabSelection &&
		requestedCode &&
		!suggestedTab &&
		settings?.contas.identificacao === "CODIGO_MANUAL" &&
		settings.aberturaPublica !== "DESABILITADA" &&
		!pointLimitReached &&
		!codeIsOpenElsewhere,
	);
	const blockReason = codeIsOpenElsewhere
		? `A comanda ${requestedCode} já está aberta em outro ponto de atendimento.`
		: requestedCode && !suggestedTab && pointLimitReached
			? "Este ponto já atingiu o limite de contas abertas."
			: null;

	// Abrir a comanda informada e o caminho feliz; o seletor so entra quando o
	// operador pede outra conta ou quando nao ha caminho sugerido.
	const opensRequestedTab = canOpenRequestedTab && !isChoosingTab;
	const showSelect = needsTabSelection && !opensRequestedTab && (isChoosingTab || !suggestedTab);

	const isError = request.status === "ERRO";
	const waitMinutes = requestWaitMinutes(request.dataInsercao, now);
	const urgency = URGENCY_META[requestUrgency(waitMinutes)];
	const etiqueta = request.tab?.codigo ? `Comanda ${request.tab.codigo}` : (request.servicePoint?.rotulo ?? "Solicitação");
	const itemCount = request.payloadSolicitacao.itens.reduce((sum, item) => sum + item.quantidade, 0);

	return (
		<article
			className={cn(
				"flex flex-col gap-3 self-start rounded-2xl border bg-card px-4 py-3.5 shadow-2xs",
				isError ? "border-destructive/40" : "border-border",
			)}
		>
			<header className="flex items-start justify-between gap-2">
				<div className="flex min-w-0 flex-col">
					<span className="flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-tight">
						<MapPin className="size-3.5 shrink-0" />
						<span className="truncate">{etiqueta}</span>
					</span>
					<span className="pl-5 text-xs font-medium text-muted-foreground">
						{isError ? "Falha ao lançar" : request.status === "PROCESSANDO" ? "Processando" : "Aguardando aprovação"}
					</span>
				</div>
				<span className={cn("flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums", urgency.text)}>
					<Clock className="size-3" />
					{formatWait(waitMinutes)}
				</span>
			</header>

			<div className="flex flex-col gap-1">
				<span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
					{itemCount} {itemCount === 1 ? "item pedido" : "itens pedidos"}
				</span>
				<div className="flex flex-col gap-0.5">
					{request.payloadSolicitacao.itens.map((item, index) => (
						<div key={`${request.id}-${index}`} className="flex items-baseline gap-1.5 text-xs">
							<span className="shrink-0 font-bold tabular-nums text-muted-foreground">{item.quantidade}×</span>
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="[overflow-wrap:anywhere]">{item.nome}</span>
								{/* O que o cliente escolheu — o operador aprova o item montado, não só o nome */}
								{item.modificadores.length > 0 ? (
									<span className="text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
										{item.modificadores.map((modifier) => `${modifier.quantidade}x ${modifier.nome ?? "adicional"}`).join(" · ")}
									</span>
								) : null}
								{item.observacoes ? <span className="text-[11px] italic text-muted-foreground [overflow-wrap:anywhere]">“{item.observacoes}”</span> : null}
							</div>
						</div>
					))}
				</div>
				{request.payloadSolicitacao.observacoes ? (
					<p className="text-[11px] italic text-muted-foreground [overflow-wrap:anywhere]">“{request.payloadSolicitacao.observacoes}”</p>
				) : null}
			</div>

			{isError && request.erroProcessamento ? (
				<p className="flex items-start gap-1.5 text-[11px] font-medium text-destructive">
					<TriangleAlert className="mt-px size-3 shrink-0" />
					<span className="[overflow-wrap:anywhere]">{request.erroProcessamento}</span>
				</p>
			) : null}

			{needsTabSelection ? (
				<div className="flex flex-col gap-2 border-t border-border/60 pt-2.5">
					<span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Conta de destino</span>

					{blockReason ? (
						<p className="flex items-start gap-1.5 text-[11px] font-semibold text-destructive">
							<TriangleAlert className="mt-px size-3 shrink-0" />
							<span>{blockReason}</span>
						</p>
					) : null}

					{suggestedTab && !isChoosingTab ? (
						<DestinationChip tone="match" label={tabLabel(suggestedTab)} detail={`comanda ${requestedCode} informada pelo cliente`} />
					) : null}

					{opensRequestedTab && requestedCode ? (
						<DestinationChip tone="new" label={`Comanda ${requestedCode}`} detail="informada pelo cliente, ainda não aberta neste ponto" />
					) : null}

					{showSelect ? (
						<>
							{requestedCode && !suggestedTab && !blockReason ? (
								<p className="text-[11px] text-muted-foreground">
									Cliente informou a comanda <span className="font-bold text-foreground">{requestedCode}</span>.
								</p>
							) : null}
							<SelectInput
								label="Conta de destino"
								showLabel={false}
								triggerProps={{ className: "h-9 rounded-xl" }}
								value={effectiveTabId}
								options={(openTabs ?? [])
									// Solicitacao de QR de ponto: somente contas DESSE ponto (o server tambem valida).
									.filter((tab) => !request.servicePointId || tab.servicePointId === request.servicePointId)
									.map((tab) => ({
										id: tab.id,
										value: tab.id,
										label: tab.servicePoint?.rotulo ? `${tab.servicePoint.rotulo}${tab.codigo ? ` · ${tab.codigo}` : ""}` : (tab.codigo ?? tab.id.slice(0, 6)),
									}))}
								resetOptionLabel="Selecione a conta"
								handleChange={(value) => setSelectedTabId(value)}
								onReset={() => setSelectedTabId(null)}
							/>
						</>
					) : null}
				</div>
			) : null}

			<div className="flex items-center gap-1.5 pt-0.5">
				<Button
					size="sm"
					className="h-9 flex-1 gap-1.5 rounded-xl font-extrabold"
					disabled={isPending || (needsTabSelection && !opensRequestedTab && !effectiveTabId)}
					onClick={() =>
						mutate({
							requestId: request.id,
							action: "APPROVE",
							destination:
								opensRequestedTab && requestedCode
									? { type: "NEW", code: requestedCode }
									: effectiveTabId
										? { type: "EXISTING", tabId: effectiveTabId }
										: null,
						})
					}
				>
					<Check className="size-3.5" />
					{opensRequestedTab && requestedCode ? `ABRIR ${requestedCode} E APROVAR` : "APROVAR"}
				</Button>
				<Button
					size="icon"
					variant="ghost"
					className="size-9 shrink-0 rounded-xl text-muted-foreground hover:text-destructive"
					aria-label="Rejeitar solicitação"
					title="Rejeitar solicitação"
					disabled={isPending}
					onClick={() => mutate({ requestId: request.id, action: "REJECT", rejectionReason: null })}
				>
					<Ban className="size-4" />
				</Button>
			</div>

			{needsTabSelection && (suggestedTab || canOpenRequestedTab) ? (
				<button
					type="button"
					className="-mt-1 w-fit text-[11px] font-semibold text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
					onClick={() => {
						setIsChoosingTab((previous) => !previous);
						if (!isChoosingTab) setSelectedTabId(null);
						else setSelectedTabId(undefined);
					}}
				>
					{isChoosingTab ? "Voltar ao destino sugerido" : "Escolher outra conta"}
				</button>
			) : null}
		</article>
	);
}

/** Destino resolvido — o dado que decide a aprovação, legível sem ler o parágrafo. */
function DestinationChip({ tone, label, detail }: { tone: "match" | "new"; label: string; detail: string }) {
	return (
		<div
			className={cn("flex items-start gap-2 rounded-xl px-2.5 py-2", tone === "match" ? "bg-primary/10 text-primary" : URGENCY_META.atencao.surface)}
		>
			<TicketCheck className="mt-px size-3.5 shrink-0" />
			<div className="flex min-w-0 flex-col leading-tight">
				<span className="truncate text-xs font-extrabold">{label}</span>
				<span className="text-[11px] font-medium opacity-80">{detail}</span>
			</div>
		</div>
	);
}

export default function OrderRequestsSection() {
	const queryClient = useQueryClient();
	const { data: requests, queryKey } = useTabOrderRequests();
	const now = useTickingNow();

	if (!requests || requests.length === 0) return null;

	function refresh() {
		queryClient.invalidateQueries({ queryKey });
		queryClient.invalidateQueries({ queryKey: ["tabs"] });
		queryClient.invalidateQueries({ queryKey: ["preparation-tickets"] });
	}

	return (
		<div className="flex flex-col gap-2">
			<h2 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
				<Inbox className="size-3.5" />
				Solicitações de pedido
				<span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-black tabular-nums leading-none text-primary-foreground">
					{requests.length}
				</span>
			</h2>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{requests.map((request) => (
					<RequestCard key={request.id} request={request} now={now} onDecided={refresh} />
				))}
			</div>
		</div>
	);
}
