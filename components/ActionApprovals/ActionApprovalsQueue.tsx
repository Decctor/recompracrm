"use client";

import type { TGetActionApprovalsOutput } from "@/app/api/action-approvals/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { useActionApprovalsRealtime } from "@/lib/hooks/use-supabase-realtime";
import { decideActionApproval } from "@/lib/mutations/action-approvals";
import { useActionApprovalHistory, useActionApprovals } from "@/lib/queries/action-approvals";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	BadgeDollarSign,
	BadgePercent,
	CalendarDays,
	CheckCheck,
	CircleUser,
	Clock3,
	Database,
	GitPullRequestArrow,
	RefreshCcw,
	Search,
	ShieldCheck,
	ShieldX,
	X,
} from "lucide-react";
import { BsCalendarPlus } from "react-icons/bs";
import { useState } from "react";
import { toast } from "sonner";

type TActionApprovalRequest = NonNullable<TGetActionApprovalsOutput["data"]["default"]>[number];

type ActionApprovalsQueueProps = {
	orgId: string;
	canApprove: boolean;
};

/**
 * Fila de aprovações de ações pendentes (molde de TransactionRequestsQueue). Renderiza qualquer
 * tipo de solicitação a partir do `resumo` denormalizado — sem switch por payload.
 */
export function ActionApprovalsQueue({ orgId, canApprove }: ActionApprovalsQueueProps) {
	const queryClient = useQueryClient();
	const { data: requests = [], isLoading, queryKey } = useActionApprovals({ status: "PENDENTE" });

	useActionApprovalsRealtime({ orgId, queryKey });

	const { mutate: decide, isPending: isDeciding } = useMutation({
		mutationKey: ["decide-action-approval"],
		mutationFn: decideActionApproval,
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey });
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs">
				<div className="flex flex-col">
					<div className="flex items-center justify-between">
						<h1 className="text-xs font-medium tracking-tight uppercase">APROVAÇÕES PENDENTES</h1>
						<GitPullRequestArrow className="w-4 h-4 min-w-4 min-h-4" />
					</div>
					<p className="text-[0.65rem] text-muted-foreground">
						Solicitações de ações que excedem os limites dos operadores (ex: descontos acima do teto no PDV).
					</p>
				</div>

				{isLoading ? (
					<div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
						<RefreshCcw className="h-4 w-4 animate-spin" /> Carregando solicitações...
					</div>
				) : requests.length === 0 ? (
					<p className="py-4 text-sm text-muted-foreground">Nenhuma solicitação pendente no momento.</p>
				) : (
					<div className="mt-4 flex flex-col gap-3">
						{requests.map((request) => (
							<ActionApprovalRequestCard
								key={request.id}
								request={request}
								canApprove={canApprove}
								disabled={isDeciding}
								onDecide={(decisao, motivo) => decide({ id: request.id, decisao, motivo })}
							/>
						))}
					</div>
				)}
			</div>
			<ActionApprovalHistory />
		</div>
	);
}

const HISTORY_STATUS_CONFIG = {
	APROVADA: { label: "APROVADA", icon: ShieldCheck, className: "bg-primary/10 text-primary" },
	REJEITADA: { label: "REJEITADA", icon: ShieldX, className: "bg-destructive/10 text-destructive" },
	CANCELADA: { label: "CANCELADA", icon: X, className: "bg-muted text-muted-foreground" },
	EXPIRADA: { label: "EXPIRADA", icon: Clock3, className: "bg-amber-500/10 text-amber-700" },
	CONSUMIDA: { label: "CONSUMIDA", icon: CheckCheck, className: "bg-green-500/10 text-green-700" },
} as const;

