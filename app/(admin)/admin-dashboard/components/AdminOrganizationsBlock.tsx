"use client";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Input } from "@/components/ui/input";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { useOrganizations } from "@/lib/queries/admin";
import { useQueryClient } from "@tanstack/react-query";
import AdminOrganizationRow from "./AdminOrganizationRow";

type TAdminOrganizationsBlockProps = {
	user: TAuthUserSession["user"];
};
export default function AdminOrganizationsBlock({ user }: TAdminOrganizationsBlockProps) {
	const queryClient = useQueryClient();
	const { data, isLoading, error, queryKey, params, updateParams } = useOrganizations();

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey });

	const organizations = data?.organizations;

	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<h2 className="text-lg font-semibold tracking-tight uppercase">Organizações Cadastradas</h2>
				<Input
					value={params.search ?? ""}
					onChange={(e) => updateParams({ search: e.target.value, page: 1 })}
					placeholder="Buscar por nome..."
					className="w-full sm:w-64"
				/>
			</div>
			<GeneralPaginationComponent
				activePage={params.page}
				totalPages={data?.totalPages || 0}
				selectPage={(page) => updateParams({ page })}
				queryLoading={isLoading}
				pageSize={params.pageSize}
				onPageSizeChange={(pageSize) => updateParams({ pageSize, page: 1 })}
				itemsMatchedText={data?.organizationsMatched === 1 ? "1 organização encontrada" : `${data?.organizationsMatched || 0} organizações encontradas`}
				itemsShowingText={`mostrando ${organizations?.length || 0}`}
			/>
			{isLoading ? <LoadingComponent /> : null}
			{error ? <ErrorComponent msg="Erro ao carregar organizações" /> : null}
			{organizations ? (
				organizations.length > 0 ? (
					<div className="flex w-full flex-col gap-2">
						{organizations.map((org) => (
							<AdminOrganizationRow
								key={org.id}
								sessionUser={user}
								organization={org}
								callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
							/>
						))}
					</div>
				) : (
					<div className="bg-card border-border flex w-full flex-col items-center justify-center gap-2 rounded-xl border p-8">
						<p className="text-sm text-foreground/60">Nenhuma organização encontrada.</p>
					</div>
				)
			) : null}
		</div>
	);
}
