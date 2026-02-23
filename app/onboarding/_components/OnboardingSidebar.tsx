import { cn } from "@/lib/utils";
import RecompraCRMLogo from "@/utils/svgs/logos/RECOMPRA - COMPLETE - VERTICAL - COLORFUL.svg";
import { AreaChartIcon, BuildingIcon, Check, CreditCardIcon, TargetIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export type OnboardingStage = "organization-general-info" | "organization-niche-origin" | "organization-actuation" | "subscription-plans-section";

const STAGES: { id: OnboardingStage; label: string; shortLabel: string; description: string; icon: ReactNode }[] = [
	{
		id: "organization-general-info",
		label: "Sobre a organização",
		shortLabel: "Empresa",
		description: "Dados básicos da empresa",
		icon: <BuildingIcon className="h-3 w-3 md:h-4 md:w-4 lg:h-5 lg:w-5" />,
	},
	{
		id: "organization-niche-origin",
		label: "Nicho e Origem",
		shortLabel: "Nicho",
		description: "Segmento de atuação",
		icon: <TargetIcon className="h-3 w-3 md:h-4 md:w-4 lg:h-5 lg:w-5" />,
	},
	{
		id: "organization-actuation",
		label: "Atuação",
		shortLabel: "Atuação",
		description: "Escala e operações",
		icon: <AreaChartIcon className="h-3 w-3 md:h-4 md:w-4 lg:h-5 lg:w-5" />,
	},
	{
		id: "subscription-plans-section",
		label: "Planos",
		shortLabel: "Planos",
		description: "Escolha seu plano",
		icon: <CreditCardIcon className="h-3 w-3 md:h-4 md:w-4 lg:h-5 lg:w-5" />,
	},
];

type OnboardingSidebarProps = {
	currentStage: OnboardingStage;
};

export function OnboardingSidebar({ currentStage }: OnboardingSidebarProps) {
	const currentStageIndex = STAGES.findIndex((s) => s.id === currentStage);

	return (
		<>
			{/* Mobile: Horizontal compact stepper */}
			<div className="flex md:hidden w-full flex-col gap-3 z-20">
				<div className="flex items-center justify-between gap-3">
					{/* Logo */}
					<div className="relative w-16 h-16 filter drop-shadow-lg shrink-0">
						<Image src={RecompraCRMLogo} alt="RecompraCRM Logo" fill={true} className="object-contain" />
					</div>

					{/* Horizontal Steps */}
					<div className="flex items-center gap-1 flex-1 justify-end">
						{STAGES.map((stage, index) => {
							const isCompleted = index < currentStageIndex;
							const isCurrent = index === currentStageIndex;

							return (
								<div key={stage.id} className="flex items-center">
									<div
										className={cn("flex items-center justify-center w-8 h-8 rounded-full z-10 transition-all duration-300 border-2", {
											"bg-[#FFB900] border-[#FFB900] text-blue-900": isCompleted,
											"bg-white border-white text-blue-900 shadow-lg ring-2 ring-white/20": isCurrent,
											"bg-transparent border-white/30 text-white/50": !isCompleted && !isCurrent,
										})}
									>
										{isCompleted ? <Check className="h-3 w-3 stroke-[3px]" /> : stage.icon}
									</div>
									{/* Connector line */}
									{index !== STAGES.length - 1 && (
										<div className={cn("w-4 h-0.5 transition-colors duration-300", index < currentStageIndex ? "bg-[#FFB900]" : "bg-white/20")} />
									)}
								</div>
							);
						})}
					</div>
				</div>

				{/* Current step info */}
				<div className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2 backdrop-blur-sm">
					<div className="flex flex-col">
						<span className="text-white font-semibold text-sm">{STAGES[currentStageIndex].label}</span>
						<span className="text-blue-200 text-xs">{STAGES[currentStageIndex].description}</span>
					</div>
					<span className="text-white/60 text-xs">
						{currentStageIndex + 1}/{STAGES.length}
					</span>
				</div>
			</div>

			{/* Desktop: Vertical sidebar */}
			<div className="hidden md:flex w-[260px] lg:w-[320px] xl:w-[380px] h-full flex-col justify-between gap-4 lg:gap-6 py-2 lg:py-4 z-20 shrink-0">
				<div className="flex flex-col gap-6 lg:gap-8 xl:gap-12">
					<div className="flex items-center justify-center">
						<div className="relative w-28 h-28 lg:w-32 lg:h-32 xl:w-36 xl:h-36 filter drop-shadow-lg">
							<Image src={RecompraCRMLogo} alt="RecompraCRM Logo" fill={true} className="object-contain" />
						</div>
					</div>
					<div className="flex flex-col gap-6 lg:gap-10 xl:gap-14 px-2 lg:px-4">
						{STAGES.map((stage, index) => {
							const isCompleted = index < currentStageIndex;
							const isCurrent = index === currentStageIndex;

							return (
								<div key={stage.id} className="relative flex items-center gap-3 lg:gap-4 xl:gap-5 group">
									{/* Vertical Line Connector */}
									{index !== STAGES.length - 1 && (
										<div
											className={cn(
												"absolute top-8 lg:top-10 left-[16px] lg:left-[20px] xl:left-[22px] h-full w-[2px] -translate-x-1/2 transition-colors duration-500",
												index < currentStageIndex ? "bg-linear-to-b from-[#FFB900] to-white/20" : "bg-white/10",
											)}
											style={{ height: "calc(100% + 24px)" }}
										/>
									)}

									<div
										className={cn(
											"flex items-center justify-center w-[32px] h-[32px] lg:w-[40px] lg:h-[40px] xl:w-[44px] xl:h-[44px] rounded-lg lg:rounded-xl z-10 transition-all duration-300 shadow-lg border-2",
											{
												"bg-[#FFB900] border-[#FFB900] text-blue-900 scale-100": isCompleted,
												"bg-white border-white text-blue-900 scale-105 lg:scale-110 shadow-blue-900/40 ring-2 lg:ring-4 ring-white/10": !isCompleted && isCurrent,
												"bg-transparent border-white/30 text-white/50": !isCompleted && !isCurrent,
											},
										)}
									>
										{isCompleted ? <Check className="h-4 w-4 lg:h-5 lg:w-5 stroke-[3px]" /> : stage.icon}
									</div>
									<div className="flex flex-col">
										<span
											className={cn("font-bold text-sm lg:text-base transition-colors duration-300", {
												"text-white": isCurrent || isCompleted,
												"text-white/50 group-hover:text-white/80": !isCurrent && !isCompleted,
											})}
										>
											{stage.label}
										</span>
										<span
											className={cn("text-xs lg:text-sm transition-colors duration-300", {
												"text-blue-100/80": isCurrent,
												"text-white/30 group-hover:text-white/50": !isCurrent,
											})}
										>
											{stage.description}
										</span>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				<div className="flex flex-col gap-4">
					<div className="flex items-center gap-2 lg:gap-3 rounded-xl lg:rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-3 lg:p-4 xl:p-5 shadow-xl transition-all hover:bg-white/15 cursor-default">
						<div className="flex h-8 w-8 lg:h-10 lg:w-10 min-w-8 lg:min-w-10 items-center justify-center rounded-full bg-linear-to-br from-white to-white/80 shadow-inner">
							<span className="font-bold text-[#24549C] text-sm lg:text-lg">?</span>
						</div>
						<div className="flex flex-col gap-0.5">
							<span className="font-semibold text-white text-xs lg:text-sm">Precisa de ajuda?</span>
							<Link href="#" className="text-blue-200 text-[10px] lg:text-xs hover:text-white hover:underline transition-colors">
								Fale com nosso suporte
							</Link>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
