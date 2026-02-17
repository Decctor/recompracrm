"use client";
import type { TGetActivitiesOutputDefault, TUpdateActivityInput } from "@/app/api/admin/crm/activities/route";
import { Button } from "@/components/ui/button";
import { formatDateAsLocale, formatNameAsInitials } from "@/lib/formatting";
import { updateActivity } from "@/lib/mutations/crm";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Calendar, Check, Clock, Mail, MessageSquare, Pencil, Phone, Video, X } from "lucide-react";
import { useState } from "react";
import { BsCalendarCheck, BsCalendarEvent, BsCalendarPlus } from "react-icons/bs";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

const TIPO_ICONS: Record<string, React.ReactNode> = {
	LIGACAO: <Phone className="w-4 h-4" />,
	EMAIL: <Mail className="w-4 h-4" />,
	REUNIAO: <Video className="w-4 h-4" />,
	TAREFA: <Clock className="w-4 h-4" />,
	WHATSAPP: <MessageSquare className="w-4 h-4" />,
};

const TIPO_LABELS: Record<string, string> = {
	LIGACAO: "LIGAÇÃO",
	EMAIL: "E-MAIL",
	REUNIAO: "REUNIÃO",
	TAREFA: "TAREFA",
	WHATSAPP: "WHATSAPP",
};

const STATUS_STYLES: Record<string, string> = {
	PENDENTE: "bg-amber-100 text-amber-700",
	CONCLUIDA: "bg-emerald-100 text-emerald-700",
	CANCELADA: "bg-red-100 text-red-700",
};

type InternalActivityCardProps = {
	activity: TGetActivitiesOutputDefault["activities"][number];
	callbacks?: {
		onMutate?: (variables: TUpdateActivityInput) => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

export default function InternalActivityCard({ activity, callbacks }: InternalActivityCardProps) {
	const [editActivityModalOpen, setEditActivityModalOpen] = useState(false);
	const { mutate: updateActivityMutation, isPending: isUpdatingActivity } = useMutation({
		mutationKey: ["update-internal-activity"],
		mutationFn: updateActivity,
	});
	return (
		<div className={cn("bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-2 shadow-2xs")}>
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-1.5">
					{TIPO_ICONS[activity.tipo]}
					<span className="text-xs font-bold tracking-tight lg:text-sm">{activity.titulo}</span>
				</div>
				{!activity.dataConclusao ? (
					<Button
						variant="ghost"
						size="xs"
						onClick={() => updateActivityMutation({ activityId: activity.id, activity: { status: "CONCLUIDA" } })}
						className="flex items-center gap-1 hover:bg-green-200 hover:text-green-700 hover:border-green-700"
					>
						<Check className="w-4 h-4 min-w-4 min-h-4" />
						CONCLUIR
					</Button>
				) : (
					<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-green-500 dark:text-green-400")}>
						<BsCalendarCheck className="w-4 min-w-4 h-4 min-h-4" />
						<p className="text-xs font-medium tracking-tight uppercase">CONCLUÍDA EM: {formatDateAsLocale(activity.dataConclusao, true)}</p>
					</div>
				)}
			</div>
			<div className="w-full flex flex-col gap-1 grow">
				{activity.descricao && <p className="text-xs text-muted-foreground mt-0.5 truncate">{activity.descricao}</p>}
			</div>
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					{activity.autor && (
						<div className="flex items-center gap-1">
							<Avatar className="w-4 h-4 min-w-4 min-h-4">
								<AvatarImage src={activity.autor.avatarUrl ?? undefined} alt={activity.autor.nome} />
								<AvatarFallback>{formatNameAsInitials(activity.autor.nome)}</AvatarFallback>
							</Avatar>
							<span className="text-xs font-medium">{activity.autor.nome}</span>
						</div>
					)}

					{!activity.dataConclusao && activity.dataAgendada ? (
						<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-primary")}>
							<BsCalendarEvent className="w-4 min-w-4 h-4 min-h-4" />
							<p className="text-xs font-medium tracking-tight uppercase">PARA: {formatDateAsLocale(activity.dataAgendada, true)}</p>
						</div>
					) : null}
				</div>
				<Button variant="ghost" size="xs" onClick={() => setEditActivityModalOpen(true)} className="flex items-center gap-1">
					<Pencil className="w-4 h-4 min-w-4 min-h-4" />
					EDITAR
				</Button>
			</div>
		</div>
	);
}

export { TIPO_LABELS, TIPO_ICONS };
