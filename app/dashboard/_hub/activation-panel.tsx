"use client";

import { Button } from "@/components/ui/button";
import { captureClientEvent } from "@/lib/analytics/posthog-client";
import type { TActivation, TActivationCelebration, TActivationMilestone } from "@/lib/onboarding/activation";
import { useOnboardingActivation } from "@/lib/queries/onboarding";
import { cn } from "@/lib/utils";
import { ArrowRight, CircleCheck, Clock, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Panel } from "./panel";
import { WhatsappChannelNotice } from "./whatsapp-channel-notice";

/**
 * Primeiros passos no topo do hub: a escada de marcos do segmento da loja e uma ação só.
 *
 * Regras em lib/onboarding/activation.ts (integração, balcão, ERP, CRM + ERP, sem fonte). O bloco
 * aparece antes da ativação, some depois dela e volta, com uma ação, quando algo que funcionava
 * parou. Fora disso o lugar é do aviso do WhatsApp oficial, que cobre o canal de quem já ativou.
 *
 * Fica acima da faixa de vendas e não muda com a aba: é a mesma pendência em qualquer leitura.
 */
export function ActivationSlot({ enabled }: { enabled: boolean }) {
	const { data, isPending, isError } = useOnboardingActivation({ enabled });
	const celebration = useCelebration(data?.celebracao ?? null);
	if (!enabled) return null;
	// Enquanto carrega, nada: o aviso do WhatsApp piscaria e sumiria para quem ainda não ativou.
	if (isPending) return null;
	if (isError || !data) return <WhatsappChannelNotice enabled={enabled} />;
	if (data.visivel) return <ActivationPanel activation={data} celebration={celebration} />;
	return (
		<>
			{celebration.value ? (
				<Panel>
					<Panel.Body>
						<CelebrationNote celebration={celebration.value} onDismiss={celebration.dismiss} />
					</Panel.Body>
				</Panel>
			) : null}
			<WhatsappChannelNotice enabled={enabled} />
		</>
	);
}

type TCelebrationState = { value: TActivationCelebration | null; dismiss: () => void };

/**
 * A celebração vale por alguns dias depois do acontecimento (regra no modelo). "Fechar" vale para
 * este navegador: é conveniência, não estado — no pior caso, ela aparece de novo até a janela acabar.
 */
function useCelebration(celebration: TActivationCelebration | null): TCelebrationState {
	const key = celebration ? `recompracrm:celebracao:${celebration.chave}` : null;
	const [dismissedKey, setDismissedKey] = useState<string | null>(null);
	useEffect(() => {
		if (!key) return;
		try {
			if (window.localStorage.getItem(key) === "1") setDismissedKey(key);
		} catch {}
	}, [key]);
	return {
		value: celebration && dismissedKey !== key ? celebration : null,
		dismiss: () => {
			if (!key) return;
			setDismissedKey(key);
			try {
				window.localStorage.setItem(key, "1");
			} catch {}
		},
	};
}

function CelebrationNote({ celebration, onDismiss }: { celebration: TActivationCelebration; onDismiss: () => void }) {
	return (
		<div className="flex items-start gap-3 rounded-lg bg-success-surface px-3 py-3 text-success-surface-foreground" role="status">
			<CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<p className="font-bold text-sm">{celebration.titulo}</p>
				<p className="text-sm">{celebration.texto}</p>
			</div>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-7 shrink-0 text-current hover:bg-success/10"
				onClick={onDismiss}
				aria-label="Fechar"
			>
				<X className="size-4" aria-hidden />
			</Button>
		</div>
	);
}

const REGRESSION_TITLE: Record<NonNullable<TActivation["regressao"]>["motivo"], string> = {
	CANAL_PERDIDO: "O WhatsApp oficial desconectou",
	SEM_ENVIO: "Suas campanhas pararam de entregar",
	SEM_VENDA: "As vendas pelo sistema pararam",
};

