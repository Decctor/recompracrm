import type { CSSProperties } from "react";

import { brandLogoSource } from "@/components/Brand/BrandLogo";
import { getWatermarkLayout, RECOMPRA_BRAND_BLUE, RECOMPRA_BRAND_YELLOW } from "@/lib/brand/watermark-layout";

// Reexportados para não quebrar quem já importa daqui; a fonte da verdade é
// `lib/brand/watermark-layout` (compartilhada com o cabeçalho satori dos convites).
export { getWatermarkCanvasSize, getWatermarkLayout, RECOMPRA_BRAND_BLUE, RECOMPRA_BRAND_YELLOW } from "@/lib/brand/watermark-layout";

const FONT_STACK = "var(--font-outfit), ui-sans-serif, system-ui, sans-serif";

type OrganizationBrandWatermarkProps = {
	organizationName: string;
	organizationLogoSrc: string | null;
	diameter: number;
	backgroundColor?: string | null;
	outerPaddingPercent?: number;
	organizationBadgeBackgroundColor?: string;
};

export default function OrganizationBrandWatermark({
	organizationName,
	organizationLogoSrc,
	diameter,
	backgroundColor = null,
	outerPaddingPercent = 10,
	organizationBadgeBackgroundColor = "#FFFFFF",
}: OrganizationBrandWatermarkProps) {
	const { width, height, padding, overlap, border, shadowBlur, shadowOffset } = getWatermarkLayout(diameter, outerPaddingPercent);
	const initial = organizationName.trim().charAt(0).toUpperCase() || "?";

	const circleBaseStyle: CSSProperties = {
		width: diameter,
		height: diameter,
		borderRadius: "50%",
		border: `${border}px solid #FFFFFF`,
		boxShadow: `0 ${shadowOffset}px ${shadowBlur}px rgba(0,0,0,0.18)`,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
		boxSizing: "border-box",
		position: "relative",
	};

	return (
		<div style={{ position: "relative", width, height, background: backgroundColor ?? "transparent", fontFamily: FONT_STACK }}>
			<div style={{ position: "absolute", top: padding, left: padding, display: "flex", alignItems: "center" }}>
				<div style={{ ...circleBaseStyle, background: organizationBadgeBackgroundColor, zIndex: 2 }}>
					{organizationLogoSrc ? (
						<img
							src={organizationLogoSrc}
							alt={organizationName}
							crossOrigin="anonymous"
							style={{ width: "74%", height: "74%", objectFit: "contain", display: "block" }}
						/>
					) : (
						<span style={{ fontSize: Math.round(diameter * 0.42), fontWeight: 800, color: RECOMPRA_BRAND_BLUE }}>{initial}</span>
					)}
				</div>

				<div style={{ ...circleBaseStyle, background: RECOMPRA_BRAND_BLUE, zIndex: 1, marginLeft: -overlap }}>
					<img
						src={brandLogoSource("icon", "color-on-dark").src}
						alt="Recompra"
						crossOrigin="anonymous"
						style={{ width: "86%", height: "86%", objectFit: "contain", display: "block" }}
					/>
				</div>
			</div>
		</div>
	);
}
