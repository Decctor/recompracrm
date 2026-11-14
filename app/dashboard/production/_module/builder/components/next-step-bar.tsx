"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Calendar, CircleAlert, CircleCheck, Info, Loader2, Play, Pointer, RefreshCcw, type LucideIcon } from "lucide-react";
import { formatPercent, formatQuantity } from "../helpers/format";
import { useBuilder } from "./builder-provider";
import { TONE_CLASSES, type TTone } from "./builder-ui";

type TStepMessage = { tone: TTone; icon: LucideIcon; text: string };

const SALDO_COVERS_TARGET = "O saldo reincorporado cobre toda a quantidade a produzir. Aumente a quantidade ou reduza o saldo.";

/** Barra fixa no rodapé: o que falta (ou que está tudo certo) e a ação da etapa. */
export default function NextStepBar() {
	const builder = useBuilder();
	const { stage, selection, recipe, recipeLoading, recipeError, plan, manualOutputsCount, quantitiesReady, reviewIssue } = builder;
	const { next, back, submit, isSubmitting, submittingStatus } = builder;

	let message: TStepMessage;
	if (stage === "recipe") {
		if (selection?.kind === "manual")
			message = { tone: "ok", icon: CircleCheck, text: "Produção manual selecionada. Toque em uma receita para trocar." };
		else if (selection?.kind === "recipe")
			message = {
				tone: "ok",
				icon: CircleCheck,
				text: `${recipe?.titulo ?? selection.preview?.titulo ?? "Receita"} selecionada. Toque em outra receita para trocar.`,
			};
		else message = { tone: "mute", icon: Pointer, text: "Toque em uma receita para continuar." };
	} else if (selection?.kind === "manual" && manualOutputsCount === 0) {
		message = { tone: "warn", icon: CircleAlert, text: "Adicione ao menos uma saída produzida para continuar." };
	} else if (selection?.kind === "recipe" && recipeLoading) {
		message = { tone: "mute", icon: Loader2, text: "Carregando a receita…" };
	} else if (selection?.kind === "recipe" && recipeError) {
		message = { tone: "bad", icon: CircleAlert, text: recipeError };
	} else if (plan?.missingOutput) {
		message = { tone: "warn", icon: CircleAlert, text: "Esta receita não tem saída cadastrada. Ajuste a receita ou faça uma produção manual." };
	} else if (plan?.saldoCoversTarget) {
		message = { tone: "warn", icon: CircleAlert, text: SALDO_COVERS_TARGET };
	} else if (plan?.blocked) {
		message = { tone: "warn", icon: CircleAlert, text: "Informe quanto produzir." };
	} else if (stage === "quantities") {
		if (selection?.kind === "manual") message = { tone: "info", icon: Info, text: "Entradas e saídas livres. Continue para revisar." };
		else if (plan && plan.escala.reducaoInsumos > 0)
			message = {
				tone: "warn",
				icon: RefreshCcw,
				text: `Mistura nova para ${formatQuantity(plan.escala.quantidadeMisturaNova, plan.unit)} + ${formatQuantity(plan.escala.quantidadeSaldo, plan.unit)} de saldo. Insumos reduzidos em ${formatPercent(plan.escala.reducaoInsumos)}.`,
			};
		else
			message = {
				tone: "info",
				icon: Info,
				text: plan ? `Insumos recalculados para ${formatQuantity(plan.escala.quantidadeSaida, plan.unit)}.` : "Defina as quantidades.",
			};
	} else if (reviewIssue) {
		message = { tone: "warn", icon: CircleAlert, text: reviewIssue };
	} else {
		message = { tone: "ok", icon: CircleCheck, text: "Tudo certo. Confira os dados e inicie a produção." };
	}

	const isReview = stage === "review";
	const primaryDisabled = isReview ? !!reviewIssue || isSubmitting : stage === "recipe" ? !selection : !quantitiesReady;
	const MessageIcon = message.icon;

	return (
		<div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2.5 rounded-[18px] border border-border bg-card p-2 shadow-lg">
			{stage !== "recipe" ? (
				<Button type="button" variant="ghost" className="h-14 gap-2 rounded-full px-5 text-sm" onClick={back} disabled={isSubmitting}>
					<ArrowLeft className="h-[18px] w-[18px]" />
					VOLTAR
				</Button>
			) : null}
			<div className={cn("flex min-h-14 min-w-[220px] flex-1 items-center gap-2.5 rounded-[14px] px-3.5 py-1.5", TONE_CLASSES[message.tone])}>
				<MessageIcon className={cn("h-4 w-4 shrink-0", message.icon === Loader2 && "animate-spin")} />
				<span className="text-sm font-semibold leading-snug">{message.text}</span>
			</div>
			{isReview ? (
				<Button
					type="button"
					variant="outline"
					className="h-14 gap-2 rounded-full px-5 text-sm font-semibold"
					disabled={!!reviewIssue || isSubmitting}
					onClick={() => submit("PLANEJADA")}
				>
					{submittingStatus === "PLANEJADA" ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Calendar className="h-[18px] w-[18px]" />}
					SALVAR COMO PLANEJADA
				</Button>
			) : null}
			<Button
				type="button"
				variant="brand"
				className="h-14 min-w-[220px] gap-2 rounded-full px-6 text-base font-bold"
				disabled={primaryDisabled}
				onClick={() => (isReview ? submit("EM_PRODUCAO") : next())}
			>
				{isReview ? (
					submittingStatus === "EM_PRODUCAO" ? (
						<Loader2 className="h-[18px] w-[18px] animate-spin" />
					) : (
						<Play className="h-[18px] w-[18px]" />
					)
				) : (
					<ArrowRight className="h-[18px] w-[18px]" />
				)}
				{isReview ? "INICIAR PRODUÇÃO" : "CONTINUAR"}
			</Button>
		</div>
	);
}
