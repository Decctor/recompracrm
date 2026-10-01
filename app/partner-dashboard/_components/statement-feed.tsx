"use client";

import type { TGetPlatformPartnerDashboardOutput } from "@/app/api/platform-partner/dashboard/route";
import { PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS } from "@/lib/platform-partnerships/constants";
import { formatCommissionPercent, formatPartnerDate, formatPartnerMonthName, getLocalMonthKey } from "@/lib/platform-partnerships/earnings";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Initials, Money } from "./partner-ui";

export type TPartnerStatementItem = TGetPlatformPartnerDashboardOutput["data"]["extrato"][number];

const COMMISSION_STATUS: Record<string, { label: string; className: string }> = {
	PENDENTE: { label: "Pendente", className: "text-warning-surface-foreground" },
	APROVADA: { label: "Aprovada", className: "text-primary" },
	PAGA: { label: "Paga", className: "text-success-surface-foreground" },
	CANCELADA: { label: "Cancelada", className: "text-destructive-surface-foreground" },
};

const STORE_EVENT: Record<string, string> = {
	EM_TESTE: "Iniciou o teste grátis",
	ATIVA: "Entrou pelo seu link",
	EM_ATRASO: "Entrou pelo seu link",
	CANCELADA: "Entrou pelo seu link",
	SEM_ASSINATURA: "Criou a conta",
	EXCLUIDA: "Entrou pelo seu link",
};

function Row({
	href,
	icon,
	title,
	value,
	subtitle,
	status,
	highlighted,
}: {
	href?: string;
	icon: ReactNode;
	title: string;
	value: ReactNode;
	subtitle: string;
	status: ReactNode;
	highlighted?: boolean;
}) {
	const content = (
		<>
			{icon}
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex justify-between gap-2">
					<span className="truncate text-sm font-bold">{title}</span>
					{value}
				</div>
				<div className="flex justify-between gap-2 text-xs text-muted-foreground">
					<span className="truncate">{subtitle}</span>
					{status}
				</div>
			</div>
			{href ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" /> : null}
		</>
	);
	const className = cn("flex items-center gap-3 px-5 py-2.5", highlighted && "bg-info-surface/50");
	if (!href) return <div className={className}>{content}</div>;
	return (
		<Link href={href} className={cn(className, "transition-colors hover:bg-muted/60")}>
			{content}
		</Link>
	);
}

export function StatementFeed({ items }: { items: TPartnerStatementItem[] }) {
	return (
		<div className="flex flex-col">
			{items.map((item) => {
				if (item.tipo === "PIX") {
					return (
						<Row
							key={item.id}
							href={`/partner-dashboard/payouts/${item.payoutId}`}
							highlighted
							icon={
								<Initials tone="success" className="h-8 w-8 rounded-xl text-[11px]">
									PIX
								</Initials>
							}
							title="PIX recebido"
							value={
								<span className="text-sm font-extrabold whitespace-nowrap text-success-surface-foreground">
									<Money centavos={item.valorCentavos} />
								</span>
							}
							subtitle={`${formatPartnerDate(item.data, { short: true })} · competência ${formatPartnerMonthName(getLocalMonthKey(new Date(item.competenciaFim)))}`}
							status={<span className="font-semibold text-success-surface-foreground">Pago</span>}
						/>
					);
				}
				if (item.tipo === "INDICACAO") {
					return (
						<Row
							key={item.id}
							href={`/partner-dashboard/stores/${item.lojaId}`}
							icon={
								<Initials tone="neutral" className="h-8 w-8 rounded-xl text-[11px]">
									{item.lojaIniciais}
								</Initials>
							}
							title={item.lojaNome}
							value={<span className="text-sm font-extrabold text-muted-foreground/70">—</span>}
							subtitle={`${formatPartnerDate(item.data, { short: true })} · ${STORE_EVENT[item.situacao] ?? "Entrou pelo seu link"}`}
							status={<span className="font-semibold text-primary">{item.situacao === "EM_TESTE" ? "Em teste" : "Nova loja"}</span>}
						/>
					);
				}
				const status = COMMISSION_STATUS[item.status];
				const bonus = !item.ajuste && item.percentualComissaoBps === PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS;
				return (
					<Row
						key={item.id}
						href={`/partner-dashboard/stores/${item.lojaId}`}
						icon={
							<Initials tone={bonus ? "bonus" : "info"} className="h-8 w-8 rounded-xl text-[11px]">
								{item.lojaIniciais}
							</Initials>
						}
						title={item.lojaNome}
						value={
							<span className={cn("text-sm font-extrabold whitespace-nowrap", item.status === "CANCELADA" && "text-muted-foreground line-through")}>
								<Money centavos={item.valorCentavos} sign />
							</span>
						}
						subtitle={`${formatPartnerDate(item.data, { short: true })} · ${
							item.ajuste ? "Ajuste" : `${item.numeroInvoiceAssinatura}ª mensalidade · ${formatCommissionPercent(item.percentualComissaoBps)}`
						}`}
						status={<span className={cn("font-semibold whitespace-nowrap", status?.className)}>{status?.label ?? item.status}</span>}
					/>
				);
			})}
		</div>
	);
}
