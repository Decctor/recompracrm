"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { getErrorMessage } from "@/lib/errors";
import { PLATFORM_PARTNER_FINANCE_WHATSAPP_NUMBER, PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS } from "@/lib/platform-partnerships/constants";
import { formatCentavos, formatCommissionPercent, formatPartnerDate } from "@/lib/platform-partnerships/earnings";
import { usePlatformPartnerPayoutById } from "@/lib/queries/platform-partnerships";
import { cn } from "@/lib/utils";
import { Check, Clock3, Download, ExternalLink } from "lucide-react";
import { PanelBody, TopSheet } from "../../../_components/partner-shell";
import { BackHeader, Initials, Money, PanelCard, PanelCardHeader, PanelSkeleton, Pill, type TPillTone } from "../../../_components/partner-ui";

const STATUS_PILL: Record<string, { label: string; tone: TPillTone }> = {
	RASCUNHO: { label: "Em apuração", tone: "warning" },
	APROVADO: { label: "Aprovado", tone: "info" },
	PAGO: { label: "Pago", tone: "success" },
};

export default function PartnerPayoutPage({ payoutId }: { payoutId: string }) {
	const { data: payout, isLoading, isError, error } = usePlatformPartnerPayoutById({ payoutId });

	if (isError) {
		return (
			<div className="p-4 md:p-0">
				<ErrorComponent msg={getErrorMessage(error)} />
			</div>
		);
	}
	if (isLoading || !payout) {
		return (
			<div className="p-4 md:p-0">
				<PanelSkeleton />
			</div>
		);
	}

	const paid = payout.status === "PAGO";
	const approved = paid || payout.status === "APROVADO";
	// Três etapas: apuração (fim da competência), aprovação (criação do payout) e pagamento.
	const steps = [
		{ label: "Em apuração", date: payout.competenciaFim, done: true },
		{ label: "Aprovado", date: approved ? payout.dataInsercao : null, done: approved },
		{ label: "Pago", date: paid ? payout.dataPagamento : payout.dataPrevista, done: paid },
	];
	const info = [
		{ label: "Competência", value: `${formatPartnerDate(payout.competenciaInicio)} a ${formatPartnerDate(payout.competenciaFim)}` },
		{ label: "Chave PIX", value: payout.chavePixMascarada ?? "—" },
		{ label: "Previsto para", value: formatPartnerDate(payout.dataPrevista) },
		{ label: "Pago em", value: formatPartnerDate(payout.dataPagamento) },
	];
	const status = STATUS_PILL[payout.status] ?? { label: payout.status, tone: "neutral" as const };
	const financeHref = `https://wa.me/${PLATFORM_PARTNER_FINANCE_WHATSAPP_NUMBER}?text=${encodeURIComponent(
		`Olá! Sou parceiro do RecompraCRM e tenho uma dúvida sobre o PIX de ${formatCentavos(payout.valorTotalCentavos)} (competência ${formatPartnerDate(payout.competenciaInicio)} a ${formatPartnerDate(payout.competenciaFim)}).`,
	)}`;

	return (
		<div className="mx-auto flex w-full max-w-[640px] flex-col md:gap-4">
			<TopSheet className="gap-[22px]">
				<BackHeader href="/partner-dashboard/extrato" title="Pagamento" />
				<div className="flex flex-col items-center gap-2.5 text-center">
					<span
						className={cn(
							"flex h-14 w-14 items-center justify-center rounded-full",
							paid ? "bg-success-surface text-success-surface-foreground" : "bg-info-surface text-primary",
						)}
					>
						{paid ? <Check className="h-[26px] w-[26px]" strokeWidth={2.5} /> : <Clock3 className="h-[26px] w-[26px]" strokeWidth={2.5} />}
					</span>
					<span className="text-[13px] font-semibold text-muted-foreground">
						{paid ? `PIX recebido em ${formatPartnerDate(payout.dataPagamento)}` : `PIX previsto para ${formatPartnerDate(payout.dataPrevista)}`}
					</span>
					<span className="text-[42px] leading-none font-extrabold tracking-[-0.025em]">
						<Money centavos={payout.valorTotalCentavos} />
					</span>
					<Pill tone={status.tone}>{status.label}</Pill>
				</div>
				<ol className="flex items-start">
					{steps.map((step, index) => (
						<li key={step.label} className="relative flex flex-1 flex-col items-center gap-1.5">
							<span
								aria-hidden
								className={cn(
									"absolute top-[11px] h-0.5",
									index === 0 ? "right-0 left-1/2" : index === steps.length - 1 ? "right-1/2 left-0" : "inset-x-0",
									step.done ? "bg-primary" : "bg-border",
								)}
							/>
							<span
								className={cn(
									"relative flex h-6 w-6 items-center justify-center rounded-full",
									step.done ? "bg-primary text-primary-foreground" : "border-[1.5px] border-dashed border-primary/50 bg-card",
								)}
							>
								{step.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
							</span>
							<span className="text-xs font-bold">{step.label}</span>
							<span className="text-[11px] font-semibold text-muted-foreground">{step.date ? formatPartnerDate(step.date, { short: true }) : "—"}</span>
						</li>
					))}
				</ol>
			</TopSheet>
			<PanelBody className="md:p-0">
				<PanelCard className="px-5 py-1.5">
					{info.map((row, index) => (
						<div key={row.label} className={cn("flex justify-between gap-3 py-3 text-sm", index > 0 && "border-t border-border")}>
							<span className="text-muted-foreground">{row.label}</span>
							<span className="text-right font-bold">{row.value}</span>
						</div>
					))}
				</PanelCard>

				<PanelCard className="py-2">
					<PanelCardHeader
						title="O que compõe este PIX"
						action={
							<span className="text-xs font-semibold text-muted-foreground">
								{payout.comissoes.length} {payout.comissoes.length === 1 ? "comissão" : "comissões"}
							</span>
						}
					/>
					{payout.comissoes.map((commission) => {
						const bonus = !commission.ajuste && commission.percentualComissaoBps === PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS;
						return (
							<div key={commission.id} className="flex items-center gap-3 px-5 py-2.5">
								<Initials tone={bonus ? "bonus" : "info"} className="h-9 w-9 rounded-xl text-xs">
									{commission.lojaIniciais}
								</Initials>
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="truncate text-sm font-bold">{commission.lojaNome}</span>
									<span className="text-xs text-muted-foreground">
										{commission.ajuste ? "Ajuste" : `${commission.numeroInvoiceAssinatura}ª mensalidade`} · fatura de{" "}
										<Money centavos={commission.valorInvoiceBrutoCentavos} />
									</span>
								</div>
								<div className="flex flex-col items-end gap-1">
									<span className="text-sm font-extrabold whitespace-nowrap">
										<Money centavos={commission.valorComissaoCentavos} />
									</span>
									<span
										className={cn(
											"inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold",
											bonus ? "bg-warning-surface text-warning-surface-foreground" : "bg-info-surface text-info-surface-foreground",
										)}
									>
										{formatCommissionPercent(commission.percentualComissaoBps)}
									</span>
								</div>
							</div>
						);
					})}
					<div className="mx-5 mt-1.5 mb-2 flex justify-between border-t border-border pt-3 text-sm">
						<span className="font-bold">Total</span>
						<span className="font-extrabold">
							<Money centavos={payout.valorTotalCentavos} />
						</span>
					</div>
				</PanelCard>

				<div className="grid grid-cols-2 gap-2">
					{payout.temComprovante ? (
						<a
							href={`/api/platform-partner/payouts/receipt?id=${encodeURIComponent(payout.id)}`}
							target="_blank"
							rel="noreferrer"
							className="flex h-11 items-center justify-center gap-2 rounded-[18px] bg-primary text-sm font-extrabold text-primary-foreground shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-primary/90"
						>
							<ExternalLink className="h-4 w-4" />
							Comprovante
						</a>
					) : (
						<span className="flex h-11 items-center justify-center rounded-[18px] bg-muted text-[13px] font-bold text-muted-foreground">
							{paid ? "Sem comprovante" : "Comprovante após o PIX"}
						</span>
					)}
					<a
						href={`/api/platform-partner/payouts/statement?id=${encodeURIComponent(payout.id)}`}
						className="flex h-11 items-center justify-center gap-2 rounded-[18px] border border-border bg-card text-sm font-bold transition-colors hover:bg-muted"
					>
						<Download className="h-4 w-4" />
						Baixar PDF
					</a>
				</div>
				<p className="mt-1 text-center text-[13px] text-muted-foreground">
					Algo diferente do esperado?{" "}
					<a href={financeHref} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">
						Fale com o financeiro
					</a>
				</p>
			</PanelBody>
		</div>
	);
}
