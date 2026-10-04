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
	const coverSvg = renderSvgMarkup(<IsoCover scene={cover} tone="deep" label={title} />).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="630" ');
	const coverDataUrl = `data:image/svg+xml;base64,${Buffer.from(coverSvg).toString("base64")}`;
	const logoHeight = 40;
	// Títulos longos descem um degrau para caber em quatro linhas.
	const titleSize = title.length > 70 ? 46 : title.length > 48 ? 52 : 60;

	return new ImageResponse(
		<div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: "#132e5c", fontFamily: "Outfit" }}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640, padding: "56px 56px 52px" }}>
				<img src={logo.dataUrl} height={logoHeight} width={(logo.width / logo.height) * logoHeight} alt="" />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", color: "#ffb900", fontSize: 20, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>
						{eyebrow}
					</div>
					<div style={{ display: "flex", color: "#ffffff", fontSize: titleSize, fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.02em" }}>{title}</div>
				</div>
				<div style={{ display: "flex", color: "rgba(255,255,255,0.6)", fontSize: 22, fontWeight: 600 }}>{footer}</div>
			</div>
			<img src={coverDataUrl} width={560} height={630} alt="" />
		</div>,
		{ ...CONTENT_OG_SIZE, fonts },
	);
}
