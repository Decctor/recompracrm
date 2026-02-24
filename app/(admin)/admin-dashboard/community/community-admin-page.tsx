"use client";

import type { TCreateCommunityCourseInput, TGetCommunityCoursesOutputDefault } from "@/app/api/admin/community/courses/route";
import type { TCreateCommunityMaterialInput, TGetCommunityMaterialsOutputDefault } from "@/app/api/admin/community/materials/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { ControlCommunityCourse } from "@/components/Modals/Internal/Courses/ControlCommunityCourse";
import { NewCommunityCourse } from "@/components/Modals/Internal/Courses/NewCommunityCourse";
import { ControlCommunityMaterial } from "@/components/Modals/Internal/Materials/ControlCommunityMaterial";
import { NewCommunityMaterial } from "@/components/Modals/Internal/Materials/NewCommunityMaterial";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { StatBadge } from "@/components/ui/stat-badge";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale } from "@/lib/formatting";
import { useAdminCommunityCourses, useAdminCommunityMaterials } from "@/lib/queries/community-admin";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Diamond, Eye, FileText, Pencil, Plus, VideoIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { BsCalendarPlus } from "react-icons/bs";

export default function CommunityAdminPage() {
	const queryClient = useQueryClient();
	const [newCourseModalOpen, setNewCourseModalOpen] = useState(false);
	const [editCourseId, setEditCourseId] = useState<string | null>(null);
	const [newMaterialModalOpen, setNewMaterialModalOpen] = useState(false);
	const [editMaterialId, setEditMaterialId] = useState<string | null>(null);
	const {
		data: coursesData,
		isLoading,
		isError,
		error,
		isSuccess,
		queryKey,
		params,
		updateParams,
	} = useAdminCommunityCourses({
		initialParams: {},
	});
	const {
		data: materialsData,
		isLoading: materialsIsLoading,
		isError: materialsIsError,
		error: materialsError,
		isSuccess: materialsIsSuccess,
		queryKey: materialsQueryKey,
		params: materialsParams,
		updateParams: updateMaterialsParams,
	} = useAdminCommunityMaterials({
		initialParams: {},
	});

	const courses = coursesData?.communityCourses;
	const coursesMatched = coursesData?.communityCoursesMatched ?? 0;
	const coursesShowing = courses ? courses.length : 0;
	const totalPages = coursesData?.totalPages;

	const materials = materialsData?.communityMaterials;
	const materialsMatched = materialsData?.communityMaterialsMatched ?? 0;
	const materialsShowing = materials ? materials.length : 0;
	const materialsTotalPages = materialsData?.totalPages;

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey: queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey: queryKey });
	const handleMaterialsOnMutate = async () => await queryClient.cancelQueries({ queryKey: materialsQueryKey });
	const handleMaterialsOnSettled = async () => await queryClient.invalidateQueries({ queryKey: materialsQueryKey });
	return (
		<div className="w-full h-full flex flex-col gap-6 p-4 lg:p-6">
			<div className="w-full flex flex-col gap-3">
				<div className="w-full flex items-center justify-between gap-2">
					<h2 className="text-lg font-semibold">CURSOS</h2>
					<Button onClick={() => setNewCourseModalOpen(true)} className="flex items-center gap-2">
						<Plus className="w-4 h-4 min-w-4 min-h-4" />
						NOVO CURSO
					</Button>
				</div>
				<GeneralPaginationComponent
					activePage={params.page}
					queryLoading={isLoading}
					selectPage={(page) => updateParams({ page })}
					totalPages={totalPages || 0}
					itemsMatchedText={coursesMatched > 0 ? `${coursesMatched} cursos encontrados.` : `${coursesMatched} curso encontrado.`}
					itemsShowingText={coursesShowing > 0 ? `Mostrando ${coursesShowing} cursos.` : `Mostrando ${coursesShowing} curso.`}
				/>
				<div className="w-full flex items-start flex-wrap gap-x-3 gap-y-1">
					{isLoading ? <LoadingComponent /> : null}
					{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
					{isSuccess ? (
						courses && courses.length > 0 ? (
							courses.map((course) => (
								<div key={course.id} className="w-[300px]">
									<CommunityCourseCard communityCourse={course} handleEditClick={() => setEditCourseId(course.id)} />
								</div>
							))
						) : (
							<EmptyState title="Nenhum curso cadastrado" description="Clique em NOVO CURSO para começar." />
						)
					) : null}
				</div>
			</div>

			<div className="w-full flex flex-col gap-3">
				<div className="w-full flex items-center justify-between gap-2">
					<h2 className="text-lg font-semibold">MATERIAIS</h2>

					<Button onClick={() => setNewMaterialModalOpen(true)} className="flex items-center gap-2">
						<Plus className="w-4 h-4 min-w-4 min-h-4" />
						NOVO MATERIAL
					</Button>
				</div>
				<GeneralPaginationComponent
					activePage={materialsParams.page}
					queryLoading={materialsIsLoading}
					selectPage={(page) => updateMaterialsParams({ page })}
					totalPages={materialsTotalPages || 0}
					itemsMatchedText={materialsMatched > 0 ? `${materialsMatched} materiais encontrados.` : `${materialsMatched} material encontrado.`}
					itemsShowingText={materialsShowing > 0 ? `Mostrando ${materialsShowing} materiais.` : `Mostrando ${materialsShowing} material.`}
				/>
				<div className="w-full flex items-start flex-wrap gap-x-3 gap-y-1">
					{materialsIsLoading ? <LoadingComponent /> : null}
					{materialsIsError ? <ErrorComponent msg={getErrorMessage(materialsError)} /> : null}
					{materialsIsSuccess ? (
						materials && materials.length > 0 ? (
							materials.map((material) => (
								<div key={material.id} className="w-[300px]">
									<CommunityMaterialCard communityMaterial={material} handleEditClick={() => setEditMaterialId(material.id)} />
								</div>
							))
						) : (
							<EmptyState title="Nenhum material cadastrado" description="Clique em NOVO MATERIAL para começar." />
						)
					) : null}
				</div>
			</div>

			{newCourseModalOpen && (
				<NewCommunityCourse closeModal={() => setNewCourseModalOpen(false)} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
			)}
			{editCourseId && (
				<ControlCommunityCourse
					courseId={editCourseId}
					closeModal={() => setEditCourseId(null)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			)}
			{newMaterialModalOpen && (
				<NewCommunityMaterial
					closeModal={() => setNewMaterialModalOpen(false)}
					callbacks={{ onMutate: handleMaterialsOnMutate, onSettled: handleMaterialsOnSettled }}
				/>
			)}
			{editMaterialId && (
				<ControlCommunityMaterial
					materialId={editMaterialId}
					closeModal={() => setEditMaterialId(null)}
					callbacks={{ onMutate: handleMaterialsOnMutate, onSettled: handleMaterialsOnSettled }}
				/>
			)}
		</div>
	);
}

type CommunityCourseCardProps = {
	communityCourse: TGetCommunityCoursesOutputDefault["communityCourses"][number];
	handleEditClick: () => void;
};
function CommunityCourseCard({ communityCourse, handleEditClick }: CommunityCourseCardProps) {
	return (
		<div className={cn("bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="w-full aspect-square relative rounded-lg overflow-hidden">
				{communityCourse.thumbnailUrl ? (
					<Image src={communityCourse.thumbnailUrl} alt={communityCourse.titulo} fill className="object-cover" />
				) : (
					<div className="bg-primary/50 text-primary-foreground flex h-full w-full items-center justify-center">
						<VideoIcon className="w-6 h-6" />
					</div>
				)}
			</div>
			<div className="w-full flex flex-col gap-0.5">
				<div className="w-full flex items-center justify-between gap-2">
					<h3 className="text-xs font-bold tracking-tight lg:text-sm">{communityCourse.titulo}</h3>
					<StatBadge icon={<Diamond className="w-4 h-4" />} value={communityCourse.status} tooltipContent="Status do curso" />
				</div>
				<p className="text-xs text-muted-foreground">{communityCourse.descricao}</p>
			</div>
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-1">
					<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-primary")}>
						<BsCalendarPlus className="w-3 min-w-3 h-3 min-h-3" />
						<p className="text-xs font-medium tracking-tight uppercase">{formatDateAsLocale(communityCourse.dataInsercao)}</p>
					</div>
				</div>
				<div className="flex items-center gap-1">
					<Button variant="ghost" className="flex items-center gap-1.5" size="sm" onClick={() => handleEditClick()}>
						<Pencil className="w-3 min-w-3 h-3 min-h-3" />
						EDITAR
					</Button>
					<Button variant="ghost" className="flex items-center gap-1.5" size="sm" asChild>
						<Link href={`/admin-dashboard/community/${communityCourse.id}?redirectBackTo=/admin-dashboard/community`}>
							<Eye className="w-3 min-w-3 h-3 min-h-3" />
							VER
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}

type CommunityMaterialCardProps = {
	communityMaterial: TGetCommunityMaterialsOutputDefault["communityMaterials"][number];
	handleEditClick: () => void;
};
function CommunityMaterialCard({ communityMaterial, handleEditClick }: CommunityMaterialCardProps) {
	return (
		<div className={cn("bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="w-full aspect-square relative rounded-lg overflow-hidden">
				{communityMaterial.capaUrl ? (
					<Image src={communityMaterial.capaUrl} alt={communityMaterial.titulo} fill className="object-cover" />
				) : (
					<div className="bg-primary/50 text-primary-foreground flex h-full w-full items-center justify-center">
						<FileText className="w-6 h-6" />
					</div>
				)}
			</div>
			<div className="w-full flex flex-col gap-0.5">
				<div className="w-full flex items-center justify-between gap-2">
					<h3 className="text-xs font-bold tracking-tight lg:text-sm">{communityMaterial.titulo}</h3>
					<StatBadge icon={<Diamond className="w-4 h-4" />} value={communityMaterial.status} tooltipContent="Status do material" />
				</div>
				<p className="text-xs text-muted-foreground">{communityMaterial.descricao}</p>
			</div>
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-1">
					<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-primary")}>
						<BsCalendarPlus className="w-3 min-w-3 h-3 min-h-3" />
						<p className="text-xs font-medium tracking-tight uppercase">{formatDateAsLocale(communityMaterial.dataInsercao)}</p>
					</div>
				</div>
				<div className="flex items-center gap-1">
					<Button variant="ghost" className="flex items-center gap-1.5" size="sm" onClick={() => handleEditClick()}>
						<Pencil className="w-3 min-w-3 h-3 min-h-3" />
						EDITAR
					</Button>
					{/* <Button variant="ghost" className="flex items-center gap-1.5" size="sm" asChild>
						<Link href={`/admin-dashboard/community?materialId=${communityMaterial.id}`}>
							<Eye className="w-3 min-w-3 h-3 min-h-3" />
							VER
						</Link>
					</Button> */}
				</div>
			</div>
		</div>
	);
}

function EmptyState({ title, description }: { title: string; description: string }) {
	return (
		<div className="w-full self-center flex flex-col items-center justify-center py-20 text-center">
			<div className="rounded-full bg-primary/10 p-4 mb-4">
				<svg className="w-8 h-8 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
					<title>{title}</title>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
					/>
				</svg>
			</div>
			<h3 className="text-lg font-semibold">{title}</h3>
			<p className="text-sm text-muted-foreground mt-1">{description}</p>
		</div>
	);
}
