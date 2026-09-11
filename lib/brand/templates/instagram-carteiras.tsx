import React from "react";
import { loadBrandLogo } from "../assets";
import { BRAND_COLORS } from "../tokens";
import type { TBrandTemplate } from "./types";

const WIDTH = 1080;
const HEIGHT = 1350;
const MARGIN = 88;

// Lâminas do carrossel, na ordem de publicação.
const SLIDES = ["capa", "rotina", "abordagem", "carteira", "fechamento"] as const;
type TSlide = (typeof SLIDES)[number];

// Drench de azul profundo compartilhado por todas as lâminas (mesma família
// de tons derivados usada no meeting-background dark).
const BACKGROUND = "linear-gradient(160deg, #1c3f73 0%, #102849 55%, #081328 100%)";
const GLOW = "radial-gradient(circle at 80% 12%, rgba(36, 84, 156, 0.5) 0%, rgba(36, 84, 156, 0) 55%)";

const INK = "#171717";
const MUTED = "#737373";
const BORDER = "#e5e5e5";
const WHITE_SOFT = "rgba(255, 255, 255, 0.82)";
const WHITE_FAINT = "rgba(255, 255, 255, 0.55)";
const BLUE_SOFT_BG = "rgba(36, 84, 156, 0.10)";
const BLUE_SOFT_BORDER = "rgba(36, 84, 156, 0.22)";

// Geometria das 5 barras do ícone (mesma extração do meeting-background),
// usada como marca d'água tipográfica na capa.
const ICON_BAR_HEIGHTS = [0.4286, 1, 0.5714, 1, 0.4286] as const;
const ICON_BAR_WIDTH_RATIO = 0.2857;
const ICON_BAR_GAP_RATIO = 0.0571;

function IconBarsWatermark({ height, color, opacity }: { height: number; color: string; opacity: number }) {
	const barWidth = height * ICON_BAR_WIDTH_RATIO;
	const gap = height * ICON_BAR_GAP_RATIO;

	return (
		<div style={{ display: "flex", alignItems: "center", gap, opacity }}>
			{ICON_BAR_HEIGHTS.map((ratio, index) => (
				<div
					key={index}
					style={{
						width: barWidth,
						height: height * ratio,
						borderRadius: barWidth / 2,
						backgroundColor: color,
					}}
				/>
			))}
		</div>
	);
}

function SlideLabel({ text }: { text: string }) {
	return (
		<div
			style={{
				fontSize: 26,
				fontWeight: 700,
				letterSpacing: 3.5,
				color: WHITE_FAINT,
			}}
		>
			{text}
		</div>
	);
}

function SlideDots({ active }: { active: TSlide }) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
			{SLIDES.map((slide) => (
				<div
					key={slide}
					style={{
						width: slide === active ? 34 : 12,
						height: 12,
						borderRadius: 6,
						backgroundColor: slide === active ? BRAND_COLORS.amber : "rgba(255, 255, 255, 0.28)",
					}}
				/>
			))}
		</div>
	);
}

async function SlideFooter({ active }: { active: TSlide }) {
	const logo = await loadBrandLogo("horizontalColorOnDark");
	const logoWidth = 260;
	const logoHeight = Math.round(logoWidth * (logo.height / logo.width));

	return (
		<div
			style={{
				display: "flex",
				position: "absolute",
				left: MARGIN,
				right: MARGIN,
				bottom: MARGIN - 16,
				alignItems: "center",
				justifyContent: "space-between",
			}}
		>
			<img src={logo.dataUrl} width={logoWidth} height={logoHeight} alt="" />
			<SlideDots active={active} />
		</div>
	);
}

function SegmentChip({ label, active }: { label: string; active?: boolean }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				paddingLeft: 26,
				paddingRight: 26,
				paddingTop: 12,
				paddingBottom: 12,
				borderRadius: 999,
				border: active ? `2px solid ${BRAND_COLORS.blue}` : `2px solid ${BORDER}`,
				backgroundColor: active ? BRAND_COLORS.blue : "#ffffff",
				color: active ? "#ffffff" : MUTED,
				fontSize: 22,
				fontWeight: 700,
				letterSpacing: 1,
			}}
		>
			{label}
		</div>
	);
}

