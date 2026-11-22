"use client";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { getErrorMessage } from "@/lib/errors";
import { requestWhatsappAssist } from "@/lib/mutations/onboarding";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronDown, Headset, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/*
 * Antes do salto para a Meta. A conexão acontece fora do RecompraCRM (Facebook no computador, app
 * WhatsApp Business no celular) e costuma travar por falta de algo que a pessoa não sabia que
 * precisava. Aqui ela descobre antes: onde o número está, o que ter em mãos e quais telas vêm.
 * Sequência das telas: docs/onboarding/whatsapp-connection-activation.md.
 */

type TNumberOrigin = "BUSINESS" | "PESSOAL" | "NOVO";

const ORIGINS: { id: TNumberOrigin; label: string }[] = [
	{ id: "BUSINESS", label: "No app WhatsApp Business" },
	{ id: "PESSOAL", label: "No WhatsApp comum (pessoal)" },
	{ id: "NOVO", label: "É um número novo" },
];

const ORIGIN_GUIDANCE: Record<Exclude<TNumberOrigin, "BUSINESS">, string> = {
	PESSOAL:
		"A conexão oficial só funciona com o app WhatsApp Business. Instale o WhatsApp Business no mesmo celular e transfira o número para ele: o app traz as conversas junto. Depois volte aqui.",
	NOVO: "Ative o número no app WhatsApp Business primeiro e use-o por alguns dias com os clientes. Com o número no app, a conexão leva uns 5 minutos.",
};

export const WHATSAPP_CONNECT_PREREQUISITES = [
	{ title: "O celular com o número à mão", sub: "você confirma a conexão dentro do app WhatsApp Business" },
	{ title: "App WhatsApp Business atualizado", sub: "versão 2.24.17 ou mais nova" },
	{ title: "Facebook de quem administra a empresa", sub: "com controle total do portfólio empresarial na Meta" },
	{ title: "Um cartão para cadastrar na Meta", sub: "a Meta cobra cada mensagem de campanha direto da sua conta, sem passar por nós" },
] as const;

const GUIDE_STEPS: { surface: "COMPUTADOR" | "CELULAR"; title: string; text: string }[] = [
	{ surface: "COMPUTADOR", title: "Entre com o Facebook", text: "Use o Facebook de quem administra a empresa e autorize o RecompraCRM." },
	{ surface: "COMPUTADOR", title: "Informe o número do app", text: "Digite o número do WhatsApp Business e confirme o perfil que a Meta mostrar." },
	{
		surface: "COMPUTADOR",
		title: "Escolha o portfólio da empresa",
		text: "Selecione o portfólio empresarial da Meta ou crie um. Ele não muda depois.",
	},
	{
		surface: "COMPUTADOR",
		title: "Deixe a tela com o código aberta",
		text: "Se aparecer um QR code em vez do código, você vai escaneá-lo com o app.",
	},
	{
		surface: "CELULAR",
		title: "Abra a mensagem do Facebook Business",
		text: "Ela chega como uma conversa no app WhatsApp Business. Toque em Conectar.",
	},
	{ surface: "CELULAR", title: "Confirme e escolha o histórico", text: "Decida se compartilha as conversas dos últimos 6 meses e confirme." },
	{ surface: "CELULAR", title: "Cole o código no app", text: "Cole o código mostrado no computador ou aponte a câmera para o QR code." },
	{ surface: "COMPUTADOR", title: "Revise e conclua", text: "Confira nome e fuso horário, revise as permissões e conclua. Você volta para cá." },
];

export function WhatsappConnectPreparation({ connectHref }: { connectHref: string }) {
	const [origin, setOrigin] = useState<TNumberOrigin | null>(null);
	const [showSteps, setShowSteps] = useState(false);
	const [assistRequested, setAssistRequested] = useState(false);
	const assist = useMutation({
		mutationKey: ["request-whatsapp-assist"],
		mutationFn: requestWhatsappAssist,
		onSuccess: (data) => {
			if (data.data.enviado) setAssistRequested(true);
			else toast.error(data.message);
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	return (
		<div className="flex flex-col gap-5">
			<section className="flex flex-col gap-2.5">
				<p className="text-sm font-bold">Onde está o número que vai mandar as campanhas?</p>
				<div role="radiogroup" aria-label="Onde está o número" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
					{ORIGINS.map((option) => {
						const selected = origin === option.id;
						return (
							<button
								key={option.id}
								type="button"
								role="radio"
								aria-checked={selected}
								onClick={() => setOrigin(option.id)}
								className={cn(
									"rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-colors",
									selected
										? "border-primary bg-primary/5 text-foreground"
										: "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
								)}
							>
								{option.label}
							</button>
						);
					})}
				</div>
				{origin && origin !== "BUSINESS" ? (
					<Callout.Root tone="info">
						<Callout.Description>{ORIGIN_GUIDANCE[origin]}</Callout.Description>
					</Callout.Root>
				) : null}
			</section>

			<section className="flex flex-col gap-2.5">
				<p className="text-sm font-bold">Tenha em mãos</p>
				<ul className="flex flex-col gap-2">
					{WHATSAPP_CONNECT_PREREQUISITES.map((item) => (
						<li key={item.title} className="flex items-start gap-2.5">
							<span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
								<Check className="size-3" strokeWidth={3} />
							</span>
							<span className="text-sm">
								<span className="font-semibold">{item.title}</span>
								<span className="text-muted-foreground"> · {item.sub}</span>
							</span>
						</li>
					))}
				</ul>
				<p className="text-xs text-muted-foreground">O WhatsApp Web e outros aparelhos conectados saem na conexão. Depois, é só conectar de novo.</p>
			</section>

			<section className="flex flex-col gap-2">
				<button
					type="button"
					onClick={() => setShowSteps((current) => !current)}
					aria-expanded={showSteps}
					className="flex w-fit items-center gap-1 text-sm font-semibold text-primary"
				>
					Ver as 8 telas da Meta, passo a passo
					<ChevronDown className={cn("size-4 transition-transform", showSteps && "rotate-180")} />
				</button>
				{showSteps ? (
					<ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
						{GUIDE_STEPS.map((step, index) => {
							const SurfaceIcon = step.surface === "CELULAR" ? Smartphone : Monitor;
							return (
								<li key={step.title} className="flex items-start gap-3 px-3 py-2.5">
									<span className="w-5 shrink-0 pt-0.5 text-xs font-extrabold tabular-nums text-primary">{index + 1}</span>
									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
											{step.title}
											<span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase">
												<SurfaceIcon className="size-3" />
												{step.surface === "CELULAR" ? "No celular" : "No computador"}
											</span>
										</p>
										<p className="text-sm text-muted-foreground">{step.text}</p>
									</div>
								</li>
							);
						})}
					</ol>
				) : null}
			</section>

			<div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
				<Button asChild className="font-bold">
					<a href={connectHref}>Conectar com a Meta</a>
				</Button>
				{assistRequested ? (
					<p className="flex items-center gap-1.5 text-sm font-semibold text-success">
						<Check className="size-4" />
						Pedido recebido: vamos te chamar em até 1 dia útil.
					</p>
				) : (
					<Button variant="ghost" size="sm" className="gap-1.5" disabled={assist.isPending} onClick={() => assist.mutate()}>
						<Headset className="size-4" />
						{assist.isPending ? "Enviando…" : "Prefere fazer junto? Quero ajuda para conectar"}
					</Button>
				)}
			</div>
		</div>
	);
}
