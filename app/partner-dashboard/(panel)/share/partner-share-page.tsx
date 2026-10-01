"use client";

import { ControlPlatformPartnerShareMessage } from "@/components/Modals/PlatformPartners/ControlPlatformPartnerShareMessage";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { getErrorMessage } from "@/lib/errors";
import {
	PLATFORM_PARTNER_COOKIE_MAX_AGE_SECONDS,
	buildPlatformPartnerShareMessage,
	getPlatformPartnerReferralLink,
} from "@/lib/platform-partnerships/constants";
import { usePlatformPartnerDashboard } from "@/lib/queries/platform-partnerships";
import { useQueryClient } from "@tanstack/react-query";
import { Download, MessageCircle, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PanelBody, TopSheet } from "../../_components/partner-shell";
import { PanelCard, PanelSkeleton } from "../../_components/partner-ui";
import { ReferralQrCode, useReferralQrDataUrl } from "../../_components/referral-qr-code";

const ATTRIBUTION_DAYS = Math.round(PLATFORM_PARTNER_COOKIE_MAX_AGE_SECONDS / 86400);

export default function PartnerSharePage() {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, error, queryKey } = usePlatformPartnerDashboard();
	const [copied, setCopied] = useState(false);
	const [editingMessage, setEditingMessage] = useState(false);
	const link = data?.partner ? getPlatformPartnerReferralLink(data.partner.codigo) : "";
	const qrDataUrl = useReferralQrDataUrl(link || "https://www.recompracrm.com.br");

	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (isLoading || !data?.partner) {
		return (
			<div className="p-4 md:p-0">
				<PanelSkeleton />
			</div>
		);
	}

	const { partner } = data;
	const message = buildPlatformPartnerShareMessage({ mensagem: partner.mensagemDivulgacao, link });
	const displayLink = link.replace(/^https?:\/\/(www\.)?/, "");

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		} catch {
			toast.error("Não foi possível copiar o link.");
		}
	};

	const shareLink = async () => {
		if (typeof navigator.share === "function") {
			try {
				await navigator.share({ title: "RecompraCRM", text: message });
				return;
			} catch (shareError) {
				if (shareError instanceof DOMException && shareError.name === "AbortError") return;
			}
		}
		await copyLink();
		toast.success("Link copiado para compartilhar.");
	};

	return (
		<div className="mx-auto flex w-full max-w-[960px] flex-col md:gap-4">
			<TopSheet className="gap-1.5">
				<span className="text-[11px] font-extrabold tracking-[0.08em] text-primary uppercase">Divulgar</span>
				<h1 className="text-2xl leading-tight font-extrabold tracking-[-0.015em]">Compartilhe seu link</h1>
				<p className="text-sm leading-normal text-muted-foreground">
					Quem se cadastrar pelo link ou informar o código fica vinculado a você por {ATTRIBUTION_DAYS} dias.
				</p>
			</TopSheet>
			<PanelBody className="md:grid md:grid-cols-2 md:items-start md:gap-4 md:p-0">
				<PanelCard className="flex flex-col items-center gap-4 p-5">
					<div className="rounded-[22px] border border-border bg-white p-3.5">
						<ReferralQrCode link={link} size={176} />
					</div>
					<div className="flex flex-col items-center gap-1">
						<span className="text-[11px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase">Código</span>
						<span className="text-[28px] font-extrabold tracking-[0.12em] break-all">{partner.codigo}</span>
					</div>
					<div className="flex w-full items-center gap-2">
						<code className="min-w-0 flex-1 truncate rounded-[14px] bg-muted px-3 py-[11px] font-sans text-[13px] font-semibold">{displayLink}</code>
						<button
							type="button"
							onClick={copyLink}
							className="h-[42px] shrink-0 rounded-[18px] bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-primary/90"
						>
							{copied ? "Copiado" : "Copiar"}
						</button>
					</div>
					<div className="grid w-full grid-cols-2 gap-2">
						<a
							href={qrDataUrl ?? undefined}
							download={`qr-code-${partner.codigo.toLowerCase()}.png`}
							aria-disabled={!qrDataUrl}
							className="flex h-11 items-center justify-center gap-2 rounded-[18px] border border-border bg-card text-sm font-bold transition-colors hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-50"
						>
							<Download className="h-4 w-4" />
							Salvar QR
						</a>
						<button
							type="button"
							onClick={shareLink}
							className="flex h-11 items-center justify-center gap-2 rounded-[18px] border border-border bg-card text-sm font-bold transition-colors hover:bg-muted"
						>
							<Share2 className="h-4 w-4" />
							Compartilhar
						</button>
					</div>
				</PanelCard>

				<div className="flex flex-col gap-3 md:gap-4">
					<PanelCard className="flex flex-col gap-3.5 p-5">
						<div className="flex items-center justify-between">
							<h2 className="text-label text-muted-foreground">Mensagem pronta</h2>
							<button type="button" onClick={() => setEditingMessage(true)} className="text-[13px] font-bold text-primary hover:underline">
								Editar
							</button>
						</div>
						<p className="max-w-[88%] self-start rounded-[18px_18px_18px_6px] bg-muted px-3.5 py-3 text-sm leading-normal text-pretty break-words">
							{message}
						</p>
						<a
							href={`https://wa.me/?text=${encodeURIComponent(message)}`}
							target="_blank"
							rel="noreferrer"
							className="flex h-12 items-center justify-center gap-2 rounded-[18px] bg-whatsapp text-[15px] font-extrabold text-whatsapp-foreground"
						>
							<MessageCircle className="h-[18px] w-[18px]" />
							Enviar no WhatsApp
						</a>
					</PanelCard>

					<PanelCard className="flex flex-col gap-3 p-5">
						<h2 className="text-label text-muted-foreground">Como você ganha</h2>
						<div className="grid grid-cols-3 gap-2">
							<div className="flex flex-col gap-1 rounded-[18px] bg-warning p-3 text-warning-foreground">
								<span className="text-[22px] leading-none font-extrabold">100%</span>
								<span className="text-xs leading-tight font-semibold">1ª mensalidade</span>
							</div>
							<div className="flex flex-col gap-1 rounded-[18px] bg-warning p-3 text-warning-foreground">
								<span className="text-[22px] leading-none font-extrabold">100%</span>
								<span className="text-xs leading-tight font-semibold">3ª mensalidade</span>
							</div>
							<div className="flex flex-col gap-1 rounded-[18px] bg-info-surface p-3 text-info-surface-foreground">
								<span className="text-[22px] leading-none font-extrabold">20%</span>
								<span className="text-xs leading-tight font-semibold">demais, todo mês</span>
							</div>
						</div>
						<span className="text-xs text-muted-foreground">Planos anuais: 27% da fatura. PIX todo dia 10.</span>
					</PanelCard>
				</div>
			</PanelBody>

			{editingMessage ? (
				<ControlPlatformPartnerShareMessage
					mensagemDivulgacao={partner.mensagemDivulgacao}
					closeModal={() => setEditingMessage(false)}
					callbacks={{ onSuccess: () => queryClient.invalidateQueries({ queryKey }) }}
				/>
			) : null}
		</div>
	);
}
