"use client";

import { CASHBACK_CALCULATOR_DEFAULTS, type TCashbackCalculatorInput, computeCashbackCalculator } from "@/lib/marketing-tools/cashback-calculator";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { RangeField } from "./RangeField";
import { ToolSectionHeading } from "./ToolSections";
import { formatBRL, formatFraction, formatInteger } from "./format";

type TField = {
	key: keyof TCashbackCalculatorInput;
	label: string;
	min: number;
	max: number;
	step: number;
	format: (value: number) => string;
	hint: string;
};

const FIELDS: TField[] = [
	{ key: "ticket", label: "Ticket médio", min: 10, max: 500, step: 5, format: formatBRL, hint: "Valor médio de cada venda." },
	{
		key: "margin",
		label: "Margem bruta",
		min: 10,
		max: 80,
		step: 1,
		format: (v) => `${v}%`,
		hint: "O que sobra da venda depois do custo da mercadoria.",
	},
	{
		key: "cashback",
		label: "Cashback oferecido",
		min: 1,
		max: 20,
		step: 0.5,
		format: (v) => `${v.toLocaleString("pt-BR")}%`,
		hint: "Percentual devolvido como crédito para a próxima compra.",
	},
	{
		key: "redemption",
		label: "Crédito que volta a ser usado",
		min: 10,
		max: 100,
		step: 5,
		format: (v) => `${v}%`,
		hint: "Parte do saldo que os clientes resgatam antes de expirar.",
	},
	{
		key: "sales",
		label: "Vendas por mês com cliente identificado",
		min: 50,
		max: 10000,
		step: 50,
		format: formatInteger,
		hint: "Usado só para o custo mensal.",
	},
];

const COMPARE_COLUMNS =
	"grid-cols-[72px_minmax(0,1fr)_96px_96px] gap-4 px-5 max-sm:grid-cols-[48px_minmax(0,1fr)_70px_62px] max-sm:gap-2.5 max-sm:px-3.5";

