import type { ReactNode } from "react";
import { spring, useVideoConfig } from "remotion";
import { COLORS, UI_FONT } from "../theme";
import type { TAppScreen } from "../types";
import { CashbackSettingsPhone } from "./AppScreen";

// Telas do produto no passo `shot: "app"`. Cada tela espelha uma tela real do RecompraCRM e destaca
// o trecho certo quando a palavra correspondente é falada: `cue("risco")` devolve o quadro (relativo
// ao início do passo) em que "risco" é dito, ou null se a fala não tem essa palavra.

export type TScreenProps = { frame: number; cue: (word: string) => number | null };

/** Já passou da palavra? (falso se a fala não tem a palavra) */
function after(cue: TScreenProps["cue"], frame: number, ...words: string[]) {
	return words.some((w) => {
		const at = cue(w);
		return at !== null && frame >= at;
	});
}

function PhoneShell({ frame, title, children }: { frame: number; title: string; children: ReactNode }) {
	const { fps } = useVideoConfig();
	const enter = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
	return (
		<div style={{ position: "absolute", left: 470, top: 470, width: 540, height: 1080, transform: `translateY(${(1 - enter) * 700}px) rotate(${(1 - enter) * 8 + 2}deg)` }}>
			<div style={{ position: "absolute", inset: 0, background: "#16171c", borderRadius: 72, boxShadow: "0 30px 60px rgba(10,25,50,0.35)" }} />
			<div style={{ position: "absolute", inset: 18, background: "#f5f7f9", borderRadius: 56, overflow: "hidden", fontFamily: UI_FONT, color: COLORS.ink }}>
				<div style={{ height: 150, background: COLORS.cobalt, color: "#ffffff", padding: "70px 34px 0", fontSize: 34, fontWeight: 700 }}>{title}</div>
				{children}
			</div>
		</div>
	);
}

function Panel({ children, glow }: { children: ReactNode; glow?: boolean }) {
	return (
		<div
			style={{
				margin: "18px 22px 0",
				background: "#ffffff",
				borderRadius: 22,
				border: glow ? `4px solid ${COLORS.gold}` : "2px solid #e3e8ea",
				padding: 20,
				transform: glow ? "scale(1.03)" : "none",
			}}
		>
			{children}
		</div>
	);
}

// ---------- Matriz RFM (cores e nomes dos segmentos: app/(brand-marketing)/features/_components/mocks/bi-mocks.tsx)

const SEGMENTS = [
	{ label: "CAMPEÕES", clients: "84", bg: "linear-gradient(135deg,#fb923c,#d97706)", text: "#fff", cue: ["campeões", "melhores"] },
	{ label: "CLIENTES LEAIS", clients: "212", bg: "linear-gradient(135deg,#34d399,#16a34a)", text: "#fff", cue: [] },
	{ label: "PRECISAM DE ATENÇÃO", clients: "96", bg: "linear-gradient(135deg,#818cf8,#7c3aed)", text: "#fff", cue: [] },
	{ label: "EM RISCO", clients: "118", bg: "linear-gradient(135deg,#fde047,#f59e0b)", text: "#422006", cue: ["risco", "esfriando"] },
	{ label: "HIBERNANDO", clients: "74", bg: "linear-gradient(135deg,#c084fc,#7c3aed)", text: "#fff", cue: [] },
	{ label: "PERDIDOS", clients: "120", bg: "linear-gradient(135deg,#f87171,#be123c)", text: "#fff", cue: ["perdidos", "sumiu"] },
];

