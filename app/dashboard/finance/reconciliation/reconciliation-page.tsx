"use client";

import { useMemo, useState } from "react";
import ControlStatementTransaction from "@/components/Modals/Finances/Reconciliation/ControlStatementTransaction";
import NewStatementImport from "@/components/Modals/Finances/Reconciliation/NewStatementImport";
import SelectInput from "@/components/Inputs/SelectInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InteractiveFilter } from "@/components/ui/interactive-filter";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { getErrorMessage } from "@/lib/errors";
import {
	rejectReconciliationMatch,
	rematchStatementLines,
	syncReconciliation,
	updateStatementTransaction,
} from "@/lib/mutations/financial-reconciliation";
import { useFinancesAccounts } from "@/lib/queries/finances";
import { useStatementTransactions } from "@/lib/queries/financial-reconciliation";
import { FinancialAccountTypeOptions } from "@/utils/select-options";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, CheckCircle2, Clock, EyeOff, FileCheck2, Landmark, ListFilter, RefreshCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { StatementLineCard } from "./_components/statement-line-card";
import { StatusCountCard } from "./_components/status-count-card";

const LINE_STATUS_OPTIONS = [
	{ id: "PENDENTE", value: "PENDENTE", label: "PENDENTE", icon: <Clock className="w-4 h-4 text-blue-600" /> },
	{ id: "CONCILIADA", value: "CONCILIADA", label: "CONCILIADA", icon: <CheckCircle2 className="w-4 h-4 text-green-600" /> },
	{ id: "IGNORADA", value: "IGNORADA", label: "IGNORADA", icon: <EyeOff className="w-4 h-4 text-gray-600" /> },
];

