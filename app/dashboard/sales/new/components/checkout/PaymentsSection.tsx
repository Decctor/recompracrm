import { Button } from "@/components/ui/button";
import {
	DropdownMenuGroup,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InteractiveInput } from "@/components/ui/interactive-input";
import { Input } from "@/components/ui/input";
import { formatDateAsLocale, formatDateOnInputChange } from "@/lib/formatting";
import { getPaymentInstallmentsOptions } from "@/lib/payments/defaults";
import { getTodayDateInputValue, isPaymentTerminalMethod } from "@/lib/payments/schemas";
import { type TPaymentTerminalListItem, usePaymentTerminals } from "@/lib/queries/payment-terminals";
import { formatToMoney } from "@/lib/formatting";
import type { ClassifiedPayment } from "@/lib/sales/utils";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import { SalePaymentMethodsOptions } from "@/utils/select-options";
import { CalendarClock, Check, CheckCheck, Clock, Landmark, Plus, Wallet, X } from "lucide-react";
import { useMemo } from "react";
import TerminalPicker from "./TerminalPicker";

type PaymentsSectionProps = {
	saleState: TUseSaleState;
	// Modo edição: transações já efetivadas, exibidas travadas — nunca entram nos splits editáveis.
	pagamentosEfetivados?: Pick<ClassifiedPayment, "id" | "metodo" | "valor" | "parcela" | "totalParcelas">[];
	// Cobrança na maquininha só nasce na confirmação (não na edição de venda confirmada).
	allowTerminal?: boolean;
};

type PaymentCardProps = {
	saleState: TUseSaleState;
	payment: TUseSaleState["state"]["pagamentos"][number];
	terminals: TPaymentTerminalListItem[];
};

// Regra do MVP (docs/10, decisão 4): um único pagamento em cartão cobrindo o total. O motivo
// aparece no próprio botão em vez de sumir com ele — o operador entende o que precisa mudar.
function resolveTerminalBlockedReason(saleState: TUseSaleState, payment: PaymentCardProps["payment"]): string | null {
	if (!isPaymentTerminalMethod(payment.metodo)) return "A maquininha só cobra cartão de débito ou crédito.";
	if (saleState.state.pagamentos.length > 1) return "A maquininha exige um único pagamento cobrindo o total da venda.";
	if (saleState.state.pagamentosEfetivadosTotal > 0) return "A maquininha não cobra vendas com pagamentos já recebidos.";
	if (Math.abs(payment.valor - saleState.valorAposEfetivados) > 0.01) return "O pagamento na maquininha precisa cobrir exatamente o total da venda.";
	return null;
}

