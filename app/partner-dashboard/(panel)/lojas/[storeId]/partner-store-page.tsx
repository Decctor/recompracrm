"use client";

import type { TGetPlatformPartnerReferralsOutputById } from "@/app/api/platform-partner/referrals/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { getErrorMessage } from "@/lib/errors";
import { PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS } from "@/lib/platform-partnerships/constants";
import { formatCommissionPercent, formatPartnerDate, getLocalDaysUntil } from "@/lib/platform-partnerships/earnings";
import { usePlatformPartnerStoreById } from "@/lib/queries/platform-partnerships";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { PanelBody, TopSheet } from "../../../_components/partner-shell";
import {
	BackHeader,
	EmptyNote,
	Initials,
	Money,
	PanelCard,
	PanelCardHeader,
	PanelSkeleton,
	Pill,
	StatTile,
	type TPillTone,
} from "../../../_components/partner-ui";

type TStore = TGetPlatformPartnerReferralsOutputById;
type TInstallment = TStore["trilha"][number];

const SITUATION_PILL: Record<TStore["situacao"], { label: string; tone: TPillTone }> = {
	ATIVA: { label: "Ativa", tone: "success" },
	EM_TESTE: { label: "Em teste", tone: "info" },
	EM_ATRASO: { label: "Pagamento pendente", tone: "warning" },
	CANCELADA: { label: "Cancelada", tone: "danger" },
	SEM_ASSINATURA: { label: "Sem assinatura", tone: "neutral" },
	EXCLUIDA: { label: "Excluída", tone: "neutral" },
};

const COMMISSION_STATUS_LABEL: Record<string, string> = {
	PENDENTE: "pendente",
	APROVADA: "aprovada",
	PAGA: "recebida",
	CANCELADA: "cancelada",
};

function isBonus(installment: TInstallment) {
	return installment.percentualComissaoBps === PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS;
}

function describeInstallment(installment: TInstallment) {
	const pct = formatCommissionPercent(installment.percentualComissaoBps);
	const title = `${installment.numero}ª mensalidade · ${isBonus(installment) && installment.numero > 1 ? `bônus ${pct}` : pct}`;
	const pix = installment.dataPix ? formatPartnerDate(installment.dataPix, { short: true }) : null;
	if (installment.situacao === "PAGA") {
		const paid = installment.comissaoStatus === "PAGA";
		return {
			title,
			sub: `Paga em ${formatPartnerDate(installment.dataFatura, { short: true })}${pix ? ` · ${paid ? "recebida no" : "entra no"} PIX de ${pix}` : ""}`,
			tone: paid ? "success" : "info",
		} as const;
	}
	if (installment.situacao === "EM_ATRASO") return { title, sub: "Fatura em atraso · a comissão entra quando a loja pagar", tone: "warning" } as const;
	if (installment.situacao === "PROXIMA") {
		const days = installment.dataFatura ? getLocalDaysUntil(installment.dataFatura, new Date()) : null;
		const when = installment.dataFatura ? `Prevista para ${formatPartnerDate(installment.dataFatura, { short: true })}` : "Próxima fatura";
		return { title, sub: days !== null && days > 0 ? `${when} · em ${days} ${days === 1 ? "dia" : "dias"}` : when, tone: "warning" } as const;
	}
	return {
		title,
		sub: installment.dataFatura ? `Prevista para ${formatPartnerDate(installment.dataFatura, { short: true })}` : "Futura",
		tone: "neutral",
	} as const;
}

const CARD_TONES = {
	success: "bg-success-surface text-success-surface-foreground",
	info: "bg-info-surface text-info-surface-foreground",
	warning: "bg-warning-surface text-warning-surface-foreground",
	neutral: "bg-muted text-foreground/75",
};

