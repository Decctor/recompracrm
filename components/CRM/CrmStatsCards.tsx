"use client";
import { useCrmStats } from "@/lib/queries/crm";
import { formatToMoney } from "@/lib/formatting";
import { BarChart3, DollarSign, TrendingUp, Users, CheckSquare, Clock } from "lucide-react";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { getErrorMessage } from "@/lib/errors";

type CrmStatsCardsProps = {
	periodAfter?: string;
	periodBefore?: string;
};

export default function CrmStatsCards({ periodAfter, periodBefore }: CrmStatsCardsProps) {
	const { data, isLoading, isError, error } = useCrmStats({ periodAfter, periodBefore });

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!data) return null;

	const cards = [
		{
			title: "Total de Leads",
			value: data.totalLeads.toString(),
			icon: <Users className="w-5 h-5" />,
			color: "text-blue-600",
		},
		{
			title: "Valor do Pipeline",
			value: formatToMoney(data.valorPipeline),
			icon: <DollarSign className="w-5 h-5" />,
			color: "text-emerald-600",
		},
		{
			title: "Taxa de Conversão",
			value: `${data.taxaConversao}%`,
			icon: <TrendingUp className="w-5 h-5" />,
			color: "text-purple-600",
		},
		{
			title: "Ganhos",
			value: data.ganhos.toString(),
			icon: <BarChart3 className="w-5 h-5" />,
			color: "text-emerald-600",
		},
		{
			title: "Atividades Pendentes",
			value: data.atividadesPendentes.toString(),
			icon: <Clock className="w-5 h-5" />,
			color: "text-amber-600",
		},
		{
			title: "Atividades Concluídas",
			value: data.atividadesConcluidas.toString(),
			icon: <CheckSquare className="w-5 h-5" />,
			color: "text-emerald-600",
		},
	];

	return (
		<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
			{cards.map((card) => (
				<div key={card.title} className="border rounded-lg p-4">
					<div className="flex items-center gap-2 mb-2">
						<span className={card.color}>{card.icon}</span>
						<span className="text-xs text-muted-foreground">{card.title}</span>
					</div>
					<span className="text-xl font-bold">{card.value}</span>
				</div>
			))}
		</div>
	);
}
