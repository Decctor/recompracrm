"use client";
import { OnboardingShell } from "../onboarding/_components/shell/OnboardingShell";
import { JourneyRail } from "../onboarding/_components/shell/JourneyRail";
import { StageHeader } from "../onboarding/_components/shell/StageHeader";
import { EntryStage } from "../onboarding/_components/crm/EntryStage";
import { ErpStages } from "../onboarding/_components/erp/ErpStages";
import { useInternalOnboardingErpState } from "@/state-hooks/use-internal-onboarding-erp-state";
import type { TOnboardingReadiness } from "@/lib/onboarding/readiness";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { useState } from "react";
import { JourneyStory } from "../onboarding/_components/shell/JourneyStory";
import { StageFooter } from "../onboarding/_components/shell/StageFooter";
import { CompanyStage } from "../onboarding/_components/crm/CompanyStage";
import { WhatsappStage } from "../onboarding/_components/crm/WhatsappStage";
import { CashbackStage } from "../onboarding/_components/crm/CashbackStage";
import { CampaignsStage } from "../onboarding/_components/crm/CampaignsStage";
import { DataSourceStage } from "../onboarding/_components/crm/DataSourceStage";
import { getJourneyDefinition, type TOnboardingStageId } from "@/lib/onboarding/journeys";
import { useOrganizationOnboardingState } from "@/state-hooks/use-organization-onboarding-state";
import { Button } from "@/components/ui/button";
const noop = () => {};
const readiness: TOnboardingReadiness = {
	organizacao: { id: "preview", nome: "Loja de exemplo", atuacaoNicho: "VAREJO", dataOnboardingConclusao: null, produtosHabilitados: ["CRM", "ERP"] },
	fonteDados: {
		modo: "INTEGRACAO",
		definida: true,
		poi: { registroAtivo: false, vendasRecentes: 0 },
		integracoes: [
			{
				id: "preview",
				tipo: "BLING",
				apelido: "Loja matriz",
				status: "CONECTADO",
				ultimaSincronizacao: null,
				ultimoErro: null,
				cargaHistorica: {
					jobId: "preview",
					estado: "EM_ANDAMENTO",
					janelaAlvo: { inicio: new Date("2026-06-07"), fim: new Date("2026-09-05") },
					coberturaConcluida: { inicio: new Date("2026-08-15"), fim: new Date("2026-09-05") },
					emProcessamento: null,
					contadores: {
						listados: 200,
						elegiveis: 126,
						ignoradosPorSituacao: 74,
						situacoesDesconhecidas: 0,
						importados: 126,
						atualizados: 0,
						clientesCriados: 65,
						requisicoes: 300,
						rateLimits: 0,
					},
					proximaExecucao: null,
					lacunas: 0,
					acao: { tipo: null, href: null },
				},
			},
		],
	},
	dados: { vendasValidas: 126, clientes: 65, clientesComAniversario: 8, coberturaInicio: new Date("2026-08-15"), coberturaParcial: true, clientesInativos: null },
	cashback: {
		estado: "ATIVO",
		programaId: "p",
		resumo: { acumuloTipo: "PERCENTUAL", acumuloValor: 5, validadeDias: 90, limiteResgate: { tipo: "PERCENTUAL", valor: 20 } },
		saldosComValidade: 10,
	},
	campanhas: [
		{
			id: "c",
			chave: "welcome",
			titulo: "Boas-vindas após a primeira compra",
			estado: "HABILITADA",
			pronta: false,
			dependencias: [
				{ tipo: "TEMPLATE", status: "EM_ANALISE", detalhe: "A Meta está analisando o modelo da sua mensagem.", acao: null },
				{ tipo: "PAGAMENTO", status: "PENDENTE", detalhe: "Confirme a forma de pagamento da conta de WhatsApp.", acao: { rotulo: "Revisar", href: "#" } },
			],
		},
	],
	campanhasManuais: { ativas: 0 },
	whatsapp: { numero: "CONECTADO", tipoConexao: "META_CLOUD_API", oficialConectadoEm: new Date("2026-11-20T12:00:00Z"), telefones: [], pagamento: "DESCONHECIDO", templates: [] },
	erp: {
		acesso: true,
		testeDisponivel: true,
		canal: "BALCAO",
		produtos: ["Café especial", "Pão de queijo", "Bolo da casa", "Suco natural", "Sanduíche"].map((nome, index) => ({
			id: String(index),
			produtoId: String(index),
			nome,
			precoVenda: 5 + index * 3,
		})),
		produtosUtilizaveis: 5,
		lojaDigital: { existe: false, ativa: false, modo: null, configurada: false },
		pontosAtendimento: 0,
		simulacaoConcluida: false,
		pendenciasLancamento: [],
	},
	jornadas: [],
	proximaAcao: {
		chave: "payment",
		rotulo: "Revisar pagamento",
		descricao: "Confirme a forma de pagamento na Meta para liberar suas campanhas.",
		href: "#",
	},
};
export default function Preview() {
	const [produto, setProduto] = useState<"CRM" | "ERP">("CRM");
	const [stage, setStage] = useState<TOnboardingStageId>("whatsapp");
	const erp = useInternalOnboardingErpState("BALCAO");
	const form = useOrganizationOnboardingState({ existingOrganization: null, readiness: null, answers: null });
	const definition = getJourneyDefinition(produto);
	const index = definition.etapas.findIndex((item) => item.id === stage);
	const current = definition.etapas[index] ?? definition.etapas[0];
	function content() {
		switch (stage) {
			case "empresa":
				return (
					<CompanyStage
						state={form.state}
						updateOrganization={form.updateOrganization}
						updateOrganizationLogoHolder={form.updateOrganizationLogoHolder}
						updateOnboarding={form.updateOnboarding}
						isEditing
					/>
				);
			case "whatsapp":
				return <WhatsappStage whatsapp={null} onConnectionChanged={noop} onConfirmPayment={noop} isConfirmingPayment={false} />;
			case "cashback":
			case "incentivo":
				return <CashbackStage cashback={form.state.cashback} updateCashback={form.updateCashback} nicheLabel="Varejo" />;
			case "campanhas":
				return (
					<CampaignsStage
						cashbackAtivo
						selectedKeys={form.state.selectedCampaignKeys}
						toggleCampaign={form.toggleCampaign}
						enableSendingWhenReady={false}
						onToggleEnableSending={noop}
						readiness={null}
					/>
				);
			case "fonte-dados":
				return <DataSourceStage mode={form.state.dataSourceMode} onChangeMode={form.setDataSourceMode} readiness={null} />;
			case "entrada":
				return (
					<EntryStage
						readiness={readiness}
						deferredStages={["whatsapp"]}
						onEnableCampaigns={noop}
						isEnabling={false}
						onComplete={noop}
						isCompleting={false}
					/>
				);
			default:
				return (
					<ErpStages
						stage={stage}
						readiness={readiness}
						user={{} as TAuthUserSession["user"]}
						membership={null}
						erp={erp}
						onRefresh={noop}
						onLaunch={noop}
						isLaunching={false}
					/>
				);
		}
	}
	return (
		<OnboardingShell
			actions={
				<>
					<Button
						variant="ghost"
						onClick={() => {
							setProduto("CRM");
							setStage("whatsapp");
						}}
					>
						CRM
					</Button>
					<Button
						variant="ghost"
						onClick={() => {
							setProduto("ERP");
							setStage("canal");
						}}
					>
						ERP
					</Button>
				</>
			}
			visual={<JourneyStory stage={stage} nome={form.state.organization.nome} produto={produto} currentIndex={index} total={definition.etapas.length} />}
			rail={
				<JourneyRail
					journeyLabel={definition.rotulo}
					stages={definition.etapas.map((item, i) => ({ id: item.id, rotulo: item.rotulo, estado: i === index ? "atual" : "pendente", navegavel: true }))}
					onSelect={(id) => setStage(id as TOnboardingStageId)}
				/>
			}
		>
			<StageHeader eyebrow={current.eyebrow} titulo={current.titulo} descricao={current.descricao} />
			{content()}
			<StageFooter
				canGoBack={index > 0}
				onBack={() => setStage(definition.etapas[index - 1].id)}
				deferLabel={current.adiarRotulo}
				// Como no fluxo real: sem número conectado, a ação principal é a de dentro da etapa.
				continueLabel={stage === "whatsapp" ? null : undefined}
				onDefer={() => setStage(definition.etapas[Math.min(index + 1, definition.etapas.length - 1)].id)}
				onContinue={() => setStage(definition.etapas[Math.min(index + 1, definition.etapas.length - 1)].id)}
				isLoading={false}
			/>
		</OnboardingShell>
	);
}
