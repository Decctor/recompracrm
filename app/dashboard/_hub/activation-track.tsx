"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import { MetaIcon, WhatsappIcon } from "@/components/icons";
import { DATA_SOURCE_INTEGRATION_PROVIDERS } from "@/lib/integrations/data-source-providers";
import type { TActivationMark, TActivationMilestone } from "@/lib/onboarding/activation";
import type { TErpChannel } from "@/lib/onboarding/erp-channels";
import { cn } from "@/lib/utils";
import { Cable, Check, Clock, ShoppingBag, Store, UtensilsCrossed } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";

/**
 * A escada de "Primeiros passos": horizontal a partir de `lg`, vertical abaixo — seis passos lado a
 * lado não cabem em 390px.
 *
 * Um marco que pertence a alguém mostra a marca dele no marcador (Meta e WhatsApp no canal oficial,
 * o RecompraCRM no balcão, o canal do ERP). O sistema conectado vai como um selo com o logo abaixo
 * do rótulo: os logos das integrações são marcas largas (o do Bling tem 2,6:1) e sumiriam num
 * círculo de 36px.
 *
 * Movimento só conta mudança de estado: a linha que liga os marcadores enche quando um passo se
 * conclui, e as cores trocam com o estado. Nada anima ao carregar a página.
 */

type TStepState = "done" | "waiting" | "current" | "later";

function resolveStepState(milestone: TActivationMilestone, isCurrent: boolean): TStepState {
	if (milestone.estado === "FEITO") return "done";
	if (milestone.estado === "EM_ANDAMENTO") return "waiting";
	return isCurrent ? "current" : "later";
}

const STATE_LABEL: Record<TStepState, string> = { done: "feito", waiting: "em andamento", current: "próximo", later: "pendente" };

const CHANNEL_ICON: Record<TErpChannel, typeof Store> = { BALCAO: Store, CATALOGO: ShoppingBag, MESAS: UtensilsCrossed };

function MarkGlyph({ mark }: { mark: TActivationMark }) {
	switch (mark.tipo) {
		case "META":
			return (
				<span className="flex items-center" aria-hidden>
					<MetaIcon className="size-3.5 text-[#0869E1]" />
					<WhatsappIcon className="-ml-0.5 size-3.5 text-whatsapp" />
				</span>
			);
		case "RECOMPRACRM":
			return <BrandLogo lockup="icon-badge" tone="color" alt="" className="size-6 object-contain" />;
		case "CANAL": {
			const Icon = CHANNEL_ICON[mark.canal];
			return <Icon className="size-4" aria-hidden />;
		}
		default:
			return <Cable className="size-4" aria-hidden />;
	}
}

function StepMarker({ milestone, state, index }: { milestone: TActivationMilestone; state: TStepState; index: number }) {
	const mark = milestone.marca ?? null;
	return (
		<span
			aria-hidden
			className={cn(
				"relative flex size-9 shrink-0 items-center justify-center rounded-full font-bold text-xs transition-colors duration-200",
				state === "done" && (mark ? "border border-border bg-card text-foreground" : "bg-success-surface text-success-surface-foreground"),
				state === "current" && "border-2 border-primary bg-card text-primary",
				state === "waiting" && "border border-border border-dashed bg-card text-muted-foreground",
				state === "later" && "border border-border bg-muted/40 text-muted-foreground",
			)}
		>
			{mark ? (
				<MarkGlyph mark={mark} />
			) : state === "done" ? (
				<Check className="size-4" strokeWidth={3} />
			) : state === "waiting" ? (
				<Clock className="size-4" />
			) : (
				index + 1
			)}
			{/* Com marca, o estado vai num selo no canto: o marcador continua dizendo de quem é o passo. */}
			{mark && (state === "done" || state === "waiting") ? (
				<span
					className={cn(
						"absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full ring-2 ring-card",
						state === "done" ? "bg-success text-white" : "bg-muted text-muted-foreground",
					)}
				>
					{state === "done" ? <Check className="size-2.5" strokeWidth={3.5} /> : <Clock className="size-2.5" strokeWidth={3} />}
				</span>
			) : null}
		</span>
	);
}

/** O logo do sistema conectado, sobre uma placa clara: os logos são PNG pensados para fundo claro. */
function IntegrationChip({ mark }: { mark: TActivationMark }) {
	if (mark.tipo !== "INTEGRACAO") return null;
	const providers = mark.integracoes
		.map((tipo) => DATA_SOURCE_INTEGRATION_PROVIDERS.find((provider) => provider.id === tipo))
		.filter((provider): provider is NonNullable<typeof provider> => !!provider?.logo);
	const first = providers[0];
	if (!first?.logo) return null;
	return (
		<span className="inline-flex items-center gap-1">
			<span className="inline-flex h-5 items-center rounded-md bg-white px-1.5 ring-1 ring-border">
				<Image src={first.logo} alt={first.nome} className="h-3.5 w-auto max-w-16 object-contain" />
			</span>
			{providers.length > 1 ? <span className="text-micro font-normal text-muted-foreground">+{providers.length - 1}</span> : null}
		</span>
	);
}

