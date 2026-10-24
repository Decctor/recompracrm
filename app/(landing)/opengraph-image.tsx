import { LANDING_CASES } from "@/app/_content/cases";
import { loadBrandLogo } from "@/lib/brand/assets";
import { CONTENT_OG_SIZE } from "@/lib/content/og-image";
import { getReportFonts } from "@/lib/reports/fonts";
import { ImageResponse } from "next/og";
import fs from "node:fs/promises";
import path from "node:path";

// Imagem de compartilhamento só da landing (fica no grupo (landing) para não ser herdada pelas
// outras rotas). Em vez da capa de dados das páginas de conteúdo, repete o herói da página: o
// título, o desenho das duas frentes com os mesmos rótulos e um resultado real de cliente.
export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "RecompraCRM — Fidelize quem compra. Recupere quem parou de comprar.";

const INK = "#0e1214";
const MUTED = "#5b6a70";
const BLUE = "#24549c";
const PANEL = "#f3f6fb";
const BORDER = "#e3e8ea";

// Quadro do desenho (viewBox 600×500) dentro do painel da direita; os rótulos usam as mesmas
// posições em % do herói (Hero.tsx), convertidas para este tamanho.
const ART_W = 472;
const ART_H = 393;

async function loadHeroIllustration() {
	const svg = await fs.readFile(path.join(process.cwd(), "public", "images", "landing", "hero-illustration.svg"), "utf8");
	// O arquivo traz um manifesto C2PA em <metadata> que só pesa no data URL.
	const clean = svg.replace(/<metadata>[\s\S]*?<\/metadata>/, "");
	return `data:image/svg+xml;base64,${Buffer.from(clean).toString("base64")}`;
}

function formatMetric(metric: (typeof LANDING_CASES)[number]["metrics"][number]) {
	const digits = metric.decimals ?? 0;
	const value = metric.value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
	return `${metric.prefix ?? ""}${value}${metric.suffix ?? ""}`;
}

function Chip({ children, top, left, right }: { children: React.ReactNode; top: number; left?: number; right?: number }) {
	return (
		<div
			style={{
				position: "absolute",
				top,
				// O satori lê todo valor de estilo como texto: chave com `undefined` quebra a renderização.
				...(left === undefined ? {} : { left }),
				...(right === undefined ? {} : { right }),
				display: "flex",
				alignItems: "center",
				padding: "7px 12px",
				borderRadius: 10,
				border: `1px solid ${BORDER}`,
				backgroundColor: "#ffffff",
				boxShadow: "0 6px 16px -8px rgba(23,23,23,0.22)",
				color: "#262626",
				fontSize: 15,
				fontWeight: 600,
				whiteSpace: "nowrap",
			}}
		>
			{children}
		</div>
	);
}

function ArcLabel({ children, top, color }: { children: string; top: number; color: string }) {
	return (
		<div style={{ position: "absolute", top, left: 0, width: ART_W, display: "flex", justifyContent: "center" }}>
			<div
				style={{
					display: "flex",
					padding: "2px 10px",
					backgroundColor: PANEL,
					color,
					fontSize: 15,
					fontWeight: 700,
					letterSpacing: "0.08em",
					textTransform: "uppercase",
				}}
			>
				{children}
			</div>
		</div>
	);
}

export default async function LandingOpengraphImage() {
	const [fonts, logo, illustration] = await Promise.all([getReportFonts(), loadBrandLogo("horizontalBadgeColorOnLight"), loadHeroIllustration()]);
	// O resultado do primeiro case com demonstrativo: prova real, não promessa.
	const featured = LANDING_CASES.find((c) => c.metrics.length > 0);
	const metric = featured?.metrics[0];
	const logoHeight = 34;

	return new ImageResponse(
		<div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: "#ffffff", fontFamily: "Outfit", padding: 32 }}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600, padding: "22px 40px 22px 28px" }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					<img src={logo.dataUrl} height={logoHeight} width={(logo.width / logo.height) * logoHeight} alt="" />
					<span style={{ color: "#8a979c", fontSize: 16, fontWeight: 600 }}>recompracrm.com.br</span>
				</div>

				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", flexDirection: "column", fontSize: 54, fontWeight: 600, lineHeight: 1.03, letterSpacing: "-0.04em" }}>
						<span style={{ color: INK }}>Fidelize quem compra.</span>
						<span style={{ color: BLUE }}>Recupere quem parou de comprar.</span>
					</div>
					<div style={{ display: "flex", marginTop: 20, color: MUTED, fontSize: 20, lineHeight: 1.4 }}>
						Cashback no balcão e campanhas no WhatsApp oficial da loja, a partir das vendas que você já registra.
					</div>
				</div>

				{metric && featured ? (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							alignSelf: "flex-start",
							padding: "16px 22px",
							borderRadius: 18,
							border: `1px solid ${BORDER}`,
						}}
					>
						<span style={{ color: INK, fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{formatMetric(metric)}</span>
						<div style={{ display: "flex", width: 1, height: 40, margin: "0 18px", backgroundColor: BORDER }} />
						<div style={{ display: "flex", flexDirection: "column", color: MUTED, fontSize: 15, lineHeight: 1.35 }}>
							<span style={{ color: INK, fontWeight: 600 }}>{metric.label}</span>
							<span>{[featured.client.name, featured.period].filter(Boolean).join(" · ")}</span>
						</div>
					</div>
				) : (
					<div style={{ display: "flex" }} />
				)}
			</div>

			<div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: PANEL }}>
				<div style={{ position: "relative", display: "flex", width: ART_W, height: ART_H }}>
					<img src={illustration} width={ART_W} height={ART_H} alt="" />
					<ArcLabel top={ART_H * 0.135 - 12} color={BLUE}>
						Fidelização
					</ArcLabel>
					<ArcLabel top={ART_H * 0.915 - 12} color="#5f7fb0">
						Recuperação
					</ArcLabel>
					<Chip top={ART_H * 0.46 - 16} left={-14}>
						Compra registrada
					</Chip>
					<Chip top={ART_H * 0.43 - 16} right={-14}>
						<span style={{ color: "#7a5117", marginRight: 5 }}>+ R$ 6,00</span>
						de cashback
					</Chip>
					<Chip top={ART_H * 0.8 - 16} left={-4}>
						Voltou ao balcão
					</Chip>
					<Chip top={ART_H + 2} right={0}>
						Sumiu há 60 dias · mensagem enviada
					</Chip>
				</div>
			</div>
		</div>,
		{ ...CONTENT_OG_SIZE, fonts },
	);
}
