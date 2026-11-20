"use client";

import type { TGetPoiTransactionRequestsOutput } from "@/app/api/point-of-interaction/transaction-requests/management/route";
import { ApproveTransaction } from "@/components/Modals/TransactionRequests/ApproveTransaction";
import { RejectTransaction } from "@/components/Modals/TransactionRequests/RejectTransaction";
import { PoiOperationBadge, POI_OPERATION_KINDS, type TPoiOperationKind } from "@/components/PointOfInteraction/operation-kinds";
import { Button } from "@/components/ui/button";
import { formatCashbackValue, formatDateAsLocale, formatToMoney, formatToPhone } from "@/lib/formatting";
import { usePoiTransactionRequestsRealtime } from "@/lib/hooks/use-supabase-realtime";
import { readPoiSummaryPrizes, type TPoiTransactionRequestSummary } from "@/lib/point-of-interaction/transaction-requests";
import { usePoiTransactionRequests } from "@/lib/queries/poi-transaction-requests";
import { cn } from "@/lib/utils";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { useQueryClient } from "@tanstack/react-query";
import { BadgePercent, CheckCheck, Clock3, Gift, GitPullRequestArrow, Phone, RefreshCcw, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

// Acima disso, um pedido pendente fica vermelho: o cliente está esperando no balcão.
const PENDING_WARNING_MINUTES = 5;

type PointOfInteractionTransactionRequestsQueueProps = {
	orgId: string;
	usuarioVendedorId: string | null;
	poiConfirmacaoValorObrigatoria: boolean;
};

type TQueueRequest = TGetPoiTransactionRequestsOutput["data"]["requests"][number];

type TApprovalCoupon = {
	cupomId: string;
	valorDesconto: number | null;
	titulo: string | null;
	codigo: string | null;
	validacaoModo: string | null;
	condicoesTexto: string | null;
};

type TApprovalFreeFormReward = {
	descricao: string;
	valor: number | null;
	saldoDisponivel: number | null;
	terminologia: TCashbackProgramTerminologyEnum;
};

type ApprovalTarget = {
	requestId: string;
	kind: TPoiOperationKind;
	clientDisplayName: string;
	valorBruto: number;
	valorFinal: number;
	valorResgate: number;
	requiresSaleValueConfirmation: boolean;
	coupon: TApprovalCoupon | null;
	freeFormReward: TApprovalFreeFormReward | null;
};

type RejectionTarget = {
	requestId: string;
	clientDisplayName: string;
	summary: { kind: TPoiOperationKind; title: string; details: string | null };
};

/** Relógio que avança sozinho, para o "há X min" da fila não congelar enquanto a tela fica aberta. */
function useNow(intervalMs: number) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
		return () => window.clearInterval(timer);
	}, [intervalMs]);
	return now;
}

function formatWaitingTime(minutes: number) {
	if (minutes < 1) return "agora";
	if (minutes < 60) return `há ${minutes} min`;
	const hours = Math.floor(minutes / 60);
	return `há ${hours} h`;
}

