"use client";

import type { TGetSalesSessionsOutputDefault } from "@/app/api/pos/sales-sessions/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import CloseSalesSession from "@/components/Modals/Internal/SalesSessions/CloseSalesSession";
import OpenSalesSession from "@/components/Modals/Internal/SalesSessions/OpenSalesSession";
import RegisterMovement from "@/components/Modals/Internal/SalesSessions/RegisterMovement";
import SalesSessionDetail from "@/components/Modals/Internal/SalesSessions/SalesSessionDetail";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { useSalesSessions } from "@/lib/queries/sales-sessions";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { ArrowRightLeft, ChevronLeft, ChevronRight, LockKeyhole, Wallet } from "lucide-react";
import { useState } from "react";

type SalesSessionRow = TGetSalesSessionsOutputDefault["sessions"][number];
type StatusFilter = "TODAS" | "ABERTA" | "FECHADA" | "CONFERIDA" | "CANCELADA";

type CashSessionsPageProps = {
	sessionsConfig: { requireOpeningFloat: boolean; blindCount: boolean };
	canReviewSessions: boolean;
};

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
	{ value: "TODAS", label: "Todas" },
	{ value: "ABERTA", label: "Abertas" },
	{ value: "FECHADA", label: "Fechadas" },
	{ value: "CONFERIDA", label: "Conferidas" },
	{ value: "CANCELADA", label: "Canceladas" },
];

function StatusBadge({ status }: { status: SalesSessionRow["status"] }) {
	const styles: Record<string, string> = {
		ABERTA: "bg-green-500/12 text-green-700",
		FECHADA: "bg-primary/10 text-primary",
		CONFERIDA: "bg-green-600/15 text-green-700",
		CANCELADA: "bg-muted text-muted-foreground",
	};
	return <span className={cn("rounded-full px-2.5 py-0.5 font-bold text-[11px]", styles[status] ?? "bg-muted text-muted-foreground")}>{status}</span>;
}

type ActiveModal = { type: "open" } | { type: "movement" | "close" | "detail"; sessionId: string } | null;

export default function CashSessionsPage({ sessionsConfig, canReviewSessions }: CashSessionsPageProps) {
	const [modal, setModal] = useState<ActiveModal>(null);

	const openSessions = useSalesSessions({ initialParams: { status: "ABERTA" } });
	const history = useSalesSessions();
	const statusFilter: StatusFilter = history.params.status ?? "TODAS";

	function applyStatus(value: StatusFilter) {
		history.updateParams({ status: value === "TODAS" ? null : value, page: 1 });
	}

	const openList = openSessions.data?.sessions ?? [];

	return (
		<div className="flex w-full flex-col gap-6 p-1">
			<div className="flex items-center justify-end">
				<Button onClick={() => setModal({ type: "open" })} className="gap-1.5">
					<Wallet className="h-4 w-4" />
					ABRIR CAIXA
				</Button>
			</div>

			{/* Caixas abertos */}
			<section className="flex flex-col gap-3">
				<span className="font-bold text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Caixas abertos</span>
				{openSessions.isLoading ? (
					<LoadingComponent />
				) : openList.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
						Nenhum caixa aberto no momento.
					</div>
				) : (
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{openList.map((session) => (
							<div key={session.id} className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/[0.05] p-4">
								<div className="flex items-center justify-between">
									<span className="font-bold text-sm">{session.vendedorPadrao?.nome ?? "Sem vendedor padrao"}</span>
									<StatusBadge status={session.status} />
								</div>
								<div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
									<span>Aberto em {dayjs(session.dataAbertura).format("DD/MM HH:mm")}</span>
									<span>Fundo de troco {formatToMoney(session.saldoInicial)}</span>
								</div>
								<div className="flex items-center gap-2">
									<Button variant="ghost" size="sm" className="flex-1 gap-1.5" onClick={() => setModal({ type: "movement", sessionId: session.id })}>
										<ArrowRightLeft className="h-4 w-4" />
										MOVIMENTO
									</Button>
									<Button size="sm" className="flex-1 gap-1.5" onClick={() => setModal({ type: "close", sessionId: session.id })}>
										<LockKeyhole className="h-4 w-4" />
										FECHAR CAIXA
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			{/* Histórico */}
			<section className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className="font-bold text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Historico</span>
					<div className="flex flex-wrap gap-1.5">
						{STATUS_CHIPS.map((chip) => (
							<button
								key={chip.value}
								type="button"
								onClick={() => applyStatus(chip.value)}
								className={cn(
									"rounded-full border px-3 py-1 font-semibold text-xs transition-colors",
									statusFilter === chip.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
								)}
							>
								{chip.label}
							</button>
						))}
					</div>
				</div>

				{history.isLoading ? (
					<LoadingComponent />
				) : history.isError ? (
					<ErrorComponent msg={getErrorMessage(history.error)} />
				) : (history.data?.sessions.length ?? 0) === 0 ? (
					<div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma sessao encontrada.</div>
				) : (
					<div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
						{history.data?.sessions.map((session) => (
							<button
								key={session.id}
								type="button"
								onClick={() => setModal({ type: "detail", sessionId: session.id })}
								className="flex items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50"
							>
								<div className="flex min-w-0 flex-col">
									<span className="truncate font-semibold text-sm">{session.vendedorPadrao?.nome ?? "Sem vendedor padrao"}</span>
									<span className="text-[11px] text-muted-foreground">
										{dayjs(session.dataAbertura).format("DD/MM HH:mm")}
										{session.dataFechamento ? ` → ${dayjs(session.dataFechamento).format("DD/MM HH:mm")}` : ""}
									</span>
								</div>
								<div className="flex items-center gap-4">
									{session.diferencaTotal !== null && session.diferencaTotal !== undefined ? (
										<span
											className={cn(
												"font-bold text-xs tabular-nums",
												session.diferencaTotal === 0 ? "text-muted-foreground" : session.diferencaTotal > 0 ? "text-green-600" : "text-destructive",
											)}
										>
											{session.diferencaTotal > 0 ? "+" : ""}
											{formatToMoney(session.diferencaTotal)}
										</span>
									) : null}
									<StatusBadge status={session.status} />
								</div>
							</button>
						))}
					</div>
				)}

				{(history.data?.totalPages ?? 0) > 1 ? (
					<div className="flex items-center justify-center gap-3">
						<Button
							variant="outline"
							size="sm"
							disabled={history.params.page <= 1}
							onClick={() => history.updateParams({ page: Math.max(1, history.params.page - 1) })}
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<span className="text-xs text-muted-foreground">
							{history.params.page} / {history.data?.totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={history.params.page >= (history.data?.totalPages ?? 1)}
							onClick={() => history.updateParams({ page: Math.min(history.data?.totalPages ?? 1, history.params.page + 1) })}
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				) : null}
			</section>

			{modal?.type === "open" ? <OpenSalesSession closeModal={() => setModal(null)} requireOpeningFloat={sessionsConfig.requireOpeningFloat} /> : null}
			{modal?.type === "movement" ? <RegisterMovement sessionId={modal.sessionId} closeModal={() => setModal(null)} /> : null}
			{modal?.type === "close" ? (
				<CloseSalesSession sessionId={modal.sessionId} closeModal={() => setModal(null)} blindCount={sessionsConfig.blindCount} />
			) : null}
			{modal?.type === "detail" ? (
				<SalesSessionDetail sessionId={modal.sessionId} closeModal={() => setModal(null)} canReview={canReviewSessions} />
			) : null}
		</div>
	);
}
