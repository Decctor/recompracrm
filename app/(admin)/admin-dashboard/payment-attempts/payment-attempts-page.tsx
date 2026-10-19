"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { resumePaymentAttemptEffectuation } from "@/lib/mutations/payment-attempts-admin";
import { type TAdminPaymentAttemptListItem, useAdminPaymentAttempts } from "@/lib/queries/payment-attempts-admin";
import { cn } from "@/lib/utils";
import type { TPaymentAttemptStatusEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, RefreshCw, Smartphone, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Lista administrativa de tentativas de pagamento em terminal (gate do piloto, docs/08 do POS).
// Não é dashboard: é a fila de quem aplica o runbook "cobrou, mas não efetivou"
// (lib/payment-attempts/README.md). Por padrão mostra só o que exige gente; os filtros abrem o
// histórico por status para investigação.

const STATUS_LABELS: Record<TPaymentAttemptStatusEnum, string> = {
	CRIADA: "Criada",
	PROCESSANDO: "Processando",
	APROVADA_EFETIVACAO_PENDENTE: "Aprovada sem efetivação",
	CONSUMIDA: "Consumida",
	NAO_APROVADA: "Não aprovada",
	RESULTADO_INCERTO: "Resultado incerto",
};

const STATUS_TONE: Record<TPaymentAttemptStatusEnum, string> = {
	CRIADA: "bg-muted text-muted-foreground",
	PROCESSANDO: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
	APROVADA_EFETIVACAO_PENDENTE: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
	CONSUMIDA: "bg-green-500/15 text-green-700 dark:text-green-400",
	NAO_APROVADA: "bg-muted text-muted-foreground",
	RESULTADO_INCERTO: "bg-destructive/10 text-destructive",
};

type TFilter = { label: string; status: TPaymentAttemptStatusEnum[] };
const FILTERS: TFilter[] = [
	{ label: "EXIGEM ATENÇÃO", status: [] },
	{ label: "INCERTAS", status: ["RESULTADO_INCERTO"] },
	{ label: "APROVADAS SEM EFETIVAÇÃO", status: ["APROVADA_EFETIVACAO_PENDENTE"] },
	{ label: "EM ABERTO", status: ["CRIADA", "PROCESSANDO"] },
	{ label: "NÃO APROVADAS", status: ["NAO_APROVADA"] },
	{ label: "CONSUMIDAS", status: ["CONSUMIDA"] },
];

function ageLabel(date: Date | string) {
	const minutes = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60_000));
	if (minutes < 60) return `há ${minutes} min`;
	if (minutes < 60 * 24) return `há ${Math.round(minutes / 60)} h`;
	return `há ${Math.round(minutes / (60 * 24))} d`;
}

