"use client";
import type { TGetLeadsOutputById, TUpdateLeadInput } from "@/app/api/admin/crm/leads/route";
import LeadTimeline from "@/components/CRM/LeadTimeline";
import NoteCard from "@/components/CRM/NoteCard";
import LeadActivities from "@/components/Internal/Lead/LeadActivities";
import LeadGeneralInformation from "@/components/Internal/Lead/LeadGeneralInformation";
import LeadNotes from "@/components/Internal/Lead/LeadNotes";
import LeadStatusController from "@/components/Internal/Lead/LeadStatusController";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import NewActivity from "@/components/Modals/Internal/Activities/NewActivity";
import NewNote from "@/components/Modals/Internal/Notes/NewNote";
import { Button } from "@/components/ui/button";
import SectionWrapper from "@/components/ui/section-wrapper";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { completeActivity, deleteNote } from "@/lib/mutations/crm";
import { useInternalLeadActivities, useInternalLeadById, useInternalLeadNotes } from "@/lib/queries/crm";
import { cn } from "@/lib/utils";
import { InternalLeadStatusCRMOptions } from "@/utils/select-options";
import { useQueryClient } from "@tanstack/react-query";
import {
	ArrowLeft,
	BadgeDollarSign,
	BriefcaseBusiness,
	Building2,
	Calendar,
	CheckSquare,
	Clock,
	DollarSign,
	FileText,
	Funnel,
	Globe,
	IdCard,
	Mail,
	Percent,
	Phone,
	Plus,
	TextIcon,
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
	const { data: lead, queryKey, isLoading, isError, error } = useInternalLeadById({ id: leadId });
	const { data: notes } = useInternalLeadNotes({ leadId });
	const [newActivityModalOpen, setNewActivityModalOpen] = useState(false);
	const [newNoteModalOpen, setNewNoteModalOpen] = useState(false);

	const handleOnMutate = async (variables: TUpdateLeadInput) => {
		await queryClient.cancelQueries({ queryKey: queryKey });
		const previousLead = queryClient.getQueryData(queryKey) as TGetLeadsOutputById;
		queryClient.setQueryData(queryKey, {
			...previousLead,
			...variables.lead,
		});
		return { previousLead };
	};
	const handleOnSettled = async () => {
		await queryClient.invalidateQueries({ queryKey: queryKey });
	};

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!lead) return null;

	return (
		<div className="w-full flex flex-col gap-4">
			{/* Header */}
			<div className="flex items-center gap-3">
				<Button variant="ghost" size="fit" asChild className="rounded-full hover:bg-brand/10 flex items-center gap-1 px-2 py-2">
					<Link href={"/admin-dashboard/crm"} className="flex items-center gap-1">
						<ArrowLeft className="w-5 h-5" />
						VOLTAR
					</Link>
				</Button>
				<h1 className="text-lg font-semibold">{lead.titulo || lead.organizacaoNome}</h1>
			</div>
			<LeadStatusController leadId={leadId} leadStatus={lead.statusCRM} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
			<div className="w-full flex items-start gap-3 flex-col lg:flex-row">
				{/* Left - Lead Info */}
				<div className="w-full lg:w-1/2 flex flex-col gap-3">
					<LeadGeneralInformation lead={lead} updateCallbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
				</div>

				{/* Right - Timeline / Activities / Notes */}
				<div className="w-full lg:w-1/2 flex flex-col gap-3">
					{/* Activities */}
					<LeadActivities leadId={leadId} />
					{/* Notes */}
					<LeadNotes leadId={leadId} />
				</div>
			</div>
			{/* Timeline */}
			<SectionWrapper title="TIMELINE" icon={<Clock className="w-4 h-4" />}>
				<LeadTimeline leadId={leadId} />
			</SectionWrapper>
			{newActivityModalOpen && <NewActivity leadId={leadId} closeMenu={() => setNewActivityModalOpen(false)} />}
			{newNoteModalOpen && <NewNote leadId={leadId} closeMenu={() => setNewNoteModalOpen(false)} />}
		</div>
	);
}
