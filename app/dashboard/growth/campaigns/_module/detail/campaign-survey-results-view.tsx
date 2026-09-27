"use client";

import ClientHoverCard from "@/components/Clients/ClientHoverCard";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { NewAudience } from "@/components/Modals/Internal/Audiences/NewAudience";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Section } from "@/components/ui/section";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces } from "@/lib/formatting";
import { useCampaignSurveyResults } from "@/lib/queries/campaigns";
import type { TSurveyReplySourceEnum } from "@/schemas/enums";
import { createEmptyFiltersTree } from "@/state-hooks/use-internal-audience-state";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, ListChecks, MessageSquareReply, Send, UserRoundCheck, Users } from "lucide-react";
import { useState } from "react";

const SOURCE_LABELS: Record<TSurveyReplySourceEnum, string> = {
	PAYLOAD: "pelo botão",
	CONTEXTO: "pela mensagem citada",
	TEXTO: "por texto (gateway)",
};

type CampaignSurveyResultsViewProps = {
	campaignId: string;
};

/**
 * Aba "Respostas" da campanha de pesquisa (docs/dev-planning/survey-campaigns-plan.md §8.2): taxa
 * de resposta, distribuição por opção e a ponte para o próximo envio — "Criar público" abre o modal
 * de públicos já filtrado por quem escolheu aquela opção.
 */
export default function CampaignSurveyResultsView({ campaignId }: CampaignSurveyResultsViewProps) {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, error } = useCampaignSurveyResults({ campaignId });
	const [audienceDraft, setAudienceDraft] = useState<{ valor: string; titulo: string } | null>(null);

	if (isLoading) return <LoadingComponent />;
	if (isError || !data) return <ErrorComponent msg={getErrorMessage(error) ?? "Resultados não encontrados."} />;

	const { totais, opcoes, campo, porOrigem, ultimasRespostas } = data;
	const answeredByText = porOrigem.TEXTO;

	return (
		<div className="flex w-full flex-col gap-3">
			{audienceDraft && campo ? (
				<NewAudience
					closeModal={() => setAudienceDraft(null)}
					initialState={{
						audience: { nome: `${campo.titulo}: ${audienceDraft.titulo}`, descricao: `Clientes que responderam "${audienceDraft.titulo}" na pesquisa "${data.campanha.titulo}".` },
						segmentacoes: [],
						filtros: {
							...createEmptyFiltersTree(),
							itens: [{ tipo: "CONDICAO", condicao: { tipo: "CAMPO_PERSONALIZADO", configuracao: { campoId: campo.id, operador: "IGUAL", valores: [audienceDraft.valor] } } }],
						},
					}}
					callbacks={{ onSuccess: () => queryClient.invalidateQueries({ queryKey: ["audiences"] }) }}
				/>
			) : null}

			<div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<StatUnitCard title="ENVIADOS" icon={<Send className="h-4 w-4" />} current={{ value: totais.enviados, format: (n) => n.toLocaleString("pt-BR") }} />
				<StatUnitCard title="ENTREGUES" icon={<CheckCheck className="h-4 w-4" />} current={{ value: totais.entregues, format: (n) => n.toLocaleString("pt-BR") }} />
				<StatUnitCard
					title="RESPONDERAM"
					icon={<UserRoundCheck className="h-4 w-4" />}
					current={{ value: totais.respondentes, format: (n) => n.toLocaleString("pt-BR") }}
					footer={<span className="text-xs text-muted-foreground">{totais.respostas.toLocaleString("pt-BR")} toque(s) no total</span>}
				/>
				<StatUnitCard
					title="TAXA DE RESPOSTA"
					icon={<MessageSquareReply className="h-4 w-4" />}
					current={{ value: totais.taxaResposta, format: (n) => `${formatDecimalPlaces(n, 1)}%` }}
					footer={<span className="text-xs text-muted-foreground">respondentes ÷ enviados</span>}
				/>
			</div>

			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<ListChecks className="h-4 w-4 min-h-4 min-w-4" />
					</Section.Icon>
					<Section.Title>{campo ? campo.titulo.toUpperCase() : "RESPOSTAS"}</Section.Title>
					<Section.Count>{totais.respondentes}</Section.Count>
				</Section.Header>
				<Section.Body>
					{!campo ? (
						<p className="text-sm text-muted-foreground">O campo desta pesquisa não foi encontrado.</p>
					) : (
						<p className="text-xs text-muted-foreground">
							{campo.tipo === "ESCOLHA_MULTIPLA"
								? "Escolha múltipla: cada cliente pode contar em mais de uma opção, então os percentuais não somam 100%."
								: "Escolha única: quando o cliente tocou mais de uma vez, vale a última resposta."}
							{!campo.ativo ? " O campo está inativo: novas respostas ficam registradas no envio, mas não entram em públicos." : null}
						</p>
					)}
					<div className="flex w-full flex-col gap-3">
						{opcoes.map((option) => (
							<div key={option.valor} className="flex w-full flex-col gap-1.5">
								<div className="flex w-full flex-wrap items-center justify-between gap-2">
									<div className="flex min-w-0 items-center gap-2">
										<span className="truncate text-sm font-semibold tracking-tight">{option.titulo}</span>
										{!option.ehBotao ? <span className="text-[10px] uppercase tracking-wide text-muted-foreground">sem botão no template</span> : null}
									</div>
									<div className="flex items-center gap-3">
										<span className="text-sm tabular-nums">
											<strong>{option.respondentes.toLocaleString("pt-BR")}</strong>{" "}
											<span className="text-muted-foreground">({formatDecimalPlaces(option.percentual, 1)}%)</span>
										</span>
										<Button
											type="button"
											size="xs"
											variant="outline"
											className="gap-1 rounded-full"
											disabled={option.respondentes === 0 || !campo}
											onClick={() => setAudienceDraft({ valor: option.valor, titulo: option.titulo })}
										>
											<Users className="h-3.5 w-3.5" />
											CRIAR PÚBLICO
										</Button>
									</div>
								</div>
								<Progress value={option.percentual} className="h-2" />
							</div>
						))}
					</div>
					{answeredByText > 0 ? (
						<p className="text-[11px] text-muted-foreground">
							{answeredByText} resposta(s) chegaram {SOURCE_LABELS.TEXTO}: o gateway interno não devolve o id do botão, então o rótulo foi casado
							com o último envio da pesquisa ao cliente.
						</p>
					) : null}
				</Section.Body>
			</Section.Root>

			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<MessageSquareReply className="h-4 w-4 min-h-4 min-w-4" />
					</Section.Icon>
					<Section.Title>ÚLTIMAS RESPOSTAS</Section.Title>
					<Section.Count>{ultimasRespostas.length}</Section.Count>
				</Section.Header>
				<Section.Bleed>
					{ultimasRespostas.length === 0 ? (
						<p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma resposta ainda.</p>
					) : (
						<ul className="divide-y divide-border">
							{ultimasRespostas.map((reply, index) => (
								<li key={`${reply.clienteId}-${reply.data}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
									<ClientHoverCard clientId={reply.clienteId}>
										<button type="button" className="truncate text-sm font-medium tracking-tight hover:underline">
											{reply.clienteNome ?? "Cliente"}
										</button>
									</ClientHoverCard>
									<div className="flex items-center gap-3 text-xs">
										<span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold text-primary">{reply.opcaoTitulo}</span>
										<span className="text-muted-foreground">
											{formatDateAsLocale(reply.data, true)} · {SOURCE_LABELS[reply.origem]}
										</span>
									</div>
								</li>
							))}
						</ul>
					)}
				</Section.Bleed>
			</Section.Root>
		</div>
	);
}
