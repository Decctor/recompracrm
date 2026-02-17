"use client";

import type { TGetAdminCoursesOutput } from "@/app/api/admin/community/courses/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createCourse, updateCourse } from "@/lib/mutations/community-admin";
import type { TCommunityCourseAccessLevel, TCommunityCourseStatus } from "@/schemas/community";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import CourseFormMetadataBlock from "./CourseFormMetadataBlock";

type CourseFormProps = {
	courseId: string | null;
	coursesData?: TGetAdminCoursesOutput["data"];
	closeModal: () => void;
};

export type CourseFormState = {
	titulo: string;
	descricao: string;
	thumbnailUrl: string;
	nivelAcesso: TCommunityCourseAccessLevel;
	status: TCommunityCourseStatus;
};

export default function CourseForm({ courseId, coursesData, closeModal }: CourseFormProps) {
	const isEditing = !!courseId;
	const existingCourse = useMemo(() => coursesData?.find((c) => c.id === courseId), [coursesData, courseId]);

	const [state, setState] = useState<CourseFormState>({
		titulo: existingCourse?.titulo ?? "",
		descricao: existingCourse?.descricao ?? "",
		thumbnailUrl: existingCourse?.thumbnailUrl ?? "",
		nivelAcesso: existingCourse?.nivelAcesso ?? "PUBLICO",
		status: existingCourse?.status ?? "RASCUNHO",
	});

	const updateState = useCallback(<K extends keyof CourseFormState>(key: K, value: CourseFormState[K]) => {
		setState((prev) => ({ ...prev, [key]: value }));
	}, []);

	const queryClient = useQueryClient();

	const { mutate, isPending } = useMutation({
		mutationFn: async () => {
			if (isEditing) {
				return await updateCourse({
					id: courseId,
					data: {
						titulo: state.titulo,
						descricao: state.descricao || null,
						thumbnailUrl: state.thumbnailUrl || null,
						nivelAcesso: state.nivelAcesso,
						status: state.status,
					},
				});
			}
			return await createCourse({
				titulo: state.titulo,
				descricao: state.descricao || null,
				thumbnailUrl: state.thumbnailUrl || null,
				nivelAcesso: state.nivelAcesso,
				status: state.status,
			});
		},
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	return (
		<ResponsiveMenu
			menuTitle={isEditing ? "EDITAR CURSO" : "NOVO CURSO"}
			menuDescription={isEditing ? "Atualize as informações do curso" : "Preencha os campos para criar um novo curso"}
			menuActionButtonText={isEditing ? "SALVAR" : "CRIAR CURSO"}
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate()}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
			drawerVariant="lg"
		>
			<CourseFormMetadataBlock state={state} updateState={updateState} />
		</ResponsiveMenu>
	);
}
