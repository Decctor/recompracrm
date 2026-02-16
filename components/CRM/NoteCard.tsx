"use client";
import type { TDeleteNoteInput, TDeleteNoteOutput, TGetNotesOutput, TGetNotesOutputDefault, TUpdateNoteInput } from "@/app/api/admin/crm/notes/route";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatNameAsInitials } from "@/lib/formatting";
import { deleteNote } from "@/lib/mutations/crm";
import { cn } from "@/lib/utils";
import type { TInternalLeadNoteEntity } from "@/services/drizzle/schema";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

type NoteCardProps = {
	note: TGetNotesOutputDefault[number];
	updateCallbacks?: {
		onMutate?: (variables: TUpdateNoteInput) => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
	deleteCallbacks?: {
		onMutate?: (variables: TDeleteNoteInput) => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

export default function NoteCard({ note, updateCallbacks, deleteCallbacks }: NoteCardProps) {
	const { mutate: deleteNoteMutation, isPending: isDeletingNote } = useMutation({
		mutationKey: ["delete-internal-note"],
		mutationFn: deleteNote,
		onMutate: (variables) => {
			if (deleteCallbacks?.onMutate) deleteCallbacks.onMutate(variables);
		},
		onSuccess: (data) => {
			if (deleteCallbacks?.onSuccess) deleteCallbacks.onSuccess();
			return toast.success(data.message);
		},
		onError: (error) => {
			if (deleteCallbacks?.onError) deleteCallbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			if (deleteCallbacks?.onSettled) deleteCallbacks.onSettled();
		},
	});
	return (
		<div className={cn("bg-yellow-100 border border-yellow-200 flex w-full flex-col gap-1 rounded-xl px-3 py-4 shadow-2xs")}>
			<div className="flex items-start justify-between gap-2">
				<p className="text-sm whitespace-pre-wrap flex-1">{note.conteudo}</p>
				<div className="flex items-center gap-1 shrink-0">
					<Button disabled={isDeletingNote} variant="ghost" size="sm" onClick={() => deleteNoteMutation({ id: note.id })}>
						<Trash2 className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>
			<div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
				{note.autor && (
					<div className="flex items-center gap-1">
						<Avatar className="w-4 h-4 min-w-4 min-h-4">
							<AvatarImage src={note.autor.avatarUrl ?? undefined} alt={note.autor.nome} />
							<AvatarFallback>{formatNameAsInitials(note.autor.nome)}</AvatarFallback>
						</Avatar>
						<span className="text-xs font-medium">{note.autor.nome}</span>
					</div>
				)}
				<span>{formatDateAsLocale(note.dataInsercao)}</span>
			</div>
		</div>
	);
}
