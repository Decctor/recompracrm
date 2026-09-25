"use client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { Bot, ListChecks, MessageSquare } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import AgentConfigForm from "./AiAgent/AgentConfigForm";
import AgentPlayground from "./AiAgent/AgentPlayground";
import AgentRunsList from "./AiAgent/AgentRunsList";

type SettingsAiAgentProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

const AI_AGENT_TABS = ["configuracao", "execucoes", "playground"] as const;
type TAiAgentTab = (typeof AI_AGENT_TABS)[number];

const TABS: Array<{ value: TAiAgentTab; label: string; icon: typeof Bot }> = [
	{ value: "configuracao", label: "Configuração", icon: Bot },
	{ value: "execucoes", label: "Execuções", icon: ListChecks },
	{ value: "playground", label: "Testar", icon: MessageSquare },
];

export default function SettingsAiAgent({ membership }: SettingsAiAgentProps) {
	// Na URL e não em estado local: uma execução investigada é um link que se manda para a equipe.
	const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(AI_AGENT_TABS).withDefault("configuracao"));

	// Mesma capability que os webhooks checam antes de executar o agente: configurar um
	// recurso que não vai rodar seria uma promessa vazia.
	const hasAccess = membership.organizacao.configuracao?.recursos?.iaAtendimento?.acesso === true;
	if (!hasAccess) {
		return (
			<div className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-12 text-center">
				<Bot className="h-8 w-8 text-muted-foreground" />
				<p className="text-sm font-medium">Atendimento com IA não está no seu plano</p>
				<p className="max-w-md text-xs text-muted-foreground">
					Com o agente de IA ativo, seus clientes recebem resposta imediata no WhatsApp — sobre produtos, compras anteriores, saldo de cashback e cupons —
					e a conversa é passada para a equipe quando precisa de uma pessoa. Fale com a gente para habilitar.
				</p>
			</div>
		);
	}

	// A permissão de visualização é checada no shell de configurações, que também trava o item no rail.
	return (
		<div className="flex w-full min-w-0 flex-col gap-6">
			{/* Mesma barra de abas das páginas de módulo (campanhas, atendimentos): o `TabsList` já
			    vem num contêiner que rola na horizontal, então em 360px a barra rola sozinha em vez
			    de empurrar a página inteira para além da viewport — os botões soltos de antes eram
			    `shrink-0` e alargavam o formulário todo. */}
			<Tabs value={tab} onValueChange={(value) => setTab(value as TAiAgentTab)} className="w-full">
				<TabsList variant="page">
					{TABS.map((item) => {
						const Icon = item.icon;
						return (
							<TabsTrigger key={item.value} value={item.value}>
								<Icon className="h-4 min-h-4 w-4 min-w-4" />
								{item.label}
							</TabsTrigger>
						);
					})}
				</TabsList>
			</Tabs>

			{tab === "configuracao" ? <AgentConfigForm /> : null}
			{tab === "execucoes" ? <AgentRunsList /> : null}
			{tab === "playground" ? <AgentPlayground /> : null}
		</div>
	);
}
