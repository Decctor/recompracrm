"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import type { TGetFinancialAccountsOutputDefault } from "@/app/api/finances/financial-accounts/route";
import type { TGetStoreCreditOutputByClient } from "@/app/api/finances/store-credit/route";
import StoreCreditAllocationBlock from "@/components/Modals/Finances/Blocks/StoreCreditAllocation";
import StoreCreditReceiptBlock from "@/components/Modals/Finances/Blocks/StoreCreditReceipt";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { getStoreCreditAllocationError } from "@/lib/finances/store-credit/allocate";
import { invalidateFinanceQueries } from "@/lib/finances/invalidate-finance-queries";
import { formatDateOnInputChange, formatToMoney } from "@/lib/formatting";
import { receiveStoreCredit } from "@/lib/mutations/store-credit";
import { useFinancesAccounts } from "@/lib/queries/finances";
import { useActiveSalesSession } from "@/lib/queries/sales-sessions";
import { STORE_CREDIT_QUERY_PREFIXES, useStoreCreditClientTitles } from "@/lib/queries/store-credit";
import { useInternalStoreCreditReceiptState } from "@/state-hooks/use-internal-store-credit-receipt-state";

type StoreCreditClient = { clienteId: string; nome: string; saldoAberto: number };

type ReceiveStoreCreditMenuProps = {
	organizationId: string;
	cliente: StoreCreditClient;
	/** Quando vem preenchido, o menu abre apontando só para aquela venda (baixa por título). */
	initialTransacaoId: string | null;
	closeMenu: () => void;
};

/**
 * Recebimento de fiado. Um único menu para os dois gestos do balcão — "o João veio pagar R$ 100" e
 * "quita esta venda aqui" —, porque são a mesma operação com o mesmo resultado contábil; separá-los
 * em dois menus só produziria duas implementações que divergem com o tempo.
 */
export function ReceiveStoreCreditMenu({ organizationId, cliente, initialTransacaoId, closeMenu }: ReceiveStoreCreditMenuProps) {
	const titlesQuery = useStoreCreditClientTitles({ clientId: cliente.clienteId });
	const accountsQuery = useFinancesAccounts({ initialFilters: { activeOnly: true, stats: false } });
	const sessionQuery = useActiveSalesSession({ organizationId });

	const isLoading = titlesQuery.isLoading || accountsQuery.isLoading;
	const stateError = titlesQuery.isError ? getErrorMessage(titlesQuery.error) : accountsQuery.isError ? getErrorMessage(accountsQuery.error) : null;

	if (isLoading || stateError || !titlesQuery.data || !accountsQuery.data) {
		return (
			<ResponsiveMenu
				menuTitle={`RECEBER DE ${cliente.nome.toUpperCase()}`}
				menuDescription="Carregando as vendas em aberto deste cliente."
				menuActionButtonText="REGISTRAR"
				menuCancelButtonText="CANCELAR"
				closeMenu={closeMenu}
				actionFunction={() => undefined}
				actionIsLoading={false}
				menuActionButtonDisabled
				stateIsLoading={isLoading}
				stateError={stateError}
			>
				{null}
			</ResponsiveMenu>
		);
	}

	return (
		<LoadedReceiveStoreCreditMenu
			cliente={cliente}
			titulos={titlesQuery.data}
			initialTransacaoId={initialTransacaoId}
			financialAccounts={accountsQuery.data.accounts}
			activeSession={sessionQuery.session ?? null}
			closeMenu={closeMenu}
		/>
	);
}

type LoadedReceiveStoreCreditMenuProps = {
	cliente: StoreCreditClient;
	titulos: TGetStoreCreditOutputByClient;
	initialTransacaoId: string | null;
	financialAccounts: TGetFinancialAccountsOutputDefault["accounts"];
	activeSession: { id: string; dataAbertura: Date | string; contaFinanceiraId: string | null } | null;
	closeMenu: () => void;
};