function Avatar({ initials }: { initials: string }) {
	return (
		<div
			style={{
				display: "flex",
				width: 72,
				height: 72,
				borderRadius: 999,
				backgroundColor: BLUE_SOFT_BG,
				alignItems: "center",
				justifyContent: "center",
				color: BRAND_COLORS.blue,
				fontSize: 26,
				fontWeight: 700,
			}}
		>
			{initials}
		</div>
	);
}

function VinculoBar({ ratio }: { ratio: number }) {
	const trackWidth = 190;
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
			<div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1.5, color: MUTED }}>FORÇA DO VÍNCULO</div>
			<div style={{ display: "flex", width: trackWidth, height: 12, borderRadius: 6, backgroundColor: BORDER }}>
				<div style={{ width: trackWidth * ratio, height: 12, borderRadius: 6, backgroundColor: BRAND_COLORS.amber }} />
			</div>
		</div>
	);
}

type TClientRowProps = {
	initials: string;
	name: string;
	meta: string;
	ltv: string;
	vinculo: number;
	last?: boolean;
};

function ClientRow({ initials, name, meta, ltv, vinculo, last }: TClientRowProps) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 24,
				paddingTop: 26,
				paddingBottom: 26,
				borderBottom: last ? "none" : `2px solid ${BORDER}`,
			}}
		>
			<Avatar initials={initials} />
			<div style={{ display: "flex", flexDirection: "column", gap: 8, flexGrow: 1 }}>
				<div style={{ fontSize: 28, fontWeight: 700, color: INK }}>{name}</div>
				<div style={{ fontSize: 21, fontWeight: 400, color: MUTED }}>{meta}</div>
			</div>
			<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
				<div style={{ fontSize: 28, fontWeight: 700, color: INK }}>{ltv}</div>
				<VinculoBar ratio={vinculo} />
			</div>
		</div>
	);
}

function ReasonLine({ text }: { text: string }) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
			<div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: BLUE_SOFT_BORDER }} />
			<div style={{ fontSize: 24, fontWeight: 400, color: INK, lineHeight: 1.35 }}>{text}</div>
		</div>
	);
}

function CardLabel({ text }: { text: string }) {
	return <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2.5, color: MUTED }}>{text}</div>;
}

function StatCard({ label, value, sub, progress }: { label: string; value: string; sub?: string; progress?: number }) {
	const trackWidth = 200;
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				flexGrow: 1,
				flexBasis: 0,
				backgroundColor: "#ffffff",
				borderRadius: 26,
				padding: 32,
				gap: 14,
			}}
		>
			<div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 2, color: MUTED }}>{label}</div>
			<div style={{ fontSize: 44, fontWeight: 700, color: INK }}>{value}</div>
			{progress !== undefined ? (
				<div style={{ display: "flex", width: trackWidth, height: 12, borderRadius: 6, backgroundColor: BORDER }}>
					<div style={{ width: trackWidth * progress, height: 12, borderRadius: 6, backgroundColor: BRAND_COLORS.amber }} />
				</div>
			) : null}
			{sub ? <div style={{ fontSize: 20, fontWeight: 400, color: MUTED }}>{sub}</div> : null}
		</div>
	);
}

function SegmentPill({ label }: { label: string }) {
	return (
		<div
			style={{
				display: "flex",
				paddingLeft: 18,
				paddingRight: 18,
				paddingTop: 8,
				paddingBottom: 8,
				borderRadius: 999,
				backgroundColor: BLUE_SOFT_BG,
				border: `2px solid ${BLUE_SOFT_BORDER}`,
				color: BRAND_COLORS.blue,
				fontSize: 19,
				fontWeight: 700,
				letterSpacing: 1.5,
			}}
		>
			{label}
		</div>
	);
}

function QueueRow({ initials, name, meta, segment, last }: { initials: string; name: string; meta: string; segment: string; last?: boolean }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 22,
				paddingTop: 24,
				paddingBottom: 24,
				borderBottom: last ? "none" : `2px solid ${BORDER}`,
			}}
		>
			<Avatar initials={initials} />
			<div style={{ display: "flex", flexDirection: "column", gap: 8, flexGrow: 1 }}>
				<div style={{ fontSize: 27, fontWeight: 700, color: INK }}>{name}</div>
				<div style={{ fontSize: 21, fontWeight: 400, color: MUTED }}>{meta}</div>
			</div>
			<SegmentPill label={segment} />
		</div>
	);
}

