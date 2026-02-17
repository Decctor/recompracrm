import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TUseInternalCommunityCourseState } from "@/state-hooks/use-internal-community-course-state";
import { CommunityCourseStatusOptions } from "@/utils/select-options";
import { LayoutGrid } from "lucide-react";

type CommunityCourseGeneralBlockProps = {
	communityCourse: TUseInternalCommunityCourseState["state"]["communityCourse"];
	updateCommunityCourse: TUseInternalCommunityCourseState["updateCommunityCourse"];
};
export default function CommunityCourseGeneralBlock({ communityCourse, updateCommunityCourse }: CommunityCourseGeneralBlockProps) {
	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="w-4 h-4" />}>
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
