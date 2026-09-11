import { formatCurrency, formatPercentage } from "@/lib/reports/formatters";
import type { TSalesReportPayload } from "@/lib/reports/types";
import { ReportCard } from "./ReportCard";
import { ReportGoalBar } from "./ReportGoalBar";
import { ReportHeader } from "./ReportHeader";
import { ReportRankingList } from "./ReportRankingList";
import { ReportStatGrid } from "./ReportStatGrid";
import { ReportTrendChart } from "./ReportTrendChart";

type SalesReportImageProps = {
	payload: TSalesReportPayload;
	logoSrc?: string | null;
};

function getTitle(frequency: TSalesReportPayload["period"]["frequency"]) {
	if (frequency === "daily") return "Resumo visual de vendas do dia";
	if (frequency === "weekly") return "Resumo visual de vendas da semana";
	return "Resumo visual de vendas do mês";
}

function getComparisonMeta(current: number, previous: number | undefined) {
	if (!previous || previous === 0) {
		return {
			label: "Sem base comparativa",
			deltaLabel: "N/A",
			icon: "•",
			tone: {
				background: "rgba(148,163,184,0.18)",
				color: "#475569",
			},
		};
	}

	const delta = ((current - previous) / Math.abs(previous)) * 100;
	if (!Number.isFinite(delta) || delta === 0) {
		return {
			label: "Estável",
			deltaLabel: "0%",
			icon: "•",
			tone: {
				background: "rgba(148,163,184,0.18)",
				color: "#475569",
			},
		};
	}

	if (delta > 0) {
		return {
			label: "Alta vs. anterior",
			deltaLabel: formatPercentage(delta),
			icon: "↑",
			tone: {
				background: "rgba(187,247,208,0.88)",
				color: "#15803D",
			},
		};
	}

	return {
		label: "Queda vs. anterior",
		deltaLabel: formatPercentage(Math.abs(delta)),
		icon: "↓",
		tone: {
			background: "rgba(254,205,211,0.92)",
			color: "#BE123C",
		},
	};
}

function hexToHsl(hex: string) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return { h: 0, s: 0, l: 0 };

	const r = Number.parseInt(result[1], 16) / 255;
	const g = Number.parseInt(result[2], 16) / 255;
	const b = Number.parseInt(result[3], 16) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
				break;
			case g:
				h = ((b - r) / d + 2) / 6;
				break;
			case b:
				h = ((r - g) / d + 4) / 6;
				break;
		}
	}

	return {
		h: Math.round(h * 360),
		s: Math.round(s * 100),
		l: Math.round(l * 100),
	};
}

function getPrimaryGradient(primary: string) {
	const primaryHsl = hexToHsl(primary);
	const lighterColor = `hsl(${primaryHsl.h}, ${primaryHsl.s}%, ${Math.min(primaryHsl.l + 12, 78)}%)`;
	const darkerColor = `hsl(${primaryHsl.h}, ${Math.max(primaryHsl.s - 6, 0)}%, ${Math.max(primaryHsl.l - 8, 18)}%)`;

	return `linear-gradient(90deg, ${lighterColor} 0%, ${primary} 58%, ${darkerColor} 100%)`;
}