/** Trilha de mensalidades: 100% da 1ª e da 3ª, 20% das demais. Barra alta é bônus; tracejada ainda não aconteceu. */
function InstallmentTrack({ store }: { store: TStore }) {
	const defaultIndex = Math.max(
		0,
		store.trilha.findIndex((installment) => installment.situacao !== "PAGA"),
	);
	const [selected, setSelected] = useState(defaultIndex);
	const [grown, setGrown] = useState(false);
	useEffect(() => {
		const frame = requestAnimationFrame(() => setGrown(true));
		return () => cancelAnimationFrame(frame);
	}, []);

	const current = store.trilha[selected] ?? store.trilha[0];
	const info = describeInstallment(current);
	const anual = store.periodicidade === "ANUAL";

	return (
		<PanelCard className="flex flex-col gap-[18px] p-5">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-label text-muted-foreground">{anual ? "Trilha de faturas" : "Trilha de mensalidades"}</h2>
				<span className="text-xs font-semibold text-muted-foreground">Toque numa barra</span>
			</div>
			<div className="flex h-[170px] items-end gap-2" role="radiogroup" aria-label="Mensalidade">
				{store.trilha.map((installment, index) => {
					const bonus = isBonus(installment);
					const target = anual ? 72 : bonus ? 120 : 24;
					const isSelected = index === selected;
					return (
						<button
							key={installment.numero}
							type="button"
							role="radio"
							aria-checked={isSelected}
							aria-label={`${installment.numero}ª mensalidade`}
							onClick={() => setSelected(index)}
							className="flex flex-1 cursor-pointer flex-col items-stretch gap-2 rounded-[10px] focus-visible:ring-[3px] focus-visible:ring-primary/30 focus-visible:outline-none"
						>
							<span
								className={cn(
									"text-center text-[11px] font-extrabold",
									installment.situacao === "FUTURA" ? "text-muted-foreground/70" : bonus ? "text-warning-surface-foreground" : "text-primary",
								)}
							>
								{formatCommissionPercent(installment.percentualComissaoBps)}
							</span>
							<span
								className={cn(
									"rounded-[10px] transition-[height,box-shadow] duration-[900ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
									installment.situacao === "PAGA" && (bonus ? "bg-warning" : "bg-primary"),
									installment.situacao === "PROXIMA" &&
										(bonus
											? "border-[1.5px] border-dashed border-chart-3 bg-warning-surface"
											: "border-[1.5px] border-dashed border-primary/60 bg-info-surface"),
									installment.situacao === "EM_ATRASO" && "border-[1.5px] border-warning bg-warning-surface",
									installment.situacao === "FUTURA" && "border-[1.5px] border-dashed border-muted-foreground/30 bg-muted/50",
									isSelected && "shadow-[0_0_0_3px_rgba(36,84,156,0.15)]",
								)}
								style={{ height: grown ? target : 6 }}
							/>
							<span className={cn("text-center text-[11px] font-bold", isSelected ? "text-foreground" : "text-muted-foreground")}>
								{installment.numero}ª
							</span>
						</button>
					);
				})}
			</div>
			<div className={cn("flex items-center justify-between gap-3 rounded-[18px] px-4 py-3.5", CARD_TONES[info.tone])} aria-live="polite">
				<div className="flex flex-col gap-0.5">
					<span className="text-[15px] font-extrabold">{info.title}</span>
					<span className="text-[13px] leading-snug">{info.sub}</span>
				</div>
				<span className="text-[17px] font-extrabold whitespace-nowrap">
					<Money centavos={current.valorComissaoCentavos} />
				</span>
			</div>
			<div className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
				{anual ? (
					<span className="flex items-center gap-1.5">
						<span className="h-2.5 w-2.5 rounded-[3px] bg-primary" />
						Anual 27%
					</span>
				) : (
					<>
						<span className="flex items-center gap-1.5">
							<span className="h-2.5 w-2.5 rounded-[3px] bg-warning" />
							Bônus 100%
						</span>
						<span className="flex items-center gap-1.5">
							<span className="h-2.5 w-2.5 rounded-[3px] bg-primary" />
							Recorrente 20%
						</span>
					</>
				)}
				<span className="flex items-center gap-1.5">
					<span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-dashed border-muted-foreground/60" />
					Futura
				</span>
			</div>
		</PanelCard>
	);
}

