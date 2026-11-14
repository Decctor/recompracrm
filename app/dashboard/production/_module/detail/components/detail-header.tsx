"use client";

import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import {
	ArrowLeft,
	Calendar,
	Check,
	CheckCheck,
	Circle,
	CircleCheck,
	Ellipsis,
	Factory,
	FileIcon,
	type LucideIcon,
	Pencil,
	Timer,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
	formatDayMonth,
	formatElapsed,
	formatHourMinute,
	formatQuantity,
	formatUnitTotals,
	getItemUnit,
	isPlannedStatus,
	sumByUnit,
	type TProductionById,
	type TProductionStatus,
} from "../helpers/production-detail";

const PRODUCTION_STATUS_CONFIG: Record<TProductionStatus, { label: string; icon: LucideIcon; className: string }> = {
	RASCUNHO: { label: "RASCUNHO", icon: FileIcon, className: "bg-gray-200 text-gray-600" },
	PLANEJADA: { label: "PLANEJADA", icon: Calendar, className: "bg-blue-200 text-blue-600" },
	EM_PRODUCAO: { label: "EM PRODUÇÃO", icon: Factory, className: "bg-yellow-200 text-yellow-600" },
	CONCLUIDA: { label: "CONCLUÍDA", icon: CheckCheck, className: "bg-green-200 text-green-600" },
	CANCELADA: { label: "CANCELADA", icon: XCircle, className: "bg-red-200 text-red-600" },
};

export type TPrimaryAction = {
	label: string;
	icon: LucideIcon;
	hint: string;
	disabled: boolean;
	loading: boolean;
	onClick: () => void;
} | null;

type ProductionDetailHeaderProps = {
	production: TProductionById;
	primaryAction: TPrimaryAction;
	/** Ausente = sem permissão ou fora de RASCUNHO/PLANEJADA. */
	onEdit?: () => void;
	/** Ausente = sem permissão ou produção já encerrada. */
	onCancel?: () => void;
	isCancelling: boolean;
};

