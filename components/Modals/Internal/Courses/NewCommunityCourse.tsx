import type { TCreateCommunityCourseInput } from "@/app/api/admin/community/courses/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createCommunityCourse } from "@/lib/mutations/community-admin";
import { useInternalCommunityCourseState } from "@/state-hooks/use-internal-community-course-state";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import CommunityCourseGeneralBlock from "./Blocks/General";
import CommunityCourseSectionsBlock from "./Blocks/Sections";

type NewCommunityCourseProps = {
	closeModal: () => void;
	callbacks?: {
		onMutate?: (info: TCreateCommunityCourseInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};
export function NewCommunityCourse({ closeModal, callbacks }: NewCommunityCourseProps) {
	const {
		state,
		updateCommunityCourse,
		addCommunityCourseSection,
		updateCommunityCourseSection,
		removeCommunityCourseSection,
		redefineState,
		resetState,
	} = useInternalCommunityCourseState({ initialState: {} });

	const { mutate: handleCreateCommunityCourseMutation, isPending } = useMutation({
		mutationKey: ["create-community-course"],
		mutationFn: createCommunityCourse,
		onMutate: async (variables) => {
			if (callbacks?.onMutate) callbacks.onMutate(variables);
			return;
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(data.message);
			return closeModal();
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError(error);
			return toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			return;
		},
	});
	return (
		<ResponsiveMenu
			menuTitle="NOVO CURSO"
			menuDescription="Preencha os campos para criar um novo curso"
			menuActionButtonText="CRIAR CURSO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleCreateCommunityCourseMutation(state)}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<CommunityCourseGeneralBlock communityCourse={state.communityCourse} updateCommunityCourse={updateCommunityCourse} />
			<CommunityCourseSectionsBlock
				communityCourseSections={state.communityCourseSections}
				addCommunityCourseSection={addCommunityCourseSection}
				removeCommunityCourseSection={removeCommunityCourseSection}
				updateCommunityCourseSection={updateCommunityCourseSection}
			/>
		</ResponsiveMenu>
	);
}
