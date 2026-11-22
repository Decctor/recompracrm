"use client";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import type { TWhatsappChannelStatus } from "@/lib/whatsapp/channel-status";
import { getErrorMessage } from "@/lib/errors";
import { formatPhoneAsBase, formatToPhone } from "@/lib/formatting";
import { sendWhatsappConnectionTest } from "@/lib/mutations/whatsapp-connections";
import { useWhatsappConnectionTest } from "@/lib/queries/whatsapp-connections";
import { cn } from "@/lib/utils";
import { describeMessagingLimit, type TChannelStep, type TChannelStepTone } from "@/lib/whatsapp/channel-activation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/*
 * Os cinco passos do canal de um número oficial: conectado → nome aprovado → pagamento na Meta →
 * modelos aprovados → primeira mensagem entregue. Cada passo diz onde a bola está e o que fazer;
 * o teste de envio acontece aqui mesmo, sem sair da tela. Regras: lib/whatsapp/channel-activation.ts.
 */

type TChannelPhone = TWhatsappChannelStatus["telefones"][number];

type WhatsappChannelStepsProps = {
	phone: TChannelPhone;
	/** WhatsApp de quem está configurando, para receber o teste. */
	destinoSugerido: string | null;
	/** Para onde vão "Conectar" e "Reconectar" (o fluxo da Meta, com a volta para esta tela). */
	connectHref: string;
	/** "Já cadastrei" no passo de pagamento, onde a tela oferece a confirmação manual (onboarding). */
	onConfirmPayment?: (telefoneId: string) => void;
	isConfirmingPayment?: boolean;
	className?: string;
};

const MARKER_CLASSES: Record<TChannelStepTone, string> = {
	ok: "bg-success text-white",
	andamento: "border border-border bg-muted text-foreground",
	// "A bola está com você": mesmo âmbar do ReadinessPill pendente.
	pendente: "bg-brand/20 text-brand-foreground dark:text-foreground",
	falhou: "bg-destructive text-white",
};

const SITUATION_CLASSES: Record<TChannelStepTone, string> = {
	ok: "text-success",
	andamento: "text-muted-foreground",
	pendente: "text-foreground",
	falhou: "text-destructive",
};

const QUALITY_LABEL = { GREEN: "Alta", YELLOW: "Média", RED: "Baixa", NA: null, UNKNOWN: null } as const;

function StepMarker({ tone, index }: { tone: TChannelStepTone; index: number }) {
	return (
		<span
			aria-hidden
			className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums", MARKER_CLASSES[tone])}
		>
			{tone === "ok" ? <Check className="size-3.5" strokeWidth={3} /> : tone === "falhou" ? <X className="size-3.5" strokeWidth={3} /> : index + 1}
		</span>
	);
}

