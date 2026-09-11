import React from "react";
import { loadBrandLogo } from "../assets";
import { BRAND_COLORS } from "../tokens";

export const CAMPAIGN_RESULTS_AUGUST = {
	period: "01 A 31 DE AGOSTO DE 2026",
	interactions: "213",
	conversions: "39",
	incrementalConversions: "34",
	conversionRate: "18,31%",
	attributedRevenue: "R$ 11.987,34",
	incrementalRevenue: "R$ 11.739,12",
	accelerations: "33",
	daysEarlier: "15,1 dias",
	ticketImpact: "+17,72%",
} as const;

export const CAMPAIGN_BACKGROUND = "linear-gradient(160deg, #1c3f73 0%, #102849 55%, #081328 100%)";
export const CAMPAIGN_GLOW = "radial-gradient(circle at 80% 12%, rgba(36, 84, 156, 0.5) 0%, rgba(36, 84, 156, 0) 55%)";
export const CAMPAIGN_INK = "#171717";
export const CAMPAIGN_MUTED = "#737373";
export const CAMPAIGN_BORDER = "#e5e5e5";
export const CAMPAIGN_WHITE_SOFT = "rgba(255, 255, 255, 0.82)";
export const CAMPAIGN_WHITE_FAINT = "rgba(255, 255, 255, 0.55)";

const ICON_BAR_HEIGHTS = [0.4286, 1, 0.5714, 1, 0.4286] as const;
const ICON_BAR_WIDTH_RATIO = 0.2857;
const ICON_BAR_GAP_RATIO = 0.0571;

export function CampaignWatermark({ height }: { height: number }) {
	const barWidth = height * ICON_BAR_WIDTH_RATIO;
	const gap = height * ICON_BAR_GAP_RATIO;

	return (
		<div style={{ display: "flex", alignItems: "center", gap, opacity: 0.05 }}>
			{ICON_BAR_HEIGHTS.map((ratio, index) => (
				<div
					key={index}
					style={{
						width: barWidth,
						height: height * ratio,
						borderRadius: barWidth / 2,
						backgroundColor: BRAND_COLORS.white,
					}}
				/>
			))}
		</div>
	);
}

export function CampaignEyebrow() {
	return (
		<div
			style={{
				display: "flex",
				alignSelf: "flex-start",
				paddingLeft: 28,
				paddingRight: 28,
				paddingTop: 13,
				paddingBottom: 13,
				borderRadius: 999,
				backgroundColor: BRAND_COLORS.amber,
				color: BRAND_COLORS.black,
				fontSize: 22,
				fontWeight: 700,
				letterSpacing: 2.8,
			}}
		>
			CASE REAL · AGOSTO 2026
		</div>
	);
}

export function MetricLabel({ children, light }: { children: React.ReactNode; light?: boolean }) {
	return (
		<div
			style={{
				fontSize: 17,
				fontWeight: 700,
				letterSpacing: 2,
				color: light ? CAMPAIGN_WHITE_FAINT : CAMPAIGN_MUTED,
			}}
		>
			{children}
		</div>
	);
}

export async function CampaignLogo({ width = 260 }: { width?: number }) {
	const logo = await loadBrandLogo("horizontalColorOnDark");
	const height = Math.round(width * (logo.height / logo.width));
	return <img src={logo.dataUrl} width={width} height={height} alt="" />;
}