function SlideShell({ children, watermark }: { children: React.ReactNode; watermark?: boolean }) {
	return (
		<div
			style={{
				display: "flex",
				position: "relative",
				width: WIDTH,
				height: HEIGHT,
				backgroundImage: BACKGROUND,
				overflow: "hidden",
				fontFamily: "Outfit",
			}}
		>
			<div
				style={{
					display: "flex",
					position: "absolute",
					top: 0,
					left: 0,
					width: WIDTH,
					height: HEIGHT,
					backgroundImage: GLOW,
				}}
			/>
			{watermark ? (
				<div
					style={{
						display: "flex",
						position: "absolute",
						right: -140,
						top: 0,
						height: HEIGHT,
						alignItems: "center",
					}}
				>
					<IconBarsWatermark height={640} color={BRAND_COLORS.white} opacity={0.05} />
				</div>
			) : null}
			{children}
		</div>
	);
}

async function renderCapa() {
	return (
		<SlideShell watermark>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					position: "absolute",
					left: MARGIN,
					right: MARGIN,
					top: MARGIN + 40,
					gap: 44,
				}}
			>
				<div
					style={{
						display: "flex",
						alignSelf: "flex-start",
						alignItems: "center",
						paddingLeft: 30,
						paddingRight: 30,
						paddingTop: 14,
						paddingBottom: 14,
						borderRadius: 999,
						backgroundColor: BRAND_COLORS.amber,
						color: BRAND_COLORS.black,
						fontSize: 25,
						fontWeight: 700,
						letterSpacing: 3,
					}}
				>
					NOVIDADE
				</div>
				<div
					style={{
						fontSize: 88,
						fontWeight: 700,
						lineHeight: 1.06,
						letterSpacing: -1.8,
						color: BRAND_COLORS.white,
					}}
				>
					Quantos clientes estão esfriando na sua carteira agora?
				</div>
				<div style={{ fontSize: 36, fontWeight: 400, lineHeight: 1.45, color: WHITE_SOFT, maxWidth: 820 }}>
					A nova visão de carteiras organiza a rotina do vendedor: cliente por cliente, com o motivo e a hora certa de agir.
				</div>
			</div>
			<div
				style={{
					display: "flex",
					position: "absolute",
					right: MARGIN,
					bottom: MARGIN + 92,
					alignItems: "center",
					gap: 14,
					fontSize: 24,
					fontWeight: 600,
					letterSpacing: 2,
					color: WHITE_FAINT,
				}}
			>
				ARRASTE
				<div style={{ display: "flex", width: 44, height: 3, backgroundColor: WHITE_FAINT }} />
			</div>
			{await SlideFooter({ active: "capa" })}
		</SlideShell>
	);
}

async function renderRotina() {
	return (
		<SlideShell>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					position: "absolute",
					left: MARGIN,
					right: MARGIN,
					top: MARGIN,
					gap: 36,
				}}
			>
				<SlideLabel text="MEU DIA" />
				<div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1, color: BRAND_COLORS.white }}>
					Todo dia começa organizado: meta, fila de abordagens e follow-ups.
				</div>

				<div style={{ display: "flex", gap: 20 }}>
					<StatCard label="META DO DIA" value="R$ 187,78" progress={0.62} />
					<StatCard label="ABORDAGENS HOJE" value="0 / 12" sub="12 clientes na fila" />
					<StatCard label="VENDAS HOJE" value="3" sub="ticket médio R$ 62,59" />
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "column",
						backgroundColor: "#ffffff",
						borderRadius: 32,
						paddingLeft: 44,
						paddingRight: 44,
						paddingTop: 36,
						paddingBottom: 24,
						gap: 8,
					}}
				>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
						<CardLabel text="FILA DE ABORDAGENS" />
						<div style={{ fontSize: 19, fontWeight: 400, color: MUTED }}>mostrando os 12 prioritários</div>
					</div>
					<div style={{ display: "flex", flexDirection: "column" }}>
						<QueueRow initials="CV" name="COMERCIAL VILA NOVA LTDA" meta="sem contato há 53 dias" segment="PRESTES A DORMIR" />
						<QueueRow initials="PM" name="PAULO HENRIQUE MARTINS" meta="ciclo de recompra vencido" segment="HIBERNANDO" />
						<QueueRow initials="AF" name="ANA LÚCIA FIGUEIREDO" meta="carteira esfriando" segment="EM RISCO" last />
					</div>
				</div>

				<div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.4, color: WHITE_SOFT, maxWidth: 860 }}>
					Rotina pedida por quem vive o balcão: o vendedor abre o dia já sabendo onde bater.
				</div>
			</div>
			{await SlideFooter({ active: "rotina" })}
		</SlideShell>
	);
}

