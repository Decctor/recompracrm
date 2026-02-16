"use client";
import ActivityCard from "@/components/CRM/ActivityCard";
import { STAGE_COLORS, STAGE_LABELS } from "@/components/CRM/Kanban/KanbanColumn";
import LeadTimeline from "@/components/CRM/LeadTimeline";
import NoteCard from "@/components/CRM/NoteCard";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import NewActivity from "@/components/Modals/CRM/NewActivity";
import NewNote from "@/components/Modals/CRM/NewNote";
import { Button } from "@/components/ui/button";
import SectionWrapper from "@/components/ui/section-wrapper";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { completeActivity, deleteNote } from "@/lib/mutations/crm";
import { useInternalLeadActivities, useInternalLeadById, useInternalLeadNotes } from "@/lib/queries/crm";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
	ArrowLeft,
	Building2,
	Calendar,
	CheckSquare,
	Clock,
	DollarSign,
	FileText,
	Globe,
	Mail,
	Phone,
	Plus,
	User,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

type LeadDetailPageProps = {
	user: TAuthUserSession["user"];
	leadId: string;
};

export default function LeadDetailPage({ user, leadId }: LeadDetailPageProps) {
	const queryClient = useQueryClient();
	const { data: lead, isLoading, isError, error } = useInternalLeadById({ id: leadId });
	const { data: activitiesData } = useInternalLeadActivities({ initialParams: { leadId } });
	const { data: notes } = useInternalLeadNotes({ leadId });
	const [newActivityModalOpen, setNewActivityModalOpen] = useState(false);
	const [newNoteModalOpen, setNewNoteModalOpen] = useState(false);

	async function handleCompleteActivity(activityId: string) {
		try {
			await completeActivity(activityId);
			toast.success("Atividade concluída!");
			queryClient.invalidateQueries({ queryKey: ["internal-lead-activities"] });
			queryClient.invalidateQueries({ queryKey: ["internal-lead-timeline", leadId] });
		} catch {
			toast.error("Erro ao concluir atividade.");
		}
	}

	async function handleDeleteNote(noteId: string) {
		try {
			await deleteNote(noteId);
			toast.success("Nota deletada!");
			queryClient.invalidateQueries({ queryKey: ["internal-lead-notes", leadId] });
			queryClient.invalidateQueries({ queryKey: ["internal-lead-timeline", leadId] });
		} catch {
			toast.error("Erro ao deletar nota.");
		}
	}

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!lead) return null;

	return (
		<div className="w-full flex flex-col gap-4">
			{/* Header */}
			<div className="flex items-center gap-3">
				<Link href="/dashboard/admin/crm">
					<Button variant="ghost" size="sm">
						<ArrowLeft className="w-4 h-4 mr-1" />
						Voltar
					</Button>
				</Link>
				<h1 className="text-lg font-semibold">{lead.titulo || lead.organizacaoNome}</h1>
				<span
					className={cn(
						"text-xs rounded-full px-2.5 py-1 text-white",
						STAGE_COLORS[lead.statusCRM] ?? "bg-gray-500",
					)}
				>
					{STAGE_LABELS[lead.statusCRM] ?? lead.statusCRM}
				</span>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				{/* Left - Lead Info */}
				<div className="lg:col-span-1 flex flex-col gap-3">
					{/* Organization */}
					<SectionWrapper
						title="Organização"
						icon={<Building2 className="w-4 h-4" />}
					>
						<div className="flex flex-col gap-1.5 text-sm">
							<span className="font-medium">{lead.organizacaoNome}</span>
							<span className="text-muted-foreground">{lead.organizacaoCnpj}</span>
							{lead.organizacaoEmail && (
								<span className="flex items-center gap-1.5 text-muted-foreground">
									<Mail className="w-3 h-3" />
									{lead.organizacaoEmail}
								</span>
							)}
							{lead.organizacaoTelefone && (
								<span className="flex items-center gap-1.5 text-muted-foreground">
									<Phone className="w-3 h-3" />
									{lead.organizacaoTelefone}
								</span>
							)}
							{lead.organizacaoSite && (
								<span className="flex items-center gap-1.5 text-muted-foreground">
									<Globe className="w-3 h-3" />
									{lead.organizacaoSite}
								</span>
							)}
						</div>
					</SectionWrapper>

					{/* Contact */}
					<SectionWrapper
						title="Contato"
						icon={<User className="w-4 h-4" />}
					>
						<div className="flex flex-col gap-1.5 text-sm">
							<span className="font-medium">{lead.contatoNome}</span>
							{lead.contatoCargo && <span className="text-muted-foreground">{lead.contatoCargo}</span>}
							<span className="flex items-center gap-1.5 text-muted-foreground">
								<Mail className="w-3 h-3" />
								{lead.contatoEmail}
							</span>
							{lead.contatoTelefone && (
								<span className="flex items-center gap-1.5 text-muted-foreground">
									<Phone className="w-3 h-3" />
									{lead.contatoTelefone}
								</span>
							)}
						</div>
					</SectionWrapper>

					{/* Deal Info */}
					<SectionWrapper
						title="Oportunidade"
						icon={<DollarSign className="w-4 h-4" />}
					>
						<div className="flex flex-col gap-1.5 text-sm">
							{lead.valor != null && (
								<span>
									Valor: <span className="font-semibold text-emerald-600">{formatToMoney(lead.valor)}</span>
								</span>
							)}
							{lead.probabilidade != null && <span>Probabilidade: {lead.probabilidade}%</span>}
							{lead.origemLead && <span>Origem: {lead.origemLead}</span>}
							{lead.motivoPerda && (
								<span className="text-red-600">Motivo de perda: {lead.motivoPerda}</span>
							)}
							<span className="flex items-center gap-1.5 text-muted-foreground">
								<Calendar className="w-3 h-3" />
								Criado em {formatDateAsLocale(lead.dataInsercao)}
							</span>
						</div>
					</SectionWrapper>
				</div>

				{/* Right - Timeline / Activities / Notes */}
				<div className="lg:col-span-2 flex flex-col gap-3">
					{/* Timeline */}
					<SectionWrapper
						title="Timeline"
						icon={<Clock className="w-4 h-4" />}
					>
						<LeadTimeline leadId={leadId} />
					</SectionWrapper>

					{/* Activities */}
					<SectionWrapper
						title="Atividades"
						icon={<CheckSquare className="w-4 h-4" />}
						actions={
							<Button size="sm" onClick={() => setNewActivityModalOpen(true)}>
								<Plus className="w-4 h-4 mr-1" />
								Adicionar
							</Button>
						}
					>
						<div className="flex flex-col gap-2">
							{activitiesData?.activities.map((activity) => (
								<ActivityCard
									key={activity.id}
									activity={activity as any}
									onComplete={handleCompleteActivity}
								/>
							))}
							{(!activitiesData || activitiesData.activities.length === 0) && (
								<p className="text-sm text-muted-foreground text-center py-8">
									Nenhuma atividade registrada.
								</p>
							)}
						</div>
					</SectionWrapper>

					{/* Notes */}
					<SectionWrapper
						title="Notas"
						icon={<FileText className="w-4 h-4" />}
						actions={
							<Button size="sm" onClick={() => setNewNoteModalOpen(true)}>
								<Plus className="w-4 h-4 mr-1" />
								Adicionar
							</Button>
						}
					>
						<div className="flex flex-col gap-2">
							{notes?.map((note) => (
								<NoteCard key={note.id} note={note as any} onDelete={handleDeleteNote} />
							))}
							{(!notes || notes.length === 0) && (
								<p className="text-sm text-muted-foreground text-center py-8">
									Nenhuma nota registrada.
								</p>
							)}
						</div>
					</SectionWrapper>
				</div>
			</div>

			{newActivityModalOpen && (
				<NewActivity leadId={leadId} closeMenu={() => setNewActivityModalOpen(false)} />
			)}
			{newNoteModalOpen && (
				<NewNote leadId={leadId} closeMenu={() => setNewNoteModalOpen(false)} />
			)}
		</div>
	);
}
