"use client";

import type { TGetFinancialTransactionsOutputById } from "@/app/api/finances/financial-transactions/route";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { CHIP_XS_ICON_CLASS, Chip } from "@/components/ui/chip";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { formatSettlementDate, SETTLEMENT_ORIGIN_LABEL } from "@/lib/finances/settlement-audit";
import { cn } from "@/lib/utils";
import { FinancialTransactionTypeOptions, SalePaymentMethodsOptions } from "@/utils/select-options";
import { AlertCircle, CheckCircle2, Clock, Receipt } from "lucide-react";
import { cloneElement, isValidElement, useMemo } from "react";
import DetailField from "./DetailField";

type FinancialTransactionSummaryBlockProps = {
	transaction: TGetFinancialTransactionsOutputById;
};

export default function FinancialTransactionSummaryBlock({ transaction }: FinancialTransactionSummaryBlockProps) {
	const typeConfig = useMemo(() => FinancialTransactionTypeOptions.find((o) => o.value === transaction.tipo) ?? null, [transaction.tipo]);
	const paymentMethodConfig = useMemo(() => SalePaymentMethodsOptions.find((o) => o.value === transaction.metodo) ?? null, [transaction.metodo]);

	const now = new Date();
	const isEffective = !!transaction.dataEfetivacao;
	const isOverdue = !isEffective && transaction.dataPrevisao && new Date(transaction.dataPrevisao) < now;

	const statusConfig = useMemo(() => {
		return {
			label: isEffective ? "EFETIVADA" : isOverdue ? "EM ATRASO" : "PENDENTE",
			className: isEffective ? "bg-green-100 text-green-700" : isOverdue ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700",
			icon: isEffective ? <CheckCircle2 className="h-3 w-3" /> : isOverdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />,
		};
	}, [isEffective, isOverdue]);

	return (
		<ResponsiveMenuSection title="RESUMO" icon={<Receipt className="h-4 w-4 min-h-4 min-w-4" />}>
			<div className="border-border bg-muted/30 flex w-full min-w-0 flex-col gap-3 rounded-xl border px-4 py-3">
				<div className="flex w-full min-w-0 flex-col gap-2">
					<div className="flex items-center gap-1.5">
						{typeConfig ? (
							<Chip.Root size="xs" shape="xl" className={cn(typeConfig.colors.background, typeConfig.colors.text)}>
								<Chip.Icon>
									{isValidElement<{ className?: string }>(typeConfig.icon)
										? cloneElement(typeConfig.icon, {
												className: cn(CHIP_XS_ICON_CLASS, typeConfig.icon.props.className),
											})
										: typeConfig.icon}
								</Chip.Icon>
								<Chip.Label weight="bold">{typeConfig.label}</Chip.Label>
							</Chip.Root>
						) : null}
						<h2 className="text-sm font-extrabold tracking-tight break-words">{transaction.titulo || "Título não definido"}</h2>
					</div>

					<div className="w-full flex items-center justify-between gap-3">
						<p className="text-lg font-extrabold tracking-tight tabular-nums">{formatToMoney(transaction.valor)}</p>
						{statusConfig ? (
							<Chip.Root size="sm" shape="xl" className={cn(statusConfig.className)}>
								<Chip.Icon>{statusConfig.icon}</Chip.Icon>
								<Chip.Label weight="bold">{statusConfig.label}</Chip.Label>
							</Chip.Root>
						) : null}
					</div>
				</div>
			</div>

			<div className="flex w-full min-w-0 flex-col">
				{transaction.dataPrevisao ? <DetailField label="Previsão" value={formatDateAsLocale(transaction.dataPrevisao)} /> : null}
				{transaction.dataEfetivacao ? (
					<>
						<DetailField label="Efetivação" value={formatSettlementDate(transaction.dataEfetivacao)} />
						{/* Efetivações anteriores à auditoria não registraram autor nem origem: "—", nunca um palpite. */}
						<DetailField label="Efetivada por" value={transaction.efetivacaoAutor?.nome ?? "—"} />
						<DetailField label="Via" value={transaction.efetivacaoOrigem ? SETTLEMENT_ORIGIN_LABEL[transaction.efetivacaoOrigem] : "—"} />
					</>
				) : null}
				{transaction.autor ? <DetailField label="Lançada por" value={transaction.autor.nome} /> : null}
				{paymentMethodConfig ? (
					<DetailField label="Método">
						<span className="flex items-center gap-1.5 text-sm font-medium">
							{paymentMethodConfig.icon}
							{paymentMethodConfig.label}
						</span>
					</DetailField>
				) : null}
				{transaction.totalParcelas && transaction.totalParcelas > 1 ? (
					<DetailField label="Parcela" value={`${transaction.parcela ?? 1} de ${transaction.totalParcelas}`} />
				) : null}
			</div>
		</ResponsiveMenuSection>
	);
}
