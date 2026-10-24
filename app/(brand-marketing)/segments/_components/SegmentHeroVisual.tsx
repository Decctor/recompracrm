import type { SegmentPage } from "@/app/_content/segment-pages";
import { cn } from "@/lib/utils";
import { CalendarClock, Check, Hourglass, MessageCircle, Store } from "lucide-react";
import { capitalize, SEGMENT_FAMILY_THEMES } from "./segment-families";

// Ilustração de produto do herói, uma por família visual. Os nomes e valores (Maria, as unidades)
// são exemplos do design; os números do segmento (validade, ocasiões, ciclo) vêm do conteúdo.
export function SegmentHeroVisual({ page }: { page: SegmentPage }) {
	switch (page.family) {
		case "ALIMENTACAO":
			return <WeeklyVisits page={page} />;
		case "REPOSICAO":
			return <ReplenishmentCycle page={page} />;
		case "MODA_E_OCASIOES":
			return <OccasionsCalendar page={page} />;
		case "CASA_E_OBRA":
			return <ProjectJourney page={page} />;
		case "REDES_E_VAREJO":
			return <UnitsSales />;
	}
}

const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const VISIT_DAYS = new Set([1, 5]);
const NUDGE_DAY = 3;

function WeeklyVisits({ page }: { page: SegmentPage }) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-3.5 rounded-[20px] border border-[rgba(14,18,20,0.06)] bg-white p-5 shadow-[0_30px_70px_-36px_rgba(120,53,15,0.35)] max-md:p-3.5">
				<div className="flex items-center justify-between gap-3">
					<span className="text-[12px] font-bold">SEMANA DA MARIA</span>
					<span className="text-[12px] text-[#687a80]">{capitalize(page.suggestedConfig.purchaseCycle)}</span>
				</div>
				<div className="grid grid-cols-7 gap-1.5 max-md:gap-1">
					{WEEK.map((day, i) => {
						const visit = VISIT_DAYS.has(i);
						const nudge = i === NUDGE_DAY;
						return (
							<div key={day} className={cn("flex min-w-0 flex-col items-center gap-2 rounded-xl py-2.5", nudge ? "bg-[#fff7e5]" : "bg-[#fafaf7]")}>
								<span className="text-[11px] font-semibold text-[#687a80]">{day}</span>
								<span
									className={cn(
										"flex size-7 items-center justify-center rounded-full max-md:size-6",
										visit ? "bg-[#b45309] text-white" : nudge ? "bg-[#25d366] text-white" : "border border-dashed border-[#e3d9c5]",
									)}
								>
									{visit ? <Check className="size-3" aria-hidden /> : null}
									{nudge ? <MessageCircle className="size-3" aria-hidden /> : null}
								</span>
								<span className="h-3 text-[10px] font-semibold text-[#687a80] max-md:text-[8.5px]">{visit ? "visita" : nudge ? "lembrete" : ""}</span>
							</div>
						);
					})}
				</div>
			</div>
			<div className="max-w-[88%] self-end rounded-[14px_14px_4px_14px] bg-[#dcf8c6] px-3.5 py-3 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.4)]">
				<p className="text-[14px] leading-[1.45] text-[#111827]">
					Oi, Maria! Seu cashback de R$ 4,20 vale por mais alguns dias. Que tal passar aqui hoje?
				</p>
				<p className="mt-1 text-right text-[10px] text-[#6b7280]">11:30 ✓✓</p>
			</div>
		</div>
	);
}

