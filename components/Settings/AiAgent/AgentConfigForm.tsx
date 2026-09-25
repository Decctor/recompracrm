import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { updateAiAgent } from "@/lib/mutations/ai-agents";
import { AI_AGENT_QUERY_KEY, useOrganizationAiAgent } from "@/lib/queries/ai-agents";
import { useInternalAiAgentState } from "@/state-hooks/use-internal-ai-agent-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import GeneralBlock from "./Blocks/GeneralBlock";
import InstructionsBlock from "./Blocks/InstructionsBlock";
import KnowledgeBlock from "./Blocks/KnowledgeBlock";
import FollowUpsBlock from "./Blocks/FollowUpsBlock";
import ScopeBlock from "./Blocks/ScopeBlock";
import ToolsBlock from "./Blocks/ToolsBlock";

/**
 * Formulário do agente. Registro singleton por organização, então é uma tela de edição direta
 * — não o par New/Control de modais usado nas entidades de lista.
 */
export default function AgentConfigForm() {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, error } = useOrganizationAiAgent();
	const {
		state,
		updateAgent,
		updateModelConfig,
		updateLimits,
		updateAttendanceSettings,
		updateFollowUpSettings,
		updateScope,
		updatePrices,
		updateQuotes,
		updateStock,
		toggleTool,
		addKnowledgeBlock,
		updateKnowledgeBlock,
		removeKnowledgeBlock,
		redefineState,
	} = useInternalAiAgentState();

	// Hidrata o formulário quando o agente chega (o GET o provisiona no primeiro acesso).
	useEffect(() => {
		if (!data) return;
		redefineState({
			agente: {
				nome: data.agente.nome,
				status: data.agente.status,
				instrucoes: data.agente.instrucoes,
				modeloConfig: data.agente.modeloConfig,
				capacidades: data.agente.capacidades,
				escopo: data.agente.escopo,
			},
			conhecimento: data.conhecimento.map((bloco) => ({
				id: bloco.id,
				titulo: bloco.titulo,
				conteudo: bloco.conteudo,
				ativo: bloco.ativo,
				ordem: bloco.ordem,
			})),
		});
	}, [data, redefineState]);

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-ai-agent"],
		mutationFn: updateAiAgent,
		onSuccess: (response) => {
			toast.success(response.message);
			queryClient.invalidateQueries({ queryKey: AI_AGENT_QUERY_KEY });
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!data) return <ErrorComponent msg="Não foi possível carregar a configuração do agente." />;

	return (
		<div className="flex w-full flex-col gap-8">
			<GeneralBlock state={state} updateAgent={updateAgent} updateModelConfig={updateModelConfig} />

			<div className="flex w-full flex-col gap-4 border-t pt-6">
				<h2 className="text-sm font-bold uppercase tracking-tight">PERSONALIDADE E REGRAS</h2>
				<InstructionsBlock state={state} updateAgent={updateAgent} />
			</div>

			<div className="flex w-full flex-col gap-4 border-t pt-6">
				<h2 className="text-sm font-bold uppercase tracking-tight">O QUE O AGENTE PODE CONSULTAR</h2>
				<ToolsBlock
					state={state}
					diagnosticoComercial={data.diagnosticoComercial}
					toggleTool={toggleTool}
					updateLimits={updateLimits}
					updateAttendanceSettings={updateAttendanceSettings}
					updatePrices={updatePrices}
					updateQuotes={updateQuotes}
					updateStock={updateStock}
				/>
			</div>

			<div className="flex w-full flex-col gap-4 border-t pt-6">
				<h2 className="text-sm font-bold uppercase tracking-tight">RETOMADAS</h2>
				<FollowUpsBlock state={state} updateFollowUpSettings={updateFollowUpSettings} />
			</div>

			<div className="flex w-full flex-col gap-4 border-t pt-6">
				<h2 className="text-sm font-bold uppercase tracking-tight">QUEM O AGENTE ATENDE</h2>
				<ScopeBlock state={state} updateScope={updateScope} />
			</div>

			<div className="flex w-full flex-col gap-4 border-t pt-6">
				<h2 className="text-sm font-bold uppercase tracking-tight">BASE DE CONHECIMENTO</h2>
				<KnowledgeBlock
					state={state}
					addKnowledgeBlock={addKnowledgeBlock}
					updateKnowledgeBlock={updateKnowledgeBlock}
					removeKnowledgeBlock={removeKnowledgeBlock}
				/>
			</div>

			<div className="flex w-full items-center justify-end border-t pt-4">
				<Button size="sm" className="flex items-center gap-2" disabled={isPending} onClick={() => mutate(state)}>
					<Save className="h-4 w-4" />
					{isPending ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
				</Button>
			</div>
		</div>
	);
}