async function renderCarteira() {
	return (
		<SlideShell>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					position: "absolute",
					left: MARGIN,
					right: MARGIN,
					top: MARGIN,
					gap: 36,
				}}
			>
				<SlideLabel text="MINHA CARTEIRA" />
				<div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1, color: BRAND_COLORS.white }}>
					Cada vendedor enxerga a própria carteira — segmentada de verdade.
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "column",
						backgroundColor: "#ffffff",
						borderRadius: 32,
						padding: 44,
						gap: 28,
					}}
				>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
						<SegmentChip label="CAMPEÕES" active />
						<SegmentChip label="CLIENTES LEAIS" />
						<SegmentChip label="EM RISCO" />
						<SegmentChip label="HIBERNANDO" />
						<SegmentChip label="PERDIDOS" />
					</div>
					<div style={{ display: "flex", flexDirection: "column" }}>
						<ClientRow initials="MF" name="MARCOS ANDRADE FERREIRA" meta="129 compras com você · última em 03/07" ltv="R$ 52.175,67" vinculo={0.92} />
						<ClientRow initials="EH" name="ELÉTRICA HORIZONTE LTDA" meta="79 compras com você · última em 22/04" ltv="R$ 91.977,43" vinculo={0.68} />
						<ClientRow initials="JC" name="JOÃO PEDRO CARDOSO" meta="65 compras com você · última em 04/07" ltv="R$ 31.625,26" vinculo={0.55} last />
					</div>
				</div>

				<div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.4, color: WHITE_SOFT, maxWidth: 840 }}>
					Matriz RFM aplicada direto na rotina de quem vende — sem planilha, sem achismo.
				</div>
			</div>
			{await SlideFooter({ active: "carteira" })}
		</SlideShell>
	);
}

async function renderAbordagem() {
	return (
		<SlideShell>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					position: "absolute",
					left: MARGIN,
					right: MARGIN,
					top: MARGIN,
					gap: 36,
				}}
			>
				<SlideLabel text="FILA DE ABORDAGENS" />
				<div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1, color: BRAND_COLORS.white }}>
					Quem abordar, por que agora e o que oferecer.
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "column",
						backgroundColor: "#ffffff",
						borderRadius: 32,
						padding: 52,
						gap: 40,
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 22 }}>
						<Avatar initials="CM" />
						<div style={{ display: "flex", flexDirection: "column", gap: 8, flexGrow: 1 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
								<div style={{ fontSize: 30, fontWeight: 700, color: INK }}>CARLOS EDUARDO MOREIRA</div>
								<SegmentPill label="HIBERNANDO" />
							</div>
							<div style={{ fontSize: 22, fontWeight: 400, color: MUTED }}>42 compras · LTV R$ 77.242,07 · última compra há 299 dias</div>
						</div>
					</div>

					<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
						<CardLabel text="POR QUE AGORA" />
						<ReasonLine text="Sem contato há 299 dias — a cadência deste segmento é 40." />
						<ReasonLine text="O ciclo de recompra dele já estourou há muito tempo." />
						<ReasonLine text="Um dos maiores clientes da carteira, esfriando." />
					</div>

					<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
						<CardLabel text="O QUE OFERECER" />
						<ReasonLine text="Recompra: CABO FLEX 2,5MM 750V ANTICHAMA" />
						<ReasonLine text="Sugestão: FITA ISOLANTE 19MM X 20M ANTICHAMA" />
					</div>

					<div style={{ display: "flex", alignItems: "center", gap: 18 }}>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								paddingLeft: 34,
								paddingRight: 34,
								paddingTop: 20,
								paddingBottom: 20,
								borderRadius: 999,
								backgroundColor: BRAND_COLORS.amber,
								color: BRAND_COLORS.black,
								fontSize: 23,
								fontWeight: 700,
								letterSpacing: 1,
							}}
						>
							ABORDAR VIA WHATSAPP
						</div>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								paddingLeft: 34,
								paddingRight: 34,
								paddingTop: 20,
								paddingBottom: 20,
								borderRadius: 999,
								border: `2px solid ${BORDER}`,
								color: INK,
								fontSize: 23,
								fontWeight: 700,
								letterSpacing: 1,
							}}
						>
							REGISTRAR CONTATO
						</div>
					</div>
				</div>

				<div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.4, color: WHITE_SOFT, maxWidth: 860 }}>
					Os dados montam a fila. O vendedor faz o que só gente faz: conversa.
				</div>
			</div>
			{await SlideFooter({ active: "abordagem" })}
		</SlideShell>
	);
}

