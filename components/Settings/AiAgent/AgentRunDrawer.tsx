import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { CodeBlock } from "@/components/ui/code-block";
import { Timeline } from "@/components/ui/timeline";
import { formatUsd } from "@/lib/ai/providers/pricing";
import { getErrorMessage } from "@/lib/errors";
import { useAiAgentRunById } from "@/lib/queries/ai-agents";
import { cn } from "@/lib/utils";
import { formatDateAsLocale, formatJsonForDisplay } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

type AgentRunDrawerProps = {
	runId: string;
	closeModal: () => void;
};

// Tom do marcador na linha do tempo; o ícone herda a cor do texto do marcador.
const TOOL_CALL_STATUS_STYLES = {
	CONCLUIDO: { icon: CheckCircle2, tone: "success", className: "text-white" },
	FALHA: { icon: XCircle, tone: "danger", className: "text-white" },
	EXECUTANDO: { icon: AlertTriangle, tone: "warning", className: "text-warning-foreground" },
} as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <h3 className="text-xs font-medium uppercase tracking-tight text-muted-foreground">{children}</h3>;
}

/** Conveniência local sobre `CodeBlock`: pula o bloco quando não há payload e nomeia a cópia. */
function JsonBlock({ label, value }: { label: string; value: unknown }) {
	if (value === null || value === undefined) return null;
	return (
		<CodeBlock.Root value={formatJsonForDisplay(value)} className="w-full overflow-hidden rounded-md border border-border">
			<CodeBlock.Header className="px-3">
				<CodeBlock.Trigger className="text-xs font-medium text-muted-foreground">{label}</CodeBlock.Trigger>
				<CodeBlock.Copy label={`Copiar ${label.toLowerCase()}`} />
			</CodeBlock.Header>
			<CodeBlock.Content className="max-h-64 border-t border-border px-3 sm:px-3" />
		</CodeBlock.Root>
	);
}

/**
 * Timeline de uma execução: o que o agente consultou, com quais argumentos, o que voltou e o
 * que ele respondeu. É a ferramenta para entender por que o agente disse o que disse.
 */
export default function AgentRunDrawer({ runId, closeModal }: AgentRunDrawerProps) {
	const { data: run, isLoading, isError, error } = useAiAgentRunById({ runId });

	return (
		<ResponsiveMenu
			mode="read-only"
			menuTitle="EXECUÇÃO DO AGENTE"
			menuDescription="Detalhe do que o agente consultou e respondeu."
			closeMenu={closeModal}
			menuCancelButtonText="FECHAR"
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			dialogVariant="lg"
			drawerVariant="lg"
		>
			{run ? (
				<div className="flex w-full flex-col gap-5">
					<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
						<div className="flex flex-col">
							<SectionLabel>STATUS</SectionLabel>
							<span
								className={cn(
									"text-sm font-bold",
									run.status === "CONCLUIDO" && "text-emerald-600",
									run.status === "FALHA" && "text-destructive",
									run.status === "CANCELADO" && "text-muted-foreground",
								)}
							>
								{run.status}
							</span>
						</div>
						<div className="flex flex-col">
							<SectionLabel>ORIGEM</SectionLabel>
							<span className="text-sm font-bold">{run.gatilho === "PLAYGROUND" ? "TESTE" : "WHATSAPP"}</span>
						</div>
						<div className="flex flex-col">
							<SectionLabel>QUANDO</SectionLabel>
							<span className="text-sm font-bold">{formatDateAsLocale(run.dataInsercao, true)}</span>
						</div>
						<div className="flex flex-col">
							<SectionLabel>TOKENS</SectionLabel>
							<span className="text-sm font-bold">{run.uso?.tokensTotal ?? "—"}</span>
						</div>
						<div className="flex flex-col">
							<SectionLabel>CUSTO ESTIMADO</SectionLabel>
							<span className="text-sm font-bold">{formatUsd(run.uso?.custoUsd)}</span>
							{run.uso?.modelo ? <span className="text-xs text-muted-foreground">{run.uso.modelo}</span> : null}
						</div>
					</div>

					{run.erro ? (
						<div className="flex w-full flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
							<SectionLabel>ERRO</SectionLabel>
							<p className="text-sm font-medium text-destructive">{run.erro}</p>
							<p className="text-xs text-muted-foreground">
								Nada foi enviado ao cliente. Verifique as ferramentas habilitadas e os limites do agente; se o erro persistir, reproduza o cenário na aba
								Playground.
							</p>
						</div>
					) : null}

					{run.mensagemEnviada ? (
						<div className="flex w-full flex-col gap-1">
							<SectionLabel>MENSAGEM ENVIADA</SectionLabel>
							<p className="rounded-lg bg-muted px-3 py-2 text-sm">{run.mensagemEnviada.conteudoTexto}</p>
							<span className="text-xs text-muted-foreground">Entrega: {run.mensagemEnviada.statusEntrega}</span>
						</div>
					) : null}

					{run.outputResumo ? (
						<div className="flex w-full flex-col gap-1">
							<SectionLabel>RESUMO DO ATENDIMENTO</SectionLabel>
							<p className="text-sm">{run.outputResumo}</p>
						</div>
					) : null}

					<div className="flex w-full flex-col gap-2">
						<SectionLabel>CONSULTAS FEITAS ({run.chamadasFerramentas.length})</SectionLabel>
						{run.chamadasFerramentas.length === 0 ? (
							<p className="text-sm text-muted-foreground">O agente respondeu sem consultar nada.</p>
						) : (
							<Timeline.Root>
								{run.chamadasFerramentas.map((toolCall) => {
									const style = TOOL_CALL_STATUS_STYLES[toolCall.status] ?? TOOL_CALL_STATUS_STYLES.EXECUTANDO;
									const Icon = style.icon;
									return (
										<Timeline.Item key={toolCall.id}>
											<Timeline.Icon tone={style.tone} className={style.className}>
												<Icon />
											</Timeline.Icon>
											<Timeline.Content className="gap-2">
												<Timeline.Title className="font-mono">{toolCall.ferramentaNome}</Timeline.Title>
												{toolCall.erro ? <Timeline.Description className="text-destructive">{toolCall.erro}</Timeline.Description> : null}
												{toolCall.operacao ? (
													<div className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-xs">
														<span>
															Operação: <strong>{toolCall.operacao.tipo}</strong> · {toolCall.operacao.status} · {toolCall.operacao.chamadas.length} tentativa(s)
														</span>
														{toolCall.operacao.recursoTipo === "VENDA" && toolCall.operacao.recursoId ? (
															<Link
																href={appRoutes.sales.details(toolCall.operacao.recursoId)}
																className="font-medium text-primary underline-offset-4 hover:underline"
															>
																Abrir orçamento
															</Link>
														) : null}
														{toolCall.operacao.erro ? <span className="text-destructive">{toolCall.operacao.erro}</span> : null}
													</div>
												) : null}
												<JsonBlock label="Argumentos" value={toolCall.input} />
												<JsonBlock label="Resultado" value={toolCall.output} />
											</Timeline.Content>
										</Timeline.Item>
									);
								})}
							</Timeline.Root>
						)}
					</div>

					<div className="flex w-full flex-col gap-2 border-t pt-3">
						<JsonBlock label="Configuração usada nesta execução" value={run.configSnapshot} />
						<JsonBlock label="Contexto enviado ao agente" value={run.contextoEntradaSnapshot} />
					</div>
				</div>
			) : null}
		</ResponsiveMenu>
	);
}
