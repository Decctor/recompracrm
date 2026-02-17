import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { isValidNumber } from "@/lib/validation";
import type { TUseInternalCommunityCourseState } from "@/state-hooks/use-internal-community-course-state";
import { ListIcon, PencilIcon, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type CommunityCourseSectionsBlockProps = {
	communityCourseSections: TUseInternalCommunityCourseState["state"]["communityCourseSections"];
	addCommunityCourseSection: TUseInternalCommunityCourseState["addCommunityCourseSection"];
	updateCommunityCourseSection: TUseInternalCommunityCourseState["updateCommunityCourseSection"];
	removeCommunityCourseSection: TUseInternalCommunityCourseState["removeCommunityCourseSection"];
};

export default function CommunityCourseSectionsBlock({
	communityCourseSections,
	addCommunityCourseSection,
	updateCommunityCourseSection,
	removeCommunityCourseSection,
}: CommunityCourseSectionsBlockProps) {
	const [newSectionModalOpen, setNewSectionModalOpen] = useState(false);
	const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);

	const editingSection = isValidNumber(editingSectionIndex) ? communityCourseSections[editingSectionIndex as number] : null;
	return (
		<ResponsiveMenuSection title="SEÇÕES" icon={<ListIcon className="w-4 h-4" />}>
			<div className="w-full flex items-center justify-end">
				<Button variant="ghost" size="xs" onClick={() => setNewSectionModalOpen(true)} className="flex items-center gap-1">
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					ADICIONAR
				</Button>
			</div>
			<div className="w-full flex flex-col gap-1.5">
				{communityCourseSections.length > 0 ? (
					communityCourseSections.map((section, index) =>
						!section.deletar ? (
							<CommunityCourseSectionCard
								key={`${section.id}${index.toString()}`}
								section={section}
								handleRemoveClick={() => removeCommunityCourseSection(index)}
								handleEditClick={() => setEditingSectionIndex(index)}
							/>
						) : null,
					)
				) : (
					<div className="w-full text-center text-sm font-medium tracking-tight text-muted-foreground">Nenhuma seção adicionada.</div>
				)}
			</div>
			{newSectionModalOpen && (
				<NewCommunityCourseSectionMenu
					closeMenu={() => setNewSectionModalOpen(false)}
					addCommunityCourseSection={(s) => {
						addCommunityCourseSection(s);
						setNewSectionModalOpen(false);
					}}
				/>
			)}
			{editingSection ? (
				<EditCommunityCourseSectionMenu
					closeMenu={() => setEditingSectionIndex(null)}
					initialSection={editingSection}
					updateCommunityCourseSection={(s) => {
						updateCommunityCourseSection({ index: editingSectionIndex as number, changes: s });
						setEditingSectionIndex(null);
					}}
				/>
			) : null}
		</ResponsiveMenuSection>
	);
}

type CommunityCourseSectionCardProps = {
	section: TUseInternalCommunityCourseState["state"]["communityCourseSections"][number];
	handleRemoveClick: () => void;
	handleEditClick: () => void;
};
function CommunityCourseSectionCard({ section, handleRemoveClick, handleEditClick }: CommunityCourseSectionCardProps) {
	return (
		<div className="w-full flex flex-col gap-1.5 bg-card border-primary/20 rounded-xl border p-1.5 shadow-2xs">
			<h3 className="text-xs font-bold tracking-tight lg:text-sm">{section.titulo}</h3>
			<p className="text-xs text-muted-foreground">{section.descricao || "Nenhuma descrição definida..."}</p>
			<div className="w-full flex items-center justify-end gap-2 flex-wrap">
				<Button
					variant="ghost"
					className="flex items-center gap-1.5 p-2 rounded-full hover:bg-destructive/10 hover:text-destructive duration-300 ease-in-out"
					size="fit"
					onClick={handleRemoveClick}
				>
					<Trash2 className="w-3 min-w-3 h-3 min-h-3" />
				</Button>
				<Button variant="ghost" className="flex items-center gap-1.5 p-2 rounded-full" size="fit" onClick={handleEditClick}>
					<PencilIcon className="w-3 min-w-3 h-3 min-h-3" />
				</Button>
			</div>
		</div>
	);
}

