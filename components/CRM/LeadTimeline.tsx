"use client";
import type { TTimelineEvent } from "@/app/api/admin/crm/leads/timeline/route";
import { useInternalLeadTimeline } from "@/lib/queries/crm";
import { formatDateAsLocale } from "@/lib/formatting";
import { ArrowRight, FileText, GitBranch, Phone, Mail, Calendar, MessageSquare, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { getErrorMessage } from "@/lib/errors";

const EVENT_ICONS: Record<string, React.ReactNode> = {
	ATIVIDADE: <CheckSquare className="w-4 h-4" />,
	NOTA: <FileText className="w-4 h-4" />,
	MUDANCA_ETAPA: <GitBranch className="w-4 h-4" />,
};

const EVENT_COLORS: Record<string, string> = {
	ATIVIDADE: "bg-blue-100 text-blue-700 border-blue-200",
	NOTA: "bg-amber-100 text-amber-700 border-amber-200",
	MUDANCA_ETAPA: "bg-purple-100 text-purple-700 border-purple-200",
};

type LeadTimelineProps = {
	leadId: string;
};

export default function LeadTimeline({ leadId }: LeadTimelineProps) {
	const { data: events, isLoading, isError, error } = useInternalLeadTimeline({ leadId });

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!events || events.length === 0) {
		return <p className="text-sm text-muted-foreground text-center py-8">Nenhuma atividade registrada.</p>;
	}

	return (
		<div className="relative">
			<div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
			<div className="flex flex-col gap-4">
				{events.map((event) => (
					<TimelineItem key={event.id} event={event} />
				))}
			</div>
		</div>
	);
}

function TimelineItem({ event }: { event: TTimelineEvent }) {
	return (
		<div className="flex gap-3 relative">
			<div
				className={cn(
					"w-10 h-10 rounded-full border flex items-center justify-center shrink-0 z-10",
					EVENT_COLORS[event.tipo] ?? "bg-gray-100 text-gray-700 border-gray-200",
				)}
			>
				{EVENT_ICONS[event.tipo]}
			</div>
			<div className="flex-1 pt-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">{event.titulo}</span>
					<span className="text-xs text-muted-foreground">
						{formatDateAsLocale(event.data)}
					</span>
				</div>
				{event.descricao && (
					<p className="text-sm text-muted-foreground mt-0.5">{event.descricao}</p>
				)}
				{event.autorNome && (
					<span className="text-xs text-muted-foreground mt-1 block">por {event.autorNome}</span>
				)}
			</div>
		</div>
	);
}