function StepText({
	milestone,
	state,
	showDetail,
	align,
}: {
	milestone: TActivationMilestone;
	state: TStepState;
	showDetail: boolean;
	align: "center" | "start";
}) {
	const mark = milestone.marca ?? null;
	return (
		<span className={cn("flex min-w-0 flex-col gap-1", align === "center" ? "items-center text-center" : "items-start")}>
			<span className={cn("text-sm leading-tight", state === "done" ? "text-muted-foreground" : "font-bold text-foreground")}>
				{milestone.rotulo}
				<span className="sr-only"> ({STATE_LABEL[state]})</span>
			</span>
			{mark?.tipo === "INTEGRACAO" ? <IntegrationChip mark={mark} /> : null}
			{milestone.detalhe && showDetail && (state === "done" || state === "waiting") ? (
				// Sem `cn`: o tailwind-merge lê `text-micro` (tamanho) e `text-muted-foreground` (cor) como o mesmo
				// grupo e descarta o tamanho.
				<span className={`text-micro font-normal text-muted-foreground${align === "center" ? " line-clamp-2" : ""}`}>{milestone.detalhe}</span>
			) : null}
		</span>
	);
}

type ActivationTrackProps = {
	marcos: TActivationMilestone[];
	/**
	 * Chave da próxima ação. O marco que ela resolve é o destacado (o botão ao lado e o anel azul falam do
	 * mesmo passo), e o texto dele não se repete na escada.
	 */
	actionKey: string | null;
};

export function ActivationTrack({ marcos, actionKey }: ActivationTrackProps) {
	const hideDetailOf = actionKey;
	const currentKey =
		marcos.find((milestone) => milestone.estado === "PENDENTE" && actionKey && milestone.acao?.chave === actionKey)?.chave ??
		marcos.find((milestone) => milestone.estado !== "FEITO")?.chave ??
		null;
	const steps = marcos.map((milestone, index) => ({
		milestone,
		index,
		state: resolveStepState(milestone, milestone.chave === currentKey),
		showDetail: milestone.acao?.chave !== hideDetailOf,
	}));

	return (
		<>
			{/* Horizontal (lg+): a linha entre dois marcadores enche quando o da esquerda está feito. */}
			<ol
				className="hidden lg:grid lg:grid-cols-[repeat(var(--steps),minmax(0,1fr))] lg:gap-x-2"
				style={{ "--steps": marcos.length } as CSSProperties}
				aria-label="Passos da ativação"
			>
				{steps.map(({ milestone, index, state, showDetail }) => (
					<li
						key={milestone.chave}
						className="relative flex min-w-0 flex-col items-center gap-2.5"
						aria-current={state === "current" ? "step" : undefined}
					>
						{index < steps.length - 1 ? (
							<span
								className="absolute top-[17px] left-[calc(50%+1.5rem)] h-0.5 w-[calc(100%-3rem+0.5rem)] overflow-hidden rounded-full bg-border"
								aria-hidden
							>
								<span
									className={cn(
										"block h-full origin-left bg-primary motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
										state === "done" ? "scale-x-100" : "scale-x-0",
									)}
								/>
							</span>
						) : null}
						<StepMarker milestone={milestone} state={state} index={index} />
						<StepText milestone={milestone} state={state} showDetail={showDetail} align="center" />
					</li>
				))}
			</ol>

			{/* Vertical (abaixo de lg): a mesma escada, em linhas. */}
			<ol className="flex flex-col lg:hidden" aria-label="Passos da ativação">
				{steps.map(({ milestone, index, state, showDetail }) => (
					<li
						key={milestone.chave}
						className="relative flex min-w-0 items-start gap-3 pb-3 last:pb-0"
						aria-current={state === "current" ? "step" : undefined}
					>
						{index < steps.length - 1 ? (
							<span className="absolute top-10 bottom-0 left-[17px] w-0.5 overflow-hidden rounded-full bg-border" aria-hidden>
								<span
									className={cn(
										"block h-full w-full origin-top bg-primary motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
										state === "done" ? "scale-y-100" : "scale-y-0",
									)}
								/>
							</span>
						) : null}
						<StepMarker milestone={milestone} state={state} index={index} />
						<span className="min-w-0 flex-1 pt-2">
							<StepText milestone={milestone} state={state} showDetail={showDetail} align="start" />
						</span>
					</li>
				))}
			</ol>
		</>
	);
}
