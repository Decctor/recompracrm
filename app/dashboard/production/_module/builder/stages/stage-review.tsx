"use client";

import DateTimeInput from "@/components/Inputs/DateTimeInput";
import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatDateForInputValue } from "@/lib/formatting";
import { CalendarClock, ClipboardList, ListChecks, Repeat } from "lucide-react";
import { RecipeCover } from "../../../_components/recipe-cover";
import { ValuationChips } from "../../../_components/valuation-chips";
import { useBuilder } from "../components/builder-provider";
import { AutoBadge, BuilderCard, FieldLabel, StaticField } from "../components/builder-ui";
import { formatDayMonth, formatDuration, formatPercent, formatQuantity } from "../helpers/format";

function parseInputDate(value: string | undefined) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export default function StageReview() {
	const { selection, recipe, plan, title, titleIsAuto, setTitle, start, startIsAuto, setStart, end, endIsAuto, setEnd, goToStage } = useBuilder();
	const isManual = selection?.kind === "manual";

	return (
		<div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_380px]">
			<BuilderCard className="gap-5">
				<ResponsiveMenuSection title="DADOS GERAIS" icon={<ClipboardList className="h-4 w-4" />}>
					<div className="flex flex-col gap-1">
						<FieldLabel required badge={<AutoBadge show={titleIsAuto} label="Receita · data" />}>
							TÍTULO
						</FieldLabel>
						<TextInput
							label="TÍTULO"
							showLabel={false}
							value={title}
							placeholder={recipe ? `Ex: ${recipe.titulo} · ${formatDayMonth(start)}` : "Ex: Produção de calda base"}
							handleChange={setTitle}
						/>
					</div>
					<div className="flex flex-col gap-1">
						<FieldLabel>RECEITA BASE</FieldLabel>
						<StaticField className="min-h-12 pr-1.5">
							<RecipeCover recipe={isManual ? null : recipe} className="h-7 w-7 shrink-0 rounded-md" iconClassName="h-4 w-4" />
							<span className="flex-1 truncate">{isManual ? "Produção manual (sem receita)" : (recipe?.titulo ?? "")}</span>
							<Button type="button" variant="ghost" className="h-10 gap-1.5 rounded-full px-3.5 text-sm font-semibold" onClick={() => goToStage("recipe")}>
								<Repeat className="h-4 w-4" />
								TROCAR
							</Button>
						</StaticField>
					</div>
				</ResponsiveMenuSection>

				<ResponsiveMenuSection title="PRAZOS" icon={<CalendarClock className="h-4 w-4" />}>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="flex flex-col gap-1">
							<FieldLabel badge={<AutoBadge show={startIsAuto} label="Agora" />}>INÍCIO</FieldLabel>
							<DateTimeInput
								label="INÍCIO"
								showLabel={false}
								holderClassName="h-12 text-base"
								value={formatDateForInputValue(start, "datetime")}
								handleChange={(value) => setStart(parseInputDate(value))}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<FieldLabel
								badge={
									<AutoBadge
										show={endIsAuto && !!plan?.duration}
										label={plan?.duration ? `+${formatDuration(plan.duration.valor, plan.duration.medida)}` : ""}
									/>
								}
							>
								PREVISÃO DE CONCLUSÃO
							</FieldLabel>
							<DateTimeInput
								label="PREVISÃO DE CONCLUSÃO"
								showLabel={false}
								holderClassName="h-12 text-base"
								value={formatDateForInputValue(end, "datetime") ?? ""}
								handleChange={(value) => setEnd(parseInputDate(value))}
							/>
						</div>
					</div>
				</ResponsiveMenuSection>
			</BuilderCard>

			<aside className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
				<ResponsiveMenuSection title="RESUMO" icon={<ListChecks className="h-4 w-4" />}>
					<ReviewSummary />
				</ResponsiveMenuSection>
			</aside>
		</div>
	);
}

function SummaryRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="text-xs font-bold uppercase tracking-tight">{label}</p>
			<StaticField>{value}</StaticField>
		</div>
	);
}

function ReviewSummary() {
	const { selection, plan, manualInputsCount, manualOutputsCount } = useBuilder();

	if (selection?.kind === "manual") {
		return (
			<>
				<SummaryRow label="Entradas" value={`${manualInputsCount} ${manualInputsCount === 1 ? "item" : "itens"}`} />
				<SummaryRow label="Saídas" value={`${manualOutputsCount} ${manualOutputsCount === 1 ? "item" : "itens"}`} />
			</>
		);
	}
	if (!plan) return null;

	const saldo = plan.escala.quantidadeSaldo;
	const reduction = plan.escala.reducaoInsumos;
	const validade = plan.saidas[0]?.validade ?? null;

	return (
		<>
			<SummaryRow label="Produzir" value={formatQuantity(plan.escala.quantidadeSaida, plan.unit)} />
			{saldo > 0 ? (
				<SummaryRow
					label="Saldo reincorporado"
					value={`${formatQuantity(saldo, plan.unit)} · ${plan.lot ? (plan.lot.codigoLote ?? "lote sem código") : "sem lote"}`}
				/>
			) : null}
			<SummaryRow label="Insumos" value={`${plan.insumos.length} · ${reduction > 0 ? `reduzidos ${formatPercent(reduction)}` : "conforme receita"}`} />
			<SummaryRow
				label="Validade da saída"
				value={validade ? `${formatDuration(validade.valor, validade.medida)} · ${formatDayMonth(validade.vence)}` : "Sem prazo de validade"}
			/>
			<div className="flex flex-wrap items-center gap-1.5">
				<ValuationChips valores={plan.valores} />
			</div>
		</>
	);
}