function PaymentCard({ saleState, payment, terminals }: PaymentCardProps) {
	const paymentMethodConfig = saleState.organizationPaymentMethodsConfig[payment.metodo];
	const selectedMethod = SalePaymentMethodsOptions.find((method) => method.value === payment.metodo);
	const selectedForecastDate = payment.dataPrevisao ? new Date(payment.dataPrevisao) : undefined;
	const supportedMethodOptions = SalePaymentMethodsOptions.filter((method) => saleState.organizationPaymentMethodsConfig[method.value]?.suportado);
	const installmentOptions = getPaymentInstallmentsOptions(paymentMethodConfig);
	const shouldShowInstallments = installmentOptions.length > 0;
	// Conta financeira: só aparece nos métodos configurados como editáveis (ex.: PIX recebido em
	// conta diferente nas vendas B2B). A padrão já vem selecionada.
	const accountOptions = saleState.organizationFinancialAccounts;
	const shouldShowAccount = (paymentMethodConfig?.contaFinanceiraEditavel ?? false) && accountOptions.length > 0;
	const selectedAccount = accountOptions.find((account) => account.id === payment.contaFinanceiraId);
	const terminalBlockedReason = terminals.length > 0 ? resolveTerminalBlockedReason(saleState, payment) : null;
	const shouldShowTerminal = terminals.length > 0 && (isPaymentTerminalMethod(payment.metodo) || !!payment.dispositivoId);
	const isTerminalCharge = !!payment.dispositivoId;
	return (
		<div className="w-full flex flex-col gap-2 rounded-lg border px-2 py-2">
			<div className="flex items-center gap-1.5 justify-between">
				<div className="flex items-center gap-1.5">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant={payment.efetivacaoTipo === "IMEDIATA" ? "success-light" : "warning-light"} size="fit" className="px-2 py-1 rounded-lg">
									{payment.efetivacaoTipo === "IMEDIATA" ? <CheckCheck className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
								</Button>
							}
						/>
						<DropdownMenuContent>
							<DropdownMenuGroup>
								<DropdownMenuLabel>EFETIVAÇÃO</DropdownMenuLabel>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem
									onClick={() =>
										saleState.updatePagamento(payment.id, {
											efetivacaoTipo: "IMEDIATA",
											dataPrevisao: getTodayDateInputValue(),
										})
									}
								>
									<CheckCheck className="w-3 h-3" />
									RECEBER AGORA
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() =>
										saleState.updatePagamento(payment.id, {
											efetivacaoTipo: "PENDENTE",
											dataPrevisao: payment.dataPrevisao ?? getTodayDateInputValue(),
										})
									}
								>
									<Clock className="w-3 h-3" />
									RECEBER DEPOIS
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant="ghost" size="sm" className="flex items-center gap-1.5 uppercase text-xs">
									{selectedMethod?.icon ?? <Wallet className="w-4 h-4" />}
									{selectedMethod?.label ?? payment.metodo}
								</Button>
							}
						/>
						<DropdownMenuContent>
							<DropdownMenuGroup>
								<DropdownMenuLabel>MÉTODO</DropdownMenuLabel>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								{supportedMethodOptions.map((method) => (
									<DropdownMenuItem key={method.value} onClick={() => saleState.updatePagamento(payment.id, { metodo: method.value })}>
										<div className="flex items-center gap-2 w-full justify-between">
											<div className="flex items-center gap-2">
												{method.icon}
												{method.label}
											</div>
											{method.value === payment.metodo ? <Check className="w-4 h-4" /> : null}
										</div>
									</DropdownMenuItem>
								))}
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				<div className="flex items-center gap-1.5">
					<Input
						type="number"
						className="w-24 max-w-full text-xs"
						value={payment.valor}
						onChange={(event) => saleState.updatePagamento(payment.id, { valor: Number(event.target.value) || 0 })}
					/>
					<Button type="button" variant="ghost-destructive" size="icon" className="h-8 w-8" onClick={() => saleState.removePagamento(payment.id)}>
						<X className="w-3 h-3" />
					</Button>
				</div>
			</div>

			{shouldShowAccount || shouldShowInstallments || shouldShowTerminal || payment.efetivacaoTipo === "PENDENTE" ? (
				<div className="w-full flex flex-wrap justify-end items-center gap-x-3 gap-y-1">
					{/* Ordem do modificador mais estrutural para o mais temporal: onde cai → como divide → quando entra. */}
					{shouldShowTerminal ? (
						<TerminalPicker
							terminals={terminals}
							value={payment.dispositivoId}
							blockedReason={terminalBlockedReason}
							onChange={(dispositivoId) => saleState.updatePagamento(payment.id, { dispositivoId })}
						/>
					) : null}
					{shouldShowAccount ? (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-[0.7rem] min-w-0">
										<Landmark className="w-3.5 h-3.5 shrink-0" />
										{/* O nome é dado do usuário: preserva a capitalização que a organização escreveu. */}
										<span className="truncate max-w-[11rem]">{selectedAccount?.nome ?? "DEFINIR CONTA"}</span>
									</Button>
								}
							/>
							<DropdownMenuContent align="end">
								<DropdownMenuGroup>
									<DropdownMenuLabel>CONTA FINANCEIRA</DropdownMenuLabel>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									{accountOptions.map((account) => (
										<DropdownMenuItem key={account.id} onClick={() => saleState.updatePagamento(payment.id, { contaFinanceiraId: account.id })}>
											<div className="flex items-center gap-2 w-full justify-between">
												{account.nome}
												{account.id === payment.contaFinanceiraId ? <Check className="w-4 h-4" /> : null}
											</div>
										</DropdownMenuItem>
									))}
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
					{shouldShowInstallments ? (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-[0.7rem]">
										{payment.totalParcelas ? `${payment.totalParcelas}x` : "PARCELAS"}
									</Button>
								}
							/>
							<DropdownMenuContent align="end">
								<DropdownMenuGroup>
									<DropdownMenuLabel>PARCELAMENTO</DropdownMenuLabel>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									{installmentOptions.map((parcelas) => (
										<DropdownMenuItem key={parcelas} onClick={() => saleState.updatePagamento(payment.id, { totalParcelas: parcelas })}>
											<div className="flex items-center gap-2 w-full justify-between">
												<span>{parcelas}x</span>
												{payment.totalParcelas === parcelas ? <Check className="w-4 h-4" /> : null}
											</div>
										</DropdownMenuItem>
									))}
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
					{payment.efetivacaoTipo === "PENDENTE" && !isTerminalCharge ? (
						<InteractiveInput.Root>
							<InteractiveInput.Trigger>
								<Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-[0.7rem]">
									<CalendarClock className="w-3.5 h-3.5 text-amber-600" />
									{payment.dataPrevisao ? `PREVISÃO: ${formatDateAsLocale(payment.dataPrevisao)}` : "DEFINIR PREVISÃO"}
								</Button>
							</InteractiveInput.Trigger>
							<InteractiveInput.Content align="end">
								<InteractiveInput.DateContent
									value={selectedForecastDate}
									onChange={(nextDate) =>
										saleState.updatePagamento(payment.id, {
											dataPrevisao: formatDateOnInputChange(nextDate?.toISOString()) ?? null,
										})
									}
								/>
							</InteractiveInput.Content>
						</InteractiveInput.Root>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export default function PaymentsSection({ saleState, pagamentosEfetivados, allowTerminal = true }: PaymentsSectionProps) {
	const missingTotal = useMemo(() => saleState.valorRestante, [saleState.valorRestante]);
	const supportedMethodOptions = SalePaymentMethodsOptions.filter((method) => saleState.organizationPaymentMethodsConfig[method.value]?.suportado);
	const hasSettledPayments = (pagamentosEfetivados?.length ?? 0) > 0;
	// Uma consulta por checkout; organização sem maquininha recebe lista vazia e nenhum controle novo.
	const { data: terminals = [] } = usePaymentTerminals({ enabled: allowTerminal });
	const hasTerminalCharge = saleState.state.pagamentos.some((payment) => payment.dispositivoId);

	return (
		<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs">
			<div className="flex items-center gap-1.5 justify-between">
				<div className="flex items-center gap-1.5">
					<Wallet className="w-4 h-4 text-foreground" />
					<h3 className="font-bold text-xs tracking-wide">PAGAMENTO</h3>
				</div>
				<Button
					type="button"
					size="fit"
					className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
					variant="ghost-brand"
					onClick={() => saleState.addPagamento({ metodo: supportedMethodOptions[0]?.value ?? "DINHEIRO", valor: missingTotal })}
				>
					<Plus className="w-4 h-4" /> ADICIONAR
				</Button>
			</div>

			{hasSettledPayments ? (
				<div className="flex flex-col gap-1.5">
					{pagamentosEfetivados?.map((payment) => {
						const methodLabel = SalePaymentMethodsOptions.find((method) => method.value === payment.metodo)?.label ?? payment.metodo;
						const installmentLabel = payment.parcela && payment.totalParcelas ? ` ${payment.parcela}/${payment.totalParcelas}` : "";
						return (
							<div key={payment.id} className="w-full flex items-center justify-between rounded-lg border border-green-600/25 bg-green-500/10 px-2 py-1.5">
								<div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400 uppercase">
									<CheckCheck className="w-3 h-3 min-w-3 min-h-3" />
									{methodLabel}
									{installmentLabel} · JÁ RECEBIDO
								</div>
								<span className="text-xs font-bold text-green-700 dark:text-green-400">{formatToMoney(payment.valor)}</span>
							</div>
						);
					})}
					<p className="text-[11px] text-muted-foreground">Pagamentos já recebidos permanecem intactos e não podem ser alterados aqui.</p>
				</div>
			) : null}

			{saleState.state.pagamentos.length === 0 && !hasSettledPayments ? (
				supportedMethodOptions.length > 0 ? (
					<div className="rounded-lg border border-dashed p-3 flex flex-col gap-2.5">
						<div className="text-xs text-muted-foreground flex items-center gap-2">
							<CalendarClock className="w-4 h-4 min-w-4 min-h-4" />
							Nenhum pagamento adicionado. Toque em um método para adicionar o valor restante.
						</div>
						<div className="flex flex-wrap gap-1.5">
							{supportedMethodOptions.map((method) => (
								<Button
									key={method.value}
									type="button"
									variant="outline"
									size="fit"
									className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs"
									onClick={() => saleState.addPagamento({ metodo: method.value, valor: missingTotal })}
								>
									{method.renderIcon("w-3.5 h-3.5")}
									{method.label}
								</Button>
							))}
						</div>
					</div>
				) : (
					<div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground flex items-center gap-2">
						<CalendarClock className="w-4 h-4 min-w-4 min-h-4" />
						Nenhum pagamento adicionado. Você pode registrar recebimento imediato ou previsto.
					</div>
				)
			) : null}

			{saleState.state.pagamentos.map((payment) => (
				<PaymentCard key={payment.id} saleState={saleState} payment={payment} terminals={allowTerminal ? terminals : []} />
			))}
			{hasTerminalCharge ? (
				<p className="text-[11px] text-muted-foreground">
					A venda será confirmada e a cobrança enviada para a maquininha. O pagamento fica pendente até a aprovação no terminal.
				</p>
			) : null}
		</div>
	);
}
