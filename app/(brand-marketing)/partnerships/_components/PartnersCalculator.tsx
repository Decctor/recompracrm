"use client";

import { TrackedLink } from "@/app/_components/ledger/TrackedLink";
import { formatToMoney } from "@/lib/formatting";
import { ArrowRight, Minus, Plus, Store } from "lucide-react";
import { useState } from "react";
import { SectionHeading } from "./SectionHeading";
import {
	CALCULATOR_DEFAULT_STORES,
	CALCULATOR_MAX_STORES,
	CALCULATOR_MIN_STORES,
	FIRST_MONTH_PAYOUT,
	FIRST_YEAR_PAYOUT,
	PARTNER_CTA_EVENT,
	PARTNER_LOGIN_HREF,
	RECURRING_MONTH_PAYOUT,
	THIRD_MONTH_PAYOUT,
} from "./program-facts";

const clampStores = (value: number) => Math.min(CALCULATOR_MAX_STORES, Math.max(CALCULATOR_MIN_STORES, value));

const STEP_BUTTON_CLASS =
	"flex size-12 flex-none items-center justify-center rounded-full border border-[#e3e8ea] bg-white text-[#0e1214] transition-colors hover:border-[#24549c]/40 disabled:cursor-default disabled:opacity-35 disabled:hover:border-[#e3e8ea]";

export function PartnersCalculator() {
	const [stores, setStores] = useState(CALCULATOR_DEFAULT_STORES);
	const updateStores = (value: number) => setStores(clampStores(value));

	return (
		<section id="calculadora" className="scroll-mt-[60px] pt-36 max-md:pt-24">
			<div className="mx-auto max-w-[1240px] px-6 max-md:px-4">
				<SectionHeading eyebrow="03 · Calculadora de ganhos" title="Quanto a sua rede" muted="pode te render?" />

				<div className="mt-14 grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-3 rounded-[28px] bg-[#eef2f6] p-3 max-md:mt-10 max-md:rounded-3xl max-md:p-2">
					<div className="flex flex-col rounded-[20px] bg-white p-9 max-md:p-6">
						<p className="flex items-center gap-2.5 text-[14px] font-medium text-[#5b6a70]">
							<Store className="size-[18px] flex-none text-[#24549c]" aria-hidden />
							Lojas que você indica
						</p>
						<div className="mt-7 flex items-center justify-between gap-4">
							<button
								type="button"
								onClick={() => updateStores(stores - 1)}
								disabled={stores <= CALCULATOR_MIN_STORES}
								aria-label="Diminuir lojas"
								className={STEP_BUTTON_CLASS}
							>
								<Minus className="size-4" aria-hidden />
							</button>
							<output aria-live="polite" className="text-[96px] font-medium leading-none tracking-[-0.05em] max-md:text-[80px]">
								{stores}
							</output>
							<button
								type="button"
								onClick={() => updateStores(stores + 1)}
								disabled={stores >= CALCULATOR_MAX_STORES}
								aria-label="Aumentar lojas"
								className={STEP_BUTTON_CLASS}
							>
								<Plus className="size-4" aria-hidden />
							</button>
						</div>
						<input
							type="range"
							min={CALCULATOR_MIN_STORES}
							max={CALCULATOR_MAX_STORES}
							value={stores}
							onChange={(event) => updateStores(Number(event.target.value))}
							aria-label="Número de lojas indicadas"
							className="mt-8 w-full cursor-pointer accent-[#24549c]"
						/>
						<div className="mt-2 flex justify-between text-[12px] font-medium text-[#8a979c]">
							<span>{CALCULATOR_MIN_STORES} loja</span>
							<span>{CALCULATOR_MAX_STORES}+ lojas</span>
						</div>
						<p className="mt-auto pt-7 text-[14px] leading-[1.6] text-[#687a80]">
							Cada loja ativa rende {formatToMoney(FIRST_MONTH_PAYOUT)} no primeiro mês, {formatToMoney(THIRD_MONTH_PAYOUT)} no terceiro mês e{" "}
							{formatToMoney(RECURRING_MONTH_PAYOUT)} nas demais mensalidades.
						</p>
					</div>

					<div data-dock="dark" className="flex flex-col gap-7 rounded-[20px] bg-[#0b1628] p-9 text-white max-md:p-6">
						<div>
							<p className="text-[13px] font-semibold text-white/60">Receita recorrente</p>
							<p className="mt-2.5 flex flex-wrap items-baseline gap-2">
								<span className="text-[64px] font-medium leading-none tracking-[-0.05em] text-[#ffb900] max-md:text-[48px] max-[400px]:text-[42px]">
									{formatToMoney(stores * RECURRING_MONTH_PAYOUT)}
								</span>
								<span className="text-[16px] font-medium text-white/65">/mês</span>
							</p>
							<p className="mt-2.5 text-[14px] text-white/60">Mensalidades sem bônus cheio, mês após mês.</p>
						</div>
						<div className="grid grid-cols-2 gap-2.5">
							<div className="rounded-2xl bg-white/7 p-[18px] max-md:p-4">
								<p className="text-[12px] font-semibold text-white/55">Bônus de 1º + 3º mês</p>
								<p className="mt-2 text-[24px] font-semibold tracking-[-0.02em] max-md:text-[19px]">
									{formatToMoney(stores * (FIRST_MONTH_PAYOUT + THIRD_MONTH_PAYOUT))}
								</p>
								<p className="mt-1 text-[12px] text-white/50">por loja mantida</p>
							</div>
							<div className="rounded-2xl bg-white/7 p-[18px] max-md:p-4">
								<p className="text-[12px] font-semibold text-white/55">Total no 1º ano</p>
								<p className="mt-2 text-[24px] font-semibold tracking-[-0.02em] max-md:text-[19px]">{formatToMoney(stores * FIRST_YEAR_PAYOUT)}</p>
								<p className="mt-1 text-[12px] text-white/50">ativação + recorrência</p>
							</div>
						</div>
						<TrackedLink
							href={PARTNER_LOGIN_HREF}
							event={PARTNER_CTA_EVENT}
							controlEvent="lead"
							properties={{ cta_id: "calculadora_entrar_no_programa", location: "partner_calculator", stores }}
							className="mt-auto inline-flex h-[52px] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#ffb900] text-[15px] font-semibold text-[#171717] transition-colors hover:bg-[#e6a700]"
						>
							Começar a indicar
							<ArrowRight className="size-4 flex-none" aria-hidden />
						</TrackedLink>
					</div>
				</div>
				<p className="mt-4 text-center text-[13px] text-[#8a979c]">
					Estimativa ilustrativa considerando lojas no plano mensal e ativas no período. Valores brutos, antes de impostos.
				</p>
			</div>
		</section>
	);
}
