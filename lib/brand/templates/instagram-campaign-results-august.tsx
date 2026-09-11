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

const WIDTH = 1080;
const HEIGHT = 1350;
const MARGIN = 88;
const VARIANTS = ["resultado"] as const;

function FlowStep({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 7, flexGrow: 1 }}>
			<div style={{ fontSize: 38, fontWeight: 700, color: accent ? BRAND_COLORS.blue : CAMPAIGN_INK }}>{value}</div>
			<div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1.7, color: CAMPAIGN_MUTED }}>{label}</div>
		</div>
	);
}

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
				fontFamily: "Outfit",
			}}
		>
			<div style={{ display: "flex", position: "absolute", inset: 0, backgroundImage: CAMPAIGN_GLOW }} />
			<div style={{ display: "flex", position: "absolute", right: -165, top: 110, height: 760, alignItems: "center" }}>
				<CampaignWatermark height={590} />
			</div>

			<div style={{ display: "flex", flexDirection: "column", position: "absolute", left: MARGIN, right: MARGIN, top: MARGIN, gap: 34 }}>
				<CampaignEyebrow />
				<div style={{ fontSize: 61, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.2, color: BRAND_COLORS.white, maxWidth: 900 }}>
					A próxima compra chegou, em média, 15 dias antes.
				</div>
				<div style={{ fontSize: 27, fontWeight: 500, lineHeight: 1.42, color: CAMPAIGN_WHITE_SOFT, maxWidth: 850 }}>
					Campanhas automáticas transformaram o momento certo em resultado mensurável.
				</div>

				<div style={{ display: "flex", flexDirection: "column", backgroundColor: "#ffffff", borderRadius: 32, padding: 46, gap: 34 }}>
					<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 30 }}>
						<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
							<MetricLabel>COMPRAS ANTECIPADAS</MetricLabel>
							<div style={{ display: "flex", alignItems: "baseline", gap: 13 }}>
								<div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1, letterSpacing: -2, color: BRAND_COLORS.blue }}>{RESULTS.accelerations}</div>
								<div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: CAMPAIGN_MUTED }}>de {RESULTS.conversions}</div>
							</div>
						</div>
						<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
							<MetricLabel>ANTECIPAÇÃO MÉDIA</MetricLabel>
							<div style={{ fontSize: 42, fontWeight: 700, color: CAMPAIGN_INK }}>{RESULTS.daysEarlier}</div>
						</div>
					</div>

					<div style={{ display: "flex", width: "100%", height: 14, borderRadius: 7, backgroundColor: CAMPAIGN_BORDER, overflow: "hidden" }}>
						<div style={{ display: "flex", width: "84.6%", height: 14, borderRadius: 7, backgroundColor: BRAND_COLORS.amber }} />
					</div>

					<div style={{ display: "flex", alignItems: "center", gap: 22, paddingTop: 26, borderTop: `2px solid ${CAMPAIGN_BORDER}` }}>
						<FlowStep value={RESULTS.interactions} label="INTERAÇÕES" />
						<div style={{ fontSize: 34, fontWeight: 600, color: CAMPAIGN_BORDER }}>→</div>
						<FlowStep value={RESULTS.conversions} label="CONVERSÕES" />
						<div style={{ fontSize: 34, fontWeight: 600, color: CAMPAIGN_BORDER }}>→</div>
						<FlowStep value={RESULTS.conversionRate} label="TAXA DE CONVERSÃO" accent />
					</div>
				</div>

				<div style={{ display: "flex", alignItems: "stretch", gap: 22 }}>
					<div style={{ display: "flex", flexDirection: "column", flexGrow: 1, backgroundColor: BRAND_COLORS.amber, borderRadius: 28, padding: 32, gap: 9 }}>
						<div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 2, color: CAMPAIGN_INK }}>RECEITA INCREMENTAL</div>
						<div style={{ fontSize: 43, fontWeight: 700, letterSpacing: -0.8, color: CAMPAIGN_INK }}>{RESULTS.incrementalRevenue}</div>
						<div style={{ fontSize: 18, fontWeight: 500, color: "rgba(23, 23, 23, 0.68)" }}>além do comportamento esperado</div>
					</div>
					<div style={{ display: "flex", flexDirection: "column", width: 290, border: "2px solid rgba(255, 255, 255, 0.2)", borderRadius: 28, padding: 32, gap: 9 }}>
						<MetricLabel light>IMPACTO NO TICKET</MetricLabel>
						<div style={{ fontSize: 43, fontWeight: 700, color: BRAND_COLORS.white }}>{RESULTS.ticketImpact}</div>
						<div style={{ fontSize: 18, fontWeight: 500, color: CAMPAIGN_WHITE_SOFT }}>sobre a média do cliente</div>
					</div>
				</div>
			</div>

			<div style={{ display: "flex", position: "absolute", left: MARGIN, right: MARGIN, bottom: MARGIN - 16, alignItems: "center", justifyContent: "space-between" }}>
				{await CampaignLogo({})}
				<div style={{ fontSize: 17, fontWeight: 600, letterSpacing: 1.4, color: "rgba(255, 255, 255, 0.55)" }}>{RESULTS.period}</div>
			</div>
		</div>
	);
}

export const instagramCampaignResultsAugustTemplate: TBrandTemplate = {
	description: "Peça única de Instagram (1080x1350) com os resultados reais das campanhas de agosto de 2026, em continuidade visual com instagram-carteiras.",
	width: WIDTH,
	height: HEIGHT,
	variants: VARIANTS,
	render: async (variant) => {
		if (variant !== "resultado") throw new Error(`Variante desconhecida para instagram-campaign-results-august: ${variant}`);
		return renderResult();
	},
};
