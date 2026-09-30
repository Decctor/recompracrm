"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import { getErrorMessage } from "@/lib/errors";
import { buildPlatformPartnerShareMessage, getPlatformPartnerReferralLink } from "@/lib/platform-partnerships/constants";
import { formatPartnerDate } from "@/lib/platform-partnerships/earnings";
import { updatePlatformPartnerMe } from "@/lib/mutations/platform-partnerships";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Check, Clock3, MessageCircle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CardLogo } from "./partner-card";
import { PARTNER_CARD_SURFACE, type TPillTone, Pill } from "./partner-ui";

export function StatusFrame({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-dvh w-full items-start justify-center bg-muted md:items-center md:p-6">
			<div className="flex w-full max-w-[440px] flex-col bg-card text-numeric max-md:min-h-dvh md:rounded-[26px] md:shadow-[0_12px_24px_rgba(0,0,0,0.08),0_4px_8px_rgba(0,0,0,0.04)]">
				{children}
			</div>
		</div>
	);
}

const STATUS_CONTENT: Record<
	string,
	{ tone: TPillTone; label: string; title: string; text: string; icon: typeof Clock3; action?: { href: string; label: string } }
> = {
	PENDENTE_APROVACAO: {
		tone: "warning",
		label: "Em análise",
		icon: Clock3,
		title: "Recebemos seu cadastro",
		text:
			"Nosso financeiro está validando seus dados e o documento. Assim que o cadastro for aprovado, seu cartão de parceiro é emitido e o painel completo é liberado aqui.",
		action: { href: "/partner-dashboard/onboarding", label: "Revisar meus dados" },
	},
	SUSPENSO: {
		tone: "warning",
		label: "Suspenso",
		icon: ShieldAlert,
		title: "Acesso suspenso",
		text: "Seu acesso ao programa está temporariamente suspenso. Fale com o nosso time para regularizar seu cadastro.",
	},
	REJEITADO: {
		tone: "danger",
		label: "Não aprovado",
		icon: ShieldAlert,
		title: "Cadastro não aprovado",
		text: "Não foi possível aprovar seu cadastro com os dados enviados. Revise as informações e o documento e envie novamente.",
		action: { href: "/partner-dashboard/onboarding", label: "Corrigir e reenviar" },
	},
};

/** Telas de quem ainda não tem painel: em análise, suspenso ou não aprovado. */
export function PartnerStatusScreen({ status, nome, motivoRejeicao = null }: { status: string; nome: string; motivoRejeicao?: string | null }) {
	const content = STATUS_CONTENT[status] ?? {
		tone: "neutral" as const,
		label: status,
		icon: ShieldAlert,
		title: "Acesso indisponível",
		text: "Entre em contato com o nosso time para revisar seu cadastro.",
	};
	const Icon = content.icon;
	return (
		<StatusFrame>
			<div className="flex items-center gap-3 px-5 pt-[max(20px,env(safe-area-inset-top))]">
				<BrandLogo lockup="icon-badge" tone="color" width={36} height={36} className="rounded-full" />
				<div className="flex flex-col gap-[3px]">
					<span className="text-[11px] leading-none font-extrabold tracking-[0.08em] text-primary uppercase">Programa de Parcerias</span>
					<span className="text-xl leading-tight font-extrabold tracking-[-0.015em]">Olá, {nome.split(" ")[0]}</span>
				</div>
			</div>
			<div className="flex flex-1 flex-col gap-5 px-5 pt-8 pb-8">
				<span
					className={cn(
						"flex h-14 w-14 items-center justify-center rounded-[18px]",
						content.tone === "danger" ? "bg-destructive-surface text-destructive-surface-foreground" : "bg-warning-surface text-warning-surface-foreground",
					)}
				>
					<Icon className="h-6 w-6" />
				</span>
				<div className="flex flex-col gap-2.5">
					<Pill tone={content.tone}>{content.label}</Pill>
					<h1 className="text-[28px] leading-[1.15] font-extrabold tracking-[-0.015em]">{content.title}</h1>
					<p className="text-[15px] leading-relaxed text-muted-foreground">{content.text}</p>
					{status === "REJEITADO" && motivoRejeicao ? (
						<div className="flex flex-col gap-1 rounded-[18px] bg-destructive-surface px-4 py-3.5 text-destructive-surface-foreground">
							<span className="text-[11px] font-extrabold tracking-[0.08em] uppercase">O que corrigir</span>
							<p className="text-sm leading-normal">{motivoRejeicao}</p>
						</div>
					) : null}
				</div>
				{content.action ? (
					<Link
						href={content.action.href}
						className="mt-auto flex h-12 items-center justify-center rounded-[18px] border border-border bg-card text-sm font-bold transition-colors hover:bg-muted"
					>
						{content.action.label}
					</Link>
				) : null}
			</div>
		</StatusFrame>
	);
}

