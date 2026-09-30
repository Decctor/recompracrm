"use client";

import type { TPartnerMonthEarnings } from "@/lib/platform-partnerships/earnings";
import { formatPartnerDate, formatPartnerMonthName } from "@/lib/platform-partnerships/earnings";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Money, PanelCard, Pill } from "./partner-ui";

type TMonth = Omit<TPartnerMonthEarnings, "dataPix"> & { dataPix: Date | string };

function describeMonth(month: TMonth) {
	if (month.situacao === "PAGO") return { text: `Pago em ${formatPartnerDate(month.dataPix, { short: true })}`, tone: "success" as const };
	if (month.situacao === "EM_APURACAO") return { text: "Em apuração", tone: "warning" as const };
	if (month.valorCentavos === 0) return { text: "Sem comissões", tone: "neutral" as const };
	return { text: `Cai em ${formatPartnerDate(month.dataPix, { short: true })}`, tone: "info" as const };
}

/**
 * Ganhos por mês de elegibilidade, na paleta ouro do DESIGN.md. Tocar numa barra troca o mês do
 * cabeçalho; o mês em apuração é hachurado porque o valor ainda pode crescer.
 */
export function EarningsChart({ months, totalCentavos, firstMonth }: { months: TMonth[]; totalCentavos: number; firstMonth: string | null }) {
	const lastWithValue = [...months].reverse().findIndex((month) => month.valorCentavos > 0 && month.situacao !== "EM_APURACAO");
	const [selected, setSelected] = useState(lastWithValue === -1 ? months.length - 1 : months.length - 1 - lastWithValue);
	const [grown, setGrown] = useState(false);
	useEffect(() => {
		const frame = requestAnimationFrame(() => setGrown(true));
		return () => cancelAnimationFrame(frame);
	}, []);

	const max = Math.max(...months.map((month) => month.valorCentavos), 1);
	const current = months[selected];
	const status = describeMonth(current);

	return (
		<PanelCard className="flex flex-col gap-[18px] p-5">
			<div className="flex items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<span className="text-label text-muted-foreground">Ganhos · {formatPartnerMonthName(current.mes)}</span>
					<span className="text-2xl font-extrabold tracking-[-0.015em]">
						<Money centavos={current.valorCentavos} />
					</span>
				</div>
				<Pill tone={status.tone}>{status.text}</Pill>
			</div>
			<div className="flex h-[132px] items-end justify-between px-1" role="radiogroup" aria-label="Mês">
				{months.map((month, index) => {
					const isSelected = index === selected;
					const pending = month.situacao === "EM_APURACAO";
					const height = Math.max(6, Math.round((month.valorCentavos / max) * 100));
					return (
						<button
							key={month.mes}
							type="button"
							role="radio"
							aria-checked={isSelected}
							aria-label={formatPartnerMonthName(month.mes)}
							onClick={() => setSelected(index)}
							className="flex cursor-pointer flex-col items-center gap-2 rounded-lg focus-visible:ring-[3px] focus-visible:ring-primary/30 focus-visible:outline-none"
						>
							<span
								className={cn(
									"w-[34px] rounded-[10px] transition-[height,background-color] duration-[1100ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
									!pending && (isSelected ? "bg-chart-3" : "bg-chart-1"),
								)}
								style={{
									height: grown ? height : 6,
									...(pending
										? {
												backgroundImage: isSelected
													? "repeating-linear-gradient(135deg,var(--color-chart-3) 0 4px,var(--color-chart-1) 4px 8px)"
													: "repeating-linear-gradient(135deg,var(--color-chart-1) 0 4px,var(--color-warning-surface) 4px 8px)",
											}
										: {}),
								}}
							/>
							<span className={cn("text-[11px] font-bold tracking-[0.06em] uppercase", isSelected ? "text-foreground" : "text-muted-foreground")}>
								{formatPartnerMonthName(month.mes).slice(0, 3)}
							</span>
						</button>
					);
				})}
			</div>
			<div className="flex justify-between border-t border-border pt-3.5 text-[13px]">
				<span className="text-muted-foreground">{firstMonth ? `Total desde ${formatPartnerMonthName(firstMonth)}` : "Total"}</span>
				<span className="font-extrabold">
					<Money centavos={totalCentavos} />
				</span>
			</div>
		</PanelCard>
	);
}
