"use client";
import type { TInternalLeadEntity } from "@/services/drizzle/schema";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { STAGE_COLORS, STAGE_LABELS } from "./Kanban/KanbanColumn";
import { Building2, Calendar, Mail, Phone, User } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type LeadCardProps = {
	lead: TInternalLeadEntity & { responsavel?: { nome: string } | null };
	onEdit?: (id: string) => void;
};

export default function LeadCard({ lead, onEdit }: LeadCardProps) {
	return (
		<Link
			href={`/dashboard/admin/crm/${lead.id}`}
			className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
		>
			<div className={cn("w-2 h-12 rounded-full shrink-0", STAGE_COLORS[lead.statusCRM] ?? "bg-gray-500")} />
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium truncate">
						{lead.titulo || lead.organizacaoNome}
					</span>
					<span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
						{STAGE_LABELS[lead.statusCRM] ?? lead.statusCRM}
					</span>
				</div>
				<div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
					<span className="flex items-center gap-1">
						<Building2 className="w-3 h-3" />
						{lead.organizacaoNome}
					</span>
					<span className="flex items-center gap-1">
						<User className="w-3 h-3" />
						{lead.contatoNome}
					</span>
					{lead.contatoEmail && (
						<span className="flex items-center gap-1">
							<Mail className="w-3 h-3" />
							{lead.contatoEmail}
						</span>
					)}
				</div>
			</div>
			<div className="flex flex-col items-end gap-1 shrink-0">
				{lead.valor != null && (
					<span className="text-sm font-semibold text-emerald-600">{formatToMoney(lead.valor)}</span>
				)}
				{lead.responsavel && (
					<span className="text-xs text-muted-foreground">{lead.responsavel.nome}</span>
				)}
				<span className="text-xs text-muted-foreground flex items-center gap-1">
					<Calendar className="w-3 h-3" />
					{formatDateAsLocale(lead.dataInsercao)}
				</span>
			</div>
		</Link>
	);
}
