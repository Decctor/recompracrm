export type TProductAbcClass = "A" | "B" | "C";

export type TProductPortfolioAnalysisFinding = {
	id: string;
	severity: "info" | "warning" | "critical";
	title: string;
	description: string;
};

export type TProductPortfolioAnalysisClassification = "EQUILIBRADO" | "ATENCAO" | "CONCENTRADO" | "INSUFICIENTE";

export type TAbcDistributionItem = {
	label: TProductAbcClass;
	count: number;
	percentage: number;
	revenueShare: number;
};

export type TTopRevenueConcentrationItem = {
	limit: 10 | 50 | 100;
	productsCount: number;
	revenue: number;
	revenueShare: number;
};

export type TProductWithPeriodMetrics = {
	productId: string;
	revenue: number;
	cost: number;
	quantity: number;
	saleCount: number;
	marginPercentage: number;
	abcClass: TProductAbcClass;
};

export type TGetPortfolioAnalysisResult = {
	period: {
		start: Date | null;
		end: Date | null;
	};
	totalProducts: number;
	activeProducts: number;
	dormantProducts: number;
	analysisSummary: {
		classification: TProductPortfolioAnalysisClassification;
		label: string;
		summary: string;
	};
	findings: TProductPortfolioAnalysisFinding[];
	abcDistribution: TAbcDistributionItem[];
	vitality: {
		active: { count: number; percentage: number };
		dormant: { count: number; percentage: number };
	};
	concentration: {
		productsFor80PctRevenue: number;
		gini: number;
	};
	topRevenueConcentration: TTopRevenueConcentrationItem[];
	metrics: {
		revenue: import("@/utils/analytics").TMetricSummary;
		// `null` para quem não vê custos (dadosSensiveis.visualizarCustos).
		margin: import("@/utils/analytics").TMetricSummary | null;
		saleFrequency: import("@/utils/analytics").TMetricSummary;
	};
	histograms: {
		revenue: import("@/utils/analytics").THistogram;
		margin: import("@/utils/analytics").THistogram | null;
		saleFrequency: import("@/utils/analytics").TDiscreteHistogramBucket[];
	};
};
