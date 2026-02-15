"use client";

import type React from "react";
import { Button } from "@/components/ui/button";
import { formatToMoney } from "@/lib/formatting";
import { CheckCircle2, PartyPopper } from "lucide-react";

type StatItem = {
	label: string;
	value: number;
	variant: "green" | "brand";
};

type ActionButton = {
	label: string;
	onClick: () => void;
};

type SuccessCelebrationProps = {
	title: string;
	subtitle: string;
	stats: StatItem[];
	primaryAction: ActionButton;
	secondaryAction: ActionButton;
	children?: React.ReactNode;
};

export function SuccessCelebration({ title, subtitle, stats, primaryAction, secondaryAction, children }: SuccessCelebrationProps) {
	return (
		<div className="flex flex-col items-center text-center space-y-8 short:space-y-2 animate-in zoom-in duration-500">
			<div className="relative">
				<div className="absolute inset-0 bg-green-500/20 blur-3xl rounded-full scale-150 animate-pulse short:hidden" />
				<div className="relative bg-green-600 p-8 short:p-3 rounded-full text-white shadow-2xl shadow-green-600/30">
					<CheckCircle2 className="w-20 h-20 short:w-8 short:h-8" />
				</div>
				<div className="absolute -top-4 -right-4 short:-top-1 short:-right-1 bg-yellow-400 p-3 short:p-1 rounded-2xl short:rounded-lg text-yellow-900 shadow-lg animate-bounce">
					<PartyPopper className="w-6 h-6 short:w-3 short:h-3" />
				</div>
			</div>

			<div className="space-y-2 short:space-y-0.5">
				<h2 className="text-4xl short:text-lg font-black uppercase tracking-tighter text-green-700">{title}</h2>
				<p className="text-muted-foreground font-medium text-lg short:text-sm">{subtitle}</p>
			</div>

			{children}

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6 short:gap-2 w-full max-w-xl">
				{stats.map((stat) => (
					<div
						key={stat.label}
						className={
							stat.variant === "green"
								? "bg-green-50 border-2 short:border border-green-200 rounded-3xl short:rounded-xl p-6 short:p-2 shadow-sm"
								: "bg-brand/5 border-2 short:border border-brand/20 rounded-3xl short:rounded-xl p-6 short:p-2 shadow-sm"
						}
					>
						<p
							className={
								stat.variant === "green"
									? "text-[0.7rem] short:text-[0.6rem] font-black text-green-600 uppercase tracking-widest mb-1 short:mb-0"
									: "text-[0.7rem] short:text-[0.6rem] font-black text-brand uppercase tracking-widest mb-1 short:mb-0"
							}
						>
							{stat.label}
						</p>
						<p
							className={
								stat.variant === "green"
									? "text-4xl short:text-xl font-black text-green-700"
									: "text-4xl short:text-xl font-black text-brand"
							}
						>
							{formatToMoney(stat.value)}
						</p>
					</div>
				))}
			</div>

			<div className="flex flex-col sm:flex-row gap-4 short:gap-2 w-full max-w-xl">
				<Button
					onClick={primaryAction.onClick}
					size="lg"
					className="flex-1 rounded-2xl short:rounded-lg h-20 short:h-11 short:py-2.5 text-xl short:text-base font-black shadow-xl uppercase tracking-wider"
				>
					{primaryAction.label}
				</Button>
				<Button
					onClick={secondaryAction.onClick}
					variant="outline"
					size="lg"
					className="flex-1 rounded-2xl short:rounded-lg h-20 short:h-11 short:py-2.5 text-xl short:text-base font-black border-4 short:border hover:bg-muted uppercase tracking-wider"
				>
					{secondaryAction.label}
				</Button>
			</div>
		</div>
	);
}