const easeOut = (x: number) => 1 - (1 - x) ** 3;
const backOut = (x: number) => {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Linha do tempo em ms do "cartão emitido"; com movimento reduzido, pula para o fim. */
function useIssueTimeline(total: number) {
	const [t, setT] = useState(0);
	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setT(total);
			return;
		}
		let frame = 0;
		const start = performance.now();
		const tick = (now: number) => {
			const elapsed = now - start;
			setT(elapsed);
			if (elapsed < total) frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [total]);
	return t;
}

/**
 * Primeiro acesso depois da aprovação: o cartão sai da "impressora", o código aparece letra a letra
 * e o selo confirma. Roda uma vez — "Ir para o painel" grava `dataCartaoVisualizado`.
 */
export function CardIssuedScreen({
	nome,
	codigo,
	dataAprovacao,
	mensagemDivulgacao,
}: {
	nome: string;
	codigo: string;
	dataAprovacao: Date | string | null;
	mensagemDivulgacao: string | null;
}) {
	const router = useRouter();
	const link = getPlatformPartnerReferralLink(codigo);
	const chars = codigo.split("");
	const codeStart = 1250;
	const codeStep = Math.min(90, 720 / Math.max(chars.length, 1));
	const codeEnd = codeStart + chars.length * codeStep;
	const t = useIssueTimeline(codeEnd + 700);
	const [copied, setCopied] = useState(false);

	const headP = easeOut(clamp(t / 400));
	const cardP = easeOut(clamp((t - 250) / 1000));
	const badgeP = clamp((t - (codeEnd + 50)) / 260);
	const restP = easeOut(clamp((t - (codeEnd + 150)) / 400));

	const { mutate, isPending } = useMutation({
		mutationKey: ["mark-platform-partner-card-as-seen"],
		mutationFn: () => updatePlatformPartnerMe({ markCardAsSeen: true }),
		onSuccess: () => router.refresh(),
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		} catch {
			toast.error("Não foi possível copiar o link.");
		}
	};
	const whatsappHref = `https://wa.me/?text=${encodeURIComponent(buildPlatformPartnerShareMessage({ mensagem: mensagemDivulgacao, link }))}`;

	return (
		<StatusFrame>
			<div
				className="flex flex-col gap-2 px-5 pt-[max(28px,env(safe-area-inset-top))] text-center"
				style={{ opacity: headP, transform: `translateY(${(1 - headP) * 8}px)` }}
			>
				<span className="mx-auto">
					<Pill tone="success">
						<Check className="h-3 w-3" strokeWidth={3} />
						Cadastro aprovado
					</Pill>
				</span>
				<h1 className="text-[28px] leading-[1.15] font-extrabold tracking-[-0.015em]">Seu cartão de parceiro está pronto</h1>
			</div>

			<div className="relative px-4 pt-7">
				{/* Fenda da "impressora" */}
				<div className="relative z-10 mx-1.5 h-2.5 rounded-full bg-foreground shadow-[inset_0_-3px_0_rgba(255,255,255,0.08)]" />
				<div className="relative mx-3.5 -mt-[5px] h-[250px] overflow-hidden pb-[30px]">
					<div className="absolute inset-x-0 top-0 h-[216px]" style={{ transform: `translateY(${(cardP - 1) * 100}%)` }}>
						<div
							className={cn(
								"relative flex h-full flex-col justify-between overflow-hidden rounded-b-[22px] px-[22px] pt-[26px] pb-[22px] shadow-[0_16px_40px_-12px_rgba(36,84,156,0.40),0_6px_12px_rgba(36,84,156,0.16)]",
								PARTNER_CARD_SURFACE,
							)}
						>
							<span aria-hidden className="pointer-events-none absolute -top-[70px] -right-[60px] h-[220px] w-[220px] rounded-full border border-white/8" />
							<div className="relative flex items-center justify-between">
								<span className="text-[11px] font-extrabold tracking-[0.14em] text-white/72 uppercase">Cartão do parceiro</span>
								<CardLogo />
							</div>
							<div className="relative flex gap-1.5" aria-label={`Código ${codigo}`}>
								{chars.map((char, index) => {
									const start = codeStart + index * codeStep;
									const on = t >= start;
									const scale = on ? 0.7 + 0.3 * backOut(clamp((t - start) / 180)) : 1;
									return (
										<span
											key={`${char}-${index}`}
											aria-hidden
											className={cn(
												"flex h-10 max-w-[30px] min-w-0 flex-1 items-center justify-center rounded-[9px] font-extrabold transition-colors",
												chars.length > 10 ? "text-base" : "text-xl",
												on ? "border border-white/18 bg-white/12" : "border-[1.5px] border-dashed border-white/35",
											)}
											style={{ transform: `scale(${scale})` }}
										>
											{on ? char : ""}
										</span>
									);
								})}
							</div>
							<div className="relative flex items-end justify-between gap-3">
								<div className="flex min-w-0 flex-col gap-[3px]">
									<span className="text-[11px] font-semibold text-white/60">Titular</span>
									<span className="truncate text-sm font-bold tracking-[0.06em] uppercase">{nome}</span>
								</div>
								<div className="flex flex-col items-end gap-[3px]">
									<span className="text-[11px] font-semibold whitespace-nowrap text-white/60">Parceiro desde</span>
									<span className="text-sm font-bold">{formatPartnerDate(dataAprovacao ?? new Date())}</span>
								</div>
							</div>
						</div>
					</div>
					<span
						className="absolute top-[190px] right-1.5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-warning text-warning-foreground shadow-[0_16px_40px_-12px_rgba(255,185,0,0.40),0_6px_12px_rgba(0,0,0,0.08)]"
						style={{ transform: `scale(${badgeP > 0 ? backOut(badgeP) : 0})` }}
					>
						<Check className="h-6 w-6" strokeWidth={3} />
					</span>
				</div>
			</div>

			<div className="flex flex-col gap-3 px-5 pt-1" style={{ opacity: restP, transform: `translateY(${(1 - restP) * 12}px)` }}>
				<div className="flex items-center gap-3 rounded-[18px] bg-muted px-4 py-3.5">
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Seu link</span>
						<span className="truncate text-sm font-bold">{link.replace(/^https?:\/\/(www\.)?/, "")}</span>
					</div>
					<button
						type="button"
						onClick={copyLink}
						className="h-9 shrink-0 rounded-[14px] bg-primary px-3.5 text-[13px] font-extrabold text-primary-foreground transition-colors hover:bg-primary/90"
					>
						{copied ? "Copiado" : "Copiar"}
					</button>
				</div>
				<p className="text-center text-sm leading-normal text-balance text-muted-foreground">
					A primeira loja que assinar pelo seu link rende 100% da mensalidade.
				</p>
			</div>

			<div className="mt-auto flex flex-col gap-2.5 px-5 pt-6 pb-[max(20px,env(safe-area-inset-bottom))]" style={{ opacity: restP }}>
				<a
					href={whatsappHref}
					target="_blank"
					rel="noreferrer"
					className="flex h-[52px] items-center justify-center gap-2 rounded-[18px] bg-whatsapp text-[15px] font-extrabold text-whatsapp-foreground"
				>
					<MessageCircle className="h-[18px] w-[18px]" />
					Enviar meu link no WhatsApp
				</a>
				<button
					type="button"
					onClick={() => mutate()}
					disabled={isPending}
					className="flex h-11 items-center justify-center rounded-[18px] border border-border bg-card text-sm font-bold transition-colors hover:bg-muted disabled:opacity-60"
				>
					Ir para o painel
				</button>
			</div>
		</StatusFrame>
	);
}
