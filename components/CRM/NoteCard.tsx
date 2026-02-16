"use client";
import type { TInternalLeadNoteEntity } from "@/services/drizzle/schema";
import { formatDateAsLocale } from "@/lib/formatting";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type NoteCardProps = {
	note: TInternalLeadNoteEntity & { autor?: { nome: string } | null };
	onEdit?: (id: string) => void;
	onDelete?: (id: string) => void;
};

export default function NoteCard({ note, onEdit, onDelete }: NoteCardProps) {
	return (
		<div className="p-3 border rounded-lg">
			<div className="flex items-start justify-between gap-2">
				<p className="text-sm whitespace-pre-wrap flex-1">{note.conteudo}</p>
				<div className="flex items-center gap-1 shrink-0">
					{onEdit && (
						<Button variant="ghost" size="sm" onClick={() => onEdit(note.id)}>
							<Pencil className="w-3.5 h-3.5" />
						</Button>
					)}
					{onDelete && (
						<Button variant="ghost" size="sm" onClick={() => onDelete(note.id)}>
							<Trash2 className="w-3.5 h-3.5" />
						</Button>
					)}
				</div>
			</div>
			<div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
				{note.autor && <span>{note.autor.nome}</span>}
				<span>{formatDateAsLocale(note.dataInsercao)}</span>
			</div>
		</div>
	);
}
