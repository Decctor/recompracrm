"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useState } from "react";
import { TrackedCta } from "../../features/_components/TrackedCta";
import { SIGNUP_HREF } from "../../features/_components/feature-links";

// Os dois planos-base com o seletor mensal/anual, como o PlanPicker do app. Os adicionais (Hub de
// Atendimentos e Gestor de Crescimento) ficam na seção seguinte da página: entram em qualquer um
// dos dois planos, pelo mesmo preço.

type TPublicPlan = {
	monthly: string;
	yearly: string;
	yearlyEquivalent: string;
	included: string[];
};

type PricingPlansProps = {
	crm: TPublicPlan;
	erp: TPublicPlan;
	yearlySavings: number;
	trialDays: number;
};

function Included({ items }: { items: string[] }) {
	return (
		<ul className="mb-8 flex flex-1 list-none flex-col gap-2.5 p-0">
			{items.map((item) => (
				<li key={item} className="flex gap-2.5 text-[15px] leading-[1.45] text-[#262626]">
					<Check className="mt-0.5 size-4 flex-none text-[#24549c]" strokeWidth={2.25} aria-hidden />
					{item}
				</li>
			))}
		</ul>
	);
}

function Price({ value, period }: { value: string; period: string }) {
	return (
		<p className="mt-6 flex items-baseline gap-1">
			<span className="text-[17px] font-semibold text-[#5b6a70]">R$</span>
			<span className="text-[52px] font-bold leading-none tracking-[-0.03em]">{value}</span>
			<span className="text-[15px] text-[#687a80]">{period}</span>
		</p>
	);
}

function PlanPrice({ plan, yearly, trialDays }: { plan: TPublicPlan; yearly: boolean; trialDays: number }) {
	if (yearly) {
		return (
			<>
				<Price value={plan.yearly} period="/ano" />
				<p className="mt-2 text-[13px] text-[#687a80]">
					Equivale a R$ {plan.yearlyEquivalent} por mês · {trialDays} dias grátis
				</p>
			</>
		);
	}
	return (
		<>
			<Price value={plan.monthly} period="/mês" />
			<p className="mt-2 text-[13px] text-[#687a80]">{trialDays} dias grátis</p>
		</>
	);
}

export function PricingPlans(props: PricingPlansProps) {
	const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
	const yearly = cycle === "yearly";
	const cycleSuffix = yearly ? "anual" : "mensal";

	return (
		<div className="flex flex-col items-center">
			<div role="group" aria-label="Ciclo de cobrança" className="flex gap-0.5 rounded-full bg-[#eef2f6] p-1">
				{(
					[
						{ id: "monthly", label: "Mensal" },
						{ id: "yearly", label: "Anual" },
					] as const
				).map((option) => (
					<button
						key={option.id}
						type="button"
						aria-pressed={cycle === option.id}
						onClick={() => setCycle(option.id)}
						className={cn(
							"inline-flex h-9 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition-colors",
							cycle === option.id ? "bg-white text-[#0e1214] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#5b6a70] hover:text-[#0e1214]",
						)}
					>
						{option.label}
						{option.id === "yearly" ? (
							<span className="rounded-full bg-[rgba(22,163,74,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[#15803d]">-{props.yearlySavings}%</span>
						) : null}
					</button>
				))}
			</div>

			<div className="mt-10 grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">
				<div className="flex flex-col rounded-2xl border border-[#e3e8ea] bg-white p-8 max-md:p-6">
					<p className="text-[17px] font-semibold">CRM</p>
					<p className="mt-1 text-[14px] text-[#687a80]">Para fazer o cliente voltar.</p>
					<PlanPrice plan={props.crm} yearly={yearly} trialDays={props.trialDays} />
					<div className="mt-7 flex flex-1 flex-col">
						<Included items={props.crm.included} />
					</div>
					<TrackedCta
						href={SIGNUP_HREF}
						ctaId={`pricing_crm_${cycleSuffix}`}
						location="pricing_plans"
						slug="pricing"
						className="flex justify-center rounded-[10px] border border-[#dfe4e6] p-[13px] text-[15px] font-semibold text-[#0e1214] transition-colors hover:bg-[#f7f8fa]"
					>
						Testar {props.trialDays} dias grátis
					</TrackedCta>
				</div>

				<div className="flex flex-col rounded-2xl border border-[#e3e8ea] bg-white p-8 max-md:p-6">
					<p className="text-[17px] font-semibold">CRM + ERP</p>
					<p className="mt-1 text-[14px] text-[#687a80]">Para vender e fazer o cliente voltar, no mesmo sistema.</p>
					<PlanPrice plan={props.erp} yearly={yearly} trialDays={props.trialDays} />
					<p className="mt-7 mb-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#687a80]">Tudo do CRM, mais:</p>
					<div className="flex flex-1 flex-col">
						<Included items={props.erp.included} />
					</div>
					<TrackedCta
						href={SIGNUP_HREF}
						ctaId={`pricing_crm_erp_${cycleSuffix}`}
						location="pricing_plans"
						slug="pricing"
						className="flex justify-center rounded-[10px] border border-[#dfe4e6] p-[13px] text-[15px] font-semibold text-[#0e1214] transition-colors hover:bg-[#f7f8fa]"
					>
						Testar {props.trialDays} dias grátis
					</TrackedCta>
				</div>
			</div>
		</div>
	);
}
