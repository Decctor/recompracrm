"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, ChevronDown, Clock, HandCoins, UserX } from "lucide-react";
import { useState } from "react";
import type { TGetStoreCreditOutputDefault } from "@/app/api/finances/store-credit/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { getStoreCreditDaysOverdue } from "@/lib/finances/store-credit/aging";
import { STORE_CREDIT_RECEIPT_ORIGIN } from "@/lib/finances/store-credit/constants";
import { formatDateAsLocale, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { PAYMENT_METHOD_CHIP_LABELS } from "@/lib/payments/labels";
import { type TStoreCreditOriginScope, useStoreCreditClientTitles } from "@/lib/queries/store-credit";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { cn } from "@/lib/utils";

type StoreCreditClient = TGetStoreCreditOutputDefault["clientes"][number];

type StoreCreditClientCardProps = {
	cliente: StoreCreditClient;
	canReceive: boolean;
	/** Recorte de origem ativo na listagem, ou `null`. Governa o rótulo do saldo e a expansão. */
	originScope: TStoreCreditOriginScope | null;
	onReceiveClient: (cliente: StoreCreditClient) => void;
	onReceiveTitle: (cliente: StoreCreditClient, transacaoId: string) => void;
};

function formatOverdueLabel(previsao: Date | string | null) {
	if (!previsao) return null;
	const dias = getStoreCreditDaysOverdue(previsao);
	if (dias <= 0) return `Vence em ${formatDateAsLocale(previsao)}`;
	return `Em atraso há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function StoreCreditClientCard({ cliente, canReceive, originScope, onReceiveClient, onReceiveTitle }: StoreCreditClientCardProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [showSettled, setShowSettled] = useState(false);
	const shouldReduceMotion = useReducedMotion();

	const titlesQuery = useStoreCreditClientTitles({
		clientId: cliente.clienteId,
		includeSettled: showSettled,
		enabled: isExpanded,
		scope: originScope,
	});
	const titulos = titlesQuery.data?.titulos ?? [];

	const diasAtraso = cliente.previsaoMaisAntiga ? getStoreCreditDaysOverdue(cliente.previsaoMaisAntiga) : 0;
	const isOverdue = diasAtraso > 0;
	const isSettled = cliente.saldoAberto <= 0;

	return (
		<div className="text-numeric bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex w-full flex-col items-start justify-between gap-3 lg:flex-row lg:items-center">
				<div className="flex min-w-0 items-center gap-2">
					<Avatar className="h-8 w-8 shrink-0">
						<AvatarFallback className="text-[0.65rem] font-medium">
							{cliente.semCliente ? <UserX className="h-3.5 w-3.5" /> : formatNameAsInitials(cliente.nome)}
						</AvatarFallback>
					</Avatar>
					<div className="flex min-w-0 flex-col gap-0.5">
						<h1 className="truncate text-xs font-bold tracking-tight lg:text-sm">{cliente.nome}</h1>
						<span className="truncate text-[0.65rem] text-muted-foreground">
							{cliente.semCliente ? "Venda cujo cadastro do cliente foi removido" : cliente.telefone || "Sem telefone"}
						</span>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-1.5">
					{isSettled ? (
						<span className="flex items-center gap-1.5 rounded-xl bg-green-500/10 px-3 py-1.5 text-[0.65rem] font-medium text-green-700 dark:text-green-400">
							<CheckCircle2 className="h-3 w-3" />
							QUITADO
						</span>
					) : isOverdue ? (
						<span className="flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-1.5 text-[0.65rem] font-medium text-red-700 dark:text-red-400">
							<AlertCircle className="h-3 w-3" />
							EM ATRASO
						</span>
					) : (
						<span className="flex items-center gap-1.5 rounded-xl bg-blue-500/10 px-3 py-1.5 text-[0.65rem] font-medium text-blue-700 dark:text-blue-400">
							<Clock className="h-3 w-3" />
							EM DIA
						</span>
					)}
					{cliente.titulosAbertos > 0 ? (
						<span className="rounded-xl bg-muted px-3 py-1.5 text-[0.65rem] font-medium text-muted-foreground">
							{cliente.titulosAbertos} {cliente.titulosAbertos === 1 ? "VENDA" : "VENDAS"}
						</span>
					) : null}
				</div>
			</div>

			<div className="flex w-full flex-col items-start justify-between gap-3 lg:flex-row lg:items-end">
				<div className="flex flex-col gap-0.5">
					<span className={cn("text-xs font-medium tracking-tight", isOverdue ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>
						{formatOverdueLabel(cliente.previsaoMaisAntiga) ?? "Sem pendências em aberto"}
					</span>
					<span className="text-[0.65rem] text-muted-foreground">
						{cliente.totalRecebido > 0
							? `${formatToMoney(cliente.totalRecebido)} já recebidos${originScope ? " no período" : ""}${cliente.ultimoRecebimento ? ` · último em ${formatDateAsLocale(cliente.ultimoRecebimento)}` : ""}`
							: originScope
								? "Nenhum recebimento das vendas deste período"
								: "Nenhum recebimento registrado"}
					</span>
				</div>

				<div className="flex w-full flex-col items-stretch gap-2 lg:w-auto lg:flex-row lg:items-center">
					<div className="flex flex-col lg:items-end">
						{/* Sob recorte, o saldo é o do período — o rótulo precisa dizer isso. Um número que
						    não muda quando o filtro muda é pior do que não ter filtro. */}
						<span className="text-[0.6rem] font-medium tracking-tight text-muted-foreground uppercase">
							{originScope ? "Em aberto no período" : "Em aberto"}
						</span>
						<span className={cn("text-lg font-bold tracking-tight", isSettled ? "text-muted-foreground" : "text-foreground")}>
							{formatToMoney(cliente.saldoAberto)}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							aria-expanded={isExpanded}
							onClick={() => setIsExpanded((previous) => !previous)}
							className="flex flex-1 items-center gap-1.5 lg:flex-none"
						>
							<ChevronDown className={cn("h-4 w-4 transition-transform duration-200 ease-out", isExpanded && "rotate-180")} />
							VENDAS
						</Button>
						{canReceive && cliente.saldoAberto > 0 ? (
							<Button type="button" size="sm" onClick={() => onReceiveClient(cliente)} className="flex flex-1 items-center gap-1.5 lg:flex-none">
								<HandCoins className="h-4 w-4" />
								RECEBER
							</Button>
						) : null}
					</div>
				</div>
			</div>

			<AnimatePresence initial={false}>
				{isExpanded ? (
					<motion.div
						key="titulos"
						initial={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
						animate={shouldReduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
						exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
						transition={{ duration: shouldReduceMotion ? 0.15 : 0.22, ease: [0.22, 1, 0.36, 1] }}
						className="overflow-hidden"
					>
						<div className="flex w-full flex-col gap-2 border-t border-border pt-3">
							<div className="flex w-full items-center justify-between gap-2">
								<h2 className="text-[0.6rem] font-medium tracking-tight text-muted-foreground uppercase">
									{originScope ? "Vendas do período" : "Vendas do cliente"}
								</h2>
								<button
									type="button"
									onClick={() => setShowSettled((previous) => !previous)}
									className="rounded-md px-2 py-1 text-[0.65rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								>
									{showSettled ? "VER SÓ EM ABERTO" : "VER HISTÓRICO"}
								</button>
							</div>

							{titlesQuery.isLoading ? (
								<div className="flex w-full flex-col gap-2">
									<Skeleton className="h-12 w-full rounded-lg" />
									<Skeleton className="h-12 w-full rounded-lg" />
								</div>
							) : titlesQuery.isError ? (
								<ErrorComponent msg={getErrorMessage(titlesQuery.error)} />
							) : titulos.length === 0 ? (
								<p className="py-2 text-center text-xs text-muted-foreground">
									{showSettled
										? originScope
											? "Nenhuma venda a prazo neste período."
											: "Nenhuma venda a prazo registrada."
										: originScope
											? "Nenhuma venda em aberto neste período."
											: "Nenhuma venda em aberto."}
								</p>
							) : (
								<div className="flex w-full flex-col divide-y divide-border">
									{titulos.map((titulo) => {
										const tituloEmAtraso = titulo.emAberto && getStoreCreditDaysOverdue(titulo.dataPrevisao) > 0;
										const quitadoViaBaixa = !titulo.emAberto && titulo.origem === STORE_CREDIT_RECEIPT_ORIGIN;
										return (
											<div key={titulo.transacaoId} className="flex w-full flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
												<div className="flex min-w-0 flex-col gap-0.5">
													<span className="truncate text-xs font-medium tracking-tight">{titulo.titulo || "Venda sem título"}</span>
													<span className="text-[0.65rem] text-muted-foreground">
														{titulo.vendaDataVenda ? `Venda em ${formatDateAsLocale(titulo.vendaDataVenda)} · ` : ""}
														{titulo.emAberto ? (
															<span className={cn(tituloEmAtraso && "font-medium text-red-700 dark:text-red-400")}>
																Previsto para {formatDateAsLocale(titulo.dataPrevisao)}
															</span>
														) : (
															<span className="text-green-700 dark:text-green-400">
																Recebido em {formatDateAsLocale(titulo.dataEfetivacao)}
																{quitadoViaBaixa ? ` em ${PAYMENT_METHOD_CHIP_LABELS[titulo.metodo as TPaymentMethodEnum] ?? titulo.metodo}` : ""}
															</span>
														)}
													</span>
												</div>
												<div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
													<span className={cn("text-sm font-bold tracking-tight", !titulo.emAberto && "text-muted-foreground")}>
														{formatToMoney(titulo.valor)}
													</span>
													{canReceive && titulo.emAberto ? (
														<Button type="button" variant="outline" size="sm" onClick={() => onReceiveTitle(cliente, titulo.transacaoId)}>
															RECEBER
														</Button>
													) : null}
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
