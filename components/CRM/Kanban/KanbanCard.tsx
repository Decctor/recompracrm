"use client";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TInternalLeadEntity } from "@/services/drizzle/schema";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Building2, GripVertical, Mail, Phone, User } from "lucide-react";
import Link from "next/link";

type KanbanCardProps = {
	lead: TInternalLeadEntity & { responsavel?: { nome: string } | null };
};

export default function KanbanCard({ lead }: KanbanCardProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: lead.id,
		data: { lead },
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn("bg-background border rounded-lg p-3 shadow-sm cursor-default", isDragging && "opacity-50 shadow-lg")}
		>
			<div className="flex items-start gap-2">
				<button {...attributes} {...listeners} className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
					<GripVertical className="w-4 h-4" />
				</button>
				<div className="flex-1 min-w-0">
					<Link href={`/admin-dashboard/crm/${lead.id}`} className="text-sm font-medium truncate block hover:underline">
						{lead.titulo || lead.organizacaoNome}
					</Link>
					<div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
						<Building2 className="w-3 h-3 min-w-3" />
						<span className="truncate">{lead.organizacaoNome}</span>
					</div>
					<div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
						<User className="w-3 h-3 min-w-3" />
						<span className="truncate">{lead.contatoNome}</span>
					</div>
					{lead.valor != null && <div className="mt-2 text-sm font-semibold text-emerald-600">{formatToMoney(lead.valor)}</div>}
					{lead.responsavel && <div className="mt-1.5 text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5 w-fit">{lead.responsavel.nome}</div>}
				</div>
			</div>
		</div>
	);
}
