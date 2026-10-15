"use client";

import { Button } from "@/components/ui/button";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { ArrowRight, CircleAlert, CircleCheck, Sparkles } from "lucide-react";
import { useBuilder } from "./builder-provider";
import { TONE_BORDER_CLASSES, TONE_CLASSES, type TTone } from "./builder-ui";
import { useBuilderSummary } from "./use-builder-summary";

/** One slim line under the stepper: what is the next thing to do, and a shortcut to it. */
export default function NextStepBar() {
	const { origin, readStatus, currentStage, setCurrentStage, openQueue, startReading, files } = useBuilder();
	const summary = useBuilderSummary();

	let tone: TTone = "warn";
	let Icon = CircleAlert;
	let text: string;
	let cta: { label: string; action: () => void } | null = null;
	const pendingCount = summary.pendingLines.length;

	if (!origin) {
		tone = "info";
		Icon = Sparkles;
		text = "Escolha como começar a compra.";
	} else if (origin === "document" && readStatus !== "done") {
		tone = "info";
		Icon = Sparkles;
		text = readStatus === "reading" ? "Lendo o documento…" : "Leia a nota para preencher a compra automaticamente.";
		if (readStatus === "idle" && files.length > 0) cta = { label: "LER DOCUMENTO", action: () => void startReading() };
	} else if (pendingCount > 0) {
		text = `Resolver ${pendingCount} ${pendingCount === 1 ? "pendência" : "pendências"} nos itens.`;
		cta = { label: "RESOLVER AGORA", action: () => openQueue() };
	} else if (!summary.transactionsBalanced) {
		text =
			summary.transactionsRemaining < 0
				? "As transações passam do valor a pagar."
				: `Faltam ${formatToMoney(summary.transactionsRemaining)} em transações financeiras.`;
		if (currentStage !== "finance") cta = { label: "CONFERIR FINANCEIRO", action: () => setCurrentStage("finance") };
	} else if (!summary.totalsMatch) {
		text = "O valor efetivo não bate com o total dos itens.";
		if (currentStage !== "finance") cta = { label: "CONFERIR FINANCEIRO", action: () => setCurrentStage("finance") };
	} else if (summary.firstInvalid) {
		text = summary.firstInvalid.reason;
		if (currentStage !== summary.firstInvalid.stage) {
			const stage = summary.firstInvalid.stage;
			cta = { label: "IR PARA A ETAPA", action: () => setCurrentStage(stage) };
		}
	} else if (currentStage !== "review") {
		tone = "ok";
		Icon = CircleCheck;
		text = "Tudo certo. Revise e confirme a compra.";
		cta = { label: "IR PARA REVISÃO", action: () => setCurrentStage("review") };
	} else {
		tone = "ok";
		Icon = CircleCheck;
		text = "Tudo certo. Confirme a compra quando quiser.";
	}

	return (
		<div className={cn("flex flex-wrap items-center gap-2.5 rounded-xl border py-2 pr-2 pl-3.5", TONE_CLASSES[tone], TONE_BORDER_CLASSES[tone])}>
			<Icon className="h-4 w-4 shrink-0" />
			<p className="min-w-[200px] flex-1 text-[0.82rem]">
				<span className="mr-2 text-[0.7rem] font-extrabold uppercase tracking-widest">Próximo passo</span>
				<span className="font-semibold">{text}</span>
			</p>
			{cta ? (
				<Button type="button" size="xs" className="flex items-center gap-1.5 rounded-full" onClick={cta.action}>
					{cta.label}
					<ArrowRight className="h-3.5 w-3.5" />
				</Button>
			) : null}
		</div>
	);
}
