"use client";

import { ArrowDown, ArrowUp, BadgeDollarSign, GitBranch, Pencil, PlayIcon, TrendingUp } from "lucide-react";
import type { TGetFinancialAccountsOutputDefault } from "@/app/api/finances/financial-accounts/route";
import { Button } from "@/components/ui/button";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { FinancialAccountTypeOptions } from "@/utils/select-options";
import { AccountCardChart } from "./account-card-chart";

type AccountCardProps = {
	account: TGetFinancialAccountsOutputDefault["accounts"][number];
	statsPeriodAfter: Date | null;
	statsPeriodBefore: Date | null;
	canEdit: boolean;
	onEdit: () => void;
};
export function AccountCard({ account, statsPeriodAfter, statsPeriodBefore, canEdit, onEdit }: AccountCardProps) {
	const typeConfig = FinancialAccountTypeOptions.find((o) => o.value === account.tipo) ?? null;
	const stats = account.estatisticas;
	const bankConfig = account.configuracao?.categoria === "BANCO" ? account.configuracao : null;
	const creditCardConfig = account.configuracao?.categoria === "CARTAO_CREDITO" ? account.configuracao : null;
	const isCreditCard = account.tipo === "CARTAO_CREDITO";
	const totalEntradas = stats?.totalEntradas ?? 0;
	const totalSaidas = stats?.totalSaidas ?? 0;
	// No cartão, saída aumenta a dívida: o resultado do período é o quanto ela cresceu.
	const periodResult = isCreditCard ? totalSaidas - totalEntradas : totalEntradas - totalSaidas;
	const creditLimit = creditCardConfig?.limiteCredito ?? null;
	const creditUsage = creditLimit ? Math.min(100, Math.max(0, ((stats?.saldoAtual ?? 0) / creditLimit) * 100)) : null;

	return (
		<div className="bg-card border-border flex w-full flex-col gap-2 rounded-xl border px-4 py-4 shadow-2xs">
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-2">
					{typeConfig ? (
						<span className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem]", typeConfig.colors.background, typeConfig.colors.text)}>
							{typeConfig.icon}
							{typeConfig.label}
						</span>
					) : null}

					<h2 className="text-sm font-semibold">{account.nome}</h2>
				</div>
				<div className="flex items-center gap-2">
					{canEdit ? (
						<Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Editar conta ${account.nome}`}>
							<Pencil className="h-3.5 w-3.5" />
						</Button>
					) : null}
					<span
						className={cn(
							"flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem]",
							account.ativo ? "bg-green-200 text-green-600" : "bg-gray-200 text-gray-600",
						)}
					>
						{account.ativo ? "ATIVO" : "INATIVO"}
					</span>
				</div>
			</div>
			<div className="w-full flex items-center flex-wrap gap-x-3 gap-y-1.5">
				<span className={cn("flex items-center gap-1.5 text-[0.65rem]")}>
					<PlayIcon className="w-3 h-3" />
					INICIAL: {formatToMoney(account.saldoInicial)} EM {formatDateAsLocale(account.dataSaldoInicial)}
				</span>
				<span className={cn("flex items-center gap-1.5 text-[0.65rem]")}>
					<GitBranch className="w-3 h-3" />
					CONTA CONTÁBIL: {account.contaContabil?.nome ?? "N/A"}
				</span>
			</div>

			{bankConfig && (bankConfig.nome || bankConfig.agencia || bankConfig.contaNumero) ? (
				<div className="flex flex-col gap-1 border-t border-border pt-2">
					{bankConfig.nome ? (
						<div className="flex items-center justify-between">
							<span className="text-[0.65rem] text-muted-foreground">Banco</span>
							<span className="text-[0.65rem] font-medium">{bankConfig.nome}</span>
						</div>
					) : null}
					{bankConfig.agencia ? (
						<div className="flex items-center justify-between">
							<span className="text-[0.65rem] text-muted-foreground">Agência</span>
							<span className="text-[0.65rem] font-medium">{bankConfig.agencia}</span>
						</div>
					) : null}
					{bankConfig.contaNumero ? (
						<div className="flex items-center justify-between">
							<span className="text-[0.65rem] text-muted-foreground">Conta</span>
							<span className="text-[0.65rem] font-medium">
								{bankConfig.contaNumero}
								{bankConfig.contaDigito ? `-${bankConfig.contaDigito}` : ""}
							</span>
						</div>
					) : null}
				</div>
			) : null}
			{creditCardConfig ? (
				<div className="flex flex-col gap-1.5 border-t border-border pt-2">
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] text-muted-foreground">
						<span>FECHAMENTO: dia {creditCardConfig.diaFechamentoFatura}</span>
						<span>VENCIMENTO: dia {creditCardConfig.diaVencimentoFatura}</span>
						{creditLimit ? <span>LIMITE: {formatToMoney(creditLimit)}</span> : null}
					</div>
					{creditLimit && creditUsage !== null ? (
						<div className="flex items-center gap-2">
							<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
								<div className="h-full rounded-full bg-red-600" style={{ width: `${creditUsage}%` }} />
							</div>
							<span className="whitespace-nowrap text-[0.65rem] font-semibold">
								{formatDecimalPlaces(creditUsage, 1, 1)}% usado · disponível {formatToMoney(Math.max(0, creditLimit - (stats?.saldoAtual ?? 0)))}
							</span>
						</div>
					) : null}
				</div>
			) : null}
			<div className="flex w-full flex-col gap-2 lg:flex-row lg:items-stretch">
				{/* LEFT: Stat badges stacked vertically */}
				<div className="flex w-full shrink-0 flex-col gap-1 lg:w-1/3">
					{/* Saldo Atual — all time */}
					<div className={cn("w-full flex items-center justify-between gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem] bg-secondary")}>
						<div className="flex items-center gap-1.5">
							<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />
							<span className="text-xs font-medium">{isCreditCard ? "SALDO DEVEDOR" : "SALDO ATUAL"}</span>
						</div>
						<span className="text-sm font-bold tabular-nums">{formatToMoney(stats?.saldoAtual ?? 0)}</span>
					</div>

					{/* Total Entradas — period */}
					<div className="w-full flex items-center justify-between gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem] bg-green-100 text-green-700">
						<div className="flex items-center gap-1.5">
							<ArrowUp className="w-4 h-4 min-w-4 min-h-4" />
							<span className="text-xs font-medium">ENTRADAS</span>
						</div>
						<span className="text-sm font-bold tabular-nums">{formatToMoney(totalEntradas)}</span>
					</div>

					{/* Total Saídas — period */}
					<div className="w-full flex items-center justify-between gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem] bg-red-100 text-red-700">
						<div className="flex items-center gap-1.5">
							<ArrowDown className="w-4 h-4 min-w-4 min-h-4" />
							<span className="text-xs font-medium">SAÍDAS</span>
						</div>
						<span className="text-sm font-bold tabular-nums">{formatToMoney(totalSaidas)}</span>
					</div>

					{/* Resultado — period (entradas − saídas; no cartão, saídas − entradas) */}
					<div className="w-full flex items-center justify-between gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem] bg-indigo-100 text-indigo-700">
						<div className="flex items-center gap-1.5">
							<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />
							<span className="text-xs font-medium">RESULTADO</span>
						</div>
						<span className="text-sm font-bold tabular-nums">
							{periodResult >= 0 ? "+" : "−"}
							{formatToMoney(Math.abs(periodResult))}
						</span>
					</div>
				</div>

				{/* RIGHT: chart — owns its own header + type toggles */}
				<div className="flex min-h-[120px] flex-1 flex-col rounded-[10px] bg-gradient-to-b from-muted/40 to-transparent px-2 pb-1 pt-2">
					<AccountCardChart accountId={account.id} accountType={account.tipo} startDate={statsPeriodAfter} endDate={statsPeriodBefore} />
				</div>
			</div>
		</div>
	);
}