export default function FinanceReconciliationPage() {
	const queryClient = useQueryClient();
	const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
	const [isImportingStatement, setIsImportingStatement] = useState(false);
	const [resolvingLineId, setResolvingLineId] = useState<string | null>(null);

	const { data: accountsData } = useFinancesAccounts({ initialFilters: { stats: false } });
	const accountOptions = useMemo(() => {
		const accounts = accountsData?.accounts ?? [];
		// Contas bancárias e carteiras digitais primeiro — são as que recebem extratos.
		const priority: Record<string, number> = { BANCO: 0, CARTEIRA_DIGITAL: 1, CAIXA: 2 };
		return [...accounts]
			.sort((a, b) => (priority[a.tipo] ?? 3) - (priority[b.tipo] ?? 3) || a.nome.localeCompare(b.nome))
			.map((account) => {
				const typeConfig = FinancialAccountTypeOptions.find((option) => option.value === account.tipo) ?? null;
				return {
					id: account.id,
					value: account.id,
					label: `${account.nome}${typeConfig ? ` (${typeConfig.label})` : ""}`,
					startContent: typeConfig?.icon,
				};
			});
	}, [accountsData?.accounts]);

	const { data, isLoading, isError, isSuccess, error, params, updateParams } = useStatementTransactions({
		contaFinanceiraId: selectedAccountId ?? "",
	});

	const transactions = data?.transactions ?? [];
	const transactionsMatched = data?.transactionsMatched ?? 0;
	const totalPages = data?.totalPages ?? 0;
	const statusCounts = data?.statusCounts ?? { pendentes: 0, conciliadas: 0, ignoradas: 0 };

	const selectedStatusesLabel = useMemo(
		() => params.statuses.map((status) => LINE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status).join(", "),
		[params.statuses],
	);

	// Sugestões visíveis com confiança máxima (1.0) — passíveis de confirmação em lote.
	const exactSuggestionMatchIds = useMemo(
		() =>
			transactions
				.filter((line) => line.status === "PENDENTE")
				.flatMap((line) => line.matches.filter((match) => match.status === "SUGERIDO" && match.confianca === 1).map((match) => match.id)),
		[transactions],
	);

	function invalidateReconciliationQueries() {
		void queryClient.invalidateQueries({ queryKey: ["reconciliation-statement-transactions"] });
		void queryClient.invalidateQueries({ queryKey: ["reconciliation-statement-transaction-by-id"] });
		void queryClient.invalidateQueries({ queryKey: ["reconciliation-statement-imports"] });
		void queryClient.invalidateQueries({ queryKey: ["finances-financial-transactions"] });
	}

	const { mutate: mutateRematch, isPending: isRematchPending } = useMutation({
		mutationKey: ["rematch-statement-lines"],
		mutationFn: rematchStatementLines,
		onSuccess: (data) => {
			toast.success(data.message);
			invalidateReconciliationQueries();
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	const {
		mutate: mutateSync,
		isPending: isSyncPending,
		variables: syncVariables,
	} = useMutation({
		mutationKey: ["sync-reconciliation"],
		mutationFn: syncReconciliation,
		onSuccess: (data) => {
			if (data.data.erros.length > 0) data.data.erros.forEach((erro) => toast.error(erro));
			else toast.success(data.message);
			invalidateReconciliationQueries();
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	const {
		mutate: mutateRejectMatch,
		isPending: isRejectPending,
		variables: rejectVariables,
	} = useMutation({
		mutationKey: ["reject-reconciliation-match"],
		mutationFn: rejectReconciliationMatch,
		onSuccess: (data) => {
			toast.success(data.message);
			invalidateReconciliationQueries();
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	const {
		mutate: mutateIgnoreLine,
		isPending: isIgnorePending,
		variables: ignoreVariables,
	} = useMutation({
		mutationKey: ["update-statement-transaction"],
		mutationFn: updateStatementTransaction,
		onSuccess: (data) => {
			toast.success(data.message);
			invalidateReconciliationQueries();
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	if (!selectedAccountId) {
		return (
			<div className="flex w-full flex-col gap-3">
				<div className="w-full max-w-md">
					<SelectInput
						label="CONTA FINANCEIRA"
						value={selectedAccountId}
						options={accountOptions}
						resetOptionLabel="NENHUMA CONTA SELECIONADA"
						onReset={() => setSelectedAccountId(null)}
						handleChange={(value) => setSelectedAccountId(value)}
					/>
				</div>
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Landmark />
						</EmptyMedia>
						<EmptyTitle>Selecione uma conta financeira</EmptyTitle>
						<EmptyDescription>
							Escolha acima a conta bancária ou carteira digital cujo extrato você deseja conciliar. Depois, importe o extrato (OFX é o formato recomendado)
							e confirme as sugestões de conciliação.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent />
				</Empty>
			</div>
		);
	}

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
				<div className="w-full max-w-md">
					<SelectInput
						label="CONTA FINANCEIRA"
						value={selectedAccountId}
						options={accountOptions}
						resetOptionLabel="NENHUMA CONTA SELECIONADA"
						onReset={() => setSelectedAccountId(null)}
						handleChange={(value) => {
							setSelectedAccountId(value);
							updateParams({ page: 1 });
						}}
					/>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<LoadingButton
						type="button"
						variant="outline"
						loading={isRematchPending}
						onClick={() => mutateRematch({ contaFinanceiraId: selectedAccountId })}
						className="flex items-center gap-1.5"
					>
						<RefreshCcw className="h-4 w-4" />
						REPROCESSAR SUGESTÕES
					</LoadingButton>
					<Button type="button" onClick={() => setIsImportingStatement(true)} className="flex items-center gap-1.5">
						<Upload className="h-4 w-4" />
						IMPORTAR EXTRATO
					</Button>
				</div>
			</div>

			<div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
				<StatusCountCard label="PENDENTES" count={statusCounts.pendentes} icon={<Clock className="h-4 w-4 text-blue-600" />} />
				<StatusCountCard label="CONCILIADAS" count={statusCounts.conciliadas} icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} />
				<StatusCountCard label="IGNORADAS" count={statusCounts.ignoradas} icon={<EyeOff className="h-4 w-4 text-gray-500" />} />
			</div>

			<div className="flex flex-col gap-2 sm:flex-row">
				<Input
					value={params.search}
					placeholder="Pesquisar linha do extrato..."
					onChange={(e) => updateParams({ search: e.target.value, page: 1 })}
					className="grow rounded-xl"
				/>
				<LoadingButton
					type="button"
					variant="outline"
					loading={isSyncPending && (syncVariables?.confirmarMatchIds?.length ?? 0) > 1}
					disabled={exactSuggestionMatchIds.length === 0}
					onClick={() => mutateSync({ confirmarMatchIds: exactSuggestionMatchIds, criarLancamentos: [], ignorarLinhaIds: [] })}
					className="flex shrink-0 items-center gap-1.5"
				>
					<CheckCheck className="h-4 w-4" />
					CONFIRMAR SUGESTÕES EXATAS ({exactSuggestionMatchIds.length})
				</LoadingButton>
			</div>

			<div className="flex flex-col gap-3 justify-end lg:flex-row lg:items-end">
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<ListFilter className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>STATUS</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>
							{selectedStatusesLabel.length > 0 ? <strong>{selectedStatusesLabel}</strong> : <span>NENHUM</span>}
						</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateParams({ statuses: [], page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-72 p-0">
						<InteractiveFilter.MultiContent
							options={LINE_STATUS_OPTIONS.map((option) => ({
								...option,
								startContent: option.icon,
							}))}
							value={params.statuses}
							onChange={(nextStatuses) => updateParams({ statuses: nextStatuses, page: 1 })}
							onClear={() => updateParams({ statuses: [], page: 1 })}
							isCleared={params.statuses.length === 0}
							searchPlaceholder="Buscar status..."
							emptyLabel="Nenhum status encontrado."
							clearLabel="N/A"
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			</div>

			<GeneralPaginationComponent
				activePage={params.page}
				queryLoading={isLoading}
				selectPage={(page) => updateParams({ page })}
				totalPages={totalPages}
				pageSize={params.pageSize}
				onPageSizeChange={(pageSize) => updateParams({ pageSize, page: 1 })}
				itemsMatchedText={transactionsMatched === 1 ? "1 linha encontrada" : `${transactionsMatched} linhas encontradas`}
				itemsShowingText={`mostrando ${transactions.length}`}
			/>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				transactions.length > 0 ? (
					transactions.map((line) => (
						<StatementLineCard
							key={line.id}
							line={line}
							onResolve={() => setResolvingLineId(line.id)}
							onConfirmMatch={(matchId) => mutateSync({ confirmarMatchIds: [matchId], criarLancamentos: [], ignorarLinhaIds: [] })}
							confirmingMatchId={isSyncPending && syncVariables?.confirmarMatchIds?.length === 1 ? syncVariables.confirmarMatchIds[0] : null}
							onRejectMatch={(matchId) => mutateRejectMatch({ matchId })}
							rejectingMatchId={isRejectPending ? (rejectVariables?.matchId ?? null) : null}
							onToggleIgnored={(ignorada) => mutateIgnoreLine({ linhaId: line.id, ignorada })}
							togglingIgnored={isIgnorePending && ignoreVariables?.linhaId === line.id}
						/>
					))
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<FileCheck2 />
							</EmptyMedia>
							<EmptyTitle>Nenhuma linha de extrato encontrada</EmptyTitle>
							<EmptyDescription>
								Importe um extrato bancário para começar a conciliação. O formato recomendado é OFX — também aceitamos CSV, XLS/XLSX, PDF e imagens.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button type="button" onClick={() => setIsImportingStatement(true)} className="flex items-center gap-1.5">
								<Upload className="h-4 w-4" />
								IMPORTAR EXTRATO
							</Button>
						</EmptyContent>
					</Empty>
				)
			) : null}

			{isImportingStatement ? (
				<NewStatementImport
					contaFinanceiraId={selectedAccountId}
					closeModal={() => setIsImportingStatement(false)}
					callbacks={{ onSuccess: invalidateReconciliationQueries }}
				/>
			) : null}
			{resolvingLineId ? (
				<ControlStatementTransaction
					linhaId={resolvingLineId}
					closeModal={() => setResolvingLineId(null)}
					callbacks={{ onSuccess: invalidateReconciliationQueries }}
				/>
			) : null}
		</div>
	);
}
