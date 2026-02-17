"use client";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { createNote } from "@/lib/mutations/crm";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type NewNoteProps = {
	leadId: string;
	closeMenu: () => void;
};

export default function NewNote({ leadId, closeMenu }: NewNoteProps) {
	const queryClient = useQueryClient();
	const [conteudo, setConteudo] = useState("");

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-note"],
		mutationFn: () =>
			createNote({
				note: { leadId, conteudo },
			}),
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: ["internal-lead-notes", leadId] });
			queryClient.invalidateQueries({ queryKey: ["internal-lead-timeline", leadId] });
			closeMenu();
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVA NOTA"
			menuDescription="Adicione uma observação ao lead"
			menuActionButtonText="SALVAR NOTA"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate()}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
			dialogVariant="sm"
		>
			<ResponsiveMenuSection title="CONTEÚDO" icon={<FileText className="w-3.5 h-3.5" />}>
				<TextareaInput
					label="Nota"
					placeholder="Escreva sua observação..."
					value={conteudo}
					handleChange={setConteudo}
				/>
			</ResponsiveMenuSection>
		</ResponsiveMenu>
	);
}
