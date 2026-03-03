import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { useClientCashbackBalance, useCashbackProgramTransactions } from "@/lib/queries/cashback-programs";
import { useMemo, useState } from "react";

type ClientCashbackProps = {
	clientId: string;
};

export default function ClientCashback({ clientId }: ClientCashbackProps) {
	const [page, setPage] = useState(1);
	const limit = 5;

	const { data: balance, isLoading: isBalanceLoading } = useClientCashbackBalance({ clienteId: clientId });
	const {
		data: transactionsResult,
		isLoading: isTransactionsLoading,
		isError: isTransactionsError,
		error: transactionsError,
	} = useCashbackProgramTransactions({
		clientId,
		page,
		limit,
	});

	const transactions = transactionsResult?.transactions ?? [];
	const totalPages = transactionsResult?.totalPages ?? 0;
	const transactionsMatched = transactionsResult?.transactionsMatched ?? 0;

	const canGoPrevious = page > 1;
	const canGoNext = totalPages > 0 ? page < totalPages : false;

	const formattedBalance = useMemo(() => formatToMoney(balance?.saldoValorDisponivel ?? 0), [balance?.saldoValorDisponivel]);

	return (
		<div className="bg-card border-primary/20 flex h-full w-full flex-col gap-3 rounded-xl border px-4 py-4 shadow-2xs">
			<div className="flex flex-col gap-1">
				<p className="text-xs font-semibold tracking-tight uppercase text-muted-foreground">Saldo do cliente</p>
				<div className="w-full rounded-xl border border-brand/30 bg-brand/20 px-3 py-3">
					<p className="text-2xl font-black tracking-tight text-brand">{isBalanceLoading ? "Carregando..." : formattedBalance}</p>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-xs font-bold tracking-tight uppercase">Últimas transações</h2>
					<p className="text-xs text-muted-foreground">{transactionsMatched} total</p>
				</div>

				{isTransactionsLoading ? <p className="text-sm text-muted-foreground">Carregando transações...</p> : null}
				{isTransactionsError ? <p className="text-sm text-destructive">{getErrorMessage(transactionsError)}</p> : null}
				{!isTransactionsLoading && !isTransactionsError && transactions.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nenhuma transação encontrada.</p>
				) : null}

				{transactions.map((transaction) => {
					const isPositive = transaction.valor >= 0;
					return (
						<div key={transaction.id} className="w-full rounded-xl border border-primary/20 bg-background px-3 py-2">
							<div className="flex items-start justify-between gap-2">
								<TransactionTypeBadge type={transaction.tipo} />
								<p className={`text-xl font-black tracking-tight ${isPositive ? "text-green-700" : "text-red-700"}`}>
									{isPositive ? "+" : "-"}
									{formatToMoney(Math.abs(transaction.valor))}
								</p>
							</div>
							<div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
								<p>{formatDateAsLocale(transaction.dataInsercao, true)}</p>
								<p>Saldo final: {formatToMoney(transaction.saldoValorPosterior)}</p>
							</div>
						</div>
					);
				})}

				{totalPages > 1 ? (
					<div className="mt-1 flex items-center justify-end gap-2">
						<Button type="button" size="sm" variant="outline" disabled={!canGoPrevious} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
							Anterior
						</Button>
						<p className="text-xs text-muted-foreground">
							{page}/{totalPages}
						</p>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={!canGoNext}
							onClick={() => setPage((prev) => (canGoNext ? prev + 1 : prev))}
						>
							Próxima
						</Button>
					</div>
				) : null}
			</div>
		</div>
	);
}

function TransactionTypeBadge({ type }: { type: "ACÚMULO" | "RESGATE" | "EXPIRAÇÃO" | "CANCELAMENTO" }) {
	if (type === "ACÚMULO") {
		return <span className="inline-flex items-center rounded-md border border-green-300 bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">ACÚMULO</span>;
	}

	if (type === "RESGATE") {
		return <span className="inline-flex items-center rounded-md border border-blue-300 bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">RESGATE</span>;
	}

	if (type === "EXPIRAÇÃO") {
		return <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">EXPIRAÇÃO</span>;
	}

	return <span className="inline-flex items-center rounded-md border border-gray-300 bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">CANCELAMENTO</span>;
}
