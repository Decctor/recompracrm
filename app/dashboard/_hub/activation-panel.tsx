"use client";

import { Button } from "@/components/ui/button";
import { captureClientEvent } from "@/lib/analytics/posthog-client";
import type { TActivation, TActivationCelebration } from "@/lib/onboarding/activation";
import { useOnboardingActivation } from "@/lib/queries/onboarding";
import { cn } from "@/lib/utils";
import { IsoIcon } from "@/components/Illustrations/Isometric/IsoIcon";
import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { resolveActionArt, resolveCelebrationArt, resolveRegressionArt } from "./activation-art";
import { ActivationTrack } from "./activation-track";
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
			{data.metaTeste ? <TrialGoalPanel goal={data.metaTeste} /> : null}
			<WhatsappChannelNotice enabled={enabled} />
		</>
	);
}

/**
 * A meta que a loja aceitou no onboarding, acompanhada depois da ativação enquanto o teste dura:
 * compromisso pequeno e fechável, com o progresso à vista.
 */
function TrialGoalPanel({ goal }: { goal: NonNullable<TActivation["metaTeste"]> }) {
	const reached = goal.atual >= goal.alvo;
	const percent = Math.min(100, Math.round((goal.atual / goal.alvo) * 100));
	// A data chega como texto (JSON); nada de fuso local deslocando o dia.
	const until = new Date(goal.fim).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
	return (
		<Panel>
			<Panel.Header title="Meta do teste" hint={`até ${until}`} />
			<Panel.Body>
				<div className="flex items-center gap-3">
					<IsoIcon icon="target" className="size-12 shrink-0" />
					<p className="text-sm">
						<span className="font-black text-2xl tabular-nums">{goal.atual.toLocaleString("pt-BR")}</span>
						<span className="text-muted-foreground"> de {goal.alvo} clientes de volta depois de uma campanha</span>
					</p>
				</div>
				<div
					className="h-2 w-full overflow-hidden rounded-full bg-muted"
					role="meter"
					aria-label="Meta do teste"
					aria-valuemin={0}
					aria-valuemax={goal.alvo}
					aria-valuenow={Math.min(goal.atual, goal.alvo)}
				>
					<div className={cn("h-full rounded-full", reached ? "bg-success" : "bg-primary")} style={{ width: `${percent}%` }} />
				</div>
				<p className="text-sm text-muted-foreground">
					{reached
						? "Meta batida: as campanhas estão trazendo clientes de volta."
						: `${goal.alvo - goal.atual === 1 ? "Falta 1 cliente" : `Faltam ${goal.alvo - goal.atual} clientes`}. Cada compra de quem recebeu uma campanha conta.`}
				</p>
			</Panel.Body>
		</Panel>
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
		<div className="flex items-center gap-3 rounded-xl bg-success-surface px-3 py-3 text-success-surface-foreground" role="status">
			<IsoIcon icon={resolveCelebrationArt(celebration)} className="size-12 shrink-0" />
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

type ActivationPanelProps = {
	activation: TActivation;
	celebration?: TCelebrationState;
};

/**
 * Cada ação, regressão e celebração vem com uma cena isométrica do kit do blog (activation-art.ts):
 * a cena diz de que se trata antes do texto, e fica ao lado do botão, sem custar altura.
 */
export function ActivationPanel({ activation, celebration }: ActivationPanelProps) {
	const next = activation.proximaAcao;
	if (activation.regressao) {
		return (
			<Panel>
				<Panel.Header title={REGRESSION_TITLE[activation.regressao.motivo]} />
				<Panel.Body>
					<div className="flex items-center gap-4">
						<IsoIcon icon={resolveRegressionArt(activation)} className="size-16 shrink-0 sm:size-20" />
						{next ? <NextAction action={next} segmento={activation.segmento} /> : null}
					</div>
				</Panel.Body>
			</Panel>
		);
	}

	return (
		<Panel>
			<Panel.Header title="Primeiros passos" hint={`${activation.progresso.feitos} de ${activation.progresso.total} feitos`} />
			<Panel.Body>
				{celebration?.value ? <CelebrationNote celebration={celebration.value} onDismiss={celebration.dismiss} /> : null}
				<div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-0">
					{/* A ação vem antes no DOM: no celular fica no topo, e o leitor de tela ouve o que fazer
					    antes da escada. No desktop ela vai para a direita, separada por um fio, sem virar um
					    cartão dentro do cartão. */}
					<div className="flex items-center gap-4 border-border border-b pb-5 lg:order-last lg:border-b-0 lg:border-l lg:pb-0 lg:pl-6">
						<IsoIcon icon={resolveActionArt(next?.chave)} className="size-16 shrink-0 sm:size-20" />
						{next ? (
							<NextAction action={next} segmento={activation.segmento} />
						) : (
							<p className="text-sm text-muted-foreground">Nada pendente por enquanto.</p>
						)}
					</div>
					<div className="min-w-0 lg:pr-6">
						<ActivationTrack marcos={activation.marcos} actionKey={next?.chave ?? null} />
					</div>
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
				<Button asChild size="sm" className="h-auto min-h-9 w-fit max-w-full gap-1.5 py-2 font-bold whitespace-normal">
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
