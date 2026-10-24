"use client";

import { useId, useState } from "react";

// Calculadora do artigo sobre cashback. A conta, por venda:
//   custo efetivo  c = ticket × cashback × taxa de resgate   (crédito que expira não custa nada)
//   margem bruta   m = ticket × margem
// Se o programa traz uma fração f de vendas a mais entre os participantes, ele se paga quando
// f·m ≥ (1 + f)·c — o cashback também é pago sobre as vendas novas —, ou seja f ≥ c / (m − c).
type TField = {
	key: "ticket" | "margin" | "cashback" | "redemption";
	label: string;
	min: number;
	max: number;
	step: number;
	format: (v: number) => string;
};

const FIELDS: TField[] = [
	{ key: "ticket", label: "Ticket médio", min: 10, max: 500, step: 5, format: (v) => formatBRL(v) },
	{ key: "margin", label: "Margem bruta", min: 10, max: 80, step: 1, format: (v) => `${v}%` },
	{ key: "cashback", label: "Cashback oferecido", min: 1, max: 20, step: 0.5, format: (v) => `${v.toLocaleString("pt-BR")}%` },
	{ key: "redemption", label: "Crédito que volta a ser usado", min: 10, max: 100, step: 5, format: (v) => `${v}%` },
];

function formatBRL(value: number) {
	return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CashbackCalculator() {
	const id = useId();
	const [values, setValues] = useState({ ticket: 80, margin: 40, cashback: 5, redemption: 60 });

	const cost = values.ticket * (values.cashback / 100) * (values.redemption / 100);
	const margin = values.ticket * (values.margin / 100);
	const shareOfMargin = margin > 0 ? cost / margin : 1;
	const breakEven = margin > cost ? cost / (margin - cost) : null;

	const percent = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

	return (
		<div className="rounded-[28px] bg-[#eef2f6] p-3 text-numeric">
			<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-x-8 gap-y-6 rounded-[20px] border border-[rgba(14,18,20,0.06)] bg-white p-6 sm:p-7">
				{FIELDS.map((field) => (
					<div key={field.key} className="flex flex-col gap-2.5">
						<div className="flex items-baseline justify-between gap-3">
							<label htmlFor={`${id}-${field.key}`} className="text-sm font-medium text-[#5b6a70]">
								{field.label}
							</label>
							<output htmlFor={`${id}-${field.key}`} className="text-[17px] font-semibold text-[#0e1214]">
								{field.format(values[field.key])}
							</output>
						</div>
						<input
							id={`${id}-${field.key}`}
							type="range"
							min={field.min}
							max={field.max}
							step={field.step}
							value={values[field.key]}
							onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))}
							className="m-0 h-1.5 w-full cursor-pointer accent-[#24549c]"
						/>
					</div>
				))}
			</div>

			<div aria-live="polite" className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-3">
				<div className="rounded-[20px] bg-white p-[22px]">
					<p className="m-0 text-[13px] font-medium text-[#687a80]">Custo real por venda</p>
					<p className="m-0 mt-2.5 text-[34px] font-medium leading-none tracking-[-0.04em] text-[#0e1214]">{formatBRL(cost)}</p>
					<p className="m-0 mt-2 text-[13px] leading-[1.45] text-[#687a80]">de {formatBRL(margin)} de margem bruta</p>
				</div>
				<div className="rounded-[20px] bg-white p-[22px]">
					<p className="m-0 text-[13px] font-medium text-[#687a80]">Parte da margem</p>
					<p
						className={`m-0 mt-2.5 text-[34px] font-medium leading-none tracking-[-0.04em] ${shareOfMargin > 0.25 ? "text-[#7a5117]" : "text-[#0e1214]"}`}
					>
						{percent(shareOfMargin)}
					</p>
					<p className="m-0 mt-2 text-[13px] leading-[1.45] text-[#687a80]">da margem de cada venda vira crédito usado</p>
				</div>
				<div className="rounded-[20px] bg-[#0b1628] p-[22px] text-white">
					<p className="m-0 text-[13px] font-medium text-white/65">Para se pagar</p>
					{breakEven === null ? (
						<p className="m-0 mt-2.5 text-[22px] font-medium leading-[1.05] tracking-[-0.03em]">Reduza o percentual</p>
					) : (
						<p className="m-0 mt-2.5 text-[34px] font-medium leading-[1.05] tracking-[-0.03em]">+{percent(breakEven)}</p>
					)}
					<p className="m-0 mt-2 text-[13px] leading-[1.45] text-white/65">
						{breakEven === null ? "O cashback custa mais que a margem." : "de vendas a mais entre os clientes do programa"}
					</p>
				</div>
			</div>
		</div>
	);
}