async function renderFechamento() {
	const logo = await loadBrandLogo("horizontalColorOnDark");
	const logoWidth = 340;
	const logoHeight = Math.round(logoWidth * (logo.height / logo.width));

	return (
		<SlideShell watermark>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					position: "absolute",
					left: MARGIN,
					right: MARGIN,
					top: 0,
					height: HEIGHT,
					alignItems: "center",
					justifyContent: "center",
					gap: 52,
					paddingBottom: 60,
				}}
			>
				<div
					style={{
						fontSize: 76,
						fontWeight: 700,
						lineHeight: 1.08,
						letterSpacing: -1.4,
						color: BRAND_COLORS.white,
						textAlign: "center",
					}}
				>
					Automação pra escalar. Toque humano pra fidelizar.
				</div>
				<div
					style={{
						fontSize: 34,
						fontWeight: 400,
						lineHeight: 1.5,
						color: WHITE_SOFT,
						textAlign: "center",
						maxWidth: 800,
					}}
				>
					As campanhas automáticas cuidam do volume no WhatsApp. A visão de carteiras devolve ao vendedor rotina, organização e relacionamento — com
					inteligência de dados por trás de cada abordagem.
				</div>
				<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							paddingLeft: 44,
							paddingRight: 44,
							paddingTop: 24,
							paddingBottom: 24,
							borderRadius: 999,
							backgroundColor: BRAND_COLORS.amber,
							color: BRAND_COLORS.black,
							fontSize: 27,
							fontWeight: 700,
							letterSpacing: 2,
						}}
					>
						AGENDE UMA DEMONSTRAÇÃO
					</div>
					<div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 2, color: WHITE_FAINT }}>LINK NA BIO</div>
				</div>
			</div>
			<div
				style={{
					display: "flex",
					position: "absolute",
					left: 0,
					right: 0,
					bottom: MARGIN - 16,
					justifyContent: "center",
				}}
			>
				<img src={logo.dataUrl} width={logoWidth} height={logoHeight} alt="" />
			</div>
		</SlideShell>
	);
}

async function renderInstagramCarteiras(variant: string) {
	switch (variant as TSlide) {
		case "capa":
			return renderCapa();
		case "rotina":
			return renderRotina();
		case "carteira":
			return renderCarteira();
		case "abordagem":
			return renderAbordagem();
		case "fechamento":
			return renderFechamento();
		default:
			throw new Error(`Variante desconhecida para instagram-carteiras: ${variant}`);
	}
}

export const instagramCarteirasTemplate: TBrandTemplate = {
	description:
		"Carrossel de Instagram (1080x1350) sobre a visão de carteiras de clientes: capa com gancho, rotina do dia, fila de abordagens, carteira segmentada e fechamento com CTA. Nomes de clientes fictícios.",
	width: WIDTH,
	height: HEIGHT,
	variants: SLIDES,
	render: renderInstagramCarteiras,
};
