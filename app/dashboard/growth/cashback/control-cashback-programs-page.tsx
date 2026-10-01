"use client";
import type { TGetCashbackProgramOutput } from "@/app/api/cashback-programs/route";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { useCashbackProgram } from "@/lib/queries/cashback-programs";
import { DataSourceIntegrationTipoEnum, type TDataSourceIntegrationTipoEnum } from "@/schemas/enums";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Database, Gift, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useState } from "react";
import CashbackBalancesView from "./_components/CashbackBalancesView";
import CashbackStatsBlock from "./_components/CashbackStatsBlock";
import CashbackTransactionsView from "./_components/CashbackTransactionsView";
import CashbackPrizesView from "./_components/prizes/CashbackPrizesView";
import CashbackProgramHeader from "./_components/program/CashbackProgramHeader";
import CashbackProgramRegistry from "./_components/program/CashbackProgramRegistry";

const VIEWS = ["stats", "transactions", "balances", "control-cashback-program", "prizes"] as const;
type TCashbackView = (typeof VIEWS)[number];

type CashbackProgramsPageProps = {
	userOrg: Exclude<TAuthUserSession["membership"], null>["organizacao"];
	cashbackProgram: Exclude<TGetCashbackProgramOutput["data"], null>;
};

/**
 * Página do programa de cashback. O programa vem do servidor na primeira pintura e daí em diante
 * vive no React Query: cada seção aplicada invalida a consulta e a página inteira (cabeçalho,
 * frase-resumo, aba Recompensas) se atualiza sem recarregar.
 */
export default function CashbackProgramsPage({ userOrg, cashbackProgram: initialCashbackProgram }: CashbackProgramsPageProps) {
	const queryClient = useQueryClient();
	const [viewMode, setViewMode] = useQueryState("view", parseAsStringEnum([...VIEWS]));
	const { data, queryKey, isError, error } = useCashbackProgram({ initialData: initialCashbackProgram });
	const cashbackProgram = data ?? initialCashbackProgram;

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey });
	const callbacks = { onMutate: handleOnMutate, onSettled: handleOnSettled };

	const userOrgHasIntegration = userOrg.integracoes.some(
		(integration) => integration.ativo && DataSourceIntegrationTipoEnum.options.includes(integration.tipo as TDataSourceIntegrationTipoEnum),
	);

	// A aba Recompensas só existe com a modalidade ligada: sem ela, não há onde gastar o que se cadastra.
	const prizesEnabled = cashbackProgram.modalidadeRecompensasPermitida;
	const currentView: TCashbackView = viewMode === "prizes" && !prizesEnabled ? "stats" : (viewMode ?? "stats");

	return (
		<div className="w-full h-full flex flex-col gap-4">
			<CashbackProgramHeader program={cashbackProgram} callbacks={callbacks} />
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			<Tabs value={currentView} onValueChange={(value: string) => setViewMode(value as TCashbackView)}>
				<TabsList variant="page">
					<TabsTrigger value="stats">
						<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />
						Estatísticas
					</TabsTrigger>
					<TabsTrigger value="transactions">
						<ReceiptText className="w-4 h-4 min-w-4 min-h-4" />
						Transações
					</TabsTrigger>
					<TabsTrigger value="balances">
						<WalletCards className="w-4 h-4 min-w-4 min-h-4" />
						Saldos
					</TabsTrigger>
					<TabsTrigger value="control-cashback-program">
						<Database className="w-4 h-4 min-w-4 min-h-4" />
						Meu Programa
					</TabsTrigger>
					{prizesEnabled ? (
						<TabsTrigger value="prizes">
							<Gift className="w-4 h-4 min-w-4 min-h-4" />
							Recompensas
						</TabsTrigger>
					) : null}
				</TabsList>
				<TabsContent value="stats" className="flex flex-col gap-3">
					<CashbackProgramsStatsView cashbackProgram={cashbackProgram} />
				</TabsContent>
				<TabsContent value="transactions" className="flex flex-col gap-3">
					<CashbackTransactionsView terminology={cashbackProgram.terminologia} />
				</TabsContent>
				<TabsContent value="balances" className="flex flex-col gap-3">
					<CashbackBalancesView terminology={cashbackProgram.terminologia} />
				</TabsContent>
				<TabsContent value="control-cashback-program" className="flex flex-col gap-3">
					<CashbackProgramRegistry
						program={cashbackProgram}
						userOrgHasIntegration={userOrgHasIntegration}
						onManagePrizes={() => setViewMode("prizes")}
						callbacks={callbacks}
					/>
				</TabsContent>
				{prizesEnabled ? (
					<TabsContent value="prizes" className="flex flex-col gap-3">
						<CashbackPrizesView organizationId={userOrg.id} programId={cashbackProgram.id} terminology={cashbackProgram.terminologia} />
					</TabsContent>
				) : null}
			</Tabs>
		</div>
	);
}

type CashbackProgramsStatsViewProps = {
	cashbackProgram: Exclude<TGetCashbackProgramOutput["data"], null>;
};
function CashbackProgramsStatsView({ cashbackProgram }: CashbackProgramsStatsViewProps) {
	const [period, setPeriod] = useState<{ after?: Date; before?: Date }>({
		after: dayjs().startOf("month").toDate(),
		before: dayjs().endOf("month").toDate(),
	});

	const periodFormatted = {
		after: period.after ? period.after.toISOString() : dayjs().startOf("month").toISOString(),
		before: period.before ? period.before.toISOString() : dayjs().endOf("month").toISOString(),
	};
	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex justify-end">
				<div className="w-fit">
					<DateIntervalInput
						label="Período"
						labelClassName="hidden"
						className="hover:bg-accent hover:text-accent-foreground border-none shadow-none"
						value={{
							after: period.after ? new Date(period.after) : undefined,
							before: period.before ? new Date(period.before) : undefined,
						}}
						handleChange={(value) =>
							setPeriod({
								after: value.after ? new Date(value.after) : undefined,
								before: value.before ? new Date(value.before) : undefined,
							})
						}
					/>
				</div>
			</div>
			<CashbackStatsBlock period={periodFormatted} terminology={cashbackProgram.terminologia} />
		</div>
	);
}
