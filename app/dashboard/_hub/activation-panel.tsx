"use client";

import { Button } from "@/components/ui/button";
import { captureClientEvent } from "@/lib/analytics/posthog-client";
import type { TActivation, TActivationMilestone } from "@/lib/onboarding/activation";
import { useOnboardingActivation } from "@/lib/queries/onboarding";
import { cn } from "@/lib/utils";
import { ArrowRight, CircleCheck, Clock, TriangleAlert } from "lucide-react";
import Link from "next/link";
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
	if (!enabled) return null;
	// Enquanto carrega, nada: o aviso do WhatsApp piscaria e sumiria para quem ainda não ativou.
	if (isPending) return null;
	if (isError || !data?.visivel) return <WhatsappChannelNotice enabled={enabled} />;
	return <ActivationPanel activation={data} />;
}

const REGRESSION_TITLE: Record<NonNullable<TActivation["regressao"]>["motivo"], string> = {
	CANAL_PERDIDO: "O WhatsApp oficial desconectou",
	SEM_ENVIO: "Suas campanhas pararam de entregar",
	SEM_VENDA: "As vendas pelo sistema pararam",
};

export function ActivationPanel({ activation }: { activation: TActivation }) {
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
