"use client";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { getErrorMessage } from "@/lib/errors";
import { useCrmStats } from "@/lib/queries/crm";
import { InternalLeadStatusCRMEnum } from "@/schemas/enums";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { STAGE_LABELS } from "./Kanban/KanbanColumn";

const STAGE_BAR_COLORS: Record<string, string> = {
	NOVO: "#3b82f6",
	CONTATO_INICIAL: "#06b6d4",
	QUALIFICADO: "#f59e0b",
	PROPOSTA: "#a855f7",
	NEGOCIACAO: "#f97316",
	GANHO: "#10b981",
	PERDIDO: "#ef4444",
};

type FunnelChartProps = {
	periodAfter?: string;
	periodBefore?: string;
};

export default function FunnelChart({ periodAfter, periodBefore }: FunnelChartProps) {
	const { data, isLoading, isError, error } = useCrmStats({ periodAfter, periodBefore });

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!data) return null;

	const chartData = Object.values(InternalLeadStatusCRMEnum).map((stage) => ({
		name: STAGE_LABELS[stage] ?? stage,
		stage,
		leads: data.stageMap[stage]?.count ?? 0,
	}));

	return (
		<div className="border rounded-lg p-4">
			<h3 className="text-sm font-semibold mb-4">Funil de Vendas</h3>
			<ResponsiveContainer width="100%" height={300}>
				<BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
					<CartesianGrid strokeDasharray="3 3" horizontal={false} />
					<XAxis type="number" />
					<YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
					<Tooltip />
					<Bar dataKey="leads" radius={[0, 4, 4, 0]}>
						{chartData.map((entry) => (
							<Cell key={entry.stage} fill={STAGE_BAR_COLORS[entry.stage] ?? "#6b7280"} />
						))}
					</Bar>
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}