export function WhatsappChannelSteps({
	phone,
	destinoSugerido,
	connectHref,
	onConfirmPayment,
	isConfirmingPayment,
	className,
}: WhatsappChannelStepsProps) {
	const queryClient = useQueryClient();
	const [testOpen, setTestOpen] = useState(false);
	const { canal } = phone;

	// Estado vivo do teste: a tela abre, consulta a aprovação do modelo na Meta e, enquanto espera a
	// aprovação ou a entrega, consulta de novo. Quando muda, os passos são recalculados no servidor.
	// Só enquanto a entrega não está provada: um número que já entregou campanha não ganha modelo de teste.
	const deliveryOpen = canal.passos.some((step) => step.chave === "entrega" && step.tom !== "ok");
	const liveTest = useWhatsappConnectionTest({ telefoneId: phone.id, enabled: deliveryOpen });
	const liveStatus = liveTest.data?.status;
	const lastStatus = useRef(phone.teste?.status);
	useEffect(() => {
		if (!liveStatus || liveStatus === lastStatus.current) return;
		lastStatus.current = liveStatus;
		queryClient.invalidateQueries({ queryKey: ["whatsapp-channel-status"] });
		if (liveStatus === "ENTREGUE") setTestOpen(false);
	}, [liveStatus, queryClient]);

	const quality = phone.meta?.qualidade ? QUALITY_LABEL[phone.meta.qualidade] : null;
	const limit = describeMessagingLimit(phone.meta?.limiteEnvio ?? null);

	function renderAction(step: TChannelStep) {
		const action = step.acao;
		if (!action) return null;
		switch (action.tipo) {
			case "CONECTAR":
			case "RECONECTAR":
				return (
					<Button asChild size="sm" className="font-bold">
						<a href={connectHref}>{action.tipo === "CONECTAR" ? "Conectar com a Meta" : "Reconectar"}</a>
					</Button>
				);
			case "LINK": {
				const external = action.href.startsWith("http");
				return (
					<Button asChild size="sm" variant={step.tom === "falhou" ? "default" : "outline"} className="gap-1.5">
						<a href={action.href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
							{action.rotulo}
							{external ? <ExternalLink className="size-3.5" /> : null}
						</a>
					</Button>
				);
			}
			case "ENVIAR_TESTE":
				return testOpen ? null : (
					<Button size="sm" variant={step.chave === "entrega" ? "default" : "outline"} className="gap-1.5" onClick={() => setTestOpen(true)}>
						<Send className="size-3.5" />
						{step.tom === "falhou" ? "Enviar o teste de novo" : "Enviar mensagem de teste"}
					</Button>
				);
			case "CONFIRMAR_PAGAMENTO":
				return null;
		}
	}

	return (
		<div className={cn("flex flex-col gap-4", className)}>
			<div className="flex flex-col gap-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<p className="text-sm font-bold">
						{phone.nome} <span className="font-semibold text-muted-foreground">· {phone.numero}</span>
					</p>
					<p className={cn("text-xs font-bold", canal.pronto ? "text-success" : "text-muted-foreground")}>
						{canal.pronto ? "Pronto para campanhas" : `${canal.concluidos} de ${canal.total} passos`}
					</p>
				</div>
				<div aria-hidden className="grid grid-cols-5 gap-1">
					{Array.from({ length: canal.total }, (_, index) => {
						const step = canal.passos[index];
						return (
							<span
								key={index}
								className={cn(
									"h-1 rounded-full",
									step?.tom === "ok"
										? "bg-success"
										: step?.tom === "falhou"
											? "bg-destructive"
											: step?.chave === canal.proximo?.chave
												? "bg-brand"
												: "bg-muted",
								)}
							/>
						);
					})}
				</div>
			</div>

			<ol className="flex flex-col divide-y divide-border rounded-xl border border-border">
				{canal.passos.map((step, index) => {
					const isNext = step.chave === canal.proximo?.chave;
					const showDetail = step.tom !== "ok" || isNext;
					const action = renderAction(step);
					const offerManualPayment = step.chave === "pagamento" && step.tom === "pendente" && onConfirmPayment;
					const showTestForm =
						testOpen &&
						step.acao?.tipo === "ENVIAR_TESTE" &&
						(step.chave === "entrega" || !canal.passos.some((other) => other.chave === "entrega" && other.acao?.tipo === "ENVIAR_TESTE"));
					return (
						<li key={step.chave} className={cn("flex items-start gap-3 px-4 py-3", isNext && "bg-muted/30")} aria-current={isNext ? "step" : undefined}>
							<StepMarker tone={step.tom} index={index} />
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
									<p className="text-sm font-bold">{step.titulo}</p>
									<p className={cn("text-xs font-bold", SITUATION_CLASSES[step.tom])}>{step.situacao}</p>
								</div>
								{showDetail && step.detalhe ? <p className="text-sm text-muted-foreground">{step.detalhe}</p> : null}
								{action || offerManualPayment ? (
									<div className="flex flex-wrap items-center gap-2 pt-1">
										{action}
										{offerManualPayment ? (
											<Button size="sm" variant="ghost" disabled={isConfirmingPayment} onClick={() => onConfirmPayment(phone.id)}>
												Já cadastrei o pagamento
											</Button>
										) : null}
									</div>
								) : null}
								{showTestForm ? <ConnectionTestForm phone={phone} destinoSugerido={destinoSugerido} onCancel={() => setTestOpen(false)} /> : null}
							</div>
						</li>
					);
				})}
			</ol>

			{quality || limit ? (
				<p className="text-xs text-muted-foreground">
					{quality ? (
						<>
							Qualidade do número na Meta: <span className="font-semibold text-foreground">{quality}</span>
						</>
					) : null}
					{quality && limit ? " · " : null}
					{limit ? (
						<>
							Limite de envio: <span className="font-semibold text-foreground">{limit}</span>
						</>
					) : null}
				</p>
			) : null}
		</div>
	);
}

function ConnectionTestForm({ phone, destinoSugerido, onCancel }: { phone: TChannelPhone; destinoSugerido: string | null; onCancel: () => void }) {
	const queryClient = useQueryClient();
	const [destino, setDestino] = useState(() => (destinoSugerido ? formatToPhone(destinoSugerido) : ""));
	// A mensagem sai do número conectado; mandar para ele mesmo não chega em lugar nenhum.
	const sameAsConnected = !!destino && formatPhoneAsBase(destino) !== "" && formatPhoneAsBase(destino) === formatPhoneAsBase(phone.numero);
	const send = useMutation({
		mutationKey: ["send-whatsapp-connection-test", phone.id],
		mutationFn: sendWhatsappConnectionTest,
		onSuccess: (data) => {
			if (data.data.teste.status === "ENVIADO") toast.success(data.message);
			else toast.error(data.message);
			queryClient.setQueryData(["whatsapp-connection-test", phone.id], data.data.teste);
			queryClient.invalidateQueries({ queryKey: ["whatsapp-channel-status"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	return (
		<form
			className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-background p-3"
			onSubmit={(event) => {
				event.preventDefault();
				if (!sameAsConnected) send.mutate({ telefoneId: phone.id, destino });
			}}
		>
			<label htmlFor={`connection-test-${phone.id}`} className="text-xs font-bold">
				Enviar para qual WhatsApp?
			</label>
			<div className="flex flex-col gap-2 sm:flex-row">
				<Input
					id={`connection-test-${phone.id}`}
					inputMode="tel"
					autoComplete="tel"
					placeholder="(34) 99999-0000"
					value={destino}
					onChange={(event) => setDestino(formatToPhone(event.target.value))}
					className="sm:max-w-56"
				/>
				<div className="flex gap-2">
					<Button
						type="submit"
						size="default"
						className="gap-1.5 font-bold"
						disabled={send.isPending || sameAsConnected || destino.replace(/\D/g, "").length < 10}
					>
						{send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
						Enviar
					</Button>
					<Button type="button" variant="ghost" onClick={onCancel}>
						Cancelar
					</Button>
				</div>
			</div>
			{sameAsConnected ? (
				<Callout.Root tone="warning">
					<Callout.Description>
						Esse é o número conectado. Use outro WhatsApp, como o seu pessoal: a mensagem sai do número da empresa.
					</Callout.Description>
				</Callout.Root>
			) : (
				<p className="text-xs text-muted-foreground">
					Uma mensagem curta sai do número da empresa. A Meta cobra como uma mensagem de campanha, centavos.
				</p>
			)}
		</form>
	);
}