export function SalesReportImage({ payload, logoSrc }: SalesReportImageProps) {
	const comparisonMeta = getComparisonMeta(payload.stats.faturamento.atual, payload.stats.faturamento.anterior);
	const heroGradient = getPrimaryGradient(payload.theme.primary);

	return (
		<div
			style={{
				width: 1080,
				height: 1350,
				display: "flex",
				flexDirection: "column",
				backgroundColor: "#F4F7FB",
				backgroundImage: `
					radial-gradient(circle at top left, rgba(255,185,0,0.20), transparent 34%),
					radial-gradient(circle at top right, rgba(36,84,156,0.18), transparent 28%),
					linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(244,247,251,1) 100%)
				`,
				padding: 42,
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
					top: -120,
					right: -100,
					width: 320,
					height: 320,
					borderRadius: 999,
					background: `radial-gradient(circle, ${payload.theme.primary}33 0%, transparent 72%)`,
				}}
			/>
			<div
				style={{
					display: "flex",
					position: "absolute",
					bottom: -160,
					left: -120,
					width: 360,
					height: 360,
					borderRadius: 999,
					background: `radial-gradient(circle, ${payload.theme.secondary}2A 0%, transparent 70%)`,
				}}
			/>
			<div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
				<ReportHeader theme={payload.theme} title={getTitle(payload.period.frequency)} periodLabel={payload.period.label} logoSrc={logoSrc} />
				<ReportCard
					style={{
						gap: 22,
						padding: 32,
						background: heroGradient,
						color: payload.theme.primaryForeground,
						boxShadow: "0 28px 60px rgba(15,23,42,0.16)",
						position: "relative",
						overflow: "hidden",
					}}
				>
					<div
						style={{
							display: "flex",
							position: "absolute",
							inset: 0,
							backgroundImage: `radial-gradient(circle, ${payload.theme.primaryForeground}18 1px, transparent 1px)`,
							backgroundSize: "18px 18px",
							opacity: 0.28,
						}}
					/>
					<div
						style={{
							display: "flex",
							position: "absolute",
							top: -120,
							right: -40,
							width: 320,
							height: 320,
							borderRadius: 999,
							background: "radial-gradient(circle, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0) 68%)",
						}}
					/>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 28 }}>
						<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
							<span style={{ fontSize: 16, letterSpacing: 1.8, textTransform: "uppercase", opacity: 0.88 }}>Faturamento do período</span>
							<span style={{ fontSize: 54, fontWeight: 700 }}>{formatCurrency(payload.stats.faturamento.atual)}</span>
							<span style={{ fontSize: 18, opacity: 0.88 }}>
								Anterior: {formatCurrency(payload.stats.faturamento.anterior || 0)}
							</span>
						</div>
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "flex-start",
								gap: 10,
								padding: "16px 18px",
								borderRadius: 22,
								backgroundColor: "rgba(255,255,255,0.94)",
								border: "1px solid rgba(255,255,255,0.42)",
								minWidth: 286,
							}}
						>
							<span style={{ fontSize: 14, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(15,23,42,0.52)" }}>Comparação</span>
							<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										padding: "6px 10px",
										borderRadius: 999,
										backgroundColor: comparisonMeta.tone.background,
										color: comparisonMeta.tone.color,
									}}
								>
									<span style={{ fontSize: 14, fontWeight: 800 }}>{comparisonMeta.icon}</span>
									<span style={{ fontSize: 14, fontWeight: 800 }}>{comparisonMeta.deltaLabel}</span>
								</div>
								<span style={{ fontSize: 22, fontWeight: 700, color: "#0F172A" }}>{comparisonMeta.label}</span>
							</div>
						</div>
					</div>
					<ReportGoalBar
						goal={payload.stats.faturamentoMeta}
						current={payload.stats.faturamento.atual}
						primary={payload.theme.primaryForeground}
						secondary={payload.theme.secondaryForeground}
					/>
				</ReportCard>
				<ReportStatGrid payload={payload} />
				<ReportCard style={{ padding: 26 }}>
					<ReportTrendChart timeline={payload.timeline} primary={payload.theme.primary} secondary={payload.theme.secondary} width={944} />
				</ReportCard>
				<div style={{ display: "flex", gap: 18 }}>
					<ReportRankingList title="Top vendedores" items={payload.topSellers} type="seller" accentColor={payload.theme.secondary} />
					<ReportRankingList title="Top parceiros" items={payload.topPartners} type="partner" accentColor={payload.theme.primary} />
					<ReportRankingList title="Top produtos" items={payload.topProducts} type="product" accentColor="#0F172A" />
				</div>
			</div>
		</div>
	);
}
