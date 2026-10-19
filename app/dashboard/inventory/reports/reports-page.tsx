"use client";

import SegmentedControl from "@/components/Utils/SegmentedControl";
import type { TStockReportPeriod } from "@/lib/queries/inventory-reports";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { Boxes, CalendarClock, ChartPie, Hourglass, type LucideIcon, RefreshCw, Repeat, Trash2, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AbcSection } from "./_components/abc-section";
import { CostChangesSection } from "./_components/cost-changes-section";
import { CoverageSection } from "./_components/coverage-section";
import { ExpirationsSection } from "./_components/expirations-section";
import { IdleSection } from "./_components/idle-section";
import { LossesSection } from "./_components/losses-section";
import { ReorderSection } from "./_components/reorder-section";
import { SummarySection } from "./_components/summary-section";

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
	{ id: "resumo", label: "Resumo", icon: Boxes },
	{ id: "abc", label: "Curva ABC", icon: ChartPie },
	{ id: "giro", label: "Giro e cobertura", icon: RefreshCw },
	{ id: "reposicao", label: "Ponto de pedido", icon: Repeat },
	{ id: "parado", label: "Estoque parado", icon: Hourglass },
	{ id: "custos", label: "Custos", icon: TrendingUp },
	{ id: "perdas", label: "Perdas", icon: Trash2 },
	{ id: "vencimentos", label: "Vencimentos", icon: CalendarClock },
];

const PERIODS = [
	{ value: 30, label: "30 dias", comparison: "30 dias" },
	{ value: 90, label: "90 dias", comparison: "90 dias" },
	{ value: 365, label: "12 meses", comparison: "12 meses" },
] as const;
type TPeriodDays = (typeof PERIODS)[number]["value"];

/** Altura da barra fixa de navegação: a seção ativa é a última cujo topo passou dela. */
const NAV_OFFSET = 140;

export default function StockReportsPage() {
	const [periodDays, setPeriodDays] = useState<TPeriodDays>(30);
	const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

	// Período estável durante o dia (início do dia de N-1 dias atrás até o fim de hoje): recalcular
	// `new Date()` a cada render trocaria a chave de todas as consultas.
	const today = dayjs().format("YYYY-MM-DD");
	const period = useMemo<TStockReportPeriod>(
		() => ({
			periodAfter: dayjs(today)
				.subtract(periodDays - 1, "day")
				.startOf("day")
				.toDate(),
			periodBefore: dayjs(today).endOf("day").toDate(),
		}),
		[periodDays, today],
	);
	const periodLabel = PERIODS.find((option) => option.value === periodDays)?.comparison ?? "";

	useEffect(() => {
		function handleScroll() {
			let current = SECTIONS[0].id;
			for (const section of SECTIONS) {
				const element = document.getElementById(section.id);
				if (element && element.getBoundingClientRect().top < NAV_OFFSET) current = section.id;
			}
			setActiveSection(current);
		}
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	function scrollToSection(id: string) {
		const element = document.getElementById(id);
		if (!element) return;
		window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
	}

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="bg-background/95 sticky top-2 z-30 flex flex-wrap items-center justify-between gap-2 py-1.5 backdrop-blur-sm">
				<nav aria-label="Seções do relatório" className="bg-muted/70 flex max-w-full items-center gap-1 overflow-x-auto rounded-[10px] p-1 sm:flex-wrap">
					{SECTIONS.map((section) => {
						const active = activeSection === section.id;
						return (
							<a
								key={section.id}
								href={`#${section.id}`}
								onClick={(event) => {
									event.preventDefault();
									scrollToSection(section.id);
								}}
								className={cn(
									"flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1 text-xs font-medium transition-colors",
									active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
								)}
							>
								<section.icon className="size-4" />
								{section.label}
							</a>
						);
					})}
				</nav>
				<SegmentedControl
					aria-label="Período dos relatórios"
					value={periodDays}
					onChange={setPeriodDays}
					options={PERIODS.map((option) => ({ value: option.value, label: option.label }))}
				/>
			</div>

			<div className="flex flex-col gap-10 pb-10 text-sm">
				<SummarySection period={period} periodLabel={periodLabel} />
				<AbcSection period={period} />
				<CoverageSection period={period} />
				<ReorderSection period={period} />
				<IdleSection />
				<CostChangesSection period={period} />
				<LossesSection period={period} />
				<ExpirationsSection />
			</div>
		</div>
	);
}
