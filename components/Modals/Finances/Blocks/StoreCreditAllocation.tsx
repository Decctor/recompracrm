"use client";

import { ListChecks, RotateCcw } from "lucide-react";
import NumberInput from "@/components/Inputs/NumberInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getStoreCreditDaysOverdue } from "@/lib/finances/store-credit/aging";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import type { TUseInternalStoreCreditReceiptState } from "@/state-hooks/use-internal-store-credit-receipt-state";
import { cn } from "@/lib/utils";

export type TStoreCreditAllocationTitle = {
	transacaoId: string;
	titulo: string;
	saldo: number;
	dataPrevisao: Date | string;
	dataVenda: Date | string | null;
};

type StoreCreditAllocationBlockProps = {
	titulos: TStoreCreditAllocationTitle[];
	alocacao: TUseInternalStoreCreditReceiptState["alocacao"];
	sobra: number;
	modoAlocacao: "AUTOMATICA" | "MANUAL";
	updateAllocation: TUseInternalStoreCreditReceiptState["updateAllocation"];
	resetAllocation: TUseInternalStoreCreditReceiptState["resetAllocation"];
};

/**
 * O abatimento, linha a linha. O operador precisa ver para onde o dinheiro foi antes de confirmar —
 * um total sozinho não diz qual venda foi quitada, e é justamente isso que ele vai ter que explicar
 * ao cliente na semana seguinte.
 */
export default function StoreCreditAllocationBlock({
	titulos,
	alocacao,
	sobra,
	modoAlocacao,
	updateAllocation,
	resetAllocation,
}: StoreCreditAllocationBlockProps) {
	const alocadoPorTitulo = new Map(alocacao.map((item) => [item.transacaoId, item.valor]));

	return (
		<ResponsiveMenuSection
			title="ABATIMENTO"
			icon={<ListChecks className="h-4 w-4 min-h-4 min-w-4" />}
			action={
				modoAlocacao === "MANUAL" ? (
					<button
						type="button"
						onClick={resetAllocation}
						className="flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<RotateCcw className="h-3 w-3" />
						DISTRIBUIR AUTOMATICAMENTE
					</button>
				) : null
			}
		>
			<p className="text-[0.65rem] text-muted-foreground">
				{modoAlocacao === "AUTOMATICA"
					? "Distribuído das vendas mais antigas para as mais novas. Edite qualquer linha para redistribuir."
					: "Distribuição manual: o valor recebido é a soma das linhas abaixo."}
			</p>

			<div className="text-numeric flex w-full flex-col divide-y divide-border">
				{titulos.map((titulo) => {
					const alocado = alocadoPorTitulo.get(titulo.transacaoId) ?? 0;
					const diasAtraso = getStoreCreditDaysOverdue(titulo.dataPrevisao);
					const restante = titulo.saldo - alocado;
					const quita = alocado > 0 && restante <= 0.005;
					return (
						<div key={titulo.transacaoId} className="flex w-full flex-col gap-2 py-2 sm:flex-row sm:items-end sm:justify-between">
							<div className="flex min-w-0 flex-col gap-0.5">
								<span className="truncate text-xs font-medium tracking-tight">{titulo.titulo || "Venda sem título"}</span>
								<span className="text-[0.65rem] text-muted-foreground">
									Saldo {formatToMoney(titulo.saldo)} ·{" "}
									<span className={cn(diasAtraso > 0 && "font-medium text-red-700 dark:text-red-400")}>
										{diasAtraso > 0 ? `${diasAtraso} ${diasAtraso === 1 ? "dia" : "dias"} em atraso` : `Vence em ${formatDateAsLocale(titulo.dataPrevisao)}`}
									</span>
								</span>
							</div>
							<div className="flex shrink-0 items-end gap-2">
								<NumberInput
									label="ABATER"
									labelClassName="text-[0.6rem]"
									placeholder="0,00"
									value={alocado}
									handleChange={(value) => updateAllocation(titulo.transacaoId, value)}
								/>
								<span
									className={cn(
										"mb-2.5 w-16 shrink-0 text-right text-[0.65rem] font-medium",
										quita ? "text-green-700 dark:text-green-400" : "text-muted-foreground",
									)}
								>
									{alocado <= 0 ? "—" : quita ? "QUITA" : `resta ${formatToMoney(restante)}`}
								</span>
							</div>
						</div>
					);
				})}
			</div>

			{sobra > 0 ? (
				<p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400">
					Sobram {formatToMoney(sobra)} acima do que este cliente deve. Reduza o valor recebido ou registre o excedente como uma nova venda.
				</p>
			) : null}
		</ResponsiveMenuSection>
	);
}
