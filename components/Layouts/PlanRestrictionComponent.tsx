import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Lock, Star } from "lucide-react";
import React from "react";

type PlanRestrictionComponentProps = {
	title?: string;
	message?: string;
};

function PlanRestrictionComponent({
	title = "Recurso Exclusivo",
	message = "Este recurso não faz parte da sua assinatura. Inclua-o pelo menu da assinatura, no selo do plano.",
}: PlanRestrictionComponentProps) {
	return (
		<div className="relative flex h-full w-full grow flex-col items-center justify-center overflow-hidden bg-background p-6">
			{/* Background decorations */}
			<div className="absolute top-1/2 left-1/2 -z-10 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 opacity-[0.03] blur-3xl rounded-full bg-[#24549C]" />

			<div className="group relative flex max-w-md flex-col items-center text-center">
				{/* Icon Container */}
				<div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-[#E7000B]/10 to-[#FFB900]/10 shadow-inner ring-1 ring-black/5 transition-transform duration-500 hover:scale-105 dark:ring-white/10">
					<div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#E7000B] to-[#FFB900] opacity-0 transition-opacity duration-500 group-hover:opacity-10 blur-xl" />
					<Lock className="h-10 w-10 text-[#E7000B] drop-shadow-sm transition-colors duration-300" />
					<div className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#FFB900] text-white shadow-lg shadow-[#FFB900]/20">
						<Star className="h-4 w-4 fill-current" />
					</div>
				</div>

				{/* Content */}
				<div className="space-y-4">
					<h2 className="text-3xl font-bold tracking-tight text-[#24549C]">{title}</h2>
					<p className="text-muted-foreground leading-relaxed text-lg">{message}</p>

					<div className="pt-4">
						{/* Visual divider or simple spacing */}
						<div className="mx-auto h-1 w-20 rounded-full bg-gradient-to-r from-[#E7000B] via-[#FFB900] to-[#24549C] opacity-30" />
					</div>
				</div>

				{/* Optional Call to Action Visual Placeholder */}
				{/*
        <div className="mt-8">
            <Button className="bg-[#24549C] hover:bg-[#24549C]/90 text-white shadow-lg shadow-[#24549C]/20 transition-all hover:scale-105 active:scale-95">
                Ver planos e adicionais
            </Button>
        </div>
        */}
			</div>
		</div>
	);
}

export default PlanRestrictionComponent;
