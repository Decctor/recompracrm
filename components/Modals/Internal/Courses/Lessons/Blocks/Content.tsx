import SelectInput from "@/components/Inputs/SelectInput";
import VideoInput from "@/components/Inputs/VideoInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TCommunityLessonContentTypeEnum } from "@/schemas/enums";
import type { TUseInternalCommunityCourseLessonState } from "@/state-hooks/use-internal-community-course-lesson-state";
import { LessonContentTypeOptions } from "@/utils/select-options";
import { FileText } from "lucide-react";

type LessonContentBlockProps = {
	lesson: TUseInternalCommunityCourseLessonState["state"]["lesson"];
	updateLesson: TUseInternalCommunityCourseLessonState["updateLesson"];
	videoHolder: TUseInternalCommunityCourseLessonState["state"]["videoHolder"];
	updateVideoHolder: TUseInternalCommunityCourseLessonState["updateVideoHolder"];
};
export default function LessonContentBlock({ lesson, updateLesson, videoHolder, updateVideoHolder }: LessonContentBlockProps) {
	const showVideoUpload = lesson.tipoConteudo === "VIDEO" || lesson.tipoConteudo === "VIDEO_TEXTO";
	const showTextContent = lesson.tipoConteudo === "TEXTO" || lesson.tipoConteudo === "VIDEO_TEXTO";
	return (
		<ResponsiveMenuSection title="CONTEÚDO" icon={<FileText className="h-4 min-h-4 w-4 min-w-4" />}>
			<SelectInput
				label="TIPO DE CONTEÚDO"
				value={lesson.tipoConteudo}
				resetOptionLabel="SELECIONE O TIPO DE CONTEÚDO"
				handleChange={(value) => updateLesson({ tipoConteudo: value as TCommunityLessonContentTypeEnum })}
				width="100%"
				options={LessonContentTypeOptions.map((option) => ({
					id: option.id,
					value: option.value,
					label: option.label,
					startContent: option.icon,
				}))}
				onReset={() => updateLesson({ tipoConteudo: "VIDEO" })}
			/>
			{showVideoUpload && (
				<VideoInput label="ARQUIVO DE VÍDEO" videoHolder={videoHolder} updateVideoHolder={updateVideoHolder} />
			)}

			{showTextContent && (
				<div className="flex flex-col gap-1.5">
					<Label>CONTEÚDO EM TEXTO </Label>
					<Textarea
						placeholder="Escreva aqui o conteúdo da aula..."
						value={lesson.conteudoTexto ?? ""}
						onChange={(event) => updateLesson({ conteudoTexto: event.target.value })}
						rows={8}
						className="font-mono text-sm"
					/>
				</div>
			)}
		</ResponsiveMenuSection>
	);
}
