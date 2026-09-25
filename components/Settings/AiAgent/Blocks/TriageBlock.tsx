import CheckboxInput from "@/components/Inputs/CheckboxInput";
import type { TUseInternalAiAgentState } from "@/state-hooks/use-internal-ai-agent-state";

type TriageBlockProps = {
	state: TUseInternalAiAgentState["state"];
	updateTriageSettings: TUseInternalAiAgentState["updateTriageSettings"];
};

/**
 * Triagem pré-run: um classificador barato (Jev) lê a última mensagem antes de o agente rodar e
 * decide se vale o turno completo. Cada gate tem a sua chave porque cada um tem um risco
 * diferente: pular uma resposta é irreversível; o modelo econômico ainda responde.
 */
export default function TriageBlock({ state, updateTriageSettings }: TriageBlockProps) {
	const { triagem } = state.agente.capacidades;

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="flex w-full flex-col gap-4 rounded-lg border border-border bg-card px-4 py-3">
				<CheckboxInput
					checked={triagem.habilitada}
					labelTrue="TRIAGEM ANTES DE CADA RESPOSTA"
					labelFalse="TRIAGEM ANTES DE CADA RESPOSTA"
					handleChange={(value) => updateTriageSettings({ habilitada: value })}
				/>
				<p className="text-xs text-muted-foreground">
					Um classificador rápido lê a mensagem do cliente antes do agente e decide se ela precisa de resposta, se é para a equipe e que tipo de pedido é.
					Custa uma fração de centavo e evita rodar o modelo principal em "ok", "obrigado" e reclamações. A categoria do atendimento nas estatísticas vem
					daqui.
				</p>

				{triagem.habilitada ? (
					<div className="flex flex-col gap-3 border-t pt-4">
						<div className="flex flex-col gap-1">
							<CheckboxInput
								checked={triagem.pularSemResposta}
								labelTrue="NÃO RESPONDER A ENCERRAMENTOS"
								labelFalse="NÃO RESPONDER A ENCERRAMENTOS"
								handleChange={(value) => updateTriageSettings({ pularSemResposta: value })}
							/>
							<p className="text-xs text-muted-foreground">"Ok", "obrigado", "combinado", emoji ou figurinha sem pergunta nova não recebem resposta.</p>
						</div>
						<div className="flex flex-col gap-1">
							<CheckboxInput
								checked={triagem.handoffDireto}
								labelTrue="ENCAMINHAR RECLAMAÇÕES DIRETO À EQUIPE"
								labelFalse="ENCAMINHAR RECLAMAÇÕES DIRETO À EQUIPE"
								handleChange={(value) => updateTriageSettings({ handoffDireto: value })}
							/>
							<p className="text-xs text-muted-foreground">
								Reclamações, negociações e perguntas dirigidas a alguém da equipe vão para um atendente sem o agente responder. Só vale com a transferência
								para atendente habilitada.
							</p>
						</div>
						<div className="flex flex-col gap-1">
							<CheckboxInput
								checked={triagem.modeloEconomico}
								labelTrue="MODELO ECONÔMICO EM PEDIDOS SIMPLES"
								labelFalse="MODELO ECONÔMICO EM PEDIDOS SIMPLES"
								handleChange={(value) => updateTriageSettings({ modeloEconomico: value })}
							/>
							<p className="text-xs text-muted-foreground">
								Saudações, status de pedido e cashback rodam no modelo rápido. Preço, orçamento e reclamação continuam no modelo configurado acima.
							</p>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