function ActionApprovalHistory() {
	const { data: requests = [], isLoading, isError, error, filters, updateFilters } = useActionApprovalHistory();

	return (
		<section className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
			<header className="flex flex-col gap-3 border-b border-border px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<div className="flex items-center gap-2">
						<Database className="h-4 w-4 text-primary" />
						<h2 className="text-sm font-bold">HISTÓRICO DE SOLICITAÇÕES</h2>
					</div>
					<p className="mt-1 text-xs text-muted-foreground">Registro de decisões, cancelamentos, expirações e consumos.</p>
				</div>
				<div className="grid w-full gap-2 sm:grid-cols-3 lg:max-w-3xl">
					<label className="relative sm:col-span-1">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							aria-label="Pesquisar histórico"
							value={filters.search}
							onChange={(event) => updateFilters({ search: event.target.value })}
							placeholder="Buscar solicitação..."
							className="pl-9"
						/>
					</label>
					<label className="relative">
						<CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							aria-label="Data inicial"
							type="date"
							className="pl-9"
							onChange={(event) => updateFilters({ periodAfter: event.target.value ? new Date(`${event.target.value}T00:00:00`) : null })}
						/>
					</label>
					<label className="relative">
						<CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							aria-label="Data final"
							type="date"
							className="pl-9"
							onChange={(event) => updateFilters({ periodBefore: event.target.value ? new Date(`${event.target.value}T23:59:59`) : null })}
						/>
					</label>
				</div>
			</header>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[760px] text-left text-xs">
					<thead className="bg-muted/50 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
						<tr>
							<th className="px-4 py-3">Solicitação</th>
							<th className="px-4 py-3">Solicitante</th>
							<th className="px-4 py-3">Status</th>
							<th className="px-4 py-3">Decisão</th>
							<th className="px-4 py-3 text-right">Valor</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{requests.map((request) => {
							const config = HISTORY_STATUS_CONFIG[request.status as keyof typeof HISTORY_STATUS_CONFIG];
							const StatusIcon = config?.icon ?? Clock3;
							return (
								<tr key={request.id} className="hover:bg-muted/30">
									<td className="px-4 py-3">
										<p className="font-semibold">{request.resumo.titulo}</p>
										<p className="max-w-md truncate text-muted-foreground">{request.resumo.descricao}</p>
									</td>
									<td className="px-4 py-3">{request.solicitante?.nome ?? request.solicitanteDispositivo?.nome ?? "Não identificado"}</td>
									<td className="px-4 py-3">
										<span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold", config?.className)}>
											<StatusIcon className="h-3.5 w-3.5" />
											{config?.label ?? request.status}
										</span>
									</td>
									<td className="px-4 py-3">
										<p>{request.decididaPor?.nome ?? "Automática"}</p>
										<p className="text-muted-foreground">{request.dataDecisao ? formatDateAsLocale(request.dataDecisao, true) : "Sem decisão manual"}</p>
									</td>
									<td className="px-4 py-3 text-right font-semibold tabular-nums">
										{request.resumo.valorPrincipal !== null ? formatToMoney(request.resumo.valorPrincipal) : "–"}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{isLoading ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Carregando histórico...</p> : null}
			{isError ? <p className="px-4 py-8 text-center text-sm text-destructive">{getErrorMessage(error)}</p> : null}
			{!isLoading && !isError && requests.length === 0 ? (
				<p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma solicitação encontrada com estes filtros.</p>
			) : null}
		</section>
	);
}

function ActionApprovalRequestCard({
	request,
	canApprove,
	disabled,
	onDecide,
}: {
	request: TActionApprovalRequest;
	canApprove: boolean;
	disabled: boolean;
	onDecide: (decisao: "APROVAR" | "REJEITAR", motivo: string | null) => void;
}) {
	const [isRejecting, setIsRejecting] = useState(false);
	const [motivo, setMotivo] = useState("");

	return (
		<div className="bg-card border border-border flex w-full flex-col gap-2 rounded-xl px-3 py-4 shadow-2xs h-fit">
			<div className="w-full flex items-center justify-between flex-col md:flex-row gap-2">
				<div className="flex items-center gap-2 flex-wrap">
					<h1 className="text-xs font-bold tracking-tight lg:text-sm">{request.resumo.titulo}</h1>
					<div className="flex items-center gap-1">
						<CircleUser className="w-4 h-4 min-w-4 min-h-4" />
						<p className="py-0.5 text-center text-[0.65rem] font-medium italic">{request.solicitante?.nome ?? request.solicitanteDispositivo?.nome ?? "Solicitante não identificado"}</p>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground">
						<BsCalendarPlus className="w-4 min-w-4 h-4 min-h-4" />
						<p className="text-xs font-medium tracking-tight uppercase">{formatDateAsLocale(request.dataInsercao, true)}</p>
					</div>
					<div className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem] bg-amber-100 text-amber-700")}>
						<p className="text-xs font-medium tracking-tight uppercase">{request.status}</p>
					</div>
				</div>
			</div>

			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<BadgePercent className="w-4 min-w-4 h-4 min-h-4" />
				<p>{request.resumo.descricao}</p>
			</div>

			<div className="w-full flex items-center justify-center lg:justify-between gap-2 flex-wrap">
				{request.resumo.valorPrincipal !== null ? (
					<div className="flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground">
						<BadgeDollarSign className="w-4 min-w-4 h-4 min-h-4" />
						<p className="text-xs font-medium tracking-tight uppercase">VALOR: {formatToMoney(request.resumo.valorPrincipal)}</p>
					</div>
				) : (
					<div />
				)}
				{canApprove ? (
					isRejecting ? (
						<div className="flex items-center gap-2 flex-wrap">
							<Input
								placeholder="Motivo da rejeição (opcional)"
								className="w-56 text-xs"
								value={motivo}
								onChange={(event) => setMotivo(event.target.value)}
							/>
							<Button disabled={disabled} variant="destructive" size="sm" onClick={() => onDecide("REJEITAR", motivo || null)}>
								CONFIRMAR REJEIÇÃO
							</Button>
							<Button disabled={disabled} variant="ghost" size="sm" onClick={() => setIsRejecting(false)}>
								VOLTAR
							</Button>
						</div>
					) : (
						<div className="flex items-center gap-3">
							<Button disabled={disabled} variant="ghost-destructive" className="flex items-center gap-1.5" size="sm" onClick={() => setIsRejecting(true)}>
								<X className="w-4 min-w-4 h-4 min-h-4" />
								REJEITAR
							</Button>
							<Button disabled={disabled} variant="brand" className="flex items-center gap-1.5" size="sm" onClick={() => onDecide("APROVAR", null)}>
								<CheckCheck className="w-4 min-w-4 h-4 min-h-4" />
								APROVAR
							</Button>
						</div>
					)
				) : (
					<p className="text-[0.65rem] text-muted-foreground">Aguardando decisão de um aprovador.</p>
				)}
			</div>
		</div>
	);
}
