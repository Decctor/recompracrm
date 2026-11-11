import { Img, spring, useVideoConfig } from "remotion";
import logoWhite from "../assets/horizontal-white.svg";
import { COLORS, DISPLAY_FONT, UI_FONT } from "../theme";

// Tela do produto no fim do episódio. Espelha os blocos reais do editor do programa de cashback
// ("Acúmulo e validade", "Onde o cliente pode resgatar") e o aviso de saldo no WhatsApp.
// Em produção, troque por um screenshot da organização de demonstração (Playwright).

type Highlight = "percentual" | "validade" | "whatsapp" | null;

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

export function CashbackSettingsPhone({ frame, highlight, notifyAt }: { frame: number; highlight: Highlight; notifyAt: number | null }) {
	const { fps } = useVideoConfig();
	const enter = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
	const notify = notifyAt === null ? 0 : spring({ frame: frame - notifyAt, fps, config: { damping: 14, stiffness: 160 } });
	const fields = [
		{ key: "percentual", label: "TIPO DE ACUMULAÇÃO", value: "Percentual" },
		{ key: "percentual", label: "VALOR DE ACUMULAÇÃO (%)", value: "5" },
		{ key: null, label: "VALOR MÍNIMO P/ ACÚMULO", value: "R$ 20,00" },
		{ key: "validade", label: "VALIDADE (DIAS)", value: "45" },
	];
	return (
		<div
			style={{
				position: "absolute",
				left: 470,
				top: 470,
				width: 540,
				height: 1080,
				transform: `translateY(${(1 - enter) * 700}px) rotate(${(1 - enter) * 8 + 2}deg)`,
			}}
		>
			<div style={{ position: "absolute", inset: 0, background: "#16171c", borderRadius: 72, boxShadow: "0 30px 60px rgba(10,25,50,0.35)" }} />
			<div style={{ position: "absolute", inset: 18, background: "#f5f7f9", borderRadius: 56, overflow: "hidden", fontFamily: UI_FONT, color: COLORS.ink }}>
				<div style={{ height: 150, background: COLORS.cobalt, color: "#ffffff", padding: "70px 34px 0", fontSize: 34, fontWeight: 700 }}>Programa de cashback</div>
				<div style={{ margin: 22, background: "#ffffff", borderRadius: 22, border: "2px solid #e3e8ea", padding: 22 }}>
					<div style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>ACÚMULO E VALIDADE</div>
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
						{fields.map((field) => {
							const on = field.key !== null && field.key === highlight;
							return (
								<div key={field.label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
									<span style={{ fontSize: 15, fontWeight: 700, color: "#687a80" }}>{field.label}</span>
									<span
										style={{
											height: 62,
											display: "flex",
											alignItems: "center",
											padding: "0 16px",
											borderRadius: 14,
											fontSize: 26,
											fontWeight: 500,
											border: on ? `4px solid ${COLORS.gold}` : "2px solid #e3e8ea",
											background: on ? "#fff7dc" : "#ffffff",
											transform: on ? "scale(1.05)" : "none",
										}}
									>
										{field.value}
									</span>
								</div>
							);
						})}
					</div>
				</div>
				<div style={{ margin: "0 22px", background: "#ffffff", borderRadius: 22, border: "2px solid #e3e8ea", padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
					<div style={{ fontSize: 22, fontWeight: 700 }}>ONDE O CLIENTE PODE RESGATAR</div>
					{["PELO PDV", "PELO PONTO DE INTERAÇÃO", "PELA LOJA DIGITAL"].map((label, i) => (
						<div key={label} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 19, fontWeight: 700 }}>
							<span
								style={{
									width: 30,
									height: 30,
									borderRadius: 8,
									background: i < 2 ? COLORS.cobalt : "#ffffff",
									border: i < 2 ? "none" : "2px solid #c9d1d4",
									color: "#ffffff",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									fontSize: 20,
								}}
							>
								{i < 2 ? "✓" : ""}
							</span>
							RESGATE {label}
						</div>
					))}
				</div>
				<div style={{ display: "flex", justifyContent: "flex-end", gap: 14, margin: 22 }}>
					<span style={{ padding: "14px 22px", fontSize: 20, fontWeight: 500, color: "#687a80" }}>DESCARTAR</span>
					<span style={{ padding: "14px 26px", fontSize: 20, fontWeight: 500, color: "#ffffff", background: COLORS.cobalt, borderRadius: 999 }}>APLICAR</span>
				</div>
			</div>

			{/* aviso de saldo chegando no WhatsApp do cliente */}
			<div
				style={{
					position: "absolute",
					left: -420,
					top: 760,
					width: 620,
					opacity: notify,
					transform: `translateY(${(1 - notify) * 60}px) scale(${0.85 + notify * 0.15})`,
					background: "#ffffff",
					borderRadius: 28,
					border: highlight === "whatsapp" ? `5px solid ${COLORS.gold}` : "3px solid #e3e8ea",
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
					<span style={{ fontSize: 22, fontWeight: 500, color: "#3d4a55", lineHeight: 1.3 }}>
						Oi, Ana! Você tem R$ 0,50 de cashback. Vale até 25/08 🍦
					</span>
				</div>
			</div>
		</div>
	);
}