function RfmSegmentsPhone({ frame, cue }: TScreenProps) {
	const { fps } = useVideoConfig();
	const campaignAt = cue("campanha");
	const campaign = campaignAt === null ? 0 : spring({ frame: frame - campaignAt, fps, config: { damping: 14, stiffness: 160 } });
	return (
		<PhoneShell frame={frame} title="Matriz RFM">
			<div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "18px 22px 0" }}>
				<div style={{ fontSize: 17, fontWeight: 700, color: "#687a80" }}>SEGMENTOS · ÚLTIMOS 12 MESES</div>
				{SEGMENTS.map((s) => {
					const on = s.cue.length > 0 && after(cue, frame, ...s.cue);
					return (
						<div
							key={s.label}
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								background: s.bg,
								color: s.text,
								borderRadius: 18,
								padding: "16px 20px",
								fontWeight: 700,
								fontSize: 22,
								outline: on ? `5px solid ${COLORS.cobalt}` : "none",
								transform: on ? "scale(1.04)" : "none",
								opacity: on || !SEGMENTS.some((x) => x.cue.length && after(cue, frame, ...x.cue)) ? 1 : 0.55,
							}}
						>
							<span>{s.label}</span>
							<span style={{ fontSize: 20 }}>{s.clients} clientes</span>
						</div>
					);
				})}
			</div>
			{/* campanha automática disparada pela entrada no segmento (gatilho ENTRADA-SEGMENTAÇÃO) */}
			<div
				style={{
					position: "absolute",
					left: 22,
					right: 22,
					bottom: 30,
					opacity: campaign,
					transform: `translateY(${(1 - campaign) * 80}px)`,
					background: "#ffffff",
					borderRadius: 22,
					border: `4px solid ${COLORS.gold}`,
					padding: 18,
					boxShadow: "0 16px 30px rgba(10,25,50,0.2)",
				}}
			>
				<div style={{ fontSize: 16, fontWeight: 700, color: "#687a80" }}>CAMPANHA AUTOMÁTICA</div>
				<div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>Entrou em EM RISCO →</div>
				<div style={{ fontSize: 21, fontWeight: 500, marginTop: 4 }}>WhatsApp + R$ 15 de crédito</div>
			</div>
		</PhoneShell>
	);
}

// ---------- Curva ABC no catálogo (filtro "CURVA ABC" e o card "Classe ABC" da aba de estoque do produto)

const PRODUCTS = [
	{ name: "Picolé de morango", rank: "1º", cls: "A" },
	{ name: "Pote 1 L chocolate", rank: "2º", cls: "A" },
	{ name: "Casquinha baunilha", rank: "3º", cls: "A" },
	{ name: "Açaí 500 ml", rank: "9º", cls: "B" },
	{ name: "Picolé de limão", rank: "14º", cls: "B" },
	{ name: "Sorvete de pistache", rank: "41º", cls: "C" },
];
const CLASS_COLOR: Record<string, string> = { A: COLORS.good, B: "#d99a00", C: "#8a9aa1" };

function ProductAbcPhone({ frame, cue }: TScreenProps) {
	const filtered = after(cue, frame, "filtrar", "filtro", "classe");
	return (
		<PhoneShell frame={frame} title="Produtos">
			<Panel glow={after(cue, frame, "curva", "posição")}>
				<div style={{ fontSize: 16, fontWeight: 700, color: "#687a80" }}>CLASSE ABC · PICOLÉ DE MORANGO</div>
				<div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 6 }}>
					<span style={{ fontSize: 56, fontWeight: 700, color: COLORS.good }}>A</span>
					<span style={{ fontSize: 22, fontWeight: 500 }}>1º de 48 em faturamento</span>
				</div>
			</Panel>
			<div style={{ display: "flex", gap: 10, alignItems: "center", padding: "18px 22px 6px", fontSize: 17, fontWeight: 700 }}>
				<span style={{ color: "#687a80" }}>CURVA ABC</span>
				{["A", "B", "C"].map((c) => (
					<span
						key={c}
						style={{
							width: 44,
							height: 40,
							borderRadius: 10,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: 20,
							background: filtered && c === "A" ? COLORS.cobalt : "#ffffff",
							color: filtered && c === "A" ? "#ffffff" : COLORS.ink,
							border: "2px solid #e3e8ea",
						}}
					>
						{c}
					</span>
				))}
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "6px 22px" }}>
				{PRODUCTS.map((p) => {
					const hidden = filtered && p.cls !== "A";
					return (
						<div
							key={p.name}
							style={{
								display: hidden ? "none" : "flex",
								alignItems: "center",
								justifyContent: "space-between",
								background: "#ffffff",
								borderRadius: 16,
								border: "2px solid #e3e8ea",
								padding: "14px 16px",
							}}
						>
							<div style={{ display: "flex", flexDirection: "column" }}>
								<span style={{ fontSize: 21, fontWeight: 700 }}>{p.name}</span>
								<span style={{ fontSize: 16, color: "#687a80" }}>{p.rank} em faturamento</span>
							</div>
							<span style={{ width: 46, height: 46, borderRadius: 12, background: CLASS_COLOR[p.cls], color: "#ffffff", fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
								{p.cls}
							</span>
						</div>
					);
				})}
			</div>
		</PhoneShell>
	);
}

