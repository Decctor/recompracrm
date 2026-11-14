"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { cn } from "@/lib/utils";
import { Package, PackageCheck, RefreshCcw, Scale } from "lucide-react";
import { ValuationChips } from "../../../_components/valuation-chips";
import { useBuilder } from "../components/builder-provider";
import { BigToggle, BuilderCard, ItemThumb, OptionTile, OverlineLabel, QuantityStepper, RadioCard, TONE_CLASSES } from "../components/builder-ui";
import { formatDayMonth, formatDuration, formatPercent, formatQuantity, formatQuantityNumber, getItemInitials } from "../helpers/format";
import { getQuantitySteps, type TRecipePlan } from "../helpers/plan";

const QUICK_MULTIPLIERS = [0.5, 1, 2, 3];

export default function StageQuantities() {
	const { plan, quantities, recipeLoading, recipeError, goToStage } = useBuilder();

	if (recipeError) {
		return (
			<BuilderCard className="items-start">
				<p className="text-sm font-medium text-destructive">{recipeError}</p>
				<Button type="button" variant="outline" className="h-11 rounded-full px-5" onClick={() => goToStage("recipe")}>
					ESCOLHER OUTRA RECEITA
				</Button>
			</BuilderCard>
		);
	}

	if (recipeLoading || !plan || !quantities) {
		return (
			<div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_380px]">
				<div className="flex flex-col gap-3.5">
					<Skeleton className="h-[150px] rounded-2xl" />
					<Skeleton className="h-[220px] rounded-2xl" />
				</div>
				<Skeleton className="h-[360px] rounded-2xl" />
			</div>
		);
	}

	return (
		<div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_380px]">
			<div className="flex min-w-0 flex-col gap-3.5">
				<TargetCard plan={plan} target={quantities.target} />
				<ReincorporationCard plan={plan} />
			</div>
			<PreviewPanel plan={plan} />
		</div>
	);
}

function TargetCard({ plan, target }: { plan: TRecipePlan; target: number }) {
	const { setTarget } = useBuilder();
	const step = getQuantitySteps(plan.unit).target;

	return (
		<BuilderCard>
			<ResponsiveMenuSection title="QUANTO PRODUZIR" icon={<Scale className="h-4 w-4" />}>
				<div className="flex flex-wrap items-center gap-3.5">
					<QuantityStepper
						value={target}
						unit={plan.unit}
						step={step}
						min={step}
						onChange={setTarget}
						decreaseLabel="Diminuir"
						increaseLabel="Aumentar"
						inputLabel="Quantidade a produzir"
					/>
					<div className="flex flex-col gap-2">
						{plan.rendimento > 0 ? (
							<div className="flex flex-wrap gap-1.5">
								{QUICK_MULTIPLIERS.map((multiplier) => {
									const value = plan.rendimento * multiplier;
									const active = Math.abs(target - value) < 1e-6;
									return (
										<button
											key={multiplier}
											type="button"
											onClick={() => setTarget(value)}
											aria-pressed={active}
											className={cn(
												"h-12 rounded-full border px-4 text-sm font-semibold transition-colors",
												active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted/40",
											)}
										>
											{multiplier === 0.5 ? "½" : multiplier}× · {formatQuantity(value, plan.unit)}
										</button>
									);
								})}
							</div>
						) : null}
						<span className="text-xs text-muted-foreground">
							{formatQuantityNumber(plan.baseFactor, "KG")}× a receita base · insumos recalculados automaticamente
						</span>
					</div>
				</div>
			</ResponsiveMenuSection>
		</BuilderCard>
	);
}

