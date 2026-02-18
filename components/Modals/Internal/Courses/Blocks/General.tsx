import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TUseInternalCommunityCourseState } from "@/state-hooks/use-internal-community-course-state";
import { CommunityCourseStatusOptions } from "@/utils/select-options";
import { ImageIcon, LayoutGrid } from "lucide-react";
import Image from "next/image";

type CommunityCourseGeneralBlockProps = {
	communityCourse: TUseInternalCommunityCourseState["state"]["communityCourse"];
	updateCommunityCourse: TUseInternalCommunityCourseState["updateCommunityCourse"];
	communityCourseThumbnailHolder: TUseInternalCommunityCourseState["state"]["communityCourseThumbnailHolder"];
	updateCommunityCourseThumbnailHolder: TUseInternalCommunityCourseState["updateCommunityCourseThumbnailHolder"];
};
export default function CommunityCourseGeneralBlock({
	communityCourse,
	updateCommunityCourse,
	communityCourseThumbnailHolder,
	updateCommunityCourseThumbnailHolder,
}: CommunityCourseGeneralBlockProps) {
	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="w-4 h-4" />}>
			<CourseThumbnailInput
				imageUrl={communityCourse.thumbnailUrl}
				imageHolder={communityCourseThumbnailHolder}
				updateImageHolder={updateCommunityCourseThumbnailHolder}
			/>
			<div className="flex flex-col gap-2">
				<span className="text-sm font-medium tracking-tight text-primary/80">STATUS</span>
				<div className="flex flex-wrap gap-2">
					{CommunityCourseStatusOptions.map((option) => {
						const isSelected = communityCourse.status === option.value;
						return (
							<Button
								key={option.id}
								type="button"
								variant="ghost"
								size="fit"
								className={cn("gap-1.5 px-3 py-1.5 rounded-lg border transition-colors", option.className, {
									"opacity-100": isSelected,
									"opacity-50 border-transparent hover:opacity-80": !isSelected,
								})}
								onClick={() => updateCommunityCourse({ status: option.value })}
							>
								{option.icon}
								<span className="text-xs font-medium">{option.label}</span>
							</Button>
						);
					})}
				</div>
			</div>
			<TextInput
				label="TÍTULO DO CURSO"
				value={communityCourse.titulo}
				placeholder="Preencha aqui o título do curso..."
				handleChange={(value) => updateCommunityCourse({ titulo: value })}
				width="100%"
			/>
			<TextareaInput
				label="DESCRIÇÃO DO CURSO"
				value={communityCourse.descricao ?? ""}
				placeholder="Preencha aqui a descrição do curso..."
				handleChange={(value) => updateCommunityCourse({ descricao: value ?? undefined })}
			/>
		</ResponsiveMenuSection>
	);
}

function CourseThumbnailInput({
	imageUrl,
	imageHolder,
	updateImageHolder,
}: {
	imageUrl: TUseInternalCommunityCourseState["state"]["communityCourse"]["thumbnailUrl"];
	imageHolder: TUseInternalCommunityCourseState["state"]["communityCourseThumbnailHolder"];
	updateImageHolder: TUseInternalCommunityCourseState["updateCommunityCourseThumbnailHolder"];
}) {
	return (
		<div className="flex items-center justify-center min-h-[200px] w-full">
			<label className="relative aspect-video w-full max-w-[320px] cursor-pointer overflow-hidden rounded-lg" htmlFor="course-thumbnail-input">
				<CourseThumbnailPreview imageHolder={imageHolder} imageUrl={imageUrl} />
				<input
					accept=".png,.jpeg,.jpg,.webp"
					className="absolute h-full w-full cursor-pointer opacity-0"
					id="course-thumbnail-input"
					multiple={false}
					onChange={(e) => {
						const file = e.target.files?.[0] ?? null;
						updateImageHolder({
							file,
							previewUrl: file ? URL.createObjectURL(file) : null,
						});
					}}
					tabIndex={-1}
					type="file"
				/>
			</label>
		</div>
	);
}

function CourseThumbnailPreview({
	imageUrl,
	imageHolder,
}: {
	imageUrl: TUseInternalCommunityCourseState["state"]["communityCourse"]["thumbnailUrl"];
	imageHolder: TUseInternalCommunityCourseState["state"]["communityCourseThumbnailHolder"];
}) {
	if (imageHolder.previewUrl) {
		return <Image alt="Thumbnail do curso." fill={true} objectFit="cover" src={imageHolder.previewUrl} />;
	}
	if (imageUrl) {
		return <Image alt="Thumbnail do curso." fill={true} objectFit="cover" src={imageUrl} />;
	}

	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-primary/20">
			<ImageIcon className="h-6 w-6" />
			<p className="text-center font-medium text-xs">DEFINIR THUMBNAIL</p>
		</div>
	);
}
