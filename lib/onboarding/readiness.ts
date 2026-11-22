import { getActiveDataSourceIntegrations, type TDataSourceIntegrationType } from "@/lib/integrations/data-sources";
import { getValidSaleConditions } from "@/lib/sales/valid-sale";
import { getImportJobProgress, type TImportJobProgress } from "@/lib/integrations/import-jobs/progress";
import { resolveHistoricalCoverage } from "@/lib/integrations/import-jobs/coverage";
import { integrationImportJobs } from "@/services/drizzle/schema/integration-import-jobs";
import { getLaunchChecklist, type TErpChannel } from "./erp-channels";
import { getUsableOnboardingProducts } from "./erp-catalog";
import { normalizeShopSettingsConfiguration } from "@/lib/shop/config";
import { resolveInactivityCutoff } from "./impact";
import { getStageDefinition } from "./journeys";
import { isSalesSourceDefined, POI_RECENT_SALES_DAYS, resolveDataSourceMode, type TDataSourceMode } from "./data-source-mode";
import { resolvePhoneNumberState, resolveWhatsappNumberState, type TWhatsappNumberState } from "@/lib/whatsapp/meta-access";
import type { TOnboardingCampaignStateEnum, TOnboardingProductEnum, TWhatsappPaymentStatusEnum } from "@/schemas/enums";
import type { TMessageTemplateMetadata } from "@/schemas/message-templates";
import type { DB, DBTransaction } from "@/services/drizzle";
import {
	campaigns,
	cashbackProgramBalances,
	clients,
	messageTemplates,
	organizationOnboardings,
	organizations,
	sales,
	servicePoints,
	shopSettings,
	whatsappConnections,
	type TOrganizationOnboardingEntity,
} from "@/services/drizzle/schema";
import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, min, sql } from "drizzle-orm";
import {
	isCampaignReady,
	resolveCampaignDependencies,
	resolveOnboardingCampaignState,
	type TCampaignDependencyContext,
	type TOnboardingCampaignDependency,
	type TOnboardingCampaignRow,
} from "./campaign-dependencies";

export type TOnboardingReadinessExecutor = DB | DBTransaction;

export type TOnboardingWhatsappNumberState = TWhatsappNumberState;

export type TOnboardingNextAction = { chave: string; rotulo: string; descricao: string; href: string };

export type TOnboardingReadiness = {
	organizacao: {
		id: string;
		nome: string;
		atuacaoNicho: string | null;
		dataOnboardingConclusao: Date | null;
		produtosHabilitados: TOnboardingProductEnum[];
	};
	fonteDados: {
		/** Ver `resolveDataSourceMode`: o registro do balcão ligado sozinho não é escolha da loja. */
		modo: TDataSourceMode;
		/** Há por onde as vendas entrarem: `modo` diferente de NENHUMA ou o PDV do ERP. */
		definida: boolean;
		poi: { registroAtivo: boolean; vendasRecentes: number };
		integracoes: Array<{
			id: string;
			tipo: TDataSourceIntegrationType;
			apelido: string | null;
			status: "CONECTADO" | "EXPIRADO" | "ERRO";
			ultimaSincronizacao: Date | null;
			ultimoErro: string | null;
			cargaHistorica: TImportJobProgress | null;
		}>;
	};
	dados: {
		vendasValidas: number;
		clientes: number;
		clientesComAniversario: number;
		coberturaInicio: Date | null;
		coberturaParcial: boolean;
		/**
		 * Clientes que não compram há mais de 60 dias e quanto somam nas vendas da plataforma. Null quando
		 * a cobertura não permite afirmar ausência de compra (lib/onboarding/impact.ts).
		 */
		clientesInativos: { clientes: number; valorTotal: number } | null;
	};
	cashback: {
		estado: "NAO_CONFIGURADO" | "CONFIGURADO_INATIVO" | "ATIVO";
		programaId: string | null;
		resumo: {
			acumuloTipo: "FIXO" | "PERCENTUAL";
			acumuloValor: number;
			validadeDias: number;
			limiteResgate: { tipo: "FIXO" | "PERCENTUAL"; valor: number } | null;
		} | null;
		saldosComValidade: number;
	};
	campanhas: Array<{
		id: string;
		chave: string;
		titulo: string;
		estado: TOnboardingCampaignStateEnum;
		pronta: boolean;
		dependencias: TOnboardingCampaignDependency[];
	}>;
	/** Campanhas criadas fora do onboarding (sem `chavePreset`). As de cima são só as semeadas. */
	campanhasManuais: { ativas: number };
	whatsapp: {
		numero: TOnboardingWhatsappNumberState;
		tipoConexao: "META_CLOUD_API" | "INTERNAL_GATEWAY" | null;
		/** Primeira conexão oficial (Meta) ainda utilizável; reconectar reaproveita a linha. */
		oficialConectadoEm: Date | null;
		telefones: Array<{ id: string; nome: string; numero: string; pagamento: TWhatsappPaymentStatusEnum | "NAO_APLICAVEL" }>;
		pagamento: TWhatsappPaymentStatusEnum | "NAO_APLICAVEL";
		templates: Array<{ id: string; nome: string; status: "RASCUNHO" | "EM_ANALISE" | "APROVADO" | "REJEITADO" | "PAUSADO" }>;
	};
	erp: {
		acesso: boolean;
		testeDisponivel: boolean;
		canal: TErpChannel | null;
		produtos: Array<{ id: string; produtoId: string; nome: string; precoVenda: number }>;
		produtosUtilizaveis: number;
		lojaDigital: { existe: boolean; ativa: boolean; modo: string | null; configurada: boolean };
		pendenciasLancamento: Array<{ chave: string; rotulo: string; href: string }>;
		pontosAtendimento: number;
		simulacaoConcluida: boolean;
	};
	jornadas: TOrganizationOnboardingEntity[];
	proximaAcao: TOnboardingNextAction | null;
};

