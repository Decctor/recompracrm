import type { TCashbackProgramTransactionsOutputByClientId } from "@/app/api/cashback-programs/transactions/route";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { useCashbackProgramTransactionsByClientId, useClientCashbackBalance } from "@/lib/queries/cashback-programs";
import { cn } from "@/lib/utils";
import { ArrowUpRight, BadgePercent, History, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
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
	} = useCashbackProgramTransactionsByClientId({
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
			<div className="w-full shrink-0 flex flex-col gap-1.5 rounded-xl border border-brand/30 bg-brand/20 px-3 py-3">
				<div className="w-full flex items-center gap-1.5">
					<BadgePercent className="w-4 h-4 text-brand" />
					<p className="text-xs font-semibold tracking-tight uppercase text-brand">SALDO EM CASHBACK</p>
				</div>
				<p className="text-2xl font-black tracking-tight text-brand">{isBalanceLoading ? "Carregando..." : formattedBalance}</p>
			</div>

			<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 w-full min-h-0 flex-1 flex flex-col gap-1.5 overflow-y-auto">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-xs font-bold tracking-tight ">ÚLTIMAS TRANSAÇÕES</h2>
					<p className="text-xs text-muted-foreground">{transactionsMatched} total</p>
				</div>

				{isTransactionsLoading ? <p className="text-sm text-muted-foreground">Carregando transações...</p> : null}
				{isTransactionsError ? <p className="text-sm text-destructive">{getErrorMessage(transactionsError)}</p> : null}
				{!isTransactionsLoading && !isTransactionsError && transactions.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nenhuma transação encontrada.</p>
				) : null}

				{transactions.map((transaction) => (
					<TransactionCard key={transaction.id} transaction={transaction} />
				))}
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

function TransactionTypeBadge({ type }: { type: "ACÚMULO" | "RESGATE" | "EXPIRAÇÃO" | "CANCELAMENTO" }) {
	if (type === "ACÚMULO") {
		return (
			<span className="inline-flex items-center rounded-md border border-green-300 bg-green-100 px-2 py-1 text-xs font-semibold text-green-700 w-fit">
				ACÚMULO
			</span>
		);
	}

	if (type === "RESGATE") {
		return (
			<span className="inline-flex items-center rounded-md border border-blue-300 bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 w-fit">
				RESGATE
			</span>
		);
	}

	if (type === "EXPIRAÇÃO") {
		return (
			<span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 w-fit">
				EXPIRAÇÃO
			</span>
		);
	}

	return (
		<span className="inline-flex items-center rounded-md border border-gray-300 bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 w-fit">
			CANCELAMENTO
		</span>
	);
}

function TransactionCard({ transaction }: { transaction: TCashbackProgramTransactionsOutputByClientId["transactions"][number] }) {
	return (
		<HoverCard key={transaction.id}>
			<HoverCardTrigger asChild>
				<div className="flex items-center gap-3 p-3 rounded-lg border border-primary/10 hover:bg-primary/5 transition-colors cursor-pointer group">
					<div
						className={cn(
							"h-10 w-10 min-h-10 min-w-10 rounded-full flex items-center justify-center border",
							transaction.tipo === "ACÚMULO"
								? "bg-green-100 border-green-200 text-green-700"
								: transaction.tipo === "RESGATE"
									? "bg-blue-100 border-blue-200 text-blue-700"
									: "bg-red-100 border-red-200 text-red-700",
						)}
					>
						{transaction.tipo === "ACÚMULO" ? (
							<TrendingUp className="h-5 w-5" />
						) : transaction.tipo === "RESGATE" ? (
							<TrendingDown className="h-5 w-5" />
						) : (
							<History className="h-5 w-5" />
						)}
					</div>

					<div className="flex-1 flex flex-col gap-1">
						<TransactionTypeBadge type={transaction.tipo} />
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<span>{formatDateAsLocale(transaction.dataInsercao, true)}</span>
							{transaction.expiracaoData && <span>• Expira: {formatDateAsLocale(transaction.expiracaoData, true)}</span>}
						</div>
					</div>

					<div className={cn("text-sm font-bold", transaction.tipo === "RESGATE" ? "text-red-600" : "text-green-600")}>
						{transaction.tipo === "RESGATE" ? "-" : "+"} {formatToMoney(transaction.valor)}
					</div>
				</div>
			</HoverCardTrigger>
			<HoverCardContent className="w-80 p-0 overflow-hidden flex flex-col gap-3 p-4" align="start">
				<div className="w-full flex flex-col gap-3">
					<div className="flex items-center gap-3">
						<div
							className={cn(
								"h-10 w-10 min-h-10 min-w-10 rounded-full flex items-center justify-center border",
								transaction.tipo === "ACÚMULO"
									? "bg-green-100 border-green-200 text-green-700"
									: transaction.tipo === "RESGATE"
										? "bg-blue-100 border-blue-200 text-blue-700"
										: "bg-red-100 border-red-200 text-red-700",
							)}
						>
							{transaction.tipo === "ACÚMULO" ? (
								<TrendingUp className="h-5 w-5" />
							) : transaction.tipo === "RESGATE" ? (
								<TrendingDown className="h-5 w-5" />
							) : (
								<History className="h-5 w-5" />
							)}
						</div>
						<div>
							<p className="text-sm font-bold">{transaction.tipo}</p>
							<p className="text-xs text-muted-foreground">{formatDateAsLocale(transaction.dataInsercao)}</p>
						</div>
						<div className="ml-auto">
							<span className={cn("text-sm font-bold", transaction.tipo === "RESGATE" ? "text-red-600" : "text-green-600")}>
								{transaction.tipo === "RESGATE" ? "-" : "+"} {formatToMoney(transaction.valor)}
							</span>
						</div>
					</div>
					<div className="pt-4 w-full flex flex-col gap-1.5 border-t">
						<div className="flex items-center justify-between gap-1.5">
							<span className="text-xs text-muted-foreground">CLIENTE</span>
							<span className="text-xs font-medium text-right">{transaction.cliente.nome}</span>
						</div>

						{transaction.venda && (
							<>
								<div className="flex items-center justify-between gap-1.5">
									<span className="text-xs text-muted-foreground">VENDA</span>
									<span className="text-xs font-medium trucate text-end">#{transaction.venda.id}</span>
								</div>
								<div className="flex items-center justify-between gap-1.5">
									<span className="text-xs text-muted-foreground">VALOR DA VENDA</span>
									<span className="text-xs font-medium truncate text-end">{formatToMoney(transaction.venda.valorTotal)}</span>
								</div>
								{transaction.venda.canal && (
									<div className="flex items-center justify-between gap-1.5">
										<span className="text-xs text-muted-foreground">CANAL</span>
										<span className="text-xs font-medium truncate text-end">{transaction.venda.canal}</span>
									</div>
								)}
								{transaction.venda.vendedor && (
									<div className="flex items-center justify-between gap-1.5">
										<span className="text-xs text-muted-foreground">VENDEDOR</span>
										<span className="text-xs font-medium truncate text-end">{transaction.venda.vendedor.nome}</span>
									</div>
								)}
							</>
						)}
					</div>
				</div>
				{transaction.venda && (
					<div className="pt-4 flex items-center justify-center">
						<Button size="sm" variant="ghost" className="w-full gap-2" asChild>
							<Link href={`/dashboard/commercial/sales/${transaction.venda.id}`}>
								VER VENDA
								<ArrowUpRight className="h-4 w-4" />
							</Link>
						</Button>
					</div>
				)}
			</HoverCardContent>
		</HoverCard>
	);
}
