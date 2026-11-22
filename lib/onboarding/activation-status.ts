import type { TBuiltSummaryCounts } from "@/lib/subscriptions/activation-narrative";
import type { DB, DBTransaction } from "@/services/drizzle";
import { campaignConversions, cashbackProgramBalances, interactions, organizations } from "@/services/drizzle/schema";
import { and, count, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { resolveActivation, type TActivation, type TActivationFacts } from "./activation";
import { DELIVERED_CAMPAIGN_STATUSES, loadOrganizationActivity } from "./activity";
import { getOnboardingReadiness, type TOnboardingReadiness } from "./readiness";

const IMPORT_RUNNING_STATES = new Set(["AGUARDANDO", "EM_ANDAMENTO", "PAUSADO_LIMITE"]);

/** Composição dos fatos: a prontidão (configuração) mais a atividade (o que de fato aconteceu). */
function composeActivationFacts({
	readiness,
	activity,
	organization,
	now,
}: {
	readiness: TOnboardingReadiness;
	activity: Awaited<ReturnType<typeof loadOrganizationActivity>>;
	organization: { id: string; dataInsercao: Date; slug: string | null };
	now: Date;
}): TActivationFacts {
	const broken = readiness.fonteDados.integracoes.find((integration) => integration.status !== "CONECTADO");
	const running = readiness.fonteDados.integracoes.filter(
		(integration) => integration.cargaHistorica && IMPORT_RUNNING_STATES.has(integration.cargaHistorica.estado),
	);
	const erpJourney = readiness.jornadas.find((journey) => journey.produto === "ERP");
	return {
		now,
		organizacao: { id: organization.id, criadaEm: organization.dataInsercao, slug: organization.slug, erpAcesso: readiness.erp.acesso },
		jornadas: {
			crm: readiness.jornadas.some((journey) => journey.produto === "CRM"),
			erp: !!erpJourney,
			erpCanal: erpJourney?.respostas.erpCanalInicial ?? null,
		},
		fonte: {
			modo: readiness.fonteDados.modo,
			integracaoComErro: broken ? { nome: broken.apelido ?? broken.tipo } : null,
			importacao: {
				emAndamento: running.length > 0,
				vendasImportadas: running.reduce((total, integration) => total + (integration.cargaHistorica?.contadores.importados ?? 0), 0),
			},
		},
		base: { clientes: readiness.dados.clientes, clientesSegmentados: activity.clientesSegmentados },
		vendas: activity.vendas,
		canal: { numero: readiness.whatsapp.numero, pagamento: readiness.whatsapp.pagamento },
		campanhas: {
			preparadas: readiness.campanhas.map((campaign) => ({
				chave: campaign.chave,
				titulo: campaign.titulo,
				estado: campaign.estado,
				pronta: campaign.pronta,
			})),
			manuaisAtivas: readiness.campanhasManuais.ativas,
			templates: readiness.whatsapp.templates.map((template) => ({ nome: template.nome, status: template.status })),
		},
		envios: { primeiraEntregaEm: activity.envios.primeiraEntregaEm, ultimaEntregaEm: activity.envios.ultimaEntregaEm },
		erp: { produtosUtilizaveis: readiness.erp.produtosUtilizaveis, pendenciasLancamento: readiness.erp.pendenciasLancamento },
	};
}

async function loadActivationContext({ executor, organizationId, now }: { executor: DB | DBTransaction; organizationId: string; now: Date }) {
	const organization = await executor.query.organizations.findFirst({
		where: eq(organizations.id, organizationId),
		columns: { id: true, dataInsercao: true, slug: true },
	});
	if (!organization) throw new Error("Organização não encontrada.");
	const [readiness, activity] = await Promise.all([
		getOnboardingReadiness({ executor, organizationId }),
		loadOrganizationActivity({ executor, organizationId, criadaEm: organization.dataInsercao, now }),
	]);
	const activation = resolveActivation(composeActivationFacts({ readiness, activity, organization, now }));
	return { readiness, activity, activation };
}

export async function getOrganizationActivation({
	executor,
	organizationId,
	now = new Date(),
}: {
	executor: DB | DBTransaction;
	organizationId: string;
	now?: Date;
}): Promise<TActivation> {
	return (await loadActivationContext({ executor, organizationId, now })).activation;
}

/**
 * Ativação mais as contagens do que a loja construiu, para o selo e o paywall da assinatura
 * (lib/subscriptions/activation-narrative.ts). Só é chamada perto do fim do teste e no bloqueio.
 */
export async function getSubscriptionActivationContext({
	executor,
	organizationId,
	now = new Date(),
}: {
	executor: DB | DBTransaction;
	organizationId: string;
	now?: Date;
}): Promise<{ activation: TActivation; counts: TBuiltSummaryCounts }> {
	const { readiness, activity, activation } = await loadActivationContext({ executor, organizationId, now });
	const [[delivered], [conversions], [withCashback]] = await Promise.all([
		executor
			.select({ total: count() })
			.from(interactions)
			.where(
				and(
					eq(interactions.organizacaoId, organizationId),
					isNotNull(interactions.campanhaId),
					inArray(interactions.statusEnvio, [...DELIVERED_CAMPAIGN_STATUSES]),
				),
			),
		executor.select({ total: count() }).from(campaignConversions).where(eq(campaignConversions.organizacaoId, organizationId)),
		executor
			.select({ total: count() })
			.from(cashbackProgramBalances)
			.where(and(eq(cashbackProgramBalances.organizacaoId, organizationId), gt(cashbackProgramBalances.saldoValorDisponivel, 0))),
	]);
	return {
		activation,
		counts: {
			clientes: readiness.dados.clientes,
			campanhasAtivas: readiness.campanhasManuais.ativas + readiness.campanhas.filter((campaign) => campaign.estado === "ATIVA").length,
			mensagensEntregues: delivered?.total ?? 0,
			recomprasAtribuidas: conversions?.total ?? 0,
			clientesComCashback: withCashback?.total ?? 0,
			vendasBalcao: activity.vendas.balcao.total,
			vendasErp: activity.vendas.erp.BALCAO.total + activity.vendas.erp.CATALOGO.total + activity.vendas.erp.MESAS.total,
		},
	};
}
