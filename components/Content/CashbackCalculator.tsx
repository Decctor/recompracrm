"use client";

import { useId, useState } from "react";

// Calculadora do artigo sobre cashback. A conta, por venda:
//   custo efetivo  c = ticket × cashback × taxa de resgate   (crédito que expira não custa nada)
//   margem bruta   m = ticket × margem
// Se o programa traz uma fração f de vendas a mais entre os participantes, ele se paga quando
// f·m ≥ (1 + f)·c — o cashback também é pago sobre as vendas novas —, ou seja f ≥ c / (m − c).
type TField = { key: "ticket" | "margin" | "cashback" | "redemption"; label: string; min: number; max: number; step: number; format: (v: number) => string };

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

	return (
		<div className="text-numeric overflow-hidden rounded-3xl border border-slate-200 bg-white">
			<div className="grid gap-x-8 gap-y-6 p-6 sm:grid-cols-2 sm:p-8">
				{FIELDS.map((field) => (
					<div key={field.key}>
						<div className="mb-2 flex items-baseline justify-between gap-3">
							<label htmlFor={`${id}-${field.key}`} className="text-sm font-semibold text-slate-600">
								{field.label}
							</label>
							<output htmlFor={`${id}-${field.key}`} className="text-base font-extrabold text-slate-900">
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
							className="h-2 w-full cursor-pointer accent-[#24549C]"
						/>
					</div>
				))}
			</div>

			<div className="grid gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-3">
				<div className="bg-slate-50 p-6">
					<p className="mb-2 text-label text-slate-500">Custo real por venda</p>
					<p className="text-3xl font-extrabold tracking-[-0.02em] text-slate-900">{formatBRL(cost)}</p>
					<p className="mt-1 text-sm text-slate-500">de {formatBRL(margin)} de margem bruta</p>
				</div>
				<div className="bg-slate-50 p-6">
					<p className="mb-2 text-label text-slate-500">Parte da margem</p>
					<p className={`text-3xl font-extrabold tracking-[-0.02em] ${shareOfMargin > 0.25 ? "text-[#7a5117]" : "text-slate-900"}`}>
						{(shareOfMargin * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
					</p>
					<p className="mt-1 text-sm text-slate-500">da margem de cada venda vira crédito usado</p>
				</div>
				<div className="bg-[#24549C] p-6 text-white">
					<p className="mb-2 text-label text-white/70">Para se pagar</p>
					{breakEven === null ? (
						<p className="text-lg font-extrabold leading-snug">O cashback custa mais que a margem. Reduza o percentual.</p>
					) : (
						<>
							<p className="text-3xl font-extrabold tracking-[-0.02em]">
								+{(breakEven * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
							</p>
							<p className="mt-1 text-sm text-white/75">de vendas a mais entre os clientes do programa</p>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