export default function ProductionDetailHeader({ production, primaryAction, onEdit, onCancel, isCancelling }: ProductionDetailHeaderProps) {
	const [cancelOpen, setCancelOpen] = useState(false);
	const status = PRODUCTION_STATUS_CONFIG[production.status];
	const isRunning = production.status === "EM_PRODUCAO";
	const isDone = production.status === "CONCLUIDA";
	const isCancelled = production.status === "CANCELADA";

	const plannedYield = formatUnitTotals(
		sumByUnit(production.saidas.map((output) => ({ unit: getItemUnit(output), value: output.quantidadePrevista ?? 0 }))),
	);

	// Em produções planejadas `dataInicio` é o início previsto; só vira "Iniciada" depois de iniciar.
	const hasStarted = production.status === "EM_PRODUCAO" || production.status === "CONCLUIDA";
	const reachedSteps = isDone ? 3 : isRunning ? 2 : 1;
	const lifecycle = [
		{ label: "Planejada", sub: `Criada ${formatDayMonth(production.dataInsercao)} ${formatHourMinute(production.dataInsercao)}` },
		{
			label: "Em produção",
			sub:
				hasStarted && production.dataInicio
					? `Iniciada ${formatHourMinute(production.dataInicio)}`
					: production.dataInicio
						? `Início previsto ${formatDayMonth(production.dataInicio)} ${formatHourMinute(production.dataInicio)}`
						: "Aguardando início",
		},
		{
			label: "Concluída",
			sub: production.dataConclusao
				? `${formatDayMonth(production.dataConclusao)} ${formatHourMinute(production.dataConclusao)}`
				: production.dataPrevisaoConclusao
					? `Previsão ${formatForecast(production.dataPrevisaoConclusao)}`
					: "Sem previsão",
		},
	];

	return (
		<div className="flex w-full flex-col gap-4">
			<Button variant="ghost" size="fit" asChild className="flex h-11 w-fit items-center gap-1 rounded-full px-2.5 hover:bg-primary/10">
				<Link href={appRoutes.productions.history()} className="flex items-center gap-1">
					<ArrowLeft className="h-5 w-5" />
					VOLTAR
				</Link>
			</Button>
			<div className="flex w-full flex-wrap items-start justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="text-xl font-extrabold leading-none tracking-tight md:text-2xl">{production.titulo}</h1>
						<div className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1", status.className)}>
							<status.icon className="h-4 min-h-4 w-4 min-w-4" />
							<span className="text-xs font-medium">{status.label}</span>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
						{production.receita ? (
							<span>
								Receita: <span className="font-medium text-foreground">{production.receita.titulo}</span>
							</span>
						) : (
							<span>Produção manual</span>
						)}
						<span>
							Rendimento previsto: <span className="font-medium text-foreground">{plannedYield}</span>
						</span>
						{isRunning && production.dataInicio ? <ElapsedChip startedAt={production.dataInicio} /> : null}
					</div>
				</div>
				{primaryAction || onEdit || onCancel ? (
					<div className="flex flex-col items-end gap-1.5">
						<div className="flex items-center gap-2">
							{onEdit || onCancel ? (
								<DropdownMenu>
									<DropdownMenuTrigger
										render={
											<Button type="button" variant="outline" size="icon" className="size-14 rounded-full" aria-label="Mais ações">
												<Ellipsis className="h-5 w-5" />
											</Button>
										}
									/>
									<DropdownMenuContent align="end" className="w-56">
										{onEdit ? (
											<DropdownMenuItem onClick={onEdit}>
												<Pencil className="h-4 w-4" />
												EDITAR PRODUÇÃO
											</DropdownMenuItem>
										) : null}
										{onCancel ? (
											<DropdownMenuItem variant="destructive" onClick={() => setCancelOpen(true)}>
												<XCircle className="h-4 w-4" />
												CANCELAR PRODUÇÃO
											</DropdownMenuItem>
										) : null}
									</DropdownMenuContent>
								</DropdownMenu>
							) : null}
							{primaryAction ? (
								<LoadingButton
									type="button"
									variant="brand"
									loading={primaryAction.loading}
									disabled={primaryAction.disabled}
									onClick={primaryAction.onClick}
									className="h-14 min-w-[260px] gap-2 rounded-full px-6 text-base font-bold"
								>
									<primaryAction.icon className="h-5 w-5" />
									{primaryAction.label}
								</LoadingButton>
							) : null}
						</div>
						{primaryAction ? <span className="max-w-sm text-right text-xs text-muted-foreground">{primaryAction.hint}</span> : null}
					</div>
				) : null}
			</div>

			{isCancelled ? (
				<div className="flex w-full max-w-2xl items-center gap-2 rounded-xl border border-destructive/25 bg-destructive-surface px-4 py-3 text-sm text-destructive-surface-foreground">
					<XCircle className="h-4 w-4 shrink-0" />
					Produção cancelada. Ela não movimenta o estoque e não pode mais ser editada nem concluída.
				</div>
			) : (
				<ol className="flex w-full max-w-2xl items-center" aria-label="Situação da produção">
					{lifecycle.map((step, index) => {
						const done = index < reachedSteps;
						const current = index === reachedSteps - 1;
						return (
							<li key={step.label} className="flex flex-1 items-center gap-2">
								<span
									className={cn(
										"flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full border",
										done ? "border-brand" : "border-border bg-background text-muted-foreground/50",
										done && current && "bg-brand text-brand-foreground",
										done && !current && "bg-brand/20 text-warning-surface-foreground",
									)}
								>
									{done ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
								</span>
								<span className="flex flex-col">
									<span className={cn("text-xs font-semibold", done ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
									<span className="text-[0.7rem] text-muted-foreground">{step.sub}</span>
								</span>
								{index < lifecycle.length - 1 ? <span className={cn("mx-2.5 h-px flex-1", index < reachedSteps - 1 ? "bg-brand" : "bg-border")} /> : null}
							</li>
						);
					})}
				</ol>
			)}

			{isDone ? <CompletionBanner production={production} /> : null}

			<Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Cancelar produção?</DialogTitle>
						<DialogDescription>
							{isPlannedStatus(production.status)
								? "A produção planejada deixa de valer e não poderá mais ser iniciada nem editada."
								: "A produção em andamento é encerrada sem baixar insumos nem gerar lotes. As pesagens feitas ficam só no histórico."}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setCancelOpen(false)}>
							VOLTAR
						</Button>
						<LoadingButton
							variant="destructive"
							loading={isCancelling}
							onClick={() => {
								onCancel?.();
								setCancelOpen(false);
							}}
						>
							CANCELAR PRODUÇÃO
						</LoadingButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

/** Previsão no mesmo dia mostra só a hora; em outro dia, a data junto. */
function formatForecast(value: Date | string) {
	const date = new Date(value);
	const sameDay = date.toDateString() === new Date().toDateString();
	return sameDay ? formatHourMinute(date) : `${formatDayMonth(date)} ${formatHourMinute(date)}`;
}

/** Isolado para que o tique de um segundo não renderize a página inteira. */
function ElapsedChip({ startedAt }: { startedAt: Date | string }) {
	const startedAtMs = new Date(startedAt).getTime();
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, []);

	return (
		<span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-200 px-2.5 py-0.5 font-semibold text-yellow-800">
			<Timer className="h-3.5 w-3.5" />
			Em andamento há {formatElapsed((now - startedAtMs) / 1000)}
		</span>
	);
}

function CompletionBanner({ production }: { production: TProductionById }) {
	const mainUnit = production.saidas[0] ? getItemUnit(production.saidas[0]) : "";
	const mainOutputs = production.saidas.filter((output) => getItemUnit(output) === mainUnit);
	const realYield = mainOutputs.reduce((total, output) => total + (output.quantidadeReal ?? 0), 0);
	const plannedYield = mainOutputs.reduce((total, output) => total + (output.quantidadePrevista ?? 0), 0);

	return (
		<div className="flex w-full flex-wrap items-center gap-x-6 gap-y-2.5 rounded-xl border border-success/30 bg-success-surface px-4 py-3 text-success-surface-foreground">
			<CircleCheck className="h-4.5 w-4.5 shrink-0" />
			<span className="text-sm font-semibold">Produção concluída. Estoque movimentado e lotes gerados.</span>
			{mainOutputs.length > 0 ? (
				<span className="text-sm">
					Rendimento real <b>{formatQuantity(realYield, mainUnit)}</b>
					{plannedYield > 0 ? ` (${Math.round((realYield / plannedYield) * 100)}% do previsto)` : null}
				</span>
			) : null}
			<span className="text-sm">
				Custo final <b>{formatToMoney(production.valores.custoTotal)}</b>
			</span>
		</div>
	);
}
