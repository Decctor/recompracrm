import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import { Switch } from "@/components/ui/switch";
import type { TAiAgentToolNameEnum } from "@/schemas/enums";
import type { TUseInternalAiAgentState } from "@/state-hooks/use-internal-ai-agent-state";

type ToolsBlockProps = {
	state: TUseInternalAiAgentState["state"];
	toggleTool: TUseInternalAiAgentState["toggleTool"];
	updateLimits: TUseInternalAiAgentState["updateLimits"];
	updateAttendanceSettings: TUseInternalAiAgentState["updateAttendanceSettings"];
	updatePrices: TUseInternalAiAgentState["updatePrices"];
	updateQuotes: TUseInternalAiAgentState["updateQuotes"];
	updateStock: TUseInternalAiAgentState["updateStock"];
	diagnosticoComercial: {
		itensAtivos: number;
		aptos: number;
		semPreco: number;
		semCusto: number;
		comAdicionais: number;
		semRastreamento: number;
		esgotados: number;
	};
};

/**
 * As ferramentas são descritas pelo que o cliente consegue perguntar, não pelo nome técnico —
 * é assim que quem configura decide se faz sentido ligar cada uma.
 */
const TOOLS: Array<{ name: TAiAgentToolNameEnum; title: string; description: string }> = [
	{
		name: "clientes.consultar_compras",
		title: "Histórico de compras",
		description: 'Responde "o que eu comprei da última vez?" e reconhece o perfil do cliente (ticket médio, produtos favoritos).',
	},
	{
		name: "produtos.consultar",
		title: "Catálogo de produtos",
		description: 'Responde "vocês têm esse produto?" e "quanto custa?", com preço e variações do seu catálogo.',
	},
	{
		name: "orcamentos.criar",
		title: "Criar orçamentos",
		description: "Cria um orçamento com preços e custos validados pelo servidor. Não confirma a venda nem reserva estoque.",
	},
	{
		name: "cashback.consultar",
		title: "Cashback",
		description: 'Responde "quanto tenho de saldo?" e explica as regras do seu programa. Requer um programa de cashback ativo.',
	},
	{
		name: "cupons.consultar",
		title: "Cupons",
		description: 'Responde "tenho algum cupom?" e confere se um código específico ainda vale para aquele cliente.',
	},
	{
		name: "atendimento.transferir_para_humano",
		title: "Transferir para atendente",
		description: "Passa a conversa para uma pessoa da equipe quando o cliente pede ou quando o assunto exige decisão comercial.",
	},
];

