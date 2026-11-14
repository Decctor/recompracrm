"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import BuilderStepper from "./builder-stepper";

export default function BuilderHeader({ onBack }: { onBack: () => void }) {
	return (
		<header className="flex w-full flex-wrap items-center gap-x-5 gap-y-3 rounded-[18px] border border-border bg-card px-3 py-2.5 shadow-sm">
			<div className="flex items-center gap-2.5">
				<Button type="button" variant="ghost" className="h-11 gap-1.5 rounded-full px-4" onClick={onBack}>
					<ArrowLeft className="h-4 w-4" />
					VOLTAR
				</Button>
				<div className="flex flex-col">
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nova produção</p>
					<h1 className="whitespace-nowrap text-sm font-semibold tracking-tight">CONSTRUTOR DE PRODUÇÃO</h1>
				</div>
			</div>
			<BuilderStepper />
		</header>
	);
}
