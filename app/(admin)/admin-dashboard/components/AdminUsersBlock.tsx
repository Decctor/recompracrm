"use client";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Input } from "@/components/ui/input";
import { useAdminUsers } from "@/lib/queries/admin";
import { useQueryClient } from "@tanstack/react-query";
import AdminUserRow from "./AdminUserRow";

export default function AdminUsersBlock() {
	const queryClient = useQueryClient();
	const { data, isLoading, error, queryKey, params, updateParams } = useAdminUsers();

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey });

	const users = data?.users;

	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<h2 className="text-lg font-semibold tracking-tight uppercase">Usuários Cadastrados</h2>
				<Input
					value={params.search ?? ""}
					onChange={(e) => updateParams({ search: e.target.value, page: 1 })}
					placeholder="Buscar por nome, email ou telefone..."
					className="w-full sm:w-72"
				/>
			</div>
			<GeneralPaginationComponent
				activePage={params.page}
				totalPages={data?.totalPages || 0}
				selectPage={(page) => updateParams({ page })}
				queryLoading={isLoading}
				pageSize={params.pageSize}
				onPageSizeChange={(pageSize) => updateParams({ pageSize, page: 1 })}
				itemsMatchedText={data?.usersMatched === 1 ? "1 usuário encontrado" : `${data?.usersMatched || 0} usuários encontrados`}
				itemsShowingText={`mostrando ${users?.length || 0}`}
			/>
			{isLoading ? <LoadingComponent /> : null}
			{error ? <ErrorComponent msg="Erro ao carregar usuários" /> : null}
			{users ? (
				users.length > 0 ? (
					<div className="flex w-full flex-col gap-2">
						{users.map((user) => (
							<AdminUserRow key={user.id} user={user} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
						))}
					</div>
				) : (
					<div className="bg-card border-border flex w-full flex-col items-center justify-center gap-2 rounded-xl border p-8">
						<p className="text-sm text-foreground/60">Nenhum usuário encontrado.</p>
					</div>
				)
			) : null}
		</div>
	);
}
