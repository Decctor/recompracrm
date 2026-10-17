import { formatInteractiveDateRangeSummary } from "@/components/ui/interactive-filter-formatting";
import type { TSalesComparisonStats } from "@/lib/sales/comparison-stats";

/** Rótulos curtos dos dois períodos, para legenda de gráfico, cartões e tooltips. */
export function describeComparisonPeriods(periodos: TSalesComparisonStats["periodos"]) {
	return {
		base: { label: formatInteractiveDateRangeSummary(periodos.base.after, periodos.base.before), dias: periodos.base.dias },
		comparacao: { label: formatInteractiveDateRangeSummary(periodos.comparacao.after, periodos.comparacao.before), dias: periodos.comparacao.dias },
	};
}