export function PointOfInteractionTransactionRequestsQueue({
	orgId,
	usuarioVendedorId,
	poiConfirmacaoValorObrigatoria,
}: PointOfInteractionTransactionRequestsQueueProps) {
	const queryClient = useQueryClient();
	const { data: requests = [], isLoading, queryKey } = usePoiTransactionRequests();
	const [approvalTarget, setApprovalTarget] = useState<ApprovalTarget | null>(null);
	const [rejectionTarget, setRejectionTarget] = useState<RejectionTarget | null>(null);
	const now = useNow(30_000);

	usePoiTransactionRequestsRealtime({
		orgId,
		queryKey,
	});

	const hasLinkedSeller = !!usuarioVendedorId;
	// Quem espera há mais tempo primeiro.
	const sortedRequests = [...requests].sort((a, b) => new Date(a.dataInsercao).getTime() - new Date(b.dataInsercao).getTime());
	const pendingCount = requests.filter((request) => request.status === "PENDENTE").length;

	return (
		<div className="bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs md:h-full md:min-h-0">
			<div className="flex flex-col">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<h1 className="text-xs font-medium tracking-tight uppercase">SOLICITAÇÕES</h1>
						{pendingCount > 0 ? (
							<span className="rounded-full bg-brand px-2 py-0.5 text-[0.65rem] font-bold text-brand-foreground">
								{pendingCount} {pendingCount === 1 ? "pendente" : "pendentes"}
							</span>
						) : null}
					</div>
					<GitPullRequestArrow className="w-4 h-4 min-w-4 min-h-4" />
				</div>
				<p className="text-[0.65rem] text-muted-foreground">
					Solicitações enviadas pelo ponto de interação. Atualiza em tempo real; as mais antigas primeiro.
				</p>
			</div>

			{isLoading ? (
				<div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
					<RefreshCcw className="h-4 w-4 animate-spin" /> Carregando solicitações...
				</div>
			) : sortedRequests.length === 0 ? (
				<p className="py-4 text-sm text-muted-foreground">Nenhuma solicitação pendente no momento.</p>
			) : (
				<div className="mt-4 flex flex-col gap-3 md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1">
					{sortedRequests.map((request) => (
						<PoiTransactionRequestCard
							key={request.id}
							request={request}
							now={now}
							onApprove={(target) =>
								setApprovalTarget({
									...target,
									requestId: request.id,
									requiresSaleValueConfirmation: poiConfirmacaoValorObrigatoria && target.kind !== "prize" && target.kind !== "free-form",
								})
							}
							onReject={(target) => setRejectionTarget({ ...target, requestId: request.id })}
						/>
					))}
				</div>
			)}

			{approvalTarget ? (
				<ApproveTransaction
					requestId={approvalTarget.requestId}
					kind={approvalTarget.kind}
					clientDisplayName={approvalTarget.clientDisplayName}
					valorBruto={approvalTarget.valorBruto}
					valorFinal={approvalTarget.valorFinal}
					valorResgate={approvalTarget.valorResgate}
					coupon={approvalTarget.coupon}
					freeFormReward={approvalTarget.freeFormReward}
					hasLinkedSeller={hasLinkedSeller}
					requiresOperatorPassword={poiConfirmacaoValorObrigatoria}
					requiresSaleValueConfirmation={approvalTarget.requiresSaleValueConfirmation}
					closeModal={() => setApprovalTarget(null)}
					callbacks={{
						onSuccess: () => {
							queryClient.invalidateQueries({ queryKey });
							queryClient.invalidateQueries({ queryKey: ["sales"] });
						},
					}}
				/>
			) : null}

			{rejectionTarget ? (
				<RejectTransaction
					requestId={rejectionTarget.requestId}
					clientDisplayName={rejectionTarget.clientDisplayName}
					summary={rejectionTarget.summary}
					closeModal={() => setRejectionTarget(null)}
					callbacks={{ onSuccess: () => queryClient.invalidateQueries({ queryKey }) }}
				/>
			) : null}
		</div>
	);
}

/** O tipo da operação pedida, pelo resumo gravado na solicitação. */
function resolveRequestKind(resumo: Partial<TPoiTransactionRequestSummary> | null): TPoiOperationKind {
	if (resumo?.recompensaAvulsa) return "free-form";
	if (resumo?.venda?.modo === "RECOMPENSA") return "prize";
	if ((resumo?.venda?.valorResgate ?? 0) > 0) return "discount";
	return "sale-only";
}

