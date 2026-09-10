"use client";

import { MetaIcon, WhatsappIcon } from "@/components/icons";
import { InternalGatewayQRConnect } from "@/components/Settings/InternalGatewayQRConnect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { TOnboardingReadiness } from "@/lib/onboarding/readiness";
import { ChevronDown, QrCode } from "lucide-react";
import { useState } from "react";
import { ReadinessPill } from "../shared/ReadinessPill";

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

export function WhatsappStage({ whatsapp, onConnectionChanged, onConfirmPayment, isConfirmingPayment }: WhatsappStageProps) {
	const [showOtherOptions, setShowOtherOptions] = useState(false);
	const [showQrConnect, setShowQrConnect] = useState(false);

	const connected = whatsapp?.numero === "CONECTADO";
	const metaPhone = whatsapp?.tipoConexao === "META_CLOUD_API" ? (whatsapp.telefones[0] ?? null) : null;
	const paymentConfirmed = metaPhone ? metaPhone.pagamento === "CONFIRMADO_PELO_USUARIO" || metaPhone.pagamento === "VERIFICADO" : false;
	const paymentLocked = metaPhone ? metaPhone.pagamento === "VERIFICADO" || metaPhone.pagamento === "PENDENTE" : false;

	return (
		<>
			<div className="flex w-full max-w-[640px] flex-col gap-6">
				<section className="flex flex-col gap-3">
					<p className="text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Número</p>
					<div className="flex flex-col gap-4 rounded-xl border border-border p-4">
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
									<p className="text-sm text-muted-foreground">Caminho recomendado: templates aprovados pela Meta, envios em volume e número verificado.</p>
								</div>
							</div>
							{whatsapp ? (
								<ReadinessPill tone={connected ? "ok" : whatsapp.numero === "NENHUM" ? "pendente" : "falhou"}>
									{connected ? "Conectado" : whatsapp.numero === "NENHUM" ? "Não conectado" : whatsapp.numero === "EXPIRADO" ? "Expirado" : "Desconectado"}
								</ReadinessPill>
							) : null}
						</div>

						{whatsapp && whatsapp.telefones.length > 0 ? (
							<ul className="flex flex-wrap gap-2">
								{whatsapp.telefones.map((phone) => (
									<li key={phone.id} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">
										{phone.nome} · {phone.numero}
									</li>
								))}
							</ul>
						) : null}

						<div>
							<Button asChild size="sm" variant={connected ? "outline" : "default"} className="font-bold">
								<a href="/api/integrations/whatsapp/auth?redirectTo=/onboarding">{connected ? "Adicionar outro número" : "Conectar com a Meta"}</a>
							</Button>
						</div>
					</div>
				</section>

				{metaPhone ? (
					<section className="flex flex-col gap-3">
						<p className="text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Pagamento</p>
						<div className="flex items-start gap-3 rounded-xl border border-border p-4">
							<Checkbox
								id="payment-confirmed"
								checked={paymentConfirmed}
								disabled={paymentLocked || isConfirmingPayment}
								onCheckedChange={(checked) => onConfirmPayment({ telefoneId: metaPhone.id, confirmado: checked === true })}
								className="mt-0.5"
							/>
							<div className="flex flex-col gap-0.5">
								<label htmlFor="payment-confirmed" className="cursor-pointer text-sm font-bold">
									Já cadastrei uma forma de pagamento na conta da Meta
								</label>
								<p className="text-sm text-muted-foreground">
									Sem ela a Meta recusa os envios. Confirmamos na primeira entrega; se a Meta recusar, avisamos aqui.
									{metaPhone.pagamento === "PENDENTE" ? " A Meta recusou um envio recente por falta de pagamento." : ""}
									{metaPhone.pagamento === "VERIFICADO" ? " Já verificado por uma entrega." : ""}
								</p>
							</div>
						</div>
					</section>
				) : null}

				{whatsapp && whatsapp.templates.length > 0 && whatsapp.tipoConexao === "META_CLOUD_API" ? (
					<section className="flex flex-col gap-3">
						<p className="text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Templates das campanhas</p>
						<ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
							{whatsapp.templates.map((template) => (
								<li key={template.id} className="flex items-center justify-between gap-3 px-4 py-3">
									<span className="truncate text-sm font-semibold">{template.nome}</span>
									<ReadinessPill tone={TEMPLATE_STATUS_TONE[template.status]}>{TEMPLATE_STATUS_LABEL[template.status]}</ReadinessPill>
								</li>
							))}
						</ul>
						<p className="text-xs text-muted-foreground">A aprovação depende da Meta e não tem prazo fixo. As campanhas ficam preparadas enquanto isso.</p>
					</section>
				) : null}

				{!connected ? (
					<div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
						Você pode preparar suas campanhas agora. Os envios ficam pendentes até concluir a configuração.
					</div>
				) : null}

				<section className="flex flex-col gap-2">
					<button
						type="button"
						onClick={() => setShowOtherOptions((current) => !current)}
						aria-expanded={showOtherOptions}
						className="flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
					>
						Outras opções
						<ChevronDown className={showOtherOptions ? "size-3.5 rotate-180 transition-transform" : "size-3.5 transition-transform"} />
					</button>
					{showOtherOptions ? (
						<div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-border p-4 sm:flex-row sm:items-center">
							<div className="flex flex-col gap-0.5">
								<p className="text-sm font-bold">Conexão por QR Code</p>
								<p className="text-sm text-muted-foreground">Escaneie como no WhatsApp Web. Não usa templates aprovados e tem limites de volume.</p>
							</div>
							<Button size="sm" variant="outline" onClick={() => setShowQrConnect(true)} className="shrink-0 gap-1.5">
								<QrCode className="size-4" />
								Conectar
							</Button>
						</div>
					) : null}
				</section>
			</div>

			{showQrConnect ? (
				<InternalGatewayQRConnect
					onBack={() => setShowQrConnect(false)}
					onSuccess={() => {
						setShowQrConnect(false);
						onConnectionChanged();
					}}
				/>
			) : null}
		</>
	);
}
