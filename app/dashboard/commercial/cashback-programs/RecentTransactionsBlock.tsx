"use client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { formatDateAsLocale, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { useCashbackProgramTransactions } from "@/lib/queries/cashback-programs";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ChevronLeft, ChevronRight, Clock, History, Link as LinkIcon, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type RecentTransactionsBlockProps = {
	period?: { after: string; before: string };
};

export default function RecentTransactionsBlock({ period }: RecentTransactionsBlockProps) {
	const [page, setPage] = useState(1);
	const [filterType, setFilterType] = useState<"ACÚMULO" | "RESGATE" | "EXPIRAÇÃO" | undefined>(undefined);
	const limit = 10;

	const { data, isLoading } = useCashbackProgramTransactions({
		period,
		page,
		limit,
		type: filterType,
	});

	const transactions = data?.transactions || [];
	const totalPages = data?.totalPages ?? 0;
	const transactionsMatched = data?.transactionsMatched ?? 0;

	const canGoPrevious = page > 1;
	const canGoNext = totalPages > 0 ? page < totalPages : false;

	const getTransactionTypeBadge = (tipo: "ACÚMULO" | "RESGATE" | "EXPIRAÇÃO" | "CANCELAMENTO") => {
		switch (tipo) {
			case "ACÚMULO":
				return (
					<span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-green-100 text-green-700 border border-green-200">
						ACÚMULO
					</span>
				);
			case "RESGATE":
				return (
					<span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
						RESGATE
					</span>
				);
			case "EXPIRAÇÃO":
				return (
					<span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-red-100 text-red-700 border border-red-200">
						EXPIRAÇÃO
					</span>
				);
			case "CANCELAMENTO":
				return (
					<span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
						CANCELAMENTO
					</span>
				);
		}
	};

	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full">
			<div className="flex items-center justify-between">
				<h1 className="text-xs font-medium tracking-tight uppercase">TRANSAÇÕES RECENTES</h1>
				<div className="flex items-center gap-1">
					<Button
						variant={!filterType ? "secondary" : "ghost"}
						size="sm"
						className="h-7 text-xs px-2"
						onClick={() => {
							setFilterType(undefined);
							setPage(1);
						}}
					>
						TODAS
					</Button>
					<Button
						variant={filterType === "ACÚMULO" ? "secondary" : "ghost"}
						size="sm"
						className="h-7 text-xs px-2"
						onClick={() => {
							setFilterType("ACÚMULO");
							setPage(1);
						}}
					>
						ACÚMULO
					</Button>
					<Button
						variant={filterType === "RESGATE" ? "secondary" : "ghost"}
						size="sm"
						className="h-7 text-xs px-2"
						onClick={() => {
							setFilterType("RESGATE");
							setPage(1);
						}}
					>
						RESGATE
					</Button>
					<Button
						variant={filterType === "EXPIRAÇÃO" ? "secondary" : "ghost"}
						size="sm"
						className="h-7 text-xs px-2"
						onClick={() => {
							setFilterType("EXPIRAÇÃO");
							setPage(1);
						}}
					>
						EXPIRAÇÃO
					</Button>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				{isLoading ? (
					<div className="text-sm text-muted-foreground text-center py-8">Carregando...</div>
				) : transactions.length === 0 ? (
					<div className="text-sm text-muted-foreground text-center py-8">Nenhuma transação encontrada</div>
				) : (
					transactions.map((transaction) => (
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
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium">{transaction.cliente.nome}</span>
											{getTransactionTypeBadge(transaction.tipo)}
										</div>
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
					))
				)}
			</div>

			{totalPages > 1 && (
				<div className="flex items-center justify-between pt-2 border-t border-primary/10">
					<div className="text-xs text-muted-foreground">
						Página {page} de {totalPages} ({transactionsMatched} transações)
					</div>
					<div className="flex items-center gap-2">
						<Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={!canGoPrevious}>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!canGoNext}>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
