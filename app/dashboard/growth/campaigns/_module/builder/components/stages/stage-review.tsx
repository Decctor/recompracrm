"use client";

import { useSurveyCustomFields } from "@/components/MessageTemplates/SurveyButtonEditor";
import { formatToMoney } from "@/lib/formatting";
import { CircleCheck, CircleDashed, ListChecks } from "lucide-react";
import type { ReactNode } from "react";
import { getCategoryById } from "../../helpers/categories";
import { getTriggerMeta } from "../../helpers/triggers";
import type { TStageValidationResult } from "../../helpers/validation";
import { useBuilderCampaign, useBuilderUi } from "../builder-provider";
import { StageShell } from "../stage-shell";
import { cn } from "@/lib/utils";

type StageReviewProps = {
	validation: TStageValidationResult;
	finalLoading: boolean;
	onSubmit: () => void;
};

function ReviewItem({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2">
			<p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
			<div className="text-sm font-medium text-foreground">{children}</div>
		</div>
	);
}

function formatMaybeMoney(value: number | null | undefined) {
	if (typeof value !== "number") return "Não definido";
	return formatToMoney(value);
}

export default function StageReview({ validation, finalLoading, onSubmit }: StageReviewProps) {
	const { selectedCategory, back } = useBuilderUi();
	const { state } = useBuilderCampaign();
	const { campaign } = state;
	const category = getCategoryById(selectedCategory);
	const trigger = getTriggerMeta(campaign.gatilhoTipo);
	const activeSegmentations = state.segmentations.filter((item) => !item.deletar);
	const filterCount = state.filtros.itens.length;
	const { fields: surveyFields } = useSurveyCustomFields();
	const surveyField = campaign.gatilhoTipo === "PESQUISA" ? (surveyFields.find((field) => field.id === campaign.gatilhoPesquisaCampoId) ?? null) : null;

	return (
		<StageShell>
			<StageShell.Title icon={ListChecks} label="Revisão" description="Confira os principais pontos antes de salvar a campanha." />
			<StageShell.Body>
				<div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
					<ReviewItem label="Campanha">
						<div className="flex flex-col gap-1">
							<span>{campaign.titulo || "Sem título"}</span>
							<span className="text-xs font-normal text-muted-foreground">{campaign.descricao || "Sem descrição"}</span>
						</div>
					</ReviewItem>
					<ReviewItem label="Status">
						<span
							className={cn(
								"flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide w-fit",
								campaign.ativo ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground",
							)}
						>
							{campaign.ativo ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
							{campaign.ativo ? "ATIVA" : "RASCUNHO"}
						</span>
					</ReviewItem>
					<ReviewItem label="Categoria">{category?.label ?? "Não definida"}</ReviewItem>
					<ReviewItem label="Gatilho">{trigger?.label ?? campaign.gatilhoTipo}</ReviewItem>
					{campaign.gatilhoTipo === "PESQUISA" ? (
						<ReviewItem label="Pesquisa">
							<div className="flex flex-col gap-1">
								<span>{surveyField ? surveyField.titulo : "Campo da pergunta não definido"}</span>
								<span className="text-xs font-normal text-muted-foreground">
									{surveyField
										? `${(surveyField.opcoes ?? []).length} opções: ${(surveyField.opcoes ?? []).map((option) => option.titulo).join(", ")}`
										: "Volte à etapa de Gatilho para escolher o campo."}
								</span>
							</div>
						</ReviewItem>
					) : null}
					<ReviewItem label="Envio">
						<div className="flex flex-col gap-1">
							<span>Bloco {campaign.execucaoAgendadaBloco ?? "não definido"}</span>
							<span className="text-xs font-normal text-muted-foreground">
								{campaign.whatsappTemplateId ? "Template selecionado" : "Template não selecionado"}
							</span>
						</div>
					</ReviewItem>
					<ReviewItem label="Público">
						<div className="flex flex-col gap-1">
							<span>{activeSegmentations.length} segmentações ativas</span>
							<span className="text-xs font-normal text-muted-foreground">{filterCount} filtros no grupo principal</span>
						</div>
					</ReviewItem>
					<ReviewItem label="Cashback">
						{campaign.cashbackGeracaoAtivo ? (
							<span>
								{campaign.cashbackGeracaoTipo ?? "Tipo não definido"} · {formatMaybeMoney(campaign.cashbackGeracaoValor)}
							</span>
						) : (
							<span>Não gera cashback</span>
						)}
					</ReviewItem>
					<ReviewItem label="Conversão">
						<span>
							{campaign.atribuicaoModelo} · {campaign.atribuicaoJanelaDias ?? 0} dias
						</span>
					</ReviewItem>
				</div>
			</StageShell.Body>
			<StageShell.Footer
				onBack={back}
				isFinalStage
				finalLabel="CRIAR CAMPANHA"
				finalLoading={finalLoading}
				onFinal={onSubmit}
				nextDisabled={!validation.valid}
				nextDisabledReason={validation.reason}
			/>
		</StageShell>
	);
}