export function CashbackCalculatorTool() {
	const [values, setValues] = useState<TCashbackCalculatorInput>(CASHBACK_CALCULATOR_DEFAULTS);
	const result = computeCashbackCalculator(values);
	const highlight = result.warning ? "text-[#ffb900]" : "text-white";

	const outputs = [
		{ label: "Custo real por venda", value: formatBRL(result.cost), sub: `de ${formatBRL(result.grossMargin)} de margem bruta` },
		{ label: "Custo no mês", value: formatBRL(result.monthlyCost), sub: `${formatInteger(values.sales)} vendas` },
		{ label: "Crédito gerado por venda", value: formatBRL(result.creditPerSale), sub: "antes de considerar o uso" },
		{
			label: "Parte da margem",
			value: formatFraction(result.marginShare),
			sub: result.warning ? "acima de 25%: revise o percentual" : "da margem de cada venda",
			warn: result.warning,
		},
	];

	return (
		<>
			<section id="calculadora" aria-label="Calculadora" className="pt-14 max-md:pt-10">
				<div className="mx-auto max-w-[1240px] px-6 max-md:px-3">
					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-3 rounded-[28px] bg-[#eef2f6] p-3 max-md:rounded-[22px] max-md:p-2">
						<div className="flex flex-col gap-8 rounded-[20px] bg-white p-9 max-md:gap-7 max-md:rounded-[16px] max-md:p-5">
							<p className="text-[13px] font-semibold text-[#687a80]">Sua loja</p>
							{FIELDS.map((field) => (
								<RangeField
									key={field.key}
									label={field.label}
									display={field.format(values[field.key])}
									value={values[field.key]}
									min={field.min}
									max={field.max}
									step={field.step}
									hint={field.hint}
									onChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
								/>
							))}
						</div>

						<div
							data-dock="dark"
							aria-live="polite"
							className="@container flex flex-col gap-7 rounded-[20px] bg-[#0b1628] p-9 text-white max-md:rounded-[16px] max-md:p-5"
						>
							<div>
								<p className="text-[13px] font-semibold text-white/60">Vendas a mais para o cashback se pagar</p>
								{result.breakEven === null ? (
									<p className={cn("mt-3.5 text-[min(40px,11cqi)] leading-[0.95] font-medium tracking-[-0.045em]", highlight)}>Reduza o percentual</p>
								) : (
									<p className={cn("mt-3.5 text-[min(96px,26cqi)] leading-[0.95] font-medium tracking-[-0.055em]", highlight)}>
										+{formatFraction(result.breakEven)}
									</p>
								)}
								<p className="mt-3 max-w-[40ch] text-[15px] leading-[1.55] text-white/65">
									{result.breakEven === null
										? "Com estes números, o crédito usado custa mais que a margem de cada venda."
										: "de vendas a mais entre os clientes do programa para a margem total ficar igual à de antes do cashback."}
								</p>
							</div>
							<div className="grid grid-cols-2 gap-2.5">
								{outputs.map((output) => (
									<div key={output.label} className="min-w-0 rounded-2xl bg-white/7 p-[18px] max-md:p-3.5">
										<p className="text-[12px] font-semibold text-white/55">{output.label}</p>
										<p
											className={cn(
												"mt-2 text-[24px] font-semibold tracking-[-0.02em] break-words max-md:text-[19px]",
												output.warn ? "text-[#ffb900]" : "text-white",
											)}
										>
											{output.value}
										</p>
										<p className="mt-1.5 text-[12px] leading-[1.4] text-white/50">{output.sub}</p>
									</div>
								))}
							</div>
							<div className="mt-auto border-t border-white/12 pt-5">
								<div className="flex justify-between gap-3 text-[12px] font-semibold text-white/55">
									<span>Parte da margem que vira crédito usado</span>
									<span>{formatFraction(result.marginShare)}</span>
								</div>
								<div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/10">
									<span
										className={cn("block h-full rounded-full transition-[width] duration-300", result.warning ? "bg-[#ffb900]" : "bg-[#9db6dd]")}
										style={{ width: `${Math.min(100, result.marginShare * 100)}%` }}
									/>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section aria-labelledby="comparar" className="pt-[120px] max-md:pt-20">
				<div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-x-[72px] gap-y-10 px-6">
					<div id="comparar">
						<ToolSectionHeading eyebrow="Compare percentuais" title="O mesmo ticket e a mesma margem, com outros percentuais.">
							Cada linha usa os números que você preencheu acima. Só o percentual de cashback muda.
						</ToolSectionHeading>
					</div>
					<div className="overflow-hidden rounded-[20px] border border-[#e3e8ea]" role="table" aria-label="Comparação de percentuais de cashback">
						<div role="row" className={cn("grid bg-[#f6f8fa] py-3 text-[12px] font-semibold text-[#687a80]", COMPARE_COLUMNS)}>
							<span role="columnheader">Cashback</span>
							<span role="columnheader">Parte da margem</span>
							<span role="columnheader" className="text-right">
								Custo/venda
							</span>
							<span role="columnheader" className="text-right">
								Empate
							</span>
						</div>
						{result.compare.map((row) => (
							<div
								key={row.cashback}
								role="row"
								aria-current={row.selected || undefined}
								className={cn("grid items-center border-t border-[#e3e8ea] py-3.5", COMPARE_COLUMNS, row.selected && "bg-[#eef3fb]")}
							>
								<span role="cell" className="text-[15px] font-semibold">
									{row.cashback.toLocaleString("pt-BR")}%
								</span>
								<span role="cell" className="flex min-w-0 items-center gap-2.5">
									<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eef1f2]">
										<span
											className={cn("block h-full rounded-full", row.warning ? "bg-[#e6a700]" : "bg-[#24549c]")}
											style={{ width: `${Math.min(100, row.marginShare * 100)}%` }}
										/>
									</span>
									<span className="w-11 text-right text-[13px] text-[#5b6a70] max-sm:w-9">{formatFraction(row.marginShare, 0)}</span>
								</span>
								<span role="cell" className="text-right text-[14px] text-[#2b3538]">
									{formatBRL(row.cost)}
								</span>
								<span role="cell" className="text-right text-[14px] font-semibold">
									{row.breakEven === null ? "—" : `+${formatFraction(row.breakEven)}`}
								</span>
							</div>
						))}
					</div>
				</div>
			</section>
		</>
	);
}