export default function PartnerStorePage({ storeId }: { storeId: string }) {
	const { data: store, isLoading, isError, error } = usePlatformPartnerStoreById({ storeId });

	if (isError) {
		return (
			<div className="p-4 md:p-0">
				<ErrorComponent msg={getErrorMessage(error)} />
			</div>
		);
	}
	if (isLoading || !store) {
		return (
			<div className="p-4 md:p-0">
				<PanelSkeleton />
			</div>
		);
	}

	const pill = SITUATION_PILL[store.situacao];
	const plan = store.plano ? `${store.plano}${store.periodicidade ? ` · ${store.periodicidade === "ANUAL" ? "anual" : "mensal"}` : ""}` : null;

	return (
		<div className="mx-auto flex w-full max-w-[720px] flex-col md:gap-4">
			<TopSheet className="gap-[18px]">
				<BackHeader href="/partner-dashboard/lojas" title="Loja indicada" />
				<div className="flex items-center gap-3.5">
					<Initials className="h-14 w-14 rounded-[18px] text-xl">{store.iniciais}</Initials>
					<div className="flex min-w-0 flex-col gap-1.5">
						<h1 className="text-2xl leading-tight font-extrabold tracking-[-0.015em] text-pretty">{store.nome}</h1>
						<div className="flex flex-wrap gap-1.5">
							{plan ? <Pill tone="neutral">{plan}</Pill> : null}
							<Pill tone={pill.tone}>{pill.label}</Pill>
						</div>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-2.5">
					<StatTile label="Você ganhou" value={<Money centavos={store.valorGanhoCentavos} />} />
					<StatTile
						label={store.periodicidade === "ANUAL" ? "No 1º ano" : "Em 12 meses"}
						value={
							<span className="text-primary">
								<Money centavos={store.valorProjetado12MesesCentavos} />
							</span>
						}
					/>
				</div>
			</TopSheet>
			<PanelBody className="md:p-0">
				<InstallmentTrack store={store} />
				<div className="flex items-start gap-2.5 rounded-[14px] border border-primary/15 bg-info-surface/50 px-3.5 py-3 text-[13px] leading-normal text-foreground/70">
					<Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
					<span>
						Comissão calculada sobre o valor do plano, sem consultoria. Entra no extrato depois que a fatura é paga e fica disponível para o PIX 30 dias
						depois.
					</span>
				</div>
				<PanelCard className="py-2">
					<PanelCardHeader title="Faturas desta loja" />
					{store.faturas.length === 0 ? (
						<EmptyNote>Nenhuma fatura paga ainda. A primeira rende 100% da mensalidade.</EmptyNote>
					) : (
						store.faturas.map((fatura, index) => (
							<div key={fatura.id} className={cn("flex justify-between gap-3 px-5 py-2.5 text-sm", index > 0 && "border-t border-border")}>
								<div className="flex flex-col gap-0.5">
									<span className="font-bold">
										{fatura.ajuste ? "Ajuste" : `Fatura #${fatura.numeroInvoiceAssinatura}`} · <Money centavos={fatura.valorInvoiceBrutoCentavos} />
									</span>
									<span className="text-xs text-muted-foreground">
										Paga em {formatPartnerDate(fatura.dataInsercao, { short: true })} · {formatCommissionPercent(fatura.percentualComissaoBps)} ·{" "}
										{COMMISSION_STATUS_LABEL[fatura.status] ?? fatura.status}
									</span>
								</div>
								<span className="font-extrabold whitespace-nowrap text-success-surface-foreground">
									<Money centavos={fatura.valorComissaoCentavos} sign />
								</span>
							</div>
						))
					)}
				</PanelCard>
			</PanelBody>
		</div>
	);
}