function summarizeTemplateStatus(
	template: { status: "RASCUNHO" | "ATIVO" | "ARQUIVADO"; metadados: TMessageTemplateMetadata },
	telefoneId: string | null,
): TOnboardingReadiness["whatsapp"]["templates"][number]["status"] {
	const perPhone = telefoneId ? template.metadados.porNumeroTelefone?.[telefoneId] : undefined;
	switch (perPhone?.status) {
		case "APROVADO":
			return "APROVADO";
		case "PENDENTE":
			return "EM_ANALISE";
		case "REJEITADO":
			return "REJEITADO";
		case "PAUSADO":
		case "DESABILITADO":
			return "PAUSADO";
		default:
			return "RASCUNHO";
	}
}

function resolveNextAction(readiness: Omit<TOnboardingReadiness, "proximaAcao">): TOnboardingNextAction | null {
	const brokenIntegration = readiness.fonteDados.integracoes.find((integration) => integration.status !== "CONECTADO");
	if (brokenIntegration) {
		return {
			chave: "reconectar-integracao",
			rotulo: "Reconectar integração",
			descricao: `A conexão com ${brokenIntegration.apelido ?? brokenIntegration.tipo} precisa de atenção para as vendas continuarem entrando.`,
			href: "/dashboard/settings?view=integration",
		};
	}
	if (readiness.whatsapp.pagamento === "PENDENTE") {
		return {
			chave: "pagamento-whatsapp",
			rotulo: "Resolver pagamento na Meta",
			descricao: "A Meta recusou um envio por falta de forma de pagamento. Os envios ficam pausados até resolver.",
			href: "/dashboard/settings?view=meta-oauth",
		};
	}
	const rejected = readiness.whatsapp.templates.find((template) => template.status === "REJEITADO");
	if (rejected) {
		return {
			chave: "template-rejeitado",
			rotulo: "Corrigir template",
			descricao: `O template "${rejected.nome}" foi rejeitado pela Meta. Ajuste o texto e envie de novo.`,
			href: "/dashboard/settings?view=message-templates",
		};
	}
	const readyToEnable = readiness.campanhas.find((campaign) => campaign.estado === "PRONTA");
	if (readyToEnable) {
		return {
			chave: "liberar-campanha",
			rotulo: "Liberar envios",
			descricao: `"${readyToEnable.titulo}" está pronta. Ela só começa a enviar quando você liberar.`,
			href: "/dashboard/growth/campaigns",
		};
	}
	const waitingOnUser = readiness.campanhas
		.filter((campaign) => campaign.estado === "HABILITADA" || campaign.estado === "ATIVA")
		.flatMap((campaign) =>
			campaign.dependencias.filter((dependency) => dependency.status !== "OK" && dependency.status !== "NAO_APLICAVEL" && dependency.acao),
		)
		.find((dependency) => dependency.tipo !== "LIBERACAO");
	if (waitingOnUser?.acao) {
		return {
			chave: `dependencia-${waitingOnUser.tipo.toLowerCase()}`,
			rotulo: waitingOnUser.acao.rotulo,
			descricao: waitingOnUser.detalhe ?? "Uma campanha preparada depende desta ação.",
			href: waitingOnUser.acao.href,
		};
	}
	for (const journey of readiness.jornadas) {
		for (const stageId of journey.etapasAdiadas) {
			const stage = getStageDefinition(journey.produto, stageId);
			if (!stage || stage.isComplete(readiness as TOnboardingReadiness, journey)) continue;
			return { chave: `retomar-${stageId}`, rotulo: `Retomar: ${stage.rotulo}`, descricao: "Esta etapa ficou para depois. Você pode continuar de onde parou.", href: `/onboarding?produto=${journey.produto}&retomar=true&etapa=${stageId}` };
		}
	}
	if (readiness.jornadas.length && !readiness.jornadas.some((journey) => journey.produto === "CRM")) {
		const pending = readiness.erp.pendenciasLancamento[0];
		return pending ? { chave: pending.chave, rotulo: "Preparar canal", descricao: pending.rotulo, href: "/onboarding?produto=ERP&retomar=true" } : null;
	}
	if (!readiness.fonteDados.definida) {
		return {
			chave: "fonte-dados",
			rotulo: "Definir de onde vêm as vendas",
			descricao: "Conecte um sistema ou registre vendas no balcão para a base começar a se formar.",
			href: "/dashboard/settings?view=integration",
		};
	}
	if (readiness.cashback.estado === "NAO_CONFIGURADO") {
		return {
			chave: "cashback",
			rotulo: "Preparar o cashback",
			descricao: "Um incentivo para a próxima compra, com a sugestão do seu segmento como ponto de partida.",
			href: "/dashboard/growth/cashback",
		};
	}
	return null;
}