// ---------- Painel: ticket médio, vendas e faturamento contra o período anterior (bi-mocks.tsx), e por vendedor

const TILES = [
	{ label: "TICKET MÉDIO", value: "R$ 35,00", delta: "−12,5%", good: false, cue: ["ticket"] },
	{ label: "VENDAS", value: "1.300", delta: "+8,3%", good: true, cue: ["vendas"] },
	{ label: "FATURAMENTO", value: "R$ 45.500", delta: "−5,2%", good: false, cue: [] },
];
const SELLERS = [
	["Márcia", "R$ 41,20"],
	["Lucas", "R$ 33,80"],
	["Bia", "R$ 30,10"],
];

function TicketDashboardPhone({ frame, cue }: TScreenProps) {
	return (
		<PhoneShell frame={frame} title="Painel">
			<div style={{ padding: "16px 22px 0", fontSize: 17, fontWeight: 700, color: "#687a80" }}>ESTE MÊS × MÊS ANTERIOR</div>
			{TILES.map((tile) => (
				<Panel key={tile.label} glow={tile.cue.length > 0 && after(cue, frame, ...tile.cue)}>
					<div style={{ fontSize: 16, fontWeight: 700, color: "#687a80" }}>{tile.label}</div>
					<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
						<span style={{ fontSize: 40, fontWeight: 700 }}>{tile.value}</span>
						<span style={{ fontSize: 22, fontWeight: 700, color: tile.good ? COLORS.good : COLORS.bad }}>{tile.delta}</span>
					</div>
				</Panel>
			))}
			<Panel glow={after(cue, frame, "vendedor")}>
				<div style={{ fontSize: 16, fontWeight: 700, color: "#687a80", marginBottom: 8 }}>TICKET MÉDIO POR VENDEDOR</div>
				{SELLERS.map(([name, value]) => (
					<div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 22, fontWeight: 500, padding: "4px 0" }}>
						<span>{name}</span>
						<span style={{ fontWeight: 700 }}>{value}</span>
					</div>
				))}
			</Panel>
		</PhoneShell>
	);
}

// ---------- Programa de cashback (tela original, com destaque pelas palavras da fala)

function CashbackScreen({ frame, cue }: TScreenProps) {
	const order: Array<["percentual" | "validade" | "whatsapp", string]> = [
		["percentual", "percentual"],
		["validade", "validade"],
		["whatsapp", "aviso"],
	];
	let highlight: "percentual" | "validade" | "whatsapp" | null = null;
	for (const [key, word] of order) if (after(cue, frame, word)) highlight = key;
	return <CashbackSettingsPhone frame={frame} highlight={highlight} notifyAt={cue("aviso")} />;
}

/** Telas desenhadas. Uma tela listada em AppScreenEnum mas ausente daqui faz o render recusar o episódio. */
export const SCREENS: Partial<Record<TAppScreen, (props: TScreenProps) => ReactNode>> = {
	"cashback-settings": CashbackScreen,
	"rfm-segments": RfmSegmentsPhone,
	"product-abc": ProductAbcPhone,
	"dashboard-ticket": TicketDashboardPhone,
};