export function ActivationPanel({ activation, celebration }: { activation: TActivation; celebration?: TCelebrationState }) {
	const next = activation.proximaAcao;
	if (activation.regressao) {
		return (
			<Panel>
				<Panel.Header title={REGRESSION_TITLE[activation.regressao.motivo]} />
				<Panel.Body>
					<div className="flex items-start gap-3">
						<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning-surface text-warning-surface-foreground">
							<TriangleAlert className="size-4" aria-hidden />
						</span>
						{next ? <NextAction action={next} segmento={activation.segmento} /> : null}
					</div>
				</Panel.Body>
			</Panel>
		);
	}

	const current = activation.marcos.find((milestone) => milestone.estado !== "FEITO")?.chave ?? null;
	return (
		<Panel>
			<Panel.Header title="Primeiros passos" hint={`${activation.progresso.feitos} de ${activation.progresso.total} feitos`} />
			<Panel.Body>
				{celebration?.value ? <CelebrationNote celebration={celebration.value} onDismiss={celebration.dismiss} /> : null}
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-6">
					{/* A ação vem antes no DOM: no celular ela fica no topo, e quem lê com leitor de tela
					    ouve o que fazer antes da lista. No desktop a escada vai para a esquerda. */}
					<div className="flex flex-col gap-3 self-start rounded-lg bg-muted/50 p-4 lg:order-last">
						{next ? (
							<NextAction action={next} segmento={activation.segmento} />
						) : (
							<p className="text-sm text-muted-foreground">Nada pendente por enquanto.</p>
						)}
					</div>
					<ol className="flex flex-col" aria-label="Passos da ativação">
						{activation.marcos.map((milestone) => (
							<MilestoneRow
								key={milestone.chave}
								milestone={milestone}
								current={milestone.chave === current}
								// O texto da etapa que a caixa de ação já explica não se repete na lista.
								showDetail={milestone.acao?.chave !== next?.chave}
							/>
						))}
					</ol>
				</div>
			</Panel.Body>
		</Panel>
	);
}

function NextAction({ action, segmento }: { action: NonNullable<TActivation["proximaAcao"]>; segmento: TActivation["segmento"] }) {
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-3">
			{/* Com botão, o rótulo já está nele; o título só aparece quando a etapa espera alguém de fora. */}
			<div className="flex flex-col gap-1">
				{action.href ? null : <p className="font-bold text-sm">{action.rotulo}</p>}
				<p className="text-sm text-muted-foreground">{action.descricao}</p>
			</div>
			{action.href ? (
				<Button asChild size="sm" className="w-fit gap-1.5 font-bold">
					<Link
						href={action.href}
						onClick={() => captureClientEvent({ event: "onboarding_next_action_clicked", properties: { chave: action.chave, segmento, origem: "hub" } })}
					>
						{action.rotulo}
						<ArrowRight className="size-4" aria-hidden />
					</Link>
				</Button>
			) : null}
		</div>
	);
}

function MilestoneRow({ milestone, current, showDetail }: { milestone: TActivationMilestone; current: boolean; showDetail: boolean }) {
	const isDone = milestone.estado === "FEITO";
	const isWaiting = milestone.estado === "EM_ANDAMENTO";
	return (
		<li className="flex min-w-0 items-start gap-3 border-border/60 border-b py-2 last:border-b-0" aria-current={current ? "step" : undefined}>
			<span
				className={cn(
					"mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
					isDone ? "text-success" : isWaiting ? "text-muted-foreground" : current ? "border-2 border-primary" : "border border-border",
				)}
				aria-hidden
			>
				{isDone ? <CircleCheck className="size-5" /> : isWaiting ? <Clock className="size-4" /> : null}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className={cn("text-sm leading-tight", isDone ? "text-muted-foreground" : "font-bold")}>
					{milestone.rotulo}
					<span className="sr-only">{isDone ? " (feito)" : isWaiting ? " (em andamento)" : current ? " (próximo)" : " (pendente)"}</span>
				</span>
				{milestone.detalhe && showDetail && (isDone || isWaiting) ? (
					<span className="text-micro font-normal text-muted-foreground">{milestone.detalhe}</span>
				) : null}
			</span>
		</li>
	);
}