export async function getOnboardingReadiness({
	executor,
	organizationId,
}: {
	executor: TOnboardingReadinessExecutor;
	organizationId: string;
}): Promise<TOnboardingReadiness> {
	const organization = await executor.query.organizations.findFirst({
		where: eq(organizations.id, organizationId),
		columns: { id: true, nome: true, atuacaoNicho: true, configuracao: true, poiConfiguracao: true, dataOnboardingConclusao: true, periodoTesteFim: true, stripeSubscriptionId: true },
	});
	if (!organization) throw new Error("Organização não encontrada.");
	const now = new Date();

	const [
		integrations,
		[salesRow],
		[clientsRow],
		[birthdayRow],
		cashbackProgram,
		presetCampaigns,
		connections,
		shop,
		[servicePointsRow],
		journeys,
		[poiSalesRow],
		[manualCampaignsRow],
	] = await Promise.all([
		getActiveDataSourceIntegrations({ executor, organizationId }),
		executor
			.select({ total: count(), primeira: min(sales.dataVenda) })
			.from(sales)
			.where(and(...getValidSaleConditions({ orgId: organizationId }))),
		executor.select({ total: count() }).from(clients).where(eq(clients.organizacaoId, organizationId)),
		executor
			.select({ total: count() })
			.from(clients)
			.where(and(eq(clients.organizacaoId, organizationId), isNotNull(clients.dataNascimento))),
		executor.query.cashbackPrograms.findFirst({
			where: (fields, { eq: equals }) => equals(fields.organizacaoId, organizationId),
			columns: {
				id: true,
				ativo: true,
				acumuloTipo: true,
				acumuloValor: true,
				expiracaoRegraValidadeValor: true,
				resgateLimiteTipo: true,
				resgateLimiteValor: true,
			},
		}),
		executor
			.select({
				id: campaigns.id,
				chavePreset: campaigns.chavePreset,
				titulo: campaigns.titulo,
				ativo: campaigns.ativo,
				whatsappTemplateId: campaigns.whatsappTemplateId,
				whatsappConexaoTelefoneId: campaigns.whatsappConexaoTelefoneId,
			})
			.from(campaigns)
			.where(and(eq(campaigns.organizacaoId, organizationId), isNotNull(campaigns.chavePreset))),
		executor.query.whatsappConnections.findMany({
			where: eq(whatsappConnections.organizacaoId, organizationId),
			columns: { id: true, tipoConexao: true, dataExpiracao: true, gatewayStatus: true, dataInsercao: true },
			with: { telefones: { columns: { id: true, nome: true, numero: true, metadados: true } } },
		}),
		executor.query.shopSettings.findFirst({
			where: eq(shopSettings.organizacaoId, organizationId),
			columns: { ativo: true, modo: true, configuracoes: true },
		}),
		executor
			.select({ total: count() })
			.from(servicePoints)
			.where(and(eq(servicePoints.organizacaoId, organizationId), eq(servicePoints.ativo, true))),
		executor.query.organizationOnboardings.findMany({ where: eq(organizationOnboardings.organizacaoId, organizationId) }),
		// Venda do Ponto de Interação: processamento interno sem canal (PDV, comanda e loja gravam o seu).
		executor
			.select({ total: count() })
			.from(sales)
			.where(
				and(
					...getValidSaleConditions({ orgId: organizationId }),
					eq(sales.processamentoOrigem, "INTERNO"),
					isNull(sales.canal),
					gte(sales.dataVenda, new Date(now.getTime() - POI_RECENT_SALES_DAYS * 24 * 60 * 60 * 1000)),
				),
			),
		executor
			.select({ total: count() })
			.from(campaigns)
			.where(and(eq(campaigns.organizacaoId, organizationId), isNull(campaigns.chavePreset), eq(campaigns.ativo, true))),
	]);

	const balancesWithValidity = cashbackProgram
		? await executor
				.select({ total: count() })
				.from(cashbackProgramBalances)
				.where(and(eq(cashbackProgramBalances.organizacaoId, organizationId), gt(cashbackProgramBalances.saldoValorDisponivel, 0)))
		: [{ total: 0 }];
	const importJobs = await executor.select().from(integrationImportJobs).where(eq(integrationImportJobs.organizacaoId, organizationId)).orderBy(desc(integrationImportJobs.dataInicio));
	const coverage = integrations.length ? resolveHistoricalCoverage(integrations.map((integration) => importJobs.filter((job) => job.integracaoId === integration.id && job.coberturaInicio).map((job) => ({ inicio: job.coberturaInicio!, fim: job.janelaAlvoFim })))) : null;
	const partialCoverage = integrations.some((integration) => {
		const latest = importJobs.find((job) => job.integracaoId === integration.id);
		return !latest || latest.estado !== "CONCLUIDO";
	});

	const templateIds = Array.from(new Set(presetCampaigns.map((campaign) => campaign.whatsappTemplateId).filter((id): id is string => !!id)));
	const templates =
		templateIds.length > 0
			? await executor.query.messageTemplates.findMany({
					where: and(eq(messageTemplates.organizacaoId, organizationId), inArray(messageTemplates.id, templateIds)),
					columns: { id: true, nome: true, status: true, metadados: true },
				})
			: [];
	const templatesById = new Map(templates.map((template) => [template.id, { status: template.status, metadados: template.metadados }]));

	const poiRegistroAtivo = organization.poiConfiguracao?.vendas?.registroAtivo === true;
	const poiVendasRecentes = poiSalesRow?.total ?? 0;
	const crmAnswers = journeys.find((journey) => journey.produto === "CRM")?.respostas ?? null;
	const fonteDadosModo = resolveDataSourceMode({
		integracoesAtivas: integrations.length,
		poiRegistroAtivo,
		modoDeclarado: crmAnswers?.fonteDadosModo ?? null,
		vendasPoiRecentes: poiVendasRecentes,
	});
	const poiEmUso = fonteDadosModo === "POI" || fonteDadosModo === "AMBOS";

	const coverageStart = coverage ?? (integrations.length === 0 && poiEmUso ? (salesRow?.primeira ?? null) : null);
	const inactivityCutoff = resolveInactivityCutoff({ coberturaInicio: coverageStart, coberturaParcial: partialCoverage, now });
	const [inactiveRow] = inactivityCutoff
		? await executor
				.select({ total: count(), valor: sql<number>`coalesce(sum(${clients.metadataValorTotalCompras}), 0)` })
				.from(clients)
				.where(and(eq(clients.organizacaoId, organizationId), lt(clients.ultimaCompraData, inactivityCutoff)))
		: [null];

	const numero = resolveWhatsappNumberState({ connections, now });
	const usablePhones = connections.flatMap((connection) =>
		connection.telefones
			.filter((phone) => resolvePhoneNumberState({ connection, phone, now }) === "CONECTADO")
			.map((phone) => ({ connection, phone })),
	);
	const primaryConnection = usablePhones[0]?.connection ?? connections.find((connection) => connection.telefones.length > 0) ?? null;
	const primaryPhone = usablePhones[0]?.phone ?? primaryConnection?.telefones[0] ?? null;
	const officialConnectedAt = usablePhones
		.filter(({ connection }) => connection.tipoConexao === "META_CLOUD_API")
		.reduce<Date | null>((earliest, { connection }) => (!earliest || connection.dataInsercao < earliest ? connection.dataInsercao : earliest), null);
	const tipoConexao = primaryConnection?.tipoConexao ?? null;
	const telefones = connections.flatMap((connection) =>
		connection.telefones.map((phone) => ({
			id: phone.id,
			nome: phone.nome,
			numero: phone.numero,
			pagamento: (connection.tipoConexao === "INTERNAL_GATEWAY" ? "NAO_APLICAVEL" : (phone.metadados?.pagamento?.status ?? "DESCONHECIDO")) as
				| TWhatsappPaymentStatusEnum
				| "NAO_APLICAVEL",
		})),
	);
	const pagamento =
		telefones.find((phone) => phone.id === primaryPhone?.id)?.pagamento ?? (tipoConexao === "INTERNAL_GATEWAY" ? "NAO_APLICAVEL" : "DESCONHECIDO");

	const cashbackEstado: TOnboardingReadiness["cashback"]["estado"] = !cashbackProgram
		? "NAO_CONFIGURADO"
		: cashbackProgram.ativo
			? "ATIVO"
			: "CONFIGURADO_INATIVO";
	const cashbackResumo = cashbackProgram
		? {
				acumuloTipo: cashbackProgram.acumuloTipo,
				acumuloValor: cashbackProgram.acumuloValor,
				validadeDias: cashbackProgram.expiracaoRegraValidadeValor,
				limiteResgate:
					cashbackProgram.resgateLimiteTipo && cashbackProgram.resgateLimiteValor !== null
						? { tipo: cashbackProgram.resgateLimiteTipo, valor: cashbackProgram.resgateLimiteValor }
						: null,
			}
		: null;

	const crmJourney = journeys.find((journey) => journey.produto === "CRM") ?? null;
	const erpJourney = journeys.find((journey) => journey.produto === "ERP") ?? null;
	const channel = erpJourney?.respostas.erpCanalInicial ?? null;
	const usableProducts = organization.configuracao.recursos.erp.acesso ? await getUsableOnboardingProducts({ executor, organizationId, channel: channel ?? "BALCAO" }) : { total: 0, amostra: [] };
	const shopConfig = shop ? normalizeShopSettingsConfiguration(shop.configuracoes) : null;
	const shopReady = !!shopConfig && (shopConfig.atendimento.retirada.ativo || shopConfig.atendimento.entrega.ativo) && shopConfig.pagamento.metodosAceitos.length > 0;
	const enabledKeys = new Set(crmJourney?.respostas.campanhasComEnvioHabilitado ?? []);

	const dependencyContextBase: Omit<TCampaignDependencyContext, "envioHabilitadoPeloUsuario"> = {
		whatsapp: { numero, tipoConexao, telefoneId: primaryPhone?.id ?? null, pagamento },
		templatesById,
		cashbackAtivo: cashbackEstado === "ATIVO",
		coberturaInicio: coverage,
		clientesComAniversario: birthdayRow?.total ?? 0,
		saldosCashbackComValidade: cashbackResumo && cashbackResumo.validadeDias > 0 ? (balancesWithValidity[0]?.total ?? 0) : 0,
	};

	const campanhas = presetCampaigns
		.filter((campaign): campaign is typeof campaign & { chavePreset: string } => !!campaign.chavePreset)
		.map((campaign) => {
			const row: TOnboardingCampaignRow = campaign;
			const ownConnection = connections.find((connection) => connection.telefones.some((phone) => phone.id === campaign.whatsappConexaoTelefoneId));
			const ownPhone = ownConnection?.telefones.find((phone) => phone.id === campaign.whatsappConexaoTelefoneId);
			// O estado é do número da campanha, não da conexão: numa conexão com um número sem acesso e
			// outro saudável, só a campanha do primeiro fica sem canal.
			const ownNumber = ownConnection && ownPhone ? resolvePhoneNumberState({ connection: ownConnection, phone: ownPhone, now }) : "NENHUM";
			const context: TCampaignDependencyContext = {
				...dependencyContextBase,
				whatsapp: { numero: ownNumber, tipoConexao: ownConnection?.tipoConexao ?? null, telefoneId: ownPhone?.id ?? null, pagamento: ownConnection?.tipoConexao === "INTERNAL_GATEWAY" ? "NAO_APLICAVEL" : ownPhone?.metadados?.pagamento?.status ?? "DESCONHECIDO" },
				envioHabilitadoPeloUsuario: enabledKeys.has(campaign.chavePreset) || campaign.ativo,
			};
			const dependencias = resolveCampaignDependencies({ campaign: row, context });
			return {
				id: campaign.id,
				chave: campaign.chavePreset,
				titulo: campaign.titulo,
				estado: resolveOnboardingCampaignState({ campaign: row, dependencies: dependencias }),
				pronta: isCampaignReady(dependencias),
				dependencias,
			};
		});

	const produtosHabilitados: TOnboardingProductEnum[] = ["CRM"];
	if (organization.configuracao.recursos.erp.acesso) produtosHabilitados.push("ERP");

	const base: Omit<TOnboardingReadiness, "proximaAcao"> = {
		organizacao: {
			id: organization.id,
			nome: organization.nome,
			atuacaoNicho: organization.atuacaoNicho,
			dataOnboardingConclusao: organization.dataOnboardingConclusao,
			produtosHabilitados,
		},
		fonteDados: {
			modo: fonteDadosModo,
			definida: isSalesSourceDefined({ modo: fonteDadosModo, erpAcesso: organization.configuracao.recursos.erp.acesso }),
			poi: { registroAtivo: poiRegistroAtivo, vendasRecentes: poiVendasRecentes },
			integracoes: integrations.map((integration) => ({
				id: integration.id,
				tipo: integration.tipo,
				apelido: integration.apelido,
				status: integration.status,
				ultimaSincronizacao: integration.dataUltimaSincronizacao,
				ultimoErro: integration.ultimoErro,
				cargaHistorica: (() => { const job = importJobs.find((item) => item.integracaoId === integration.id); return job ? getImportJobProgress(job) : null; })(),
			})),
		},
		dados: {
			vendasValidas: salesRow?.total ?? 0,
			clientes: clientsRow?.total ?? 0,
			clientesComAniversario: birthdayRow?.total ?? 0,
			coberturaInicio: coverageStart,
			coberturaParcial: partialCoverage,
			clientesInativos: inactiveRow ? { clientes: inactiveRow.total, valorTotal: Number(inactiveRow.valor) || 0 } : null,
		},
		cashback: {
			estado: cashbackEstado,
			programaId: cashbackProgram?.id ?? null,
			resumo: cashbackResumo,
			saldosComValidade: balancesWithValidity[0]?.total ?? 0,
		},
		campanhas,
		campanhasManuais: { ativas: manualCampaignsRow?.total ?? 0 },
		whatsapp: {
			numero,
			tipoConexao,
			oficialConectadoEm: officialConnectedAt,
			telefones,
			pagamento,
			templates: templates.map((template) => ({
				id: template.id,
				nome: template.nome,
				status: summarizeTemplateStatus(template, primaryPhone?.id ?? null),
			})),
		},
		erp: {
			acesso: organization.configuracao.recursos.erp.acesso,
			testeDisponivel: !organization.stripeSubscriptionId && !!organization.periodoTesteFim && organization.periodoTesteFim > new Date(),
			canal: channel,
			produtos: usableProducts.amostra,
			produtosUtilizaveis: usableProducts.total,
			lojaDigital: { existe: !!shop, ativa: shop?.ativo ?? false, modo: shop?.modo ?? null, configurada: shopReady },
			pendenciasLancamento: getLaunchChecklist(channel, { acesso: organization.configuracao.recursos.erp.acesso, produtosUtilizaveis: usableProducts.total, lojaDigital: { existe: !!shop, ativa: shop?.ativo ?? false, configurada: shopReady }, pontosAtendimento: servicePointsRow?.total ?? 0, simulacaoConcluida: !!erpJourney?.respostas.erpSimulacaoConcluidaEm }).filter((item) => !item.concluida),
			pontosAtendimento: servicePointsRow?.total ?? 0,
			simulacaoConcluida: !!erpJourney?.respostas.erpSimulacaoConcluidaEm,
		},
		jornadas: journeys,
	};

	return { ...base, proximaAcao: resolveNextAction(base) };
}
