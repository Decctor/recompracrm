"use client";

import type { TGetFinancialAccountsOutputDefault } from "@/app/api/finances/financial-accounts/route";
import { formatPercent } from "@/app/dashboard/finance/_components/finance-chart-kit";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";

type TAccount = TGetFinancialAccountsOutputDefault["accounts"][number];

/** Cor sólida de cada tipo (o mesmo tom do texto do badge em `FinancialAccountTypeOptions`). */
const ACCOUNT_TYPE_HEX: Record<TAccount["tipo"], string> = {
	CAIXA: "#16a34a",
	BANCO: "#2563eb",
	CARTEIRA_DIGITAL: "#9333ea",
	CARTAO_CREDITO: "#dc2626",
	INVESTIMENTO: "#b45309",
	OUTRO: "#4b5563",
};

/**
 * Faixa de posição no topo da página: saldo em contas (tudo que não é cartão), fatura em aberto
 * (cartões) e posição líquida, com a participação de cada conta no saldo.
 */
export function AccountsSummary({ accounts: listedAccounts }: { accounts: TAccount[] }) {
	// Só contas ativas, como nos demais relatórios — o filtro "Todas as contas" não muda a posição.
	const accounts = listedAccounts.filter((account) => account.ativo);
	const cashAccounts = accounts.filter((account) => account.tipo !== "CARTAO_CREDITO");
	const totalCash = cashAccounts.reduce((total, account) => total + (account.estatisticas?.saldoAtual ?? 0), 0);
	const totalLiabilities = accounts
		.filter((account) => account.tipo === "CARTAO_CREDITO")
		.reduce((total, account) => total + (account.estatisticas?.saldoAtual ?? 0), 0);
	const netPosition = totalCash - totalLiabilities;

	// Saldos negativos não ocupam espaço na barra, mas continuam na legenda.
	const positiveTotal = cashAccounts.reduce((total, account) => total + Math.max(0, account.estatisticas?.saldoAtual ?? 0), 0);
	const segments = cashAccounts
		.map((account) => {
			const balance = account.estatisticas?.saldoAtual ?? 0;
			return {
				id: account.id,
				nome: account.nome,
				balance,
				color: ACCOUNT_TYPE_HEX[account.tipo] ?? ACCOUNT_TYPE_HEX.OUTRO,
				share: positiveTotal > 0 ? (Math.max(0, balance) / positiveTotal) * 100 : 0,
			};
		})
		.sort((a, b) => b.balance - a.balance);

	return (
		<div className="bg-card border-border flex flex-col gap-3 rounded-xl border px-4 py-3.5 shadow-2xs">
			<div className="flex flex-wrap items-end gap-x-7 gap-y-3">
				<SummaryFigure label="Saldo em contas" value={formatToMoney(totalCash)} className="text-[#24549c]" />
				<SummaryFigure label="Fatura em aberto" value={formatToMoney(totalLiabilities)} className="text-red-600" />
				<SummaryFigure label="Posição líquida" value={formatToMoney(netPosition)} className={cn({ "text-red-600": netPosition < 0 })} />
			</div>
			{positiveTotal > 0 ? (
				<div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
					{segments
						.filter((segment) => segment.share > 0)
						.map((segment) => (
							<div
								key={segment.id}
								title={`${segment.nome} · ${formatToMoney(segment.balance)}`}
								style={{ width: `${segment.share}%`, background: segment.color }}
							/>
						))}
				</div>
			) : null}
			<div className="flex flex-wrap gap-x-4.5 gap-y-1.5">
				{segments.map((segment) => (
					<div key={segment.id} className="flex items-center gap-1.5 text-xs">
						<span className="size-2 rounded-[2px]" style={{ background: segment.color }} />
						<span className="font-semibold">{segment.nome}</span>
						<span className="text-muted-foreground tabular-nums">
							{formatToMoney(segment.balance)} · {formatPercent(segment.share)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function SummaryFigure({ label, value, className }: { label: string; value: string; className?: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-muted-foreground text-[0.6rem] font-semibold uppercase tracking-wide">{label}</span>
			<span className={cn("text-[22px] font-bold leading-7 tabular-nums", className)}>{value}</span>
		</div>
	);
}
