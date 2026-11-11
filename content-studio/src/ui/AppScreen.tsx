import { Img, spring, useVideoConfig } from "remotion";
import logoWhite from "../assets/horizontal-white.svg";
import { COLORS, DISPLAY_FONT, UI_FONT } from "../theme";

// Peças em volta da tela do produto no passo "app": o título com a marca e o aviso de saldo que chega
// no WhatsApp do cliente. A tela em si é um print do app real (src/ui/screens.tsx).

export function AppHeadline({ text, frame }: { text: string; frame: number }) {
	const { fps } = useVideoConfig();
	const pop = spring({ frame, fps, config: { damping: 13, stiffness: 180, mass: 0.7 } });
	return (
		<div style={{ position: "absolute", top: 120, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
			<div
				style={{
					transform: `scale(${0.6 + pop * 0.4})`,
					opacity: pop,
					background: "#ffffff",
					border: `5px solid ${COLORS.ink}`,
					borderRadius: 26,
					padding: "18px 34px 20px",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 10,
					fontFamily: DISPLAY_FONT,
					fontWeight: 800,
					fontSize: 52,
					lineHeight: 1.05,
					color: COLORS.ink,
				}}
			>
				{text}
				<span style={{ background: COLORS.cobalt, borderRadius: 16, padding: "14px 22px", display: "flex" }}>
					<Img src={logoWhite} style={{ height: 46 }} />
				</span>
			</div>
		</div>
	);
}

/** Aviso de saldo chegando no WhatsApp do cliente: é o celular do cliente, não uma tela do produto. */
export function WhatsAppBalanceNotice({ frame, at }: { frame: number; at: number | null }) {
	const { fps } = useVideoConfig();
	const show = at === null ? 0 : spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 160 } });
	return (
		<div
			style={{
				position: "absolute",
				left: 50,
				top: 1230,
				width: 620,
				opacity: show,
				transform: `translateY(${(1 - show) * 60}px) scale(${0.85 + show * 0.15})`,
				background: "#ffffff",
				borderRadius: 28,
				border: `5px solid ${COLORS.gold}`,
				boxShadow: "0 20px 40px rgba(10,25,50,0.25)",
				padding: "18px 22px",
				display: "flex",
				gap: 16,
				fontFamily: UI_FONT,
			}}
		>
			<div style={{ width: 64, height: 64, borderRadius: 18, background: COLORS.whatsapp, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
				<svg viewBox="0 0 32 32" width={40} height={40}>
					<path d="M16,4 A12,12 0 0 0 5.6,22 L4,28 L10.2,26.4 A12,12 0 1 0 16,4 Z" fill="#ffffff" />
				</svg>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<span style={{ fontSize: 22, fontWeight: 700, color: COLORS.ink }}>Sorveteria da Márcia</span>
				<span style={{ fontSize: 22, fontWeight: 500, color: "#3d4a55", lineHeight: 1.3 }}>Oi, Ana! Você tem R$ 0,50 de cashback. Vale até 25/08 🍦</span>
			</div>
		</div>
	);
}
