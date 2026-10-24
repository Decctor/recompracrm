"use client";

import { type TWhatsappCostInput, WHATSAPP_COST_DEFAULTS, WHATSAPP_PRICES, computeWhatsappCost } from "@/lib/marketing-tools/whatsapp-cost";
import { Target } from "lucide-react";
import { useState } from "react";
import { RangeField } from "./RangeField";
import { WHATSAPP_CATEGORY_COLOR } from "./whatsapp-colors";
import { formatBRL, formatInteger, formatUnitPrice } from "./format";

type TField = { key: keyof TWhatsappCostInput; label: string; min: number; max: number; step: number; format: (value: number) => string };

const GROUPS: { title: string; color: string; fields: TField[] }[] = [
	{
		title: "Marketing",
		color: WHATSAPP_CATEGORY_COLOR.MARKETING,
		fields: [
			{ key: "base", label: "Clientes com permissão (opt-in)", min: 100, max: 20000, step: 100, format: formatInteger },
			{ key: "campaigns", label: "Campanhas por mês", min: 0, max: 12, step: 1, format: formatInteger },
			{ key: "reach", label: "Parte da base em cada campanha", min: 5, max: 100, step: 5, format: (v) => `${v}%` },
		],
	},
	{
		title: "Utilidade",
		color: WHATSAPP_CATEGORY_COLOR.UTILIDADE,
		fields: [{ key: "utility", label: "Avisos por cliente no mês", min: 0, max: 6, step: 1, format: formatInteger }],
	},
	{
		title: "Atendimento",
		color: WHATSAPP_CATEGORY_COLOR.ATENDIMENTO,
		fields: [
			{ key: "conversations", label: "Conversas por mês", min: 0, max: 3000, step: 50, format: formatInteger },
			{ key: "replies", label: "Respostas da loja por conversa", min: 1, max: 30, step: 1, format: formatInteger },
		],
	},
];

function Dot({ color }: { color: string }) {
	return <span className="block h-2 w-2 flex-none rounded-full" style={{ background: color }} aria-hidden />;
}

export function WhatsappCostTool() {
	const [values, setValues] = useState<TWhatsappCostInput>(WHATSAPP_COST_DEFAULTS);
	const result = computeWhatsappCost(values);

	const lines = [
		{
			label: "Marketing",
			color: WHATSAPP_CATEGORY_COLOR.MARKETING,
			cost: result.costs.marketing,
			messages: result.messages.marketing,
			price: WHATSAPP_PRICES.MARKETING.brl,
		},
		{
			label: "Utilidade",
			color: WHATSAPP_CATEGORY_COLOR.UTILIDADE,
			cost: result.costs.utility,
			messages: result.messages.utility,
			price: WHATSAPP_PRICES.UTILIDADE.brl,
		},
		{
			label: "Atendimento",
			color: WHATSAPP_CATEGORY_COLOR.ATENDIMENTO,
			cost: result.costs.service,
			messages: result.messages.service,
			price: WHATSAPP_PRICES.ATENDIMENTO.brl,
		},
	];

	return (
		<section id="estimador" aria-label="Estimador" className="pt-14 max-md:pt-10">
			<div className="mx-auto max-w-[1240px] px-6 max-md:px-3">
				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-3 rounded-[28px] bg-[#eef2f6] p-3 max-md:rounded-[22px] max-md:p-2">
					<div className="flex flex-col gap-9 rounded-[20px] bg-white p-9 max-md:gap-8 max-md:rounded-[16px] max-md:p-5">
						{GROUPS.map((group) => (
							<fieldset key={group.title} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
								<legend className="mb-6 flex items-center gap-2.5 p-0 text-[13px] font-semibold text-[#687a80]">
									<Dot color={group.color} />
									{group.title}
								</legend>
								{group.fields.map((field) => (
									<RangeField
										key={field.key}
										size="md"
										label={field.label}
										display={field.format(values[field.key])}
										value={values[field.key]}
										min={field.min}
										max={field.max}
										step={field.step}
										onChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
									/>
								))}
							</fieldset>
						))}
					</div>

					<div
						data-dock="dark"
						aria-live="polite"
						className="@container flex flex-col gap-7 rounded-[20px] bg-[#0b1628] p-9 text-white max-md:rounded-[16px] max-md:p-5"
					>
						<div>
							<p className="text-[13px] font-semibold text-white/60">Estimativa por mês</p>
							<p className="mt-3.5 text-[min(88px,15cqi)] leading-[0.95] font-medium tracking-[-0.055em] whitespace-nowrap">{formatBRL(result.total)}</p>
							<p className="mt-3 text-[15px] leading-[1.5] text-white/65">
								{formatInteger(result.totalMessages)} mensagens · {formatBRL(result.costPerClient)} por cliente com opt-in
							</p>
						</div>
						<div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
							{lines
								.filter((line) => line.cost > 0)
								.map((line) => (
									<span
										key={line.label}
										className="block h-full transition-[flex-grow] duration-300"
										style={{ flex: `${line.cost} 1 0`, background: line.color }}
									/>
								))}
						</div>
						<div className="flex flex-col">
							{lines.map((line) => (
								<div key={line.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t border-white/10 py-3.5">
									<span className="flex items-center gap-2.5 text-[15px] font-medium">
										<Dot color={line.color} />
										{line.label}
									</span>
									<span className="text-right text-[17px] font-semibold">{formatBRL(line.cost)}</span>
									<span className="col-span-2 pl-[18px] text-[13px] text-white/50">
										{formatInteger(line.messages)} × {formatUnitPrice(line.price)}
									</span>
								</div>
							))}
						</div>
						{result.saving ? (
							<div className="mt-auto flex items-start gap-3 rounded-2xl bg-[rgba(255,185,0,0.12)] p-4">
								<Target className="mt-0.5 h-[18px] w-[18px] flex-none text-[#ffb900]" aria-hidden />
								<p className="text-[14px] leading-[1.55] text-white/85">
									Enviando cada campanha para {result.saving.reach}% da base, os clientes com mais motivo para voltar, o marketing custaria{" "}
									{formatBRL(result.saving.amount)} a menos por mês.
								</p>
							</div>
						) : null}
					</div>
				</div>
				<p className="mt-4 text-center text-[13px] leading-[1.5] text-[#8a979c] max-md:px-3">
					Estimativa com a tabela da Meta. O provedor da API (BSP) pode cobrar uma taxa própria por cima. Utilidade e autenticação têm desconto só em
					volumes muito altos.
				</p>
			</div>
		</section>
	);
}
