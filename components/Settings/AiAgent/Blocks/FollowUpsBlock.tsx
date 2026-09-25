import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import TextInput from "@/components/Inputs/TextInput";
import type { TUseInternalAiAgentState } from "@/state-hooks/use-internal-ai-agent-state";

type FollowUpsBlockProps = {
	state: TUseInternalAiAgentState["state"];
	updateFollowUpSettings: TUseInternalAiAgentState["updateFollowUpSettings"];
};

/**
 * Retomadas: o agente decide, ao responder, se vale um lembrete caso o cliente suma; aqui a
 * organização decide se ele pode, quantas vezes e em que horário. Desabilitado por padrão — é
 * uma mensagem proativa, e a loja precisa optar por ela.
 */
export default function FollowUpsBlock({ state, updateFollowUpSettings }: FollowUpsBlockProps) {
	const { retomadas } = state.agente.capacidades;

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="flex w-full flex-col gap-4 rounded-lg border border-border bg-card px-4 py-3">
				<CheckboxInput
					checked={retomadas.habilitadas}
					labelTrue="O AGENTE PODE RETOMAR CONVERSAS QUE O CLIENTE ABANDONOU"
					labelFalse="O AGENTE PODE RETOMAR CONVERSAS QUE O CLIENTE ABANDONOU"
					handleChange={(value) => updateFollowUpSettings({ habilitadas: value })}
				/>
				<p className="text-xs text-muted-foreground">
					Quando o agente informa preços, cria um orçamento ou sugere produtos e o cliente some, ele agenda um lembrete. O lembrete só sai se o cliente
					continuar em silêncio: qualquer mensagem dele, um atendente assumindo ou o encerramento do atendimento cancelam a retomada.
				</p>

				{retomadas.habilitadas ? (
					<div className="grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-2">
						<div className="flex flex-col gap-1">
							<NumberInput
								label="RETOMADAS POR ATENDIMENTO"
								placeholder="1"
								value={retomadas.maxPorAtendimento}
								handleChange={(value) => updateFollowUpSettings({ maxPorAtendimento: Math.min(3, Math.max(1, Math.round(value))) })}
							/>
							<p className="text-xs text-muted-foreground">Entre 1 e 3. Um lembrete costuma bastar; três já parece insistência.</p>
						</div>
						<div className="flex flex-col gap-1">
							<NumberInput
								label="ESPERA MÁXIMA (HORAS)"
								placeholder="24"
								value={retomadas.maxAguardarHoras}
								handleChange={(value) => updateFollowUpSettings({ maxAguardarHoras: Math.min(72, Math.max(1, Math.round(value))) })}
							/>
							<p className="text-xs text-muted-foreground">
								Teto do que o agente pode pedir. Na Cloud API da Meta a retomada ainda precisa caber na janela de 24h da última mensagem do cliente.
							</p>
						</div>
						<div className="flex flex-col gap-1">
							<TextInput
								label="HORÁRIO INICIAL"
								placeholder="08:00"
								value={retomadas.horarioInicio}
								handleChange={(value) => updateFollowUpSettings({ horarioInicio: value })}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<TextInput
								label="HORÁRIO FINAL"
								placeholder="20:00"
								value={retomadas.horarioFim}
								handleChange={(value) => updateFollowUpSettings({ horarioFim: value })}
							/>
							<p className="text-xs text-muted-foreground">Fora desta faixa (horário de São Paulo) a retomada é adiada para a próxima abertura.</p>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
