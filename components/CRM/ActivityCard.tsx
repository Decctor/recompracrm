"use client";
import type { TInternalLeadActivityEntity } from "@/services/drizzle/schema";
import { formatDateAsLocale } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { Calendar, Check, Clock, Mail, MessageSquare, Phone, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const TIPO_ICONS: Record<string, React.ReactNode> = {
	LIGACAO: <Phone className="w-4 h-4" />,
	EMAIL: <Mail className="w-4 h-4" />,
	REUNIAO: <Video className="w-4 h-4" />,
	TAREFA: <Clock className="w-4 h-4" />,
	WHATSAPP: <MessageSquare className="w-4 h-4" />,
};

const TIPO_LABELS: Record<string, string> = {
	LIGACAO: "Ligação",
	EMAIL: "E-mail",
	REUNIAO: "Reunião",
	TAREFA: "Tarefa",
	WHATSAPP: "WhatsApp",
};

const STATUS_STYLES: Record<string, string> = {
	PENDENTE: "bg-amber-100 text-amber-700",
	CONCLUIDA: "bg-emerald-100 text-emerald-700",
	CANCELADA: "bg-red-100 text-red-700",
};

type ActivityCardProps = {
	activity: TInternalLeadActivityEntity & { autor?: { nome: string } | null };
	onComplete?: (id: string) => void;
	onEdit?: (id: string) => void;
};

export default function ActivityCard({ activity, onComplete, onEdit }: ActivityCardProps) {
	return (
		<div className="flex items-start gap-3 p-3 border rounded-lg">
			<div className="mt-0.5 text-muted-foreground">{TIPO_ICONS[activity.tipo]}</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium truncate">{activity.titulo}</span>
					<span className={cn("text-xs rounded px-1.5 py-0.5 shrink-0", STATUS_STYLES[activity.status])}>
						{activity.status === "PENDENTE" ? "Pendente" : activity.status === "CONCLUIDA" ? "Concluída" : "Cancelada"}
					</span>
				</div>
				{activity.descricao && (
					<p className="text-xs text-muted-foreground mt-0.5 truncate">{activity.descricao}</p>
				)}
				<div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
					<span className="flex items-center gap-1">
						<Calendar className="w-3 h-3" />
						{formatDateAsLocale(activity.dataAgendada)}
					</span>
					<span>{TIPO_LABELS[activity.tipo] ?? activity.tipo}</span>
					{activity.autor && <span>por {activity.autor.nome}</span>}
				</div>
			</div>
			{activity.status === "PENDENTE" && onComplete && (
				<Button variant="ghost" size="sm" onClick={() => onComplete(activity.id)} className="shrink-0">
					<Check className="w-4 h-4" />
				</Button>
			)}
		</div>
	);
}

export { TIPO_LABELS, TIPO_ICONS };
