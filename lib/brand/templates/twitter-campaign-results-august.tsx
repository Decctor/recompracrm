import React from "react";
import { BRAND_COLORS } from "../tokens";
import {
	CAMPAIGN_BACKGROUND,
	CAMPAIGN_BORDER,
	CAMPAIGN_GLOW,
	CAMPAIGN_INK,
	CAMPAIGN_MUTED,
	CAMPAIGN_RESULTS_AUGUST as RESULTS,
	CAMPAIGN_WHITE_SOFT,
	CampaignEyebrow,
	CampaignLogo,
	CampaignWatermark,
	MetricLabel,
} from "./campaign-results-august-shared";
import type { TBrandTemplate } from "./types";

const WIDTH = 1600;
const HEIGHT = 900;
const MARGIN = 76;
const VARIANTS = ["resultado"] as const;

async function renderResult() {
	return (
		<div
			style={{
				display: "flex",
				position: "relative",
				width: WIDTH,
				height: HEIGHT,
				backgroundImage: CAMPAIGN_BACKGROUND,
				overflow: "hidden",
				fontFamily: "Raleway",
			}}
		>
			<div style={{ display: "flex", position: "absolute", inset: 0, backgroundImage: CAMPAIGN_GLOW }} />
			<div style={{ display: "flex", position: "absolute", left: -105, bottom: -255 }}>
				<CampaignWatermark height={470} />
			</div>

			<div style={{ display: "flex", position: "absolute", left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN, gap: 68 }}>
				<div style={{ display: "flex", flexDirection: "column", width: 690 }}>
					<CampaignEyebrow />
					<div style={{ marginTop: 34, fontSize: 64, fontWeight: 700, lineHeight: 1.06, letterSpacing: -1.4, color: BRAND_COLORS.white }}>
						A próxima compra chegou 15 dias antes.
					</div>
					<div style={{ marginTop: 28, fontSize: 27, fontWeight: 500, lineHeight: 1.42, color: CAMPAIGN_WHITE_SOFT, maxWidth: 620 }}>
						33 de 39 conversões anteciparam o ciclo esperado do cliente.
					</div>
					<div style={{ display: "flex", marginTop: "auto", alignItems: "center", justifyContent: "space-between" }}>
						{await CampaignLogo({ width: 250 })}
						<div style={{ fontSize: 16, fontWeight: 600, letterSpacing: 1.2, color: "rgba(255, 255, 255, 0.55)" }}>AGOSTO · 2026</div>
					</div>
				</div>

				<div style={{ display: "flex", flexDirection: "column", flexGrow: 1, backgroundColor: "#ffffff", borderRadius: 34, padding: 48 }}>
					<MetricLabel>RECEITA INCREMENTAL</MetricLabel>
					<div style={{ marginTop: 8, fontSize: 62, fontWeight: 700, letterSpacing: -1.3, color: BRAND_COLORS.blue }}>{RESULTS.incrementalRevenue}</div>
					<div style={{ marginTop: 5, fontSize: 20, fontWeight: 500, color: CAMPAIGN_MUTED }}>estimada além do comportamento basal</div>

					<div style={{ display: "flex", flexDirection: "column", marginTop: 38, gap: 17, paddingTop: 32, borderTop: `2px solid ${CAMPAIGN_BORDER}` }}>
						<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
							<div style={{ display: "flex", fontSize: 21, fontWeight: 600, color: CAMPAIGN_MUTED }}>{RESULTS.interactions} interações</div>
							<div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: CAMPAIGN_INK }}>{RESULTS.conversions} conversões</div>
						</div>
						<div style={{ display: "flex", width: "100%", height: 15, borderRadius: 8, backgroundColor: CAMPAIGN_BORDER, overflow: "hidden" }}>
							<div style={{ display: "flex", width: "18.31%", height: 15, borderRadius: 8, backgroundColor: BRAND_COLORS.amber }} />
						</div>
						<div style={{ display: "flex", justifyContent: "space-between" }}>
							<div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: BRAND_COLORS.blue }}>{RESULTS.conversionRate} DE CONVERSÃO</div>
							<div style={{ display: "flex", fontSize: 18, fontWeight: 600, color: CAMPAIGN_MUTED }}>{RESULTS.incrementalConversions} COM IMPACTO INCREMENTAL</div>
						</div>
					</div>

					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							marginTop: 34,
							borderRadius: 24,
							backgroundColor: "rgba(36, 84, 156, 0.1)",
							paddingLeft: 28,
							paddingRight: 28,
							paddingTop: 20,
							paddingBottom: 20,
						}}
					>
						<div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
							<div style={{ fontSize: 42, fontWeight: 700, color: BRAND_COLORS.blue }}>{RESULTS.accelerations}</div>
							<div style={{ fontSize: 20, fontWeight: 600, color: CAMPAIGN_INK }}>compras antecipadas</div>
						</div>
						<div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: CAMPAIGN_INK }}>{RESULTS.daysEarlier} antes</div>
					</div>

					<div style={{ display: "flex", marginTop: "auto", gap: 18 }}>
						<div style={{ display: "flex", flexDirection: "column", flexGrow: 1, borderRadius: 24, backgroundColor: "rgba(36, 84, 156, 0.1)", padding: 26, gap: 6 }}>
							<MetricLabel>RECEITA ATRIBUÍDA</MetricLabel>
							<div style={{ fontSize: 32, fontWeight: 700, color: CAMPAIGN_INK }}>{RESULTS.attributedRevenue}</div>
						</div>
						<div style={{ display: "flex", flexDirection: "column", width: 238, borderRadius: 24, backgroundColor: BRAND_COLORS.amber, padding: 26, gap: 6 }}>
							<div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1.8, color: CAMPAIGN_INK }}>IMPACTO NO TICKET</div>
							<div style={{ fontSize: 32, fontWeight: 700, color: CAMPAIGN_INK }}>{RESULTS.ticketImpact}</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export const twitterCampaignResultsAugustTemplate: TBrandTemplate = {
	description: "Peça única para X/Twitter (1600x900) com os resultados reais das campanhas de agosto de 2026, em continuidade visual com instagram-carteiras.",
	width: WIDTH,
	height: HEIGHT,
	variants: VARIANTS,
	render: async (variant) => {
		if (variant !== "resultado") throw new Error(`Variante desconhecida para twitter-campaign-results-august: ${variant}`);
		return renderResult();
	},
};