function LoadedReceiveStoreCreditMenu({
	cliente,
	titulos,
	initialTransacaoId,
	financialAccounts,
	activeSession,
	closeMenu,
}: LoadedReceiveStoreCreditMenuProps) {
	const queryClient = useQueryClient();

	const openTitles = titulos.titulos
		.filter((titulo) => titulo.emAberto)
		.map((titulo) => ({
			transacaoId: titulo.transacaoId,
			titulo: titulo.titulo,
			saldo: titulo.valor,
			dataPrevisao: titulo.dataPrevisao,
			dataVenda: titulo.vendaDataVenda,
		}));

	const { state, alocacao, sobra, saldoTotal, updateReceipt, updateValor, updateAllocation, settleAll, resetAllocation } =
		useInternalStoreCreditReceiptState({
			titulos: openTitles,
			initialTransacaoId,
		});

	// Conta única na organização não é escolha, é o único destino possível — preencher poupa um
	// clique em toda baixa. Com duas ou mais, o destino fica em branco de propósito: errar a conta é
	// pior do que perguntar, e um padrão arbitrário some dinheiro no lugar errado sem ninguém ver.
	const soleAccountId = financialAccounts.length === 1 ? financialAccounts[0].id : null;

	// Dinheiro no balcão vai para a gaveta aberta; qualquer outra forma vai para uma conta. Deixar o
	// destino "colado" na sessão depois de trocar para Pix faria o Pix entrar na conferência de caixa.
	useEffect(() => {
		if (state.metodo === "DINHEIRO" && activeSession && !state.sessaoVendaId && !state.contaFinanceiraId) {
			updateReceipt({ sessaoVendaId: activeSession.id, contaFinanceiraId: null });
			return;
		}
		if (state.metodo !== "DINHEIRO" && state.sessaoVendaId) {
			updateReceipt({ sessaoVendaId: null, contaFinanceiraId: activeSession?.contaFinanceiraId ?? soleAccountId });
			return;
		}
		if (!state.sessaoVendaId && !state.contaFinanceiraId && soleAccountId) {
			updateReceipt({ contaFinanceiraId: soleAccountId });
		}
	}, [state.metodo, state.sessaoVendaId, state.contaFinanceiraId, activeSession, soleAccountId, updateReceipt]);

	const { mutate, isPending } = useMutation({
		mutationKey: ["receive-store-credit", cliente.clienteId],
		mutationFn: receiveStoreCredit,
		onSuccess: (data) => {
			toast.success(data.message);
			void invalidateFinanceQueries(queryClient);
			void Promise.all(STORE_CREDIT_QUERY_PREFIXES.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
			closeMenu();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const temSaldoRemanescente = alocacao.some((item) => {
		const titulo = openTitles.find((open) => open.transacaoId === item.transacaoId);
		return !!titulo && titulo.saldo - item.valor > 0.005;
	});

	const allocationError = getStoreCreditAllocationError({ titles: openTitles, valorRecebido: state.valor, allocations: alocacao });
	const missingDestination = !state.sessaoVendaId && !state.contaFinanceiraId;
	const missingDate = !state.dataRecebimento;
	const validationError = sobra > 0 ? `Sobram ${formatToMoney(sobra)} acima do que este cliente deve.` : allocationError;

	function handleSubmit() {
		if (validationError) return toast.error(validationError);

		// Meio-dia (`natural`) e não início do dia: o recebimento precisa cair no dia que o operador
		// escolheu, e a meia-noite local vira o dia anterior assim que a data atravessa o fuso.
		const dataRecebimento = formatDateOnInputChange(state.dataRecebimento, "string", "natural");
		if (!dataRecebimento) return toast.error("Informe a data do recebimento.");

		mutate({
			clientId: cliente.clienteId,
			receipt: {
				valor: state.valor,
				dataRecebimento,
				metodo: state.metodo,
				contaFinanceiraId: state.contaFinanceiraId,
				sessaoVendaId: state.sessaoVendaId,
				observacoes: state.observacoes.trim() ? state.observacoes.trim() : null,
				novaDataPrevisao: formatDateOnInputChange(state.novaDataPrevisao, "string", "natural"),
			},
			allocations: alocacao,
		});
	}

	return (
		<ResponsiveMenu
			menuTitle={`RECEBER DE ${cliente.nome.toUpperCase()}`}
			menuDescription={
				openTitles.length === 0
					? "Este cliente não tem vendas a prazo em aberto."
					: `${openTitles.length} ${openTitles.length === 1 ? "venda em aberto" : "vendas em aberto"}, somando ${formatToMoney(saldoTotal)}.`
			}
			menuActionButtonText="REGISTRAR RECEBIMENTO"
			menuCancelButtonText="CANCELAR"
			menuActionButtonDisabled={openTitles.length === 0 || !!validationError || missingDestination || missingDate}
			closeMenu={closeMenu}
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={false}
			dialogVariant="md"
			drawerVariant="lg"
		>
			<StoreCreditReceiptBlock
				state={state}
				saldoTotal={saldoTotal}
				temSaldoRemanescente={temSaldoRemanescente}
				financialAccounts={financialAccounts}
				activeSession={activeSession}
				updateReceipt={updateReceipt}
				updateValor={updateValor}
				settleAll={settleAll}
			/>
			<StoreCreditAllocationBlock
				titulos={openTitles}
				alocacao={alocacao}
				sobra={sobra}
				modoAlocacao={state.modoAlocacao}
				updateAllocation={updateAllocation}
				resetAllocation={resetAllocation}
			/>
			{missingDestination ? <p className="text-xs font-medium text-red-700 dark:text-red-400">Escolha onde o dinheiro entrou.</p> : null}
		</ResponsiveMenu>
	);
}
