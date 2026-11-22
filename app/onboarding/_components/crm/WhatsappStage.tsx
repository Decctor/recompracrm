"use client";

import { MetaIcon, WhatsappIcon } from "@/components/icons";
import { Callout } from "@/components/ui/callout";
import { WhatsappChannelSteps } from "@/components/WhatsappConnections/WhatsappChannelSteps";
import { WhatsappConnectPreparation } from "@/components/WhatsappConnections/WhatsappConnectPreparation";
import { WhatsappConnectResultNotice } from "@/components/WhatsappConnections/WhatsappConnectResultNotice";
import type { TOnboardingReadiness } from "@/lib/onboarding/readiness";
import { useWhatsappChannelStatus } from "@/lib/queries/whatsapp-connections";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { ReadinessPill } from "../shared/ReadinessPill";

/*
 * Etapa WhatsApp do onboarding. Antes de conectar: o que ter em mãos e quais telas da Meta vêm
 * (WhatsappConnectPreparation). Depois: os cinco passos do canal, com o teste de envio que
 * verifica o pagamento na Meta (WhatsappChannelSteps). A conexão por QR Code não é oferecida
 * aqui: a jornada leva ao WhatsApp oficial; o QR continua em Configurações.
 * Desenho: docs/onboarding/whatsapp-connection-activation.md.
 */

const CONNECT_HREF = "/api/integrations/whatsapp/auth?redirectTo=/onboarding";

type WhatsappStageProps = {
	whatsapp: TOnboardingReadiness["whatsapp"] | null;
	onConnectionChanged: () => void;
	onConfirmPayment: (input: { telefoneId: string; confirmado: boolean }) => void;
	isConfirmingPayment: boolean;
};

const TEMPLATE_STATUS_LABEL = {
	RASCUNHO: "Não enviado",
	EM_ANALISE: "Em análise",
	APROVADO: "Aprovado",
	REJEITADO: "Rejeitado",
	PAUSADO: "Pausado",
} as const;
const TEMPLATE_STATUS_TONE = { RASCUNHO: "pendente", EM_ANALISE: "andamento", APROVADO: "ok", REJEITADO: "falhou", PAUSADO: "falhou" } as const;

function SectionLabel({ children }: { children: string }) {
	return <p className="text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{children}</p>;
}

function OfficialHeader({ pill }: { pill?: ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="flex items-start gap-3">
				<span className="flex shrink-0 items-center">
					<span className="z-10 flex size-9 items-center justify-center rounded-full border border-border bg-background">
						<MetaIcon className="size-4 text-[#0869E1]" />
					</span>
					<span className="-ml-2 flex size-9 items-center justify-center rounded-full border border-border bg-background">
						<WhatsappIcon className="size-4 text-whatsapp" />
					</span>
				</span>
				<div className="flex flex-col gap-0.5">
					<p className="text-sm font-bold">WhatsApp oficial da Meta</p>
					<p className="text-sm text-muted-foreground">
						O número do app WhatsApp Business continua no celular e passa a mandar campanhas pela Meta. Leva uns 5 minutos.
					</p>
				</div>
			</div>
			{pill}
		</div>
	);
}

export function WhatsappStage({ whatsapp, onConnectionChanged, onConfirmPayment, isConfirmingPayment }: WhatsappStageProps) {
	const queryClient = useQueryClient();
	const hasOfficial = whatsapp?.tipoConexao === "META_CLOUD_API" && whatsapp.telefones.length > 0;
	const channel = useWhatsappChannelStatus({ enabled: hasOfficial });

	// O readiness é a fonte do pagamento confirmado e do estado do número; quando muda, os passos também.
	const paymentKey = whatsapp?.telefones.map((phone) => `${phone.id}:${phone.pagamento}`).join("|") ?? "";
	useEffect(() => {
		if (hasOfficial) void queryClient.invalidateQueries({ queryKey: ["whatsapp-channel-status"] });
	}, [paymentKey, whatsapp?.numero, hasOfficial, queryClient]);

	const gatewayConnected = whatsapp?.tipoConexao === "INTERNAL_GATEWAY" && whatsapp.numero === "CONECTADO";

	return (
		<div className="flex w-full max-w-[640px] flex-col gap-6">
			<WhatsappConnectResultNotice onConnected={onConnectionChanged} />

			{hasOfficial ? (
				<section className="flex flex-col gap-3">
					<SectionLabel>Canal de envio</SectionLabel>
					<div className="flex flex-col gap-5 rounded-xl border border-border p-4">
						<OfficialHeader
							pill={
								channel.data ? (
									<ReadinessPill tone={channel.data.pronto ? "ok" : "andamento"}>{channel.data.pronto ? "Pronto" : "Configurando"}</ReadinessPill>
								) : null
							}
						/>
						{channel.isLoading ? (
							<p className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								Conferindo o número com a Meta…
							</p>
						) : channel.isError ? (
							<Callout.Root tone="warning">
								<Callout.Description>Não deu para conferir o canal agora. Recarregue a página em instantes.</Callout.Description>
							</Callout.Root>
						) : (
							channel.data?.telefones.map((phone) => (
								<WhatsappChannelSteps
									key={phone.id}
									phone={phone}
									destinoSugerido={channel.data.destinoSugerido}
									connectHref={CONNECT_HREF}
									onConfirmPayment={(telefoneId) => onConfirmPayment({ telefoneId, confirmado: true })}
									isConfirmingPayment={isConfirmingPayment}
								/>
							))
						)}
						<a href={CONNECT_HREF} className="flex w-fit items-center gap-1 text-sm font-semibold text-primary">
							<Plus className="size-4" />
							Conectar outro número
						</a>
					</div>
				</section>
			) : (
				<section className="flex flex-col gap-3">
					<SectionLabel>Número</SectionLabel>
					<div className="flex flex-col gap-5 rounded-xl border border-border p-4">
						<OfficialHeader />
						{gatewayConnected ? (
							<Callout.Root tone="info">
								<Callout.Description>
									Sua empresa já envia por QR Code ({whatsapp.telefones.map((phone) => phone.numero).join(", ")}). Pode seguir assim; conectar o WhatsApp
									oficial libera modelos aprovados e envios em volume.
								</Callout.Description>
							</Callout.Root>
						) : null}
						<WhatsappConnectPreparation connectHref={CONNECT_HREF} />
					</div>
					{!gatewayConnected ? (
						<p className="text-xs text-muted-foreground">Pode seguir e preparar as campanhas agora. Os envios esperam a conexão.</p>
					) : null}
				</section>
			)}

			{hasOfficial && whatsapp.templates.length > 0 ? (
				<section className="flex flex-col gap-3">
					<SectionLabel>Modelos das campanhas</SectionLabel>
					<ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
						{whatsapp.templates.map((template) => (
							<li key={template.id} className="flex items-center justify-between gap-3 px-4 py-3">
								<span className="min-w-0 truncate text-sm font-semibold">{template.nome}</span>
								<ReadinessPill tone={TEMPLATE_STATUS_TONE[template.status]}>{TEMPLATE_STATUS_LABEL[template.status]}</ReadinessPill>
							</li>
						))}
					</ul>
					<p className="text-xs text-muted-foreground">A aprovação depende da Meta e não tem prazo fixo. As campanhas ficam preparadas enquanto isso.</p>
				</section>
			) : null}
		</div>
	);
}
