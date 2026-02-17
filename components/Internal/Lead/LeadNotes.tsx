import type { TDeleteNoteInput, TDeleteNoteOutput, TGetNotesOutputByLeadId } from "@/app/api/admin/crm/notes/route";
import NoteCard from "@/components/CRM/NoteCard";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import SectionWrapper from "@/components/ui/section-wrapper";
import { getErrorMessage } from "@/lib/errors";
import { useInternalLeadNotes } from "@/lib/queries/crm";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";

type LeadNotesProps = {
	leadId: string;
};

export default function LeadNotes({ leadId }: LeadNotesProps) {
	const queryClient = useQueryClient();
	const { data: notes, queryKey, isLoading, isError, isSuccess, error } = useInternalLeadNotes({ leadId });
	const [newNoteModalOpen, setNewNoteModalOpen] = useState(false);

	const handleDeleteOnUpdate = async (variables: TDeleteNoteInput) => {
		await queryClient.cancelQueries({ queryKey: queryKey });
		const previousNotes = queryClient.getQueryData(queryKey) as TGetNotesOutputByLeadId;
		queryClient.setQueryData(
			queryKey,
			(previousNotes || []).filter((note) => note.id !== variables.id),
		);
		return { previousNotes };
	};
	const handleDeleteOnSettled = async () => {
		await queryClient.invalidateQueries({ queryKey: queryKey });
	};
	return (
		<SectionWrapper
			title="Notas"
			icon={<FileText className="w-4 h-4" />}
			actions={
				<Button variant="ghost" size="xs" onClick={() => setNewNoteModalOpen(true)} className="flex items-center gap-1">
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					ADICIONAR
				</Button>
			}
		>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				notes.length > 0 ? (
					notes.map((note) => (
						<NoteCard key={note.id} note={note} deleteCallbacks={{ onMutate: handleDeleteOnUpdate, onSettled: handleDeleteOnSettled }} />
					))
				) : (
					<p className="text-sm text-muted-foreground text-center py-8">Nenhuma nota registrada.</p>
				)
			) : null}
		</SectionWrapper>
	);
}
