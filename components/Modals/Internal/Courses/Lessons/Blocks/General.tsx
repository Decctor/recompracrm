import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TUseInternalCommunityCourseLessonState } from "@/state-hooks/use-internal-community-course-lesson-state";
import { LayoutGrid } from "lucide-react";

type LessonGeneralBlockProps = {
	lesson: TUseInternalCommunityCourseLessonState["state"]["lesson"];
	updateLesson: TUseInternalCommunityCourseLessonState["updateLesson"];
};
export default function LessonGeneralBlock({ lesson, updateLesson }: LessonGeneralBlockProps) {
	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="h-4 min-h-4 w-4 min-w-4" />}>
			<TextInput
				label="TÍTULO"
				placeholder="Preencha aqui o título da aula..."
				value={lesson.titulo}
				handleChange={(value) => updateLesson({ titulo: value })}
			/>
			<TextareaInput
				label="Descrição (opcional)"
				placeholder="Preencha aqui uma breve descrição da aula..."
				value={lesson.descricao ?? ""}
				handleChange={(value) => updateLesson({ descricao: value })}
			/>
		</ResponsiveMenuSection>
	);
}