function ValuePair({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
	return (
		<span className={cn("flex items-baseline gap-1 text-xs", className)}>
			<span className="text-muted-foreground">{label}</span>
			<span className="font-semibold">{value}</span>
		</span>
	);
}

function PoiTransactionRequestCard({
	request,
	now,
	onApprove,
	onReject,
}: {
	request: TQueueRequest;
	now: number;
	onApprove: (data: Omit<ApprovalTarget, "requestId" | "requiresSaleValueConfirmation">) => void;
	onReject: (data: Omit<RejectionTarget, "requestId">) => void;
}) {
	// `resumoSolicitacao` é jsonb sem tipo no Drizzle; o formato persistido é o do builder.
	const resumo = request.resumoSolicitacao as Partial<TPoiTransactionRequestSummary> | null;
	const kind = resolveRequestKind(resumo);
	const kindMeta = POI_OPERATION_KINDS[kind];
	const clientName = request.cliente?.nome ?? resumo?.cliente?.nome ?? "Cliente não identificado";
	const clientPhone = request.cliente?.telefone ?? resumo?.cliente?.telefone ?? null;
	const requestCoupon: TApprovalCoupon | null = resumo?.cupom
		? {
				cupomId: resumo.cupom.cupomId,
				valorDesconto: resumo.cupom.valorDesconto ?? null,
				titulo: resumo.cupom.titulo ?? null,
				codigo: resumo.cupom.codigo ?? null,
				validacaoModo: resumo.cupom.validacaoModo ?? null,
				condicoesTexto: resumo.cupom.condicoesTexto ?? null,
			}
		: null;
	// Saldo e moeda do programa do cliente: o operador define o débito da recompensa avulsa contra eles.
	const clientBalance = request.cliente?.saldos?.[0] ?? null;
	const terminology = clientBalance?.programa?.terminologia ?? "DINHEIRO";
	const freeFormReward: TApprovalFreeFormReward | null = resumo?.recompensaAvulsa
		? {
				descricao: resumo.recompensaAvulsa.descricao,
				valor: resumo.recompensaAvulsa.valor ?? null,
				saldoDisponivel: clientBalance?.saldoValorDisponivel ?? null,
				terminologia: terminology,
			}
		: null;

	// Uma linha por recompensa (formato atual ou legado singular, via helper). `transacaoResgate`
	// aponta para UMA recompensa (FK única): serve só de fallback para a primeira linha quando o
	// resumo não gravou título/imagem.
	const summaryPrizes = readPoiSummaryPrizes(resumo ? { recompensas: resumo.recompensas ?? [], recompensa: resumo.recompensa } : null);
	const linkedPrize = request.transacaoResgate?.resgateRecompensa ?? null;
	const prizeRows = summaryPrizes.map((prize, index) => ({
		prizeId: prize.prizeId,
		quantity: prize.quantity,
		valueTotal: prize.prizeValue * prize.quantity,
		titulo: prize.prizeTitulo ?? (index === 0 ? (linkedPrize?.descricao ?? null) : null),
		imageUrl: prize.prizeImageUrl ?? (index === 0 ? (linkedPrize?.imagemCapaUrl ?? null) : null),
	}));
	// Solicitação antiga sem recompensas no resumo mas com a transação de resgate vinculada.
	if (prizeRows.length === 0 && linkedPrize && (linkedPrize.descricao || linkedPrize.imagemCapaUrl)) {
		prizeRows.push({
			prizeId: linkedPrize.id,
			quantity: 1,
			valueTotal: 0,
			titulo: linkedPrize.descricao ?? null,
			imageUrl: linkedPrize.imagemCapaUrl ?? null,
		});
	}
	const totalPrizeUnits = prizeRows.reduce((sum, row) => sum + row.quantity, 0);

	const valorBruto = resumo?.venda?.valorBruto ?? 0;
	const valorResgate = resumo?.venda?.valorResgate ?? 0;
	const valorFinal = resumo?.venda?.valorFinal ?? 0;
	const deliveryMode = resumo?.venda?.entregaModalidade ?? null;

	const waitingMinutes = Math.max(0, Math.floor((now - new Date(request.dataInsercao).getTime()) / 60_000));
	const isPending = request.status === "PENDENTE";
	const isLate = isPending && waitingMinutes >= PENDING_WARNING_MINUTES;

	const rejectionSummary: RejectionTarget["summary"] =
		kind === "free-form"
			? {
					kind,
					title: freeFormReward?.descricao ?? "Recompensa avulsa",
					details: freeFormReward?.valor != null ? `Débito ${formatCashbackValue(freeFormReward.valor, terminology)}` : "Débito a definir",
				}
			: kind === "prize"
				? {
						kind,
						title: prizeRows.map((row) => `${row.titulo ?? "Recompensa"} ×${row.quantity}`).join(", ") || "Recompensa",
						details: `Resgate ${formatCashbackValue(valorResgate, terminology)} · final ${formatToMoney(valorFinal)}`,
					}
				: {
						kind,
						title: `Venda de ${formatToMoney(valorBruto)}`,
						details: valorResgate > 0 ? `Desconto ${formatToMoney(valorResgate)} · final ${formatToMoney(valorFinal)}` : null,
					};

	return (
		<div className="bg-card border border-border flex w-full flex-col gap-2 rounded-xl px-3 py-4 shadow-2xs h-fit">
			<div className="w-full flex items-center justify-between flex-wrap gap-2">
				<div className="flex items-center gap-2 flex-wrap">
					<h2 className="text-xs font-bold tracking-tight lg:text-sm">{clientName}</h2>
					<span className="flex items-center gap-1 text-[0.7rem] text-muted-foreground">
						<Phone className="w-3.5 h-3.5 min-w-3.5 min-h-3.5" />
						{clientPhone ? formatToPhone(clientPhone) : "Telefone não informado"}
					</span>
					<PoiOperationBadge kind={kind} />
				</div>

				<span
					title={formatDateAsLocale(request.dataInsercao, true) ?? undefined}
					className={cn(
						"flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.7rem] font-semibold tracking-tight uppercase bg-secondary text-foreground",
						{
							"bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300": isPending && !isLate,
							"bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300": isLate || request.status === "REJEITADO",
							"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300": request.status === "APROVADO",
						},
					)}
				>
					<Clock3 className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
					{request.status}
					{isPending ? <span className="normal-case">· {formatWaitingTime(waitingMinutes)}</span> : null}
				</span>
			</div>

			{requestCoupon ? (
				<div className="flex items-center gap-2.5 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2">
					<div className="flex h-10 w-10 min-h-10 min-w-10 items-center justify-center rounded-md bg-brand/15">
						<BadgePercent className="h-5 w-5 text-foreground/80" />
					</div>
					<div className="flex flex-col gap-0.5">
						<p className="text-[0.65rem] font-semibold uppercase tracking-tight text-foreground/80">
							Cupom {requestCoupon.codigo ?? ""}
							{requestCoupon.titulo ? ` — ${requestCoupon.titulo}` : ""}
						</p>
						<p className="text-xs font-bold">
							{requestCoupon.valorDesconto ? `Desconto: ${formatToMoney(requestCoupon.valorDesconto)}` : "Desconto a informar pelo operador na aprovação"}
						</p>
						{requestCoupon.condicoesTexto ? <p className="text-[0.65rem] text-muted-foreground">Condições: {requestCoupon.condicoesTexto}</p> : null}
					</div>
				</div>
			) : null}

			{freeFormReward ? (
				<div className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", kindMeta.classes.surface)}>
					<div className={cn("flex h-10 w-10 min-h-10 min-w-10 items-center justify-center rounded-md", kindMeta.classes.iconTile)}>
						<kindMeta.icon className="h-5 w-5" />
					</div>
					<div className="flex min-w-0 flex-col gap-0.5">
						<p className={cn("text-[0.65rem] font-semibold uppercase tracking-tight", kindMeta.classes.text)}>Recompensa avulsa</p>
						<p className={cn("text-xs font-bold break-words", kindMeta.classes.title)}>{freeFormReward.descricao}</p>
						<p className="text-[0.65rem] text-muted-foreground">
							{freeFormReward.valor != null ? (
								`Débito: ${formatCashbackValue(freeFormReward.valor, terminology)}`
							) : (
								<strong className="font-semibold text-amber-700 dark:text-amber-400">Débito a definir na aprovação</strong>
							)}
							{freeFormReward.saldoDisponivel != null ? ` · Saldo: ${formatCashbackValue(freeFormReward.saldoDisponivel, terminology)}` : null}
						</p>
					</div>
				</div>
			) : null}

			{kind === "prize" && prizeRows.length > 0 ? (
				<div className={cn("flex flex-col gap-2 rounded-lg border px-3 py-2", kindMeta.classes.surface)}>
					<p className={cn("text-[0.65rem] font-semibold uppercase tracking-tight", kindMeta.classes.text)}>
						{totalPrizeUnits === 1 ? "Prêmio resgatado" : `Prêmios resgatados (${totalPrizeUnits})`}
					</p>
					{prizeRows.map((row) => (
						<div key={row.prizeId} className="flex items-center gap-2.5">
							{row.imageUrl ? (
								<img src={row.imageUrl} alt={row.titulo ?? "Prêmio"} className="h-10 w-10 min-h-10 min-w-10 rounded-md object-cover" />
							) : (
								<div className="flex h-10 w-10 min-h-10 min-w-10 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-900/30">
									<Gift className="h-5 w-5 text-violet-600 dark:text-violet-300" />
								</div>
							)}
							<p className={cn("min-w-0 flex-1 truncate text-xs font-bold", kindMeta.classes.title)}>{row.titulo ?? "Recompensa"}</p>
							{row.quantity > 1 ? (
								<span className="rounded-full bg-violet-200 px-2 py-0.5 text-[0.65rem] font-black tabular-nums text-violet-900 dark:bg-violet-800/40 dark:text-violet-100">
									×{row.quantity}
								</span>
							) : null}
						</div>
					))}
				</div>
			) : null}

			<div className="w-full flex items-center justify-between gap-2 flex-wrap">
				<div className="flex items-center gap-x-3.5 gap-y-1 flex-wrap">
					{kind === "free-form" ? (
						<span className="text-xs text-muted-foreground">Sem venda · só débito de saldo</span>
					) : (
						<>
							<ValuePair label="Bruto" value={formatToMoney(valorBruto)} />
							{valorResgate > 0 ? (
								<ValuePair
									label="Resgate"
									value={`− ${kind === "prize" ? formatCashbackValue(valorResgate, terminology) : formatToMoney(valorResgate)}`}
									className={kindMeta.classes.amount}
								/>
							) : null}
							<ValuePair label="Final" value={formatToMoney(valorFinal)} />
							{deliveryMode ? <ValuePair label="Modalidade" value={deliveryMode.toLowerCase()} className="capitalize" /> : null}
						</>
					)}
				</div>
				<div className="flex items-center gap-3">
					<Button
						variant="ghost-destructive"
						className="flex items-center gap-1.5"
						size="sm"
						onClick={() => onReject({ clientDisplayName: clientName, summary: rejectionSummary })}
					>
						<X className="w-4 min-w-4 h-4 min-h-4" />
						REJEITAR
					</Button>
					<Button
						variant="brand"
						className="flex items-center gap-1.5"
						size="sm"
						onClick={() =>
							onApprove({
								kind,
								clientDisplayName: clientName,
								valorBruto,
								valorFinal,
								valorResgate,
								coupon: requestCoupon,
								freeFormReward,
							})
						}
					>
						<CheckCheck className="w-4 min-w-4 h-4 min-h-4" />
						APROVAR
					</Button>
				</div>
			</div>
		</div>
	);
}
