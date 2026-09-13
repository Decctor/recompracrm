"use client";

import type { TGetPoiTransactionRequestsOutput } from "@/app/api/point-of-interaction/transaction-requests/management/route";
import { ApproveTransaction } from "@/components/Modals/TransactionRequests/ApproveTransaction";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { usePoiTransactionRequestsRealtime } from "@/lib/hooks/use-supabase-realtime";
import { rejectPoiTransactionRequest } from "@/lib/mutations/poi-transaction-requests";
import { usePoiTransactionRequests } from "@/lib/queries/poi-transaction-requests";
import { cn } from "@/lib/utils";
import type { TDeliveryModeEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeDollarSign, BadgePercent, CheckCheck, Gift, GitPullRequestArrow, Phone, RefreshCcw, X } from "lucide-react";
import { BsCalendarPlus } from "react-icons/bs";
import { useState } from "react";
import { toast } from "sonner";

type PointOfInteractionTransactionRequestsQueueProps = {
	orgId: string;
	usuarioVendedorId: string | null;
	poiConfirmacaoValorObrigatoria: boolean;
};

type TApprovalCoupon = {
	cupomId: string;
	valorDesconto: number | null;
	titulo: string | null;
	codigo: string | null;
	validacaoModo: string | null;
	condicoesTexto: string | null;
};

type ApprovalTarget = {
	requestId: string;
	clientDisplayName: string;
	valorBruto: number;
	valorFinal: number;
	requiresSaleValueConfirmation: boolean;
	coupon: TApprovalCoupon | null;
};