type NewCommunityCourseSectionMenuProps = {
	closeMenu: () => void;
	addCommunityCourseSection: TUseInternalCommunityCourseState["addCommunityCourseSection"];
};
function NewCommunityCourseSectionMenu({ closeMenu, addCommunityCourseSection }: NewCommunityCourseSectionMenuProps) {
	const [sectionHolder, setSectionHolder] = useState<TUseInternalCommunityCourseState["state"]["communityCourseSections"][number]>({
		titulo: "",
		descricao: null,
		ordem: 0,
	});
	function updateSectionHolder(section: Partial<TUseInternalCommunityCourseState["state"]["communityCourseSections"][number]>) {
		setSectionHolder((prev) => ({
			...prev,
			...section,
		}));
	}
	function validateAndAddSection(info: TUseInternalCommunityCourseState["state"]["communityCourseSections"][number]) {
		if (info.titulo.trim().length < 3) {
			toast.error("O título da seção deve ter pelo menos 3 caracteres.");
			return;
		}
		return addCommunityCourseSection(info);
	}
	return (
		<ResponsiveMenu
			menuTitle="NOVA SEÇÃO"
			menuDescription="Preencha os campos para criar uma nova seção"
			menuActionButtonText="CRIAR SEÇÃO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => validateAndAddSection(sectionHolder)}
			actionIsLoading={false}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
		>
			<TextInput
				label="TÍTULO DA SEÇÃO"
				placeholder="Preencha aqui o título da seção..."
				value={sectionHolder.titulo}
				handleChange={(v) => updateSectionHolder({ titulo: v })}
				width="100%"
			/>
			<TextareaInput
				label="DESCRIÇÃO DA SEÇÃO"
				placeholder="Preencha aqui a descrição da seção..."
				value={sectionHolder.descricao ?? ""}
				handleChange={(v) => updateSectionHolder({ descricao: v })}
			/>
		</ResponsiveMenu>
	);
}

type EditCommunityCourseSectionMenuProps = {
	closeMenu: () => void;
	initialSection: TUseInternalCommunityCourseState["state"]["communityCourseSections"][number];
	updateCommunityCourseSection: (info: Parameters<TUseInternalCommunityCourseState["updateCommunityCourseSection"]>[0]["changes"]) => void;
};
function EditCommunityCourseSectionMenu({ closeMenu, initialSection, updateCommunityCourseSection }: EditCommunityCourseSectionMenuProps) {
	const [sectionHolder, setSectionHolder] = useState<TUseInternalCommunityCourseState["state"]["communityCourseSections"][number]>(initialSection);
	function updateSectionHolder(section: Partial<TUseInternalCommunityCourseState["state"]["communityCourseSections"][number]>) {
		setSectionHolder((prev) => ({
			...prev,
			...section,
		}));
	}
	function validateAndUpdateSection(info: TUseInternalCommunityCourseState["state"]["communityCourseSections"][number]) {
		if (info.titulo.trim().length < 3) {
			toast.error("O título da seção deve ter pelo menos 3 caracteres.");
			return;
		}
		return updateCommunityCourseSection(info);
	}
	return (
		<ResponsiveMenu
			menuTitle="EDITAR SEÇÃO"
			menuDescription="Preencha os campos para editar a seção"
			menuActionButtonText="ATUALIZAR SEÇÃO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => validateAndUpdateSection(sectionHolder)}
			actionIsLoading={false}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
		>
			<TextInput
				label="TÍTULO DA SEÇÃO"
				placeholder="Preencha aqui o título da seção..."
				value={sectionHolder.titulo}
				handleChange={(v) => updateSectionHolder({ titulo: v })}
				width="100%"
			/>
			<TextareaInput
				label="DESCRIÇÃO DA SEÇÃO"
				placeholder="Preencha aqui a descrição da seção..."
				value={sectionHolder.descricao ?? ""}
				handleChange={(v) => updateSectionHolder({ descricao: v })}
			/>
		</ResponsiveMenu>
	);
}