export default function ToolsBlock({
	state,
	diagnosticoComercial,
	toggleTool,
	updateLimits,
	updateAttendanceSettings,
	updatePrices,
	updateQuotes,
	updateStock,
}: ToolsBlockProps) {
	const { ferramentas, comercial, limites, atendimento } = state.agente.capacidades;
	const stockHidden = comercial.estoque.visibilidade === "OCULTO";

	return (
		<div className="flex w-full flex-col gap-6">
			<div className="flex w-full flex-col gap-2">
				{TOOLS.map((tool) => (
					<div key={tool.name} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
						<div className="flex flex-col">
							<h3 className="text-sm font-bold tracking-tight">{tool.title}</h3>
							<p className="text-xs text-muted-foreground">{tool.description}</p>
						</div>
						<Switch
							checked={ferramentas[tool.name]?.habilitada === true}
							onCheckedChange={(checked) => toggleTool(tool.name, checked)}
							aria-label={tool.title}
						/>
					</div>
				))}
			</div>

			<div className="flex w-full flex-col gap-4 border-t pt-4">
				<div className="flex flex-col gap-1">
					<h3 className="text-xs font-medium uppercase tracking-tight text-muted-foreground">RECURSOS COMERCIAIS</h3>
					<p className="text-xs text-muted-foreground">
						{diagnosticoComercial.aptos} de {diagnosticoComercial.itensAtivos} itens ativos estão aptos para orçamento. {diagnosticoComercial.semPreco} sem
						preço, {diagnosticoComercial.semCusto} sem custo cadastrado e {diagnosticoComercial.comAdicionais} com adicionais ainda não suportados.
					</p>
				</div>

				<div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
					<div className="flex flex-col">
						<h3 className="text-sm font-bold tracking-tight">Exibir preços de venda</h3>
						<p className="text-xs text-muted-foreground">Quando desativado, o agente consulta o catálogo sem informar valores.</p>
					</div>
					<Switch
						checked={comercial.precos.visiveis}
						onCheckedChange={(checked) => updatePrices({ visiveis: checked })}
						aria-label="Exibir preços de venda"
					/>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-1">
						<SelectInput
							label="O QUE O AGENTE DIZ SOBRE ESTOQUE"
							value={comercial.estoque.visibilidade}
							resetOptionLabel="Selecione uma opção"
							options={[
								{ id: "OCULTO", value: "OCULTO", label: "Nada — a equipe confirma" },
								{ id: "DISPONIBILIDADE", value: "DISPONIBILIDADE", label: "Se tem ou não tem" },
								{ id: "QUANTIDADE", value: "QUANTIDADE", label: "Quantidade exata em estoque" },
							]}
							handleChange={(value) => updateStock({ visibilidade: value as "OCULTO" | "DISPONIBILIDADE" | "QUANTIDADE" })}
							onReset={() => updateStock({ visibilidade: "OCULTO" })}
						/>
						<p className="text-xs text-muted-foreground">
							Itens sem controle de saldo nunca são apresentados como disponíveis nem em falta. Hoje {diagnosticoComercial.semRastreamento} de{" "}
							{diagnosticoComercial.itensAtivos} itens ativos não têm rastreamento de estoque e {diagnosticoComercial.esgotados} estão com saldo zerado.
						</p>
					</div>

					<div className="flex flex-col gap-1">
						<SelectInput
							label="QUANDO O PEDIDO PASSAR DO SALDO"
							value={comercial.estoque.excedente}
							resetOptionLabel="Selecione uma ação"
							options={[
								{ id: "PERMITIR", value: "PERMITIR", label: "Seguir sem conferir" },
								// Avisar exige que o agente possa falar de estoque — a opção sai da lista em vez
								// de ser rebaixada em silêncio depois da escolha.
								...(stockHidden ? [] : [{ id: "AVISAR", value: "AVISAR", label: "Criar e avisar o cliente" }]),
								{ id: "BLOQUEAR", value: "BLOQUEAR", label: "Não criar o orçamento" },
							]}
							handleChange={(value) => updateStock({ excedente: value as "PERMITIR" | "AVISAR" | "BLOQUEAR" })}
							onReset={() => updateStock({ excedente: "PERMITIR" })}
						/>
						<p className="text-xs text-muted-foreground">
							{stockHidden
								? 'Avisar o cliente exige que o agente possa falar de estoque. Escolha uma opção acima de "Nada".'
								: "Vale para os orçamentos criados pelo agente. Itens sem controle de saldo nunca bloqueiam."}
						</p>
					</div>
				</div>

				{ferramentas["orcamentos.criar"]?.habilitada ? (
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<SelectInput
							label="QUANDO UM ITEM BLOQUEAR O ORÇAMENTO"
							value={comercial.orcamentos.bloqueio}
							resetOptionLabel="Selecione uma ação"
							options={[
								{ id: "TRANSFERIR", value: "TRANSFERIR", label: "Transferir para atendente" },
								{ id: "INFORMAR", value: "INFORMAR", label: "Informar indisponibilidade" },
							]}
							handleChange={(value) => updateQuotes({ bloqueio: value as "TRANSFERIR" | "INFORMAR" })}
							onReset={() => updateQuotes({ bloqueio: "TRANSFERIR" })}
						/>
						<div className="flex flex-col justify-center rounded-lg border border-border bg-muted/30 px-4 py-3">
							<p className="text-xs font-medium">CUSTO AUSENTE</p>
							<p className="text-xs text-muted-foreground">Quando não estiver disponível, o custo será registrado como zero.</p>
						</div>
					</div>
				) : null}

				<p className="text-xs text-muted-foreground">O agente nunca informa preço de custo, margem ou markup ao cliente.</p>
			</div>

			<div className="flex w-full flex-col gap-4 border-t pt-4">
				<h3 className="text-xs font-medium uppercase tracking-tight text-muted-foreground">LIMITES</h3>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-1">
						<SelectInput
							label="QUANDO O AGENTE RESPONDE"
							value={atendimento.modo}
							resetOptionLabel="Selecione"
							options={[
								{ id: "IMEDIATO", value: "IMEDIATO", label: "Na hora" },
								{ id: "RESERVA", value: "RESERVA", label: "Só se a equipe não responder" },
							]}
							handleChange={(value) => updateAttendanceSettings({ modo: value as "IMEDIATO" | "RESERVA" })}
							onReset={() => updateAttendanceSettings({ modo: "IMEDIATO" })}
						/>
						<p className="text-xs text-muted-foreground">
							{atendimento.modo === "RESERVA"
								? "O agente espera a equipe. Se alguém responder pelo hub ou pelo celular da loja dentro da espera, ele não entra."
								: "O agente responde assim que a espera abaixo termina, mesmo com a equipe online."}
						</p>
					</div>

					{atendimento.modo === "RESERVA" ? (
						<div className="flex flex-col gap-1">
							<NumberInput
								label="ESPERA PELA EQUIPE (MINUTOS)"
								placeholder="3"
								value={Math.round(atendimento.esperaHumanoMs / 60000)}
								handleChange={(value) => updateAttendanceSettings({ esperaHumanoMs: Math.min(5, Math.max(1, Math.round(value))) * 60000 })}
							/>
							<p className="text-xs text-muted-foreground">Entre 1 e 5 minutos sem resposta da equipe antes de o agente assumir.</p>
						</div>
					) : null}
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<div className="flex flex-col gap-1">
						<NumberInput
							label="ESPERA ANTES DE RESPONDER (SEGUNDOS)"
							placeholder="5"
							value={Math.round(atendimento.atrasoRespostaMs / 1000)}
							handleChange={(value) => updateAttendanceSettings({ atrasoRespostaMs: Math.min(60, Math.max(0, value)) * 1000 })}
						/>
						<p className="text-xs text-muted-foreground">Agrupa mensagens enviadas em sequência antes de responder.</p>
					</div>

					<div className="flex flex-col gap-1">
						<NumberInput
							label="CONSULTAS POR RESPOSTA"
							placeholder="15"
							value={limites.maxChamadasFerramentasPorRun}
							handleChange={(value) => updateLimits({ maxChamadasFerramentasPorRun: Math.min(30, Math.max(1, Math.round(value))) })}
						/>
						<p className="text-xs text-muted-foreground">Quantas buscas o agente pode fazer para montar uma resposta.</p>
					</div>

					<div className="flex flex-col gap-1">
						<NumberInput
							label="RESPOSTAS POR DIA"
							placeholder="500"
							value={limites.maxRunsDiarios}
							handleChange={(value) => updateLimits({ maxRunsDiarios: Math.max(1, Math.round(value)) })}
						/>
						<p className="text-xs text-muted-foreground">Teto diário de segurança. Atingido o limite, o agente para até o dia seguinte.</p>
					</div>
				</div>
			</div>
		</div>
	);
}