function AttemptRow({ attempt, onResume, isResuming }: { attempt: TAdminPaymentAttemptListItem; onResume: (attemptId: string) => void; isResuming: boolean }) {
	const canResume = attempt.status === "APROVADA_EFETIVACAO_PENDENTE";
	const uncertain = attempt.status === "RESULTADO_INCERTO" || attempt.nextAction === "RECUPERAR_NO_TERMINAL";
	return (
		<Collapsible className="rounded-xl border border-border bg-card">
			<div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex min-w-0 flex-col gap-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className={cn("rounded-md px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-[0.08em]", STATUS_TONE[attempt.status])}>
							{STATUS_LABELS[attempt.status]}
							{attempt.motivo ? ` · ${attempt.motivo}` : ""}
						</span>
						{uncertain ? (
							<span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase text-destructive">
								<TriangleAlert className="h-3 w-3" /> não recobrar
							</span>
						) : null}
						<span className="text-xs text-muted-foreground">{ageLabel(attempt.dataInsercao)}</span>
					</div>
					<p className="truncate text-sm font-bold">
						{attempt.organizacao.nome} · {formatToMoney(attempt.valor)}
						{attempt.totalParcelas > 1 ? ` em ${attempt.totalParcelas}x` : ""} · {attempt.metodo.replaceAll("_", " ")}
					</p>
					<p className="truncate text-xs text-muted-foreground">
						Terminal {attempt.dispositivo.nome} · order_id {attempt.ordemProvedorId ?? "—"} · venda #{attempt.venda.id.slice(-8).toUpperCase()} (
						{attempt.venda.statusVenda ?? "—"})
					</p>
					{attempt.erroMensagem ? <p className="text-xs text-destructive">{attempt.erroMensagem}</p> : null}
				</div>
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{canResume ? (
						<Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={isResuming} onClick={() => onResume(attempt.id)}>
							{isResuming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
							RETOMAR EFETIVAÇÃO
						</Button>
					) : null}
					<CollapsibleTrigger className="group inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-muted">
						DETALHES
						<ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
					</CollapsibleTrigger>
				</div>
			</div>
			<CollapsibleContent>
				<div className="grid gap-4 border-t border-border px-4 py-3 text-xs sm:grid-cols-2">
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
						<dt className="text-muted-foreground">Tentativa</dt>
						<dd className="break-all font-mono">{attempt.id}</dd>
						<dt className="text-muted-foreground">Provedor</dt>
						<dd>{attempt.provedor}</dd>
						<dt className="text-muted-foreground">ITK / ATK</dt>
						<dd className="break-all font-mono">
							{attempt.itkProvedor ?? "—"} / {attempt.atkProvedor ?? "—"}
						</dd>
						<dt className="text-muted-foreground">Valor autorizado</dt>
						<dd>{attempt.valorAutorizado === null ? "—" : formatToMoney(attempt.valorAutorizado)}</dd>
						<dt className="text-muted-foreground">Transação</dt>
						<dd>
							{attempt.transacaoFinanceira
								? `${attempt.transacaoFinanceira.dataEfetivacao ? `efetivada em ${formatDateAsLocale(attempt.transacaoFinanceira.dataEfetivacao, true)}` : "pendente"} (${attempt.transacaoFinanceira.provedorStatus ?? "—"})`
								: "sem vínculo"}
						</dd>
						<dt className="text-muted-foreground">Último contato do terminal</dt>
						<dd>{attempt.dispositivo.ultimoAcesso ? formatDateAsLocale(attempt.dispositivo.ultimoAcesso, true) : "nunca"}</dd>
						<dt className="text-muted-foreground">Versão (CAS)</dt>
						<dd>{attempt.versao}</dd>
					</dl>
					<div className="flex flex-col gap-1">
						<p className="font-bold uppercase tracking-[0.08em] text-muted-foreground">Últimos eventos</p>
						{attempt.eventos.length === 0 ? <p className="text-muted-foreground">Nenhum evento registrado.</p> : null}
						<ul className="flex flex-col gap-1">
							{attempt.eventos.map((event) => (
								<li key={event.id} className="flex flex-col">
									<span>
										<span className="font-semibold">{event.tipo}</span> · {event.origem} · {event.statusAnterior ?? "—"} → {event.statusPosterior}
									</span>
									<span className="text-muted-foreground">
										{formatDateAsLocale(event.dataInsercao, true)}
										{event.descricao ? ` · ${event.descricao}` : ""}
									</span>
								</li>
							))}
						</ul>
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

export default function PaymentAttemptsAdminPage() {
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<TFilter>(FILTERS[0]);
	const { data, queryKey, isLoading, isError, isSuccess, error } = useAdminPaymentAttempts({ status: filter.status });

	const { mutate: resume, isPending, variables } = useMutation({
		mutationKey: ["admin-resume-payment-attempt"],
		mutationFn: resumePaymentAttemptEffectuation,
		onSuccess: (result) => toast.success(result.message),
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
		onSettled: async () => await queryClient.invalidateQueries({ queryKey }),
	});

	const attempts = data?.attempts ?? [];

	return (
		<div className="flex w-full flex-col gap-4 p-4 pb-28 md:p-6 md:pb-28">
			<div className="flex flex-col gap-1">
				<h1 className="text-lg font-black tracking-tight md:text-xl">COBRANÇAS EM TERMINAL</h1>
				<p className="text-sm text-muted-foreground">
					Tentativas de pagamento nas maquininhas (RecompraCRM POS) que exigem atenção: resultado incerto, aprovação sem efetivação e cobranças
					iniciadas sem desfecho. Nunca peça ao lojista para cobrar de novo antes de resolver uma linha incerta.
				</p>
			</div>

			<div className="flex flex-wrap gap-1.5">
				{FILTERS.map((item) => (
					<Button key={item.label} type="button" size="sm" variant={item.label === filter.label ? "default" : "outline"} className="text-xs" onClick={() => setFilter(item)}>
						{item.label}
					</Button>
				))}
			</div>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}

			{isSuccess && attempts.length === 0 ? (
				<div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-12 text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
						<Smartphone className="h-6 w-6" />
					</div>
					<div className="flex flex-col gap-1">
						<h2 className="text-base font-bold tracking-tight">Nenhuma tentativa neste filtro</h2>
						<p className="max-w-md text-sm text-muted-foreground">
							{filter.status.length === 0 ? "Nenhuma cobrança exige atenção agora." : "Nenhuma tentativa com este status."}
						</p>
					</div>
				</div>
			) : null}

			{attempts.length > 0 ? (
				<div className="flex flex-col gap-2">
					{attempts.map((attempt) => (
						<AttemptRow key={attempt.id} attempt={attempt} onResume={(attemptId) => resume({ attemptId })} isResuming={isPending && variables?.attemptId === attempt.id} />
					))}
					{data?.pagination && data.pagination.total > attempts.length ? (
						<p className="text-xs text-muted-foreground">
							Mostrando {attempts.length} de {data.pagination.total}. Refine pelo status para ver o restante.
						</p>
					) : null}
				</div>
			) : null}
		</div>
	);
}
