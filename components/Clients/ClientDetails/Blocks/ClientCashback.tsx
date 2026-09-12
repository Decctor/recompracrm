import { CashbackTransaction, ClientCashbackTransactionRow } from "@/components/CashbackPrograms/CashbackTransactionCard";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatCashbackValue, formatDateAsLocale, getCashbackUnitLabel } from "@/lib/formatting";
import { useCashbackProgram, useCashbackProgramTransactionsByClientId, useClientCashbackBalance } from "@/lib/queries/cashback-programs";
import { BadgePercent } from "lucide-react";
import { useMemo, useState } from "react";
type ClientCashbackProps = {
	clientId: string;
};

export default function ClientCashback({ clientId }: ClientCashbackProps) {
	const [page, setPage] = useState(1);
	const limit = 5;

	const { data: balance, isLoading: isBalanceLoading } = useClientCashbackBalance({ clienteId: clientId });
	const { data: cashbackProgram } = useCashbackProgram();
	const {
		data: transactionsResult,
		isLoading: isTransactionsLoading,
		isError: isTransactionsError,
		error: transactionsError,
	} = useCashbackProgramTransactionsByClientId({
		clientId,
		operatorSellerIds: [],
		search: "",
		types: [],
		periodAfter: null,
		periodBefore: null,
		page,
		limit,
	});

	const transactions = transactionsResult?.transactions ?? [];
	const totalPages = transactionsResult?.totalPages ?? 0;
	const transactionsMatched = transactionsResult?.transactionsMatched ?? 0;

	const canGoPrevious = page > 1;
	const canGoNext = totalPages > 0 ? page < totalPages : false;

	const terminology = cashbackProgram?.terminologia ?? "DINHEIRO";
	const formattedBalance = useMemo(
		() => formatCashbackValue(balance?.saldoValorDisponivel ?? 0, terminology),
		[balance?.saldoValorDisponivel, terminology],
	);
	// Só aparece quando há algo a perder: zero não é informação, é ruído embaixo do destaque.
	const expiringSoon = balance?.expirandoEmBreve && balance.expirandoEmBreve.valor > 0 ? balance.expirandoEmBreve : null;

	return (
		<div className="bg-card border-border flex h-full w-full flex-col gap-3 rounded-xl border px-4 py-4 shadow-2xs">
			{/* O saldo ocupa a largura toda da aba: o aviso de expiração vai para a direita em vez de
			    virar uma terceira linha sob um bloco estreito. */}
			<div className="w-full shrink-0 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-brand/30 bg-brand/20 px-4 py-4">
				<div className="flex min-w-0 flex-col gap-1">
					<div className="flex items-center gap-1.5">
						<BadgePercent className="w-4 h-4 text-brand" />
						<p className="text-xs font-semibold tracking-tight uppercase text-brand">SALDO EM {getCashbackUnitLabel(terminology, { uppercase: true })}</p>
					</div>
					<p className="text-3xl font-black tracking-tight text-brand">{isBalanceLoading ? "Carregando..." : formattedBalance}</p>
				</div>
				{expiringSoon ? (
					<p className="max-w-xs text-xs font-medium leading-tight text-muted-foreground text-numeric sm:text-right">
						{formatCashbackValue(expiringSoon.valor, terminology)} expiram nos próximos {expiringSoon.janelaDias} dias
						{expiringSoon.proximaExpiracaoData ? ` · primeiro em ${formatDateAsLocale(expiringSoon.proximaExpiracaoData)}` : ""}
					</p>
				) : null}
			</div>

			{/* `overflow-x-hidden` de propósito: a linha de transação usa `-mx-2` para o lavado de hover
			    alinhar com o título, e sem travar o eixo esses 8px viram rolagem lateral. */}
			<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 w-full min-h-0 flex-1 flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-xs font-bold tracking-tight ">ÚLTIMAS TRANSAÇÕES</h2>
					<p className="text-xs text-muted-foreground">{transactionsMatched} total</p>
				</div>

				{isTransactionsLoading ? <p className="text-sm text-muted-foreground">Carregando transações...</p> : null}
				{isTransactionsError ? <p className="text-sm text-destructive">{getErrorMessage(transactionsError)}</p> : null}
				{!isTransactionsLoading && !isTransactionsError && transactions.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nenhuma transação encontrada.</p>
				) : null}

				<CashbackTransaction.List>
					{transactions.map((transaction) => (
						<ClientCashbackTransactionRow key={transaction.id} transaction={transaction} terminology={terminology} />
					))}
				</CashbackTransaction.List>
			</div>
			{totalPages > 1 ? (
				<div className="mt-1 shrink-0 flex items-center justify-end gap-2">
					<Button type="button" size="sm" variant="outline" disabled={!canGoPrevious} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
						Anterior
					</Button>
					<p className="text-xs text-muted-foreground">
						{page}/{totalPages}
					</p>
					<Button type="button" size="sm" variant="outline" disabled={!canGoNext} onClick={() => setPage((prev) => (canGoNext ? prev + 1 : prev))}>
						Próxima
					</Button>
				</div>
			) : null}
		</div>
	);
}
