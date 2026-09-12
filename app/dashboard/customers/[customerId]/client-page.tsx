"use client";

import ClientDetailHeader from "./_components/ClientDetailHeader";
import ClientRegistryTab from "./client-registry-tab";
import ClientStatsTab from "./client-stats-tab";
import ClientCashback from "@/components/Clients/ClientDetails/Blocks/ClientCashback";
import ClientPurchases from "@/components/Clients/ClientDetails/Blocks/ClientPurchases";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/errors";
import { useClientById, useClientStatsById } from "@/lib/queries/clients";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { BadgePercent, ChartBar, Pencil, ShoppingCart } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";

const CLIENT_TABS = ["cadastro", "estatisticas", "compras", "cashback"] as const;
type TClientTab = (typeof CLIENT_TABS)[number];

type ClientPageProps = {
	id: string;
	canReconcileClients: boolean;
};

/**
 * Página do cliente: cabeçalho fixo com a identidade e os números de vida inteira, e quatro abas.
 *
 * A página era só estatística; o cadastro só podia ser corrigido por um modal aberto na listagem.
 * Agora CADASTRO é uma aba de edição no lugar (mesmo contrato do cadastro de produto), e COMPRAS e
 * CASHBACK deixaram de dividir uma linha de 2/3 + 1/3 — cada um ocupa a tela inteira, que é o que a
 * listagem de compras com filtros precisava desde o começo.
 */
export default function ClientPage({ id, canReconcileClients }: ClientPageProps) {
	const [tab, setTab] = useQueryState("tab", parseAsStringEnum([...CLIENT_TABS]).withDefault("estatisticas"));
	const queryClient = useQueryClient();

	const { data: client, queryKey, isLoading, isError, error } = useClientById({ id });
	const {
		data: stats,
		isLoading: isStatsLoading,
		isError: isStatsError,
		error: statsError,
		filters: statsFilters,
		updateFilters: updateStatsFilters,
	} = useClientStatsById({
		clientId: id,
		initialFilters: { periodAfter: dayjs().startOf("month").toISOString(), periodBefore: dayjs().endOf("month").toISOString() },
	});

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => {
		await queryClient.invalidateQueries({ queryKey });
		// O cabeçalho lê nome, RFM e os totais pela rota de estatísticas: sem isto, aplicar uma
		// alteração no cadastro atualiza os campos e deixa o cabeçalho com o nome antigo.
		await queryClient.invalidateQueries({ queryKey: ["client-stats-by-id", id] });
	};

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!client) return null;

	return (
		<div className="flex w-full max-w-full grow flex-col gap-4 overflow-x-hidden bg-background px-6 py-6 lg:px-12">
			<ClientDetailHeader client={client} totals={stats?.totais} canReconcileClients={canReconcileClients} />

			<Tabs value={tab} onValueChange={(value) => setTab(value as TClientTab)}>
				<TabsList variant="page">
					<TabsTrigger value="cadastro">
						<Pencil className="h-4 w-4 min-h-4 min-w-4" />
						CADASTRO
					</TabsTrigger>
					<TabsTrigger value="estatisticas">
						<ChartBar className="h-4 w-4 min-h-4 min-w-4" />
						ESTATÍSTICAS
					</TabsTrigger>
					<TabsTrigger value="compras">
						<ShoppingCart className="h-4 w-4 min-h-4 min-w-4" />
						COMPRAS
					</TabsTrigger>
					<TabsTrigger value="cashback">
						<BadgePercent className="h-4 w-4 min-h-4 min-w-4" />
						CASHBACK
					</TabsTrigger>
				</TabsList>

				<TabsContent value="cadastro" className="mt-4">
					<ClientRegistryTab client={client} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
				</TabsContent>
				<TabsContent value="estatisticas" className="mt-4">
					<ClientStatsTab
						stats={stats}
						filters={statsFilters}
						updateFilters={updateStatsFilters}
						isLoading={isStatsLoading}
						isError={isStatsError}
						errorMessage={isStatsError ? getErrorMessage(statsError) : null}
					/>
				</TabsContent>
				<TabsContent value="compras" className="mt-4">
					<div className="flex min-h-[520px] w-full flex-col">
						<ClientPurchases clientId={id} />
					</div>
				</TabsContent>
				<TabsContent value="cashback" className="mt-4">
					<div className="flex min-h-[520px] w-full flex-col">
						<ClientCashback clientId={id} />
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
