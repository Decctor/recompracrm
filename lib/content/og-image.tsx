import { IsoCover, type TIsoCoverKey } from "@/components/Illustrations/Isometric/IsoCover";
import { loadBrandLogo } from "@/lib/brand/assets";
import { getReportFonts } from "@/lib/reports/fonts";
import { ImageResponse } from "next/og";
import { renderSvgMarkup } from "./svg-markup";

// Imagem de compartilhamento (Open Graph) dos artigos e páginas de funcionalidade: o título em
// azul profundo à esquerda e a própria capa isométrica à direita — o mesmo desenho do site,
// sem foto de banco. A capa vira <img> de SVG estático: o satori não executa componentes React
// dentro de um <svg>, e o Next proíbe react-dom/server em rotas de metadata.
export const CONTENT_OG_SIZE = { width: 1200, height: 630 };

type TContentOgImageInput = {
	eyebrow: string;
	title: string;
	cover: TIsoCoverKey;
	footer: string;
};

export async function renderContentOgImage({ eyebrow, title, cover, footer }: TContentOgImageInput) {
	const [fonts, logo] = await Promise.all([getReportFonts(), loadBrandLogo("horizontalColorOnDark")]);
	const coverSvg = renderSvgMarkup(<IsoCover scene={cover} tone="deep" label={title} />).replace(
		"<svg ",
		'<svg xmlns="http://www.w3.org/2000/svg" width="560" height="630" ',
	);
	const coverDataUrl = `data:image/svg+xml;base64,${Buffer.from(coverSvg).toString("base64")}`;
	const logoHeight = 40;
	// Títulos longos descem um degrau para caber em quatro linhas.
	const titleSize = title.length > 70 ? 46 : title.length > 48 ? 52 : 60;

	return new ImageResponse(
		<div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: "#132e5c", fontFamily: "Outfit" }}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640, padding: "56px 56px 52px" }}>
				<img src={logo.dataUrl} height={logoHeight} width={(logo.width / logo.height) * logoHeight} alt="" />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div
						style={{
							display: "flex",
							color: "#ffb900",
							fontSize: 20,
							fontWeight: 700,
							letterSpacing: "0.08em",
							textTransform: "uppercase",
							marginBottom: 20,
						}}
					>
						{eyebrow}
					</div>
					<div style={{ display: "flex", color: "#ffffff", fontSize: titleSize, fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.02em" }}>
						{title}
					</div>
				</div>
				<div style={{ display: "flex", color: "rgba(255,255,255,0.6)", fontSize: 22, fontWeight: 600 }}>{footer}</div>
			</div>
			<img src={coverDataUrl} width={560} height={630} alt="" />
		</div>,
		{ ...CONTENT_OG_SIZE, fonts },
	);
}

type TStatOgImageInput = {
	eyebrow: string;
	title: string;
	/** O número em destaque, já formatado (ex: "+R$ 17.482", "R$ 0,3217"). */
	stat: string;
	/** O que o número mede, em uma ou duas linhas. */
	statLabel: string;
	/** Linha pequena sob o rótulo (ex: "Fonte: Cielo ICVA"). */
	statSource?: string | null;
	footer: string;
	/** Cores do painel do número. Sem elas, azul-noite com número branco. */
	panel?: TStatOgPanel;
};

export type TStatOgPanel = { background: string; value: string; label: string; meta: string; accent: string };

const DEFAULT_STAT_PANEL: TStatOgPanel = {
	background: "#0b1628",
	value: "#ffffff",
	label: "rgba(255,255,255,0.72)",
	meta: "rgba(255,255,255,0.5)",
	accent: "#ffb900",
};

// Variante com "capa de dados" (blog, cases e ferramentas): no lugar da capa isométrica, o número
// que resume a página em letra grande. Mesma coluna da esquerda da versão acima.
export async function renderStatOgImage({ eyebrow, title, stat, statLabel, statSource, footer, panel = DEFAULT_STAT_PANEL }: TStatOgImageInput) {
	const [fonts, logo] = await Promise.all([getReportFonts(), loadBrandLogo("horizontalColorOnDark")]);
	const logoHeight = 40;
	const titleSize = title.length > 70 ? 46 : title.length > 48 ? 52 : 60;
	// O número ocupa a largura do painel: valores longos ("R$ 1.461,80") descem de tamanho.
	const statSize = stat.length > 10 ? 76 : stat.length > 7 ? 92 : 112;

	return new ImageResponse(
		<div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: "#132e5c", fontFamily: "Outfit" }}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640, padding: "56px 56px 52px" }}>
				<img src={logo.dataUrl} height={logoHeight} width={(logo.width / logo.height) * logoHeight} alt="" />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div
						style={{
							display: "flex",
							color: "#ffb900",
							fontSize: 20,
							fontWeight: 700,
							letterSpacing: "0.08em",
							textTransform: "uppercase",
							marginBottom: 20,
						}}
					>
						{eyebrow}
					</div>
					<div style={{ display: "flex", color: "#ffffff", fontSize: titleSize, fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.02em" }}>
						{title}
					</div>
				</div>
				<div style={{ display: "flex", color: "rgba(255,255,255,0.6)", fontSize: 22, fontWeight: 600 }}>{footer}</div>
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "flex-end",
					width: 560,
					padding: "56px 56px 60px",
					backgroundColor: panel.background,
				}}
			>
				<div style={{ display: "flex", width: 64, height: 4, backgroundColor: panel.accent, marginBottom: 28 }} />
				<div style={{ display: "flex", color: panel.value, fontSize: statSize, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.04em" }}>{stat}</div>
				<div style={{ display: "flex", marginTop: 24, color: panel.label, fontSize: 26, fontWeight: 400, lineHeight: 1.3 }}>{statLabel}</div>
				{statSource ? <div style={{ display: "flex", marginTop: 20, color: panel.meta, fontSize: 18, fontWeight: 600 }}>{statSource}</div> : null}
			</div>
		</div>,
		{ ...CONTENT_OG_SIZE, fonts },
	);
}