function ReplenishmentCycle({ page }: { page: SegmentPage }) {
	const days = Number(page.suggestedConfig.expirationDays);
	const marks = [
		{ value: "Dia 0", label: "Última compra" },
		{ value: `Dia ${Math.round(days * 0.8)}`, label: "Lembrete no WhatsApp" },
		{ value: `Dia ${days}`, label: "Saldo expira" },
	];
	return (
		<div className="flex flex-col gap-6 rounded-[24px] border border-white/12 bg-white/6 p-7 max-md:rounded-[20px] max-md:p-5">
			<div className="flex items-center justify-between gap-3">
				<span className="text-[13px] font-semibold text-white/70">Ciclo de reposição</span>
				<span className="text-[13px] text-[#5eead4]">{days} dias</span>
			</div>
			<div className="relative h-3 rounded-full bg-white/10" aria-hidden>
				<span className="absolute inset-y-0 left-0 w-[62%] rounded-full bg-[linear-gradient(to_right,#14b8a6,#5eead4)]" />
				<span className="absolute top-1/2 left-[62%] -mt-[11px] -ml-[11px] size-[22px] rounded-full bg-white shadow-[0_0_0_6px_rgba(94,234,212,0.25)]" />
				<span className="absolute -inset-y-1.5 left-[80%] w-0.5 bg-[#ffb900]" />
			</div>
			<div className="grid grid-cols-3 gap-2.5 text-[12px] text-white/60">
				{marks.map((mark) => (
					<div key={mark.label}>
						<p className="text-[18px] font-semibold text-white">{mark.value}</p>
						<p className="mt-1">{mark.label}</p>
					</div>
				))}
			</div>
			<div className="flex items-center gap-3 rounded-[14px] bg-white p-3.5 text-[#0e1214]">
				<span className="flex size-10 flex-none items-center justify-center rounded-[10px] bg-[#24549c] text-white">
					<Hourglass className="size-4" aria-hidden />
				</span>
				<div className="min-w-0">
					<p className="text-[10px] font-semibold tracking-[0.06em] text-[#687a80]">GATILHO</p>
					<p className="mt-px text-[14px] font-semibold">Cashback expirando</p>
					<p className="mt-0.5 text-[12px] leading-[1.4] text-[#687a80]">
						Avisa o cliente com antecedência quando seu cashback estiver prestes a expirar.
					</p>
				</div>
			</div>
		</div>
	);
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function OccasionsCalendar({ page }: { page: SegmentPage }) {
	const accent = SEGMENT_FAMILY_THEMES[page.family].accent;
	const occasionByMonth = new Map(page.occasions.map((occasion) => [occasion.month, occasion.label]));
	return (
		<div className="flex flex-col gap-4 rounded-[20px] border border-[rgba(14,18,20,0.06)] bg-white p-5 shadow-[0_30px_70px_-36px_rgba(159,18,57,0.35)] max-md:p-4">
			<div className="flex items-center justify-between gap-3">
				<span className="text-[12px] font-bold">CALENDÁRIO DE OCASIÕES</span>
				<span className="text-[12px] text-[#687a80]">2026</span>
			</div>
			{/* No celular, seis meses por linha deixam "Dia das Mães" com uma palavra por linha: viram quatro. */}
			<div className="grid grid-cols-6 gap-1.5 max-md:grid-cols-4">
				{MONTHS.map((month, i) => {
					const occasion = occasionByMonth.get(i);
					return (
						<div
							key={month}
							className={cn(
								"flex min-h-16 min-w-0 flex-col gap-1 rounded-[10px] p-2 max-md:px-1.5",
								occasion ? "text-white" : "bg-[#fafafa] text-[#8a979c]",
							)}
							style={occasion ? { background: accent } : undefined}
						>
							<span className="text-[11px] font-bold">{month}</span>
							<span className="text-[10px] leading-[1.25] break-words">{occasion ?? ""}</span>
						</div>
					);
				})}
			</div>
			<div className="flex items-center gap-3 rounded-xl border border-[#e3e8ea] p-3">
				<span className="flex size-9 flex-none items-center justify-center rounded-lg bg-[rgba(36,84,156,0.1)] text-[#24549c]">
					<CalendarClock className="size-[15px]" aria-hidden />
				</span>
				<div className="min-w-0">
					<p className="text-[14px] font-semibold">Uso único</p>
					<p className="mt-0.5 text-[12px] leading-[1.4] text-[#687a80]">Disparada uma única vez na data selecionada e no bloco de horário configurado.</p>
				</div>
			</div>
		</div>
	);
}

function ProjectJourney({ page }: { page: SegmentPage }) {
	const days = Number(page.suggestedConfig.expirationDays);
	const steps = [
		{ day: 0, title: "Primeira compra", trigger: "Gatilho: Primeira compra" },
		{ day: Math.round(days * 0.25), title: "Nova compra", trigger: "Gatilho: Nova compra" },
		{ day: Math.round(days * 0.6), title: "Segunda etapa da obra ou reparo", trigger: "Gatilho: Quantidade total de compras" },
		{ day: days, title: "Manutenção", trigger: "Gatilho: Recorrente" },
	];
	return (
		<div className="flex flex-col rounded-[24px] border border-white/12 bg-white/6 p-7 max-md:rounded-[20px] max-md:p-5">
			<div className="mb-5 flex items-center justify-between gap-3">
				<span className="text-[13px] font-semibold text-white/70">Jornada do cliente</span>
				<span className="text-[13px] text-[#ffb900]">{days} dias de crédito</span>
			</div>
			{steps.map((step, i) => (
				<div key={step.title} className="grid grid-cols-[56px_20px_minmax(0,1fr)] items-stretch gap-3 max-md:grid-cols-[48px_20px_minmax(0,1fr)]">
					<span className="pt-3 text-[12px] font-semibold text-white/50">Dia {step.day}</span>
					<span className="flex flex-col items-center" aria-hidden>
						<span className={cn("mt-3.5 block size-3.5 rounded-full", i === 0 ? "bg-[#ffb900]" : "border-2 border-[#ffb900] bg-[#0f1f33]")} />
						{i < steps.length - 1 ? <span className="block w-0.5 flex-1 bg-[rgba(255,185,0,0.3)]" /> : null}
					</span>
					<div className="pt-2.5 pb-[18px]">
						<p className="text-[15px] font-semibold text-white">{step.title}</p>
						<p className="mt-[3px] text-[12px] text-white/55">{step.trigger}</p>
					</div>
				</div>
			))}
		</div>
	);
}

const UNITS = [
	{ name: "Unidade Centro", value: "R$ 84.210", share: 100, meta: "412 clientes recorrentes" },
	{ name: "Unidade Shopping", value: "R$ 71.930", share: 85, meta: "358 clientes recorrentes" },
	{ name: "Unidade Bairro", value: "R$ 52.480", share: 62, meta: "271 clientes recorrentes" },
];

function UnitsSales() {
	return (
		<div className="flex flex-col gap-3 rounded-[20px] border border-[rgba(14,18,20,0.06)] bg-white p-5 shadow-[0_30px_70px_-36px_rgba(16,24,40,0.35)] max-md:p-4">
			<div className="flex items-center justify-between gap-3">
				<span className="text-[12px] font-bold">VENDAS POR UNIDADE</span>
				<span className="text-[12px] text-[#687a80]">Outubro</span>
			</div>
			{UNITS.map((unit) => (
				<div key={unit.name} className="flex flex-col gap-2 rounded-xl border border-[#e3e8ea] p-3">
					<div className="flex justify-between gap-2">
						<span className="flex items-center gap-2 text-[14px] font-semibold">
							<Store className="size-[15px] flex-none text-[#24549c]" aria-hidden />
							{unit.name}
						</span>
						<span className="text-[14px] font-bold whitespace-nowrap">{unit.value}</span>
					</div>
					<span className="block h-2 overflow-hidden rounded-full bg-[#f2f4f4]">
						<span className="block h-full rounded-full bg-[#24549c]" style={{ width: `${unit.share}%` }} />
					</span>
					<span className="text-[11px] text-[#687a80]">{unit.meta}</span>
				</div>
			))}
		</div>
	);
}
