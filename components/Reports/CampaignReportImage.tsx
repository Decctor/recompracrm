import type { TCampaignReportPayload } from "@/lib/reports/types";
import { hexToRgba } from "@/lib/reports/theme-utils";
import { CampaignConversionTypes } from "./Campaign/CampaignConversionTypes";
import { CampaignHeroCard } from "./Campaign/CampaignHeroCard";
import { CampaignImpactRow } from "./Campaign/CampaignImpactRow";
import { CampaignKpiStrip } from "./Campaign/CampaignKpiStrip";
import { CampaignTopList } from "./Campaign/CampaignTopList";
import { CommercialSummaryStrip } from "./Campaign/CommercialSummaryStrip";
import { ReportHeader } from "./ReportHeader";

type CampaignReportImageProps = {
	payload: TCampaignReportPayload;
	logoSrc?: string | null;
};

function getTitle(frequency: TCampaignReportPayload["period"]["frequency"]) {
	if (frequency === "daily") return "Impacto das campanhas no dia";
	if (frequency === "weekly") return "Impacto das campanhas na semana";
	if (frequency === "biweekly") return "Impacto das campanhas na quinzena";
	return "Impacto das campanhas no mês";
}

export function CampaignReportImage({ payload, logoSrc }: CampaignReportImageProps) {
	const { theme, period, campaign, commercial } = payload;
	const hasActivity = campaign.conversoes.atual > 0 || campaign.mensagensEnviadas.atual > 0;
	const hasConversions = campaign.conversoes.atual > 0;

	return (
		<div
			style={{
				width: 1080,
				height: 1920,
				display: "flex",
				flexDirection: "column",
				backgroundColor: "#F4F7FB",
				backgroundImage: `
					radial-gradient(circle at top left, ${hexToRgba(theme.primary, 0.2)}, transparent 32%),
					radial-gradient(circle at top right, ${hexToRgba(theme.secondary, 0.18)}, transparent 28%),
					linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(244,247,251,1) 100%)
				`,
				padding: 48,
				fontFamily: "Outfit",
				color: "#0F172A",
				position: "relative",
				overflow: "hidden",
			}}
		>
			<div
				style={{
					display: "flex",
					position: "absolute",
					top: -130,
					right: -110,
					width: 340,
					height: 340,
					borderRadius: 999,
					background: `radial-gradient(circle, ${hexToRgba(theme.primary, 0.2)} 0%, transparent 72%)`,
				}}
			/>
			<div
				style={{
					display: "flex",
					position: "absolute",
					bottom: -170,
					left: -130,
					width: 380,
					height: 380,
					borderRadius: 999,
					background: `radial-gradient(circle, ${hexToRgba(theme.secondary, 0.16)} 0%, transparent 70%)`,
				}}
			/>

			<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
				<ReportHeader theme={theme} title={getTitle(period.frequency)} periodLabel={period.label} logoSrc={logoSrc} />
				<CampaignHeroCard campaign={campaign} theme={theme} hasActivity={hasActivity} />
				<CampaignKpiStrip campaign={campaign} />
				<CampaignConversionTypes distribuicao={campaign.distribuicaoTipos} theme={theme} />
				{hasConversions ? <CampaignImpactRow campaign={campaign} theme={theme} /> : null}
				{campaign.topCampanhas.length > 0 ? <CampaignTopList campanhas={campaign.topCampanhas} theme={theme} /> : null}
				<CommercialSummaryStrip commercial={commercial} />
			</div>

			<div style={{ display: "flex", flex: 1, minHeight: 24 }} />

			<div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
				<span style={{ fontSize: 15, color: "rgba(15,23,42,0.42)" }}>Relatório automático · Recompra CRM · {theme.orgName}</span>
			</div>
		</div>
	);
}