export function PointOfInteractionTransactionRequestsQueue({
	orgId,
	usuarioVendedorId,
	poiConfirmacaoValorObrigatoria,
}: PointOfInteractionTransactionRequestsQueueProps) {
	const queryClient = useQueryClient();
	const { data: requests = [], isLoading, queryKey } = usePoiTransactionRequests();
	const [approvalTarget, setApprovalTarget] = useState<ApprovalTarget | null>(null);

	usePoiTransactionRequestsRealtime({
		orgId,
		queryKey,
	});

	const { mutate: rejectRequest, isPending: isRejecting } = useMutation({
		mutationFn: (requestId: string) => rejectPoiTransactionRequest({ requestId }),
		onSuccess: () => {
			toast.success("Solicitação rejeitada.");
			queryClient.invalidateQueries({ queryKey });
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	const hasLinkedSeller = !!usuarioVendedorId;

	return (
		<div className="bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs md:h-full md:min-h-0">
			<div className="flex flex-col">
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">SOLICITAÇÕES</h1>
					<div className="flex items-center gap-2">
						<GitPullRequestArrow className="w-4 h-4 min-w-4 min-h-4" />
					</div>
				</div>
				<p className="text-[0.65rem] text-muted-foreground">Solicitacoes enviadas de transações recebidas pelo ponto de interação.</p>
			</div>

			{isLoading ? (
				<div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
					<RefreshCcw className="h-4 w-4 animate-spin" /> Carregando solicitações...
				</div>
			) : requests.length === 0 ? (
				<p className="py-4 text-sm text-muted-foreground">Nenhuma solicitação pendente no momento.</p>
			) : (
				<div className="mt-4 flex flex-col gap-3 md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1">
					{requests.map((request) => (
						<PoiTransactionRequestCard
							key={request.id}
							request={request}
							onApprove={({ valorBruto, valorFinal, isRewardMode, coupon }) =>
								setApprovalTarget({
									requestId: request.id,
									clientDisplayName: request.cliente?.nome ?? "Cliente não identificado",
									valorBruto,
									valorFinal,
									requiresSaleValueConfirmation: poiConfirmacaoValorObrigatoria && !isRewardMode,
									coupon,
								})
							}
							onReject={() => rejectRequest(request.id)}
							disabled={isRejecting}
						/>
					))}
				</div>
			)}

			{approvalTarget ? (
				<ApproveTransaction
					requestId={approvalTarget.requestId}
					clientDisplayName={approvalTarget.clientDisplayName}
					valorBruto={approvalTarget.valorBruto}
					valorFinal={approvalTarget.valorFinal}
					coupon={approvalTarget.coupon}
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
		</div>
	);
}

function PoiTransactionRequestCard({
	request,
	onApprove,
	onReject,
	disabled,
}: {
	request: TGetPoiTransactionRequestsOutput["data"]["requests"][number];
	onApprove: (data: { valorBruto: number; valorFinal: number; isRewardMode: boolean; coupon: TApprovalCoupon | null }) => void;
	onReject: () => void;
	disabled: boolean;
}) {
	const resumo = request.resumoSolicitacao as {
		cliente?: { nome?: string; telefone?: string };
		venda?: { valorBruto?: number; valorResgate?: number; valorFinal?: number; modo?: string; entregaModalidade?: TDeliveryModeEnum | null };
		recompensa?: { prizeValue?: number; prizeSaleValue?: number; prizeTitulo?: string | null; prizeImageUrl?: string | null } | null;
		cupom?: TApprovalCoupon | null;
	};
	const requestCoupon = resumo?.cupom ?? null;
	const isRewardMode = resumo?.venda?.modo === "RECOMPENSA";

	// Prize info: prefer data from approved transaction, fallback to summary
	const prizeDescricao = request.transacaoResgate?.resgateRecompensa?.descricao ?? resumo?.recompensa?.prizeTitulo ?? null;
	const prizeImageUrl = request.transacaoResgate?.resgateRecompensa?.imagemCapaUrl ?? resumo?.recompensa?.prizeImageUrl ?? null;

	return (
		<div className="bg-card border border-border flex w-full flex-col gap-1 rounded-xl px-3 py-4 shadow-2xs h-fit">
			<div className="w-full flex items-center justify-between flex-col md:flex-row gap-2">
				<div className="flex items-center gap-2 flex-wrap">
					<h1 className="text-xs font-bold tracking-tight lg:text-sm">{request.cliente?.nome ?? resumo?.cliente?.nome ?? "Cliente não identificado"}</h1>
					<div className="flex items-center gap-1">
						<Phone className="w-4 h-4 min-w-4 min-h-4" />
						<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic">
							{request.cliente?.telefone ?? resumo?.cliente?.telefone ?? "Telefone não informado"}
						</h1>
					</div>
					{isRewardMode && (
						<span className="flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-0.5 text-[0.65rem] font-bold text-brand dark:bg-brand/30 dark:text-brand">
							<Gift className="h-3 w-3 min-h-3 min-w-3" />
							RECOMPENSA
						</span>
					)}
				</div>

				<div className="flex items-center gap-3">
					<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground")}>
						<BsCalendarPlus className="w-4 min-w-4 h-4 min-h-4" />
						<p className="text-xs font-medium tracking-tight uppercase">{formatDateAsLocale(request.dataInsercao, true)}</p>
					</div>
					<div
						className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem] bg-secondary text-foreground", {
							"bg-amber-100 text-amber-700": request.status === "PENDENTE",
							"bg-green-100 text-green-700": request.status === "APROVADO",
							"bg-red-100 text-red-700": request.status === "REJEITADO",
						})}
					>
						<p className="text-xs font-medium tracking-tight uppercase">{request.status}</p>
					</div>
				</div>
			</div>

			{requestCoupon ? (
				<div className="flex items-center gap-2.5 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2">
					<div className="flex h-10 w-10 min-h-10 min-w-10 items-center justify-center rounded-md bg-brand/10">
						<BadgePercent className="h-5 w-5 text-brand" />
					</div>
					<div className="flex flex-col gap-0.5">
						<p className="text-[0.65rem] font-semibold uppercase tracking-tight text-brand">
							Cupom {requestCoupon.codigo ?? ""} — {requestCoupon.titulo ?? ""}
						</p>
						<p className="text-xs font-bold">
							{requestCoupon.valorDesconto ? `Desconto: ${formatToMoney(requestCoupon.valorDesconto)}` : "Desconto a informar pelo operador na aprovação"}
						</p>
						{requestCoupon.condicoesTexto ? <p className="text-[0.65rem] text-muted-foreground">Condições: {requestCoupon.condicoesTexto}</p> : null}
					</div>
				</div>
			) : null}

			{isRewardMode && (prizeDescricao || prizeImageUrl) && (
				<div className="flex items-center gap-2.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 dark:border-purple-800/40 dark:bg-purple-900/10">
					{prizeImageUrl && <img src={prizeImageUrl} alt={prizeDescricao ?? "Prêmio"} className="h-10 w-10 min-h-10 min-w-10 rounded-md object-cover" />}
					{!prizeImageUrl && (
						<div className="flex h-10 w-10 min-h-10 min-w-10 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900/30">
							<Gift className="h-5 w-5 text-purple-500" />
						</div>
					)}
					<div className="flex flex-col gap-0.5">
						<p className="text-[0.65rem] font-semibold uppercase tracking-tight text-purple-700 dark:text-purple-300">Prêmio resgatado</p>
						<p className="text-xs font-bold text-purple-900 dark:text-purple-100">{prizeDescricao}</p>
					</div>
				</div>
			)}

			<div className="w-full flex items-center justify-center lg:justify-between gap-2 flex-wrap">
				<div className="flex items-center gap-3 flex-wrap">
					<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground")}>
						<BadgeDollarSign className="w-4 min-w-4 h-4 min-h-4" />
						<p className="text-xs font-medium tracking-tight uppercase">MODALIDADE: {resumo?.venda?.entregaModalidade ?? "NÃO INFORMADA"}</p>
						<p className="text-xs font-medium tracking-tight uppercase">BRUTO: {formatToMoney(resumo?.venda?.valorBruto ?? 0)}</p>
					</div>
					<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground")}>
						<BadgePercent className="w-4 min-w-4 h-4 min-h-4" />
						<p className="text-xs font-medium tracking-tight uppercase">
							{isRewardMode
								? `RESGATE: ${resumo?.recompensa?.prizeValue ?? resumo?.venda?.valorResgate ?? 0} créditos`
								: `RESGATE: ${formatToMoney(resumo?.venda?.valorResgate ?? 0)}`}
						</p>
					</div>
					<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground")}>
						<BadgeDollarSign className="w-4 min-w-4 h-4 min-h-4" />
						<p className="text-xs font-medium tracking-tight uppercase">FINAL: {formatToMoney(resumo?.venda?.valorFinal ?? 0)}</p>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<Button disabled={disabled} variant="ghost-destructive" className="flex items-center gap-1.5" size="sm" onClick={onReject}>
						<X className="w-4 min-w-4 h-4 min-h-4" />
						REJEITAR
					</Button>
					<Button
						disabled={disabled}
						variant="brand"
						className="flex items-center gap-1.5"
						size="sm"
						onClick={() =>
							onApprove({
								valorBruto: resumo?.venda?.valorBruto ?? 0,
								valorFinal: resumo?.venda?.valorFinal ?? 0,
								isRewardMode,
								coupon: requestCoupon,
							})
						}
					>
						<CheckCheck className="w-4 min-w-4 h-4 min-h-4" />
						APROVAR
					</Button>
				</div>
			</div>
			{/* <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="space-y-2">
					<div className="flex flex-wrap items-center gap-2 text-xs">
						<span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-700">{request.status}</span>
						<span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-muted-foreground">
							{formatDateAsLocale(request.dataInsercao, true)}
						</span>
						{resumo?.venda?.modo ? <span className="rounded-full bg-primary/10 px-2.5 py-1 font-bold text-foreground">{resumo.venda.modo}</span> : null}
					</div>
					<div>
						<h3 className="text-sm font-black uppercase tracking-tight">{request.cliente?.nome ?? resumo?.cliente?.nome ?? "Cliente não identificado"}</h3>
						<p className="text-xs text-muted-foreground">{request.cliente?.telefone ?? resumo?.cliente?.telefone ?? "Telefone não informado"}</p>
					</div>
					<div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
						<span>
							Valor bruto: <strong className="text-foreground">{formatToMoney(resumo?.venda?.valorBruto ?? 0)}</strong>
						</span>
						<span>
							Resgate: <strong className="text-foreground">{formatToMoney(resumo?.venda?.valorResgate ?? 0)}</strong>
						</span>
						<span>
							Total final: <strong className="text-foreground">{formatToMoney(resumo?.venda?.valorFinal ?? 0)}</strong>
						</span>
					</div>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Button size="sm" className="gap-2" disabled={disabled} onClick={onApprove}>
						<ShieldCheck className="h-4 w-4" /> Aprovar
					</Button>
					<Button size="sm" variant="outline" className="gap-2" disabled={disabled} onClick={onReject}>
						<ShieldX className="h-4 w-4" /> Rejeitar
					</Button>
				</div>
			</div> */}
		</div>
	);
}
