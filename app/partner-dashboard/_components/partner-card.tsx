"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import { formatPartnerDate, getLocalDaysUntil } from "@/lib/platform-partnerships/earnings";
import { cn } from "@/lib/utils";
import { CalendarClock, QrCode } from "lucide-react";
import { useState } from "react";
import { Money, PARTNER_CARD_SURFACE } from "./partner-ui";
import { ReferralQrCode } from "./referral-qr-code";

/**
 * O símbolo ocupa só o miolo do SVG (barras entre x 131–369 de 500): renderiza grande e recorta,
 * como o protótipo fazia com o logo.png, para as barras terem ~27×21 no canto do cartão.
 */
export function CardLogo() {
	return (
		<span aria-hidden className="relative block h-[21px] w-[27px] overflow-hidden">
			<BrandLogo
				lockup="icon"
				tone="color-on-dark"
				alt=""
				width={57}
				height={57}
				className="absolute top-1/2 left-1/2 h-[57px] w-[57px] max-w-none -translate-x-1/2 -translate-y-1/2"
			/>
		</span>
	);
}

export function CardRings() {
	return (
		<>
			<span aria-hidden className="pointer-events-none absolute -top-[70px] -right-[60px] h-[220px] w-[220px] rounded-full border border-white/8" />
			<span aria-hidden className="pointer-events-none absolute -top-[30px] -right-[20px] h-[140px] w-[140px] rounded-full border border-white/8" />
		</>
	);
}

function describeDaysUntil(days: number) {
	if (days <= 0) return "hoje";
	if (days === 1) return "amanhã";
	return `daqui a ${days} dias`;
}

/**
 * Cartão do parceiro: frente com o próximo PIX, verso com o QR do link. Toque vira. O giro usa
 * `transform` (compositor) e respeita `prefers-reduced-motion` trocando a rotação por um fade.
 */
export function PartnerCard({
	codigo,
	link,
	proximoPix,
}: {
	codigo: string;
	link: string;
	proximoPix: { valorCentavos: number; data: Date | string };
}) {
	const [flipped, setFlipped] = useState(false);
	const days = getLocalDaysUntil(proximoPix.data, new Date());

	return (
		<div className="[perspective:1200px]">
			<button
				type="button"
				onClick={() => setFlipped((previous) => !previous)}
				aria-label={flipped ? "Mostrar frente do cartão" : "Mostrar QR code do link"}
				aria-pressed={flipped}
				className={cn(
					"relative block h-[236px] w-full cursor-pointer rounded-[22px] text-left transition-transform duration-[620ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] [transform-style:preserve-3d] focus-visible:ring-[3px] focus-visible:ring-primary/30 focus-visible:outline-none motion-reduce:transition-none",
					flipped && "[transform:rotateY(180deg)]",
				)}
			>
				{/* Frente */}
				<div
					className={cn(
						"absolute inset-0 flex flex-col justify-between overflow-hidden rounded-[22px] p-[22px] text-numeric shadow-[0_16px_40px_-12px_rgba(36,84,156,0.40),0_6px_12px_rgba(36,84,156,0.16)] [backface-visibility:hidden]",
						PARTNER_CARD_SURFACE,
					)}
				>
					<CardRings />
					<div className="relative flex items-center justify-between">
						<span className="text-[11px] font-extrabold tracking-[0.14em] text-white/72 uppercase">Cartão do parceiro</span>
						<CardLogo />
					</div>
					<div className="relative flex flex-col gap-1.5">
						<span className="text-[13px] font-medium text-white/72">A receber no próximo PIX</span>
						<span className="text-[42px] leading-none font-extrabold tracking-[-0.025em]">
							<Money centavos={proximoPix.valorCentavos} />
						</span>
						<span className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-warning px-2.5 py-1 text-[11px] font-extrabold tracking-[0.04em] text-warning-foreground">
							<CalendarClock className="h-3 w-3" strokeWidth={2.5} />
							Cai em {formatPartnerDate(proximoPix.data, { short: true })} · {describeDaysUntil(days)}
						</span>
					</div>
					<div className="relative flex items-end justify-between">
						<div className="flex flex-col gap-1">
							<span className="text-[11px] font-semibold text-white/60">Código</span>
							<span className="text-[15px] font-extrabold tracking-[0.14em]">{codigo}</span>
						</div>
						<span className="flex h-9 items-center gap-2 rounded-[14px] border border-white/18 bg-white/10 px-3.5 text-[13px] font-bold">
							<QrCode className="h-3.5 w-3.5" />
							Mostrar QR
						</span>
					</div>
				</div>

				{/* Verso */}
				<div className="absolute inset-0 flex items-center gap-[18px] rounded-[22px] border border-border bg-card p-5 text-card-foreground shadow-[0_16px_40px_-12px_rgba(36,84,156,0.30),0_6px_12px_rgba(36,84,156,0.12)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
					<ReferralQrCode link={link} size={168} className="max-[360px]:hidden" />
					<ReferralQrCode link={link} size={132} className="hidden max-[360px]:block" />
					<div className="flex min-w-0 flex-col gap-2">
						<span className="text-[11px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase">Aponte a câmera</span>
						<span className="text-[17px] leading-tight font-extrabold">Teste grátis com o código</span>
						<span className="truncate text-[17px] font-extrabold tracking-[0.12em] text-primary">{codigo}</span>
						<span className="text-xs font-semibold text-muted-foreground">Toque para voltar</span>
					</div>
				</div>
			</button>
		</div>
	);
}

/** Versão estática do cartão, usada no estado vazio e no cadastro aprovado. */
export function StaticPartnerCard({ nome, codigo, children }: { nome: string; codigo: string; children?: React.ReactNode }) {
	return (
		<div className={cn("relative flex flex-col gap-5 overflow-hidden rounded-[22px] p-[22px] text-numeric", PARTNER_CARD_SURFACE)}>
			<CardRings />
			<div className="relative flex items-center justify-between">
				<span className="text-[11px] font-extrabold tracking-[0.14em] text-white/72 uppercase">Cartão do parceiro</span>
				<CardLogo />
			</div>
			{children}
			<div className="relative flex items-end justify-between gap-3">
				<span className="truncate text-sm font-bold tracking-[0.06em] uppercase">{nome}</span>
				<span className="text-sm font-extrabold tracking-[0.08em]">{codigo}</span>
			</div>
		</div>
	);
}