function ReincorporationCard({ plan }: { plan: TRecipePlan }) {
	const { quantities, updateReinc } = useBuilder();
	if (!quantities || !plan.primaryOutput) return null;
	const { reinc, target } = quantities;
	const unit = plan.unit;
	const outputName = plan.saidas[0]?.nome ?? plan.primaryOutput.produto.nome;
	const saldoStep = getQuantitySteps(unit).saldo;
	const lotOptions = [
		...plan.lots.map((lot) => {
			const vence = formatDayMonth(lot.dataValidade);
			return {
				id: lot.id as string | null,
				title: lot.codigoLote ?? "Lote sem código",
				description: `${formatQuantity(lot.quantidadeAtual, unit)}${vence ? ` · vence ${vence}` : ""}`,
				max: lot.quantidadeAtual,
			};
		}),
		{ id: null, title: "Sem lote específico", description: "Baixa pelo saldo geral", max: plan.maxSaldo },
	];

	return (
		<BuilderCard>
			<div className="flex items-center gap-3">
				<span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", TONE_CLASSES.warn)}>
					<RefreshCcw className="h-5 w-5" />
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="text-base font-bold">Reincorporar saldo</span>
					<span className="text-[13px] leading-snug text-muted-foreground">Use saldo já produzido de {outputName} como insumo desta produção.</span>
				</div>
				{plan.canReincorporate ? (
					<BigToggle
						checked={plan.reincOn}
						label="Reincorporar saldo"
						onChange={(on) => updateReinc(on && reinc.quantidade <= 0 ? { on, quantidade: Math.min(saldoStep, plan.maxSaldo) } : { on })}
					/>
				) : null}
			</div>

			{!plan.canReincorporate ? (
				<p className="text-[13px] italic text-muted-foreground">Nenhum saldo em estoque de {outputName} para reincorporar.</p>
			) : null}

			{plan.reincOn ? (
				<>
					<div className="grid gap-4 border-t border-border pt-3 sm:grid-cols-[auto_minmax(0,1fr)]">
						<div className="flex flex-col gap-1.5">
							<OverlineLabel>Quantidade</OverlineLabel>
							<QuantityStepper
								size="md"
								value={plan.escala.quantidadeSaldo}
								unit={unit}
								step={saldoStep}
								min={0}
								max={plan.maxSaldo}
								onChange={(quantidade) => updateReinc({ quantidade })}
								decreaseLabel="Menos saldo"
								increaseLabel="Mais saldo"
								inputLabel="Quantidade de saldo"
							/>
							<span className="text-xs text-muted-foreground">
								{plan.lot ? `Lote com ${formatQuantity(plan.lot.quantidadeAtual, unit)}` : `Até ${formatQuantity(plan.maxSaldo, unit)} do saldo geral`}
							</span>
						</div>
						<div className="flex min-w-0 flex-col gap-1.5">
							<OverlineLabel>Lote (opcional)</OverlineLabel>
							<div className="flex flex-wrap gap-1.5">
								{lotOptions.map((option) => (
									<OptionTile
										key={option.id ?? "sem-lote"}
										selected={option.id === (plan.lot?.id ?? null)}
										title={option.title}
										description={option.description}
										onClick={() =>
											updateReinc({
												loteId: option.id,
												quantidade: Math.min(reinc.quantidade > 0 ? reinc.quantidade : option.max, option.max),
											})
										}
									/>
								))}
							</div>
						</div>
					</div>
					<div className="grid gap-2 sm:grid-cols-2">
						<RadioCard
							selected={reinc.modo === "MANTER_RENDIMENTO"}
							onClick={() => updateReinc({ modo: "MANTER_RENDIMENTO" })}
							title="Manter rendimento"
							description={`Produz ${formatQuantity(target, unit)}. Os outros insumos diminuem na proporção do saldo.`}
						/>
						<RadioCard
							selected={reinc.modo === "SOMAR_AO_RENDIMENTO"}
							onClick={() => updateReinc({ modo: "SOMAR_AO_RENDIMENTO" })}
							title="Somar ao rendimento"
							description={`Insumos seguem a quantidade. O rendimento sobe para ${formatQuantity(target + plan.escala.quantidadeSaldo, unit)}.`}
						/>
					</div>
				</>
			) : null}
		</BuilderCard>
	);
}

function PreviewPanel({ plan }: { plan: TRecipePlan }) {
	const saldo = plan.escala.quantidadeSaldo;
	const reduction = plan.escala.reducaoInsumos;
	const inputsCount = plan.insumos.length + (saldo > 0 ? 1 : 0);
	const outputName = plan.saidas[0]?.nome ?? "";

	return (
		<aside className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
			<ResponsiveMenuSection
				title="ENTRADAS CONSUMIDAS"
				icon={<Package className="h-4 w-4" />}
				action={
					<span className="text-[0.65rem] font-semibold uppercase text-muted-foreground">
						{inputsCount} {inputsCount === 1 ? "insumo" : "insumos"}
					</span>
				}
			>
				<div className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-border bg-border">
					{saldo > 0 ? (
						<div className="flex min-h-[52px] items-center gap-2.5 bg-warning-surface px-3 py-2">
							<ItemThumb icon={RefreshCcw} tone="warn" />
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="text-sm font-medium">{outputName}</span>
								<span className="text-[11px] text-warning-surface-foreground">
									Saldo · {plan.lot?.codigoLote ?? (plan.lot ? "Lote sem código" : "Sem lote específico")}
								</span>
							</span>
							<span className="whitespace-nowrap text-[15px] font-bold">{formatQuantity(saldo, plan.unit)}</span>
						</div>
					) : null}
					{plan.insumos.map((input) => (
						<div key={input.id} className="flex min-h-[52px] items-center gap-2.5 bg-card px-3 py-2">
							<ItemThumb initials={getItemInitials(input.nome)} />
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="text-sm font-medium">{input.nome}</span>
								{reduction > 0 ? (
									<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
										<span className="line-through">{formatQuantity(input.quantidadeBase, input.unidade)}</span>
										<span className={cn("rounded-full px-1.5 py-px text-[10px] font-bold", TONE_CLASSES.warn)}>−{formatPercent(reduction)}</span>
									</span>
								) : null}
							</span>
							<span className="whitespace-nowrap text-[15px] font-bold">{formatQuantity(input.quantidade, input.unidade)}</span>
						</div>
					))}
				</div>
			</ResponsiveMenuSection>

			<ResponsiveMenuSection title="SAÍDAS PRODUZIDAS" icon={<PackageCheck className="h-4 w-4" />}>
				<div className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-border bg-border">
					{plan.saidas.map((output) => (
						<div key={output.id} className="flex min-h-14 items-center gap-2.5 bg-card px-3 py-2">
							<ItemThumb initials={getItemInitials(output.nome)} />
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="text-sm font-medium">{output.nome}</span>
								<span className="text-[11px] text-muted-foreground">
									{output.validade
										? `Validade ${formatDuration(output.validade.valor, output.validade.medida)} · vence ${formatDayMonth(output.validade.vence)}`
										: "Sem prazo de validade"}
								</span>
							</span>
							<span className="whitespace-nowrap text-[15px] font-bold">{formatQuantity(output.quantidade, output.unidade)}</span>
						</div>
					))}
				</div>
			</ResponsiveMenuSection>

			<div className="flex flex-col gap-1.5">
				<div className="flex flex-wrap items-center gap-1.5">
					<ValuationChips valores={plan.valores} />
				</div>
				<span className="text-[11px] text-muted-foreground">Valores estimados pelos preços atuais do catálogo.</span>
			</div>
		</aside>
	);
}
