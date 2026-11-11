"use client";

import type { TGetCampaignDispatchesOutputItems } from "@/app/api/campaigns/dispatches/route";
import type { TCampaignDispatchRecipientSituation } from "@/app/api/campaigns/dispatches/recipients/route";
import {
	DISPATCH_ORIGIN_LABELS,
	DISPATCH_SKIP_REASON_LABELS,
	QUOTA_SKIP_REASONS,
	formatDispatchMoment,
} from "@/app/dashboard/growth/campaigns/_module/detail/helpers/dispatch-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDecimalPlaces, formatToPhone } from "@/lib/formatting";
import { useCampaignDispatchRecipients } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import { CircleCheck, CircleSlash, CircleX, Clock, RefreshCw, Search, UserRound, Users, X } from "lucide-react";
import { useState } from "react";

const SITUATION_TABS: { value: TCampaignDispatchRecipientSituation | null; label: string }[] = [
	{ value: null, label: "Todos" },
	{ value: "ENVIADA", label: "Enviados" },
	{ value: "FALHOU", label: "Falhas" },
	{ value: "PULADA", label: "Pulados" },
	{ value: "PENDENTE", label: "Na fila" },
];

const SITUATION_BADGES: Record<TCampaignDispatchRecipientSituation, { label: string; icon: typeof CircleCheck; className: string }> = {
	ENVIADA: { label: "Enviado", icon: CircleCheck, className: "text-green-600 dark:text-green-400" },
	FALHOU: { label: "Falhou", icon: CircleX, className: "text-red-600 dark:text-red-400" },
	PULADA: { label: "Pulado", icon: CircleSlash, className: "text-amber-600 dark:text-amber-400" },
	PENDENTE: { label: "Na fila", icon: Clock, className: "text-blue-600 dark:text-blue-400" },
};

type DispatchRecipientsPanelProps = {
	dispatch: TGetCampaignDispatchesOutputItems[number];
	onRetryQuotaSkips: (() => void) | null;
	retryIsPending: boolean;
};

/** Quem entrou na rodada e o que aconteceu com cada um, com o motivo de quem ficou de fora. */
export function DispatchRecipientsPanel({ dispatch, onRetryQuotaSkips, retryIsPending }: DispatchRecipientsPanelProps) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button size="sm" variant="outline" className="h-7 text-[0.65rem] font-semibold">
						<Users className="size-3.5" />
						VER DESTINATÁRIOS
					</Button>
				}
			/>
			<PopoverContent align="end" className="w-[min(30rem,calc(100vw-2rem))] gap-0 p-0">
				{open ? (
					<RecipientsPanelContent
						dispatch={dispatch}
						onClose={() => setOpen(false)}
						onRetryQuotaSkips={onRetryQuotaSkips}
						retryIsPending={retryIsPending}
					/>
				) : null}
			</PopoverContent>
		</Popover>
	);
}

