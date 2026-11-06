"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { TrackedCta } from "../../features/_components/TrackedCta";
import { SIGNUP_HREF, whatsappHref } from "../../features/_components/feature-links";

// Os dois planos com o seletor mensal/anual, como o PlanPicker do app: no anual só existe o plano
// Plataforma, porque o Gestor de Crescimento é cobrado mensalmente.

type PricingPlansProps = {
	platformMonthly: string;
	platformYearly: string;
	platformYearlyEquivalent: string;
	yearlySavings: number;
	bundleMonthly: string;
	trialDays: number;
	platformIncluded: string[];
	consultoriaIncluded: string[];
};

const CONSULTORIA_TEXT = "Olá! Quero agendar um diagnóstico e entender a gestão com gestor de crescimento dedicado do RecompraCRM.";

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

export function PricingPlans(props: PricingPlansProps) {
	const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
	const yearly = cycle === "yearly";

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

			<div className={cn("mt-10 grid w-full gap-4", yearly ? "max-w-[520px]" : "grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))]")}>
				<div className="flex flex-col rounded-2xl border border-[#e3e8ea] bg-white p-8 max-md:p-6">
					<p className="text-[17px] font-semibold">Plataforma</p>
					<p className="mt-1 text-[14px] text-[#687a80]">Você no controle.</p>
					{yearly ? (
						<>
							<Price value={props.platformYearly} period="/ano" />
							<p className="mt-2 text-[13px] text-[#687a80]">
								Equivale a R$ {props.platformYearlyEquivalent} por mês · {props.trialDays} dias grátis
							</p>
						</>
					) : (
						<>
							<Price value={props.platformMonthly} period="/mês" />
							<p className="mt-2 text-[13px] text-[#687a80]">{props.trialDays} dias grátis</p>
						</>
					)}
					<div className="mt-7">
						<Included items={props.platformIncluded} />
					</div>
					<TrackedCta
						href={SIGNUP_HREF}
						ctaId={yearly ? "pricing_plataforma_anual" : "pricing_plataforma_mensal"}
						location="pricing_plans"
						slug="pricing"
						className="flex justify-center rounded-[10px] border border-[#dfe4e6] p-[13px] text-[15px] font-semibold text-[#0e1214] transition-colors hover:bg-[#f7f8fa]"
					>
						Testar {props.trialDays} dias grátis
					</TrackedCta>
				</div>

				{yearly ? null : (
					<div className="flex flex-col rounded-2xl border border-[#24549c] bg-white p-8 shadow-[0_0_0_1px_#24549c] max-md:p-6">
						<div className="flex items-center justify-between gap-3">
							<p className="text-[17px] font-semibold">Plataforma + Gestor de Crescimento</p>
							<span className="whitespace-nowrap rounded-md bg-[rgba(36,84,156,0.08)] px-2 py-[3px] text-[11px] font-semibold text-[#24549c]">
								Recomendado
							</span>
						</div>
						<p className="mt-1 text-[14px] text-[#687a80]">A gente opera por você.</p>
						<Price value={props.bundleMonthly} period="/mês" />
						<p className="mt-2 text-[13px] text-[#687a80]">Plataforma + consultoria · {props.trialDays} dias grátis</p>
						<p className="mt-7 mb-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#687a80]">Tudo da Plataforma, mais:</p>
						<Included items={props.consultoriaIncluded} />
						<TrackedCta
							href={whatsappHref(CONSULTORIA_TEXT)}
							ctaId="pricing_agendar_diagnostico"
							location="pricing_plans"
							slug="pricing"
							className="flex items-center justify-center gap-2 rounded-[10px] bg-[#24549c] p-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-[#1a3d7a]"
						>
							Agendar diagnóstico
							<ArrowRight className="size-4" aria-hidden />
						</TrackedCta>
					</div>
				)}
			</div>
			{yearly ? (
				<p className="mt-4 max-w-[520px] text-center text-[13px] text-[#687a80]">
					O Gestor de Crescimento é cobrado mensalmente e não entra no plano anual. Para contratá-lo, escolha o ciclo mensal.
				</p>
			) : null}
		</div>
	);
}