function RecipientsPanelContent({
	dispatch,
	onClose,
	onRetryQuotaSkips,
	retryIsPending,
}: Omit<DispatchRecipientsPanelProps, never> & { onClose: () => void }) {
	const { data, isLoading, isError, params, updateParams } = useCampaignDispatchRecipients({ dispatchId: dispatch.id });
	const counts = data?.counts;
	const items = data?.items ?? [];
	const quotaSkips = dispatch.pulosPorMotivo.filter((skip) => QUOTA_SKIP_REASONS.includes(skip.motivo)).reduce((acc, skip) => acc + skip.qtde, 0);
	const tabCount = (value: TCampaignDispatchRecipientSituation | null) => (counts ? (value ? counts[value] : counts.total) : null);

	return (
		<div className="flex max-h-[70vh] flex-col">
			<div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
				<div className="flex flex-col">
					<span className="flex items-center gap-1.5 text-xs font-bold uppercase">
						<Users className="size-4 min-h-4 min-w-4" />
						Destinatários do disparo
						<span className="text-muted-foreground tabular-nums">{formatDecimalPlaces(dispatch.totalDestinatarios)}</span>
					</span>
					<span className="text-[0.7rem] text-muted-foreground">
						{formatDispatchMoment(dispatch)} · {DISPATCH_ORIGIN_LABELS[dispatch.origem]}
					</span>
				</div>
				<Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Fechar" onClick={onClose}>
					<X className="size-4" />
				</Button>
			</div>
			<div className="flex flex-col gap-2 border-b border-border px-4 py-3">
				<div className="flex flex-wrap items-center gap-1.5">
					{SITUATION_TABS.filter((tab) => tab.value !== "PENDENTE" || (counts?.PENDENTE ?? 0) > 0).map((tab) => {
						const active = params.situation === tab.value;
						const count = tabCount(tab.value);
						return (
							<button
								key={tab.label}
								type="button"
								aria-pressed={active}
								onClick={() => updateParams({ situation: tab.value })}
								className={cn(
									"flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.65rem] font-bold uppercase transition-colors",
									active ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary",
								)}
							>
								{tab.label}
								{count != null ? <span className="tabular-nums opacity-80">{formatDecimalPlaces(count)}</span> : null}
							</button>
						);
					})}
				</div>
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={params.search ?? ""}
						onChange={(event) => updateParams({ search: event.target.value })}
						placeholder="Pesquisar cliente ou telefone..."
						className="rounded-xl pl-9"
					/>
				</div>
			</div>
			{onRetryQuotaSkips && quotaSkips > 0 && params.situation === "PULADA" ? (
				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-amber-500/10 px-4 py-2">
					<span className="text-[0.7rem] font-medium text-amber-700 dark:text-amber-400">
						{formatDecimalPlaces(quotaSkips)} {quotaSkips === 1 ? "cliente ficou" : "clientes ficaram"} de fora por limite de envio.
					</span>
					<Button size="sm" variant="outline" disabled={retryIsPending} className="h-7 text-[0.65rem] font-semibold" onClick={onRetryQuotaSkips}>
						<RefreshCw className={cn("size-3.5", { "animate-spin": retryIsPending })} />
						REENVIAR PULADOS POR LIMITE
					</Button>
				</div>
			) : null}
			<div className="min-h-0 flex-1 overflow-y-auto">
				{isLoading ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Carregando destinatários...</p> : null}
				{isError ? <p className="px-4 py-6 text-center text-sm text-red-500">Não foi possível carregar os destinatários.</p> : null}
				{!isLoading && !isError && items.length === 0 ? (
					<p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum destinatário encontrado.</p>
				) : null}
				<ul className="divide-y divide-border">
					{items.map((recipient) => {
						const badge = SITUATION_BADGES[recipient.situacao];
						const BadgeIcon = badge.icon;
						const reason = recipient.motivoPulo
							? DISPATCH_SKIP_REASON_LABELS[recipient.motivoPulo]
							: recipient.situacao === "FALHOU"
								? recipient.erro
								: null;
						return (
							<li key={recipient.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2">
								<span className="flex min-w-0 items-center gap-1.5 text-[0.7rem] font-semibold uppercase">
									<UserRound className="size-3.5 min-h-3.5 min-w-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate">{recipient.cliente.nome}</span>
								</span>
								<span className={cn("flex items-center gap-1 text-[0.65rem] font-bold uppercase", badge.className)}>
									<BadgeIcon className="size-3.5 min-h-3.5 min-w-3.5" />
									{badge.label}
								</span>
								<span className="flex min-w-0 items-center gap-2 pl-5 text-[0.65rem] text-muted-foreground">
									<span className="shrink-0 font-mono tabular-nums">
										{recipient.cliente.telefone ? formatToPhone(recipient.cliente.telefone) : "sem telefone"}
									</span>
									{reason ? (
										<span className="truncate text-amber-700 dark:text-amber-400" title={reason}>
											{reason}
										</span>
									) : null}
								</span>
							</li>
						);
					})}
				</ul>
			</div>
			{data ? (
				<div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-[0.65rem] text-muted-foreground">
					<span>
						mostrando {formatDecimalPlaces(items.length)} de {formatDecimalPlaces(data.recipientsMatched)}
					</span>
					{data.totalPages > 1 ? (
						<div className="flex items-center gap-1">
							<Button
								size="sm"
								variant="ghost"
								className="h-6 px-2 text-[0.65rem]"
								disabled={(params.page ?? 1) <= 1}
								onClick={() => updateParams({ page: (params.page ?? 1) - 1 })}
							>
								ANTERIOR
							</Button>
							<span className="tabular-nums">
								{params.page ?? 1}/{data.totalPages}
							</span>
							<Button
								size="sm"
								variant="ghost"
								className="h-6 px-2 text-[0.65rem]"
								disabled={(params.page ?? 1) >= data.totalPages}
								onClick={() => updateParams({ page: (params.page ?? 1) + 1 })}
							>
								PRÓXIMA
							</Button>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
