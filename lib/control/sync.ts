import { createHash } from "node:crypto";

import { getOnboardingReadiness } from "@/lib/onboarding/readiness";
import {
	createControlOpportunity,
	getControlOpportunity,
	isControlLifecycleSyncEnabled,
	listControlBoards,
	listControlOpportunityCustomFieldKeys,
	logControlInteraction,
	moveControlOpportunityStage,
	sendControlEvent,
	type TControlBoard,
	updateControlOpportunity,
} from "@/services/control";
import { db } from "@/services/drizzle";
import { campaigns, cashbackProgramTransactions, controlLifecycleSyncs, interactions, sales } from "@/services/drizzle/schema";
import { and, count, eq, gte, inArray, isNotNull, min, sql } from "drizzle-orm";

import {
	buildControlCustomFields,
	CONTROL_COMMERCIAL_BOARD_NAME,
	CONTROL_COMMERCIAL_TRIAL_STAGE_NAME,
	CONTROL_SUCCESS_BOARD_NAME,
	controlOrganizationReference,
	normalizeStageName,
	planControlLifecycleSync,
	shouldMoveSuccessStage,
	type TControlCustomFieldValues,
	type TControlLifecycleSnapshot,
} from "./lifecycle";

/**
 * Leva o ciclo de vida de uma organização ao Syncroniza Control (análise de ativação §9).
 *
 * 1. Garante a oportunidade da organização no Control — criada uma vez, no "Funil Comercial
 *    RecompraCRM" em "Teste grátis", e encontrada depois por `ref:recompracrm:org_<id>`.
 * 2. Avança o cartão no "SUCESSO DO CLIENTE" até o marco mais adiantado (só para frente).
 * 3. Para cada marco novo, envia um evento (gatilho "Evento de sistema integrado") e uma interação.
 * 4. Atualiza os campos personalizados que existirem no Control, só quando mudarem.
 *
 * Idempotente de ponta a ponta: os eventos deduplicam por `eventId` e as interações por chave de
 * idempotência, então uma retentativa depois de uma falha no meio não duplica nada lá.
 */

const CATALOG_TTL_MS = 10 * 60 * 1000;
let boardsCache: { at: number; boards: TControlBoard[] } | null = null;
let customFieldKeysCache: { at: number; keys: string[] } | null = null;

async function getBoards() {
	if (boardsCache && Date.now() - boardsCache.at < CATALOG_TTL_MS) return boardsCache.boards;
	boardsCache = { at: Date.now(), boards: await listControlBoards() };
	return boardsCache.boards;
}

async function getCustomFieldKeys() {
	if (customFieldKeysCache && Date.now() - customFieldKeysCache.at < CATALOG_TTL_MS) return customFieldKeysCache.keys;
	customFieldKeysCache = { at: Date.now(), keys: await listControlOpportunityCustomFieldKeys() };
	return customFieldKeysCache.keys;
}

function findBoard(boards: TControlBoard[], name: string) {
	return boards.find((board) => normalizeStageName(board.nome) === normalizeStageName(name)) ?? null;
}

const DELIVERED_STATUSES = ["ENTREGUE", "LIDO"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Organização mais velha que isto, sincronizada pela primeira vez, entra em backfill silencioso. */
const BACKFILL_AGE_MS = 2 * DAY_MS;

async function loadOrganization(organizationId: string) {
	return db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, organizationId),
		columns: {
			id: true,
			nome: true,
			email: true,
			telefone: true,
			cnpj: true,
			atuacaoNicho: true,
			assinaturaPlano: true,
			stripeSubscriptionStatus: true,
			periodoTesteFim: true,
			dataInsercao: true,
			dataOnboardingConclusao: true,
		},
		with: { autor: { columns: { nome: true, email: true, telefone: true } } },
	});
}
type TSyncOrganization = NonNullable<Awaited<ReturnType<typeof loadOrganization>>>;

async function loadSnapshot(organization: TSyncOrganization, now: Date) {
	const organizationId = organization.id;
	const fourteenDaysAgo = new Date(now.getTime() - 14 * DAY_MS);
	const deliveredCampaignMessages = and(
		eq(interactions.organizacaoId, organizationId),
		isNotNull(interactions.campanhaId),
		inArray(interactions.statusEnvio, [...DELIVERED_STATUSES]),
	);

	const [readiness, [firstSale], [firstDelivery], [recentDeliveries], [firstRedemption], [campaignCounts]] = await Promise.all([
		getOnboardingReadiness({ executor: db, organizationId }),
		// Venda com data depois do cadastro: o histórico importado não é "a primeira venda" na plataforma.
		db
			.select({ at: min(sales.dataVenda) })
			.from(sales)
			.where(and(eq(sales.organizacaoId, organizationId), gte(sales.dataVenda, organization.dataInsercao))),
		db
			.select({ at: min(interactions.dataInsercao) })
			.from(interactions)
			.where(deliveredCampaignMessages),
		db
			.select({ total: count() })
			.from(interactions)
			.where(and(deliveredCampaignMessages, gte(interactions.dataInsercao, fourteenDaysAgo))),
		db
			.select({ at: min(cashbackProgramTransactions.dataInsercao) })
			.from(cashbackProgramTransactions)
			.where(and(eq(cashbackProgramTransactions.organizacaoId, organizationId), eq(cashbackProgramTransactions.tipo, "RESGATE"))),
		db
			.select({ total: count(), ativas: sql<number>`count(*) filter (where ${campaigns.ativo})::integer` })
			.from(campaigns)
			.where(eq(campaigns.organizacaoId, organizationId)),
	]);

	// As organizações anteriores ao onboarding novo não têm campanhas de preset; o que conta é ter
	// campanhas, de qualquer origem.
	const campanhasPreparadas = Math.max(campaignCounts?.total ?? 0, readiness.campanhas.length);

	const snapshot: TControlLifecycleSnapshot = {
		organizacaoCriadaEm: organization.dataInsercao,
		onboardingConcluidoEm: organization.dataOnboardingConclusao,
		cashbackConfigurado: readiness.cashback.estado !== "NAO_CONFIGURADO",
		campanhasPreparadas,
		fonteDadosDefinida: readiness.fonteDados.modo !== "NENHUMA",
		whatsappOficialConectado: readiness.whatsapp.numero === "CONECTADO" && readiness.whatsapp.tipoConexao === "META_CLOUD_API",
		primeiraVendaEm: firstSale?.at ?? null,
		primeiroEnvioCampanhaEm: firstDelivery?.at ?? null,
		primeiroResgateEm: firstRedemption?.at ?? null,
		enviosCampanhaUltimos14Dias: recentDeliveries?.total ?? 0,
		now,
	};

	const customFields: TControlCustomFieldValues = {
		organizacao_id: organization.id,
		plano: organization.assinaturaPlano,
		segmento: organization.atuacaoNicho,
		assinatura_status: organization.stripeSubscriptionStatus,
		fim_do_teste: organization.periodoTesteFim ? organization.periodoTesteFim.toISOString().slice(0, 10) : null,
		fonte_de_dados: readiness.fonteDados.modo,
		whatsapp: readiness.whatsapp.numero,
		campanhas_ativas: campaignCounts?.ativas ?? 0,
		envios_campanha_14d: recentDeliveries?.total ?? 0,
	};

	return { snapshot, customFields };
}

export type TControlLifecycleSyncResult =
	| { status: "DESLIGADO" | "SEM_ORGANIZACAO" }
	| {
			status: "SINCRONIZADO";
			oportunidadeId: string;
			marcosNovos: string[];
			backfillSilencioso: boolean;
			estagioMovidoPara: string | null;
			camposAtualizados: boolean;
	  };

export async function syncControlLifecycle({
	organizationId,
	now = new Date(),
}: {
	organizationId: string;
	now?: Date;
}): Promise<TControlLifecycleSyncResult> {
	if (!isControlLifecycleSyncEnabled()) return { status: "DESLIGADO" };

	const organization = await loadOrganization(organizationId);
	if (!organization) return { status: "SEM_ORGANIZACAO" };

	const [state, { snapshot, customFields }, boards] = await Promise.all([
		db.query.controlLifecycleSyncs.findFirst({ where: (fields, { eq }) => eq(fields.organizacaoId, organizationId) }),
		loadSnapshot(organization, now),
		getBoards(),
	]);
	const reference = controlOrganizationReference(organizationId);
	const commercialBoard = findBoard(boards, CONTROL_COMMERCIAL_BOARD_NAME);
	const successBoard = findBoard(boards, CONTROL_SUCCESS_BOARD_NAME);
	const sent = new Set(state?.marcosEnviados ?? []);

	const persist = async (values: Partial<typeof controlLifecycleSyncs.$inferInsert>) => {
		await db
			.insert(controlLifecycleSyncs)
			.values({ organizacaoId: organizationId, ...values })
			.onConflictDoUpdate({ target: controlLifecycleSyncs.organizacaoId, set: values });
	};

	// 1. Oportunidade. A criação usa a referência como chave de idempotência do lado do Control:
	// se a resposta se perdeu, repetir devolve a mesma oportunidade.
	let opportunityId = state?.controlOportunidadeId ?? null;
	let justCreated = false;
	if (!opportunityId) {
		const owner = organization.autor;
		// O contato da loja vem primeiro: quando o time cria a conta para o cliente, o "responsável" é
		// alguém da Syncroniza, e o Control casaria todas essas lojas com o mesmo cliente.
		const email = organization.email || owner?.email || undefined;
		const telefone = organization.telefone || owner?.telefone || undefined;
		const trialStage = commercialBoard?.estagios.find(
			(stage) => normalizeStageName(stage.nome) === normalizeStageName(CONTROL_COMMERCIAL_TRIAL_STAGE_NAME),
		);
		// O cliente no Control é a loja (o CRM da Syncroniza é B2B), com o contato da loja quando houver.
		const created = await createControlOpportunity({
			referenciaExterna: reference,
			reaproveitarAberta: false,
			cliente: { nome: organization.nome, email, telefone, cpfCnpj: organization.cnpj || undefined },
			oportunidade: {
				nome: organization.nome,
				observacoes: `Organização ${organization.nome} no RecompraCRM (id ${organization.id}). Responsável: ${owner?.nome ?? "não informado"}.`,
				...(commercialBoard && trialStage ? { quadroKanbanId: commercialBoard.id, estagioKanbanId: trialStage.id } : {}),
			},
		});
		opportunityId = created.oportunidadeId;
		justCreated = true;
		await persist({ controlOportunidadeId: opportunityId, marcosEnviados: [...sent] });
	}

	// 2. Estágio no quadro de sucesso. Só consulta o Control quando há algo novo a decidir.
	const plan = planControlLifecycleSync({
		snapshot,
		marcosEnviados: [...sent],
		estagiosDoQuadro: successBoard?.estagios.map((stage) => stage.nome) ?? [],
	});
	let movedTo: string | null = null;
	if (successBoard && plan.estagioAlvo && (justCreated || plan.novosMarcos.length > 0)) {
		const current = await getControlOpportunity(opportunityId);
		const currentStage = current.estagiosKanban.find((connection) => connection.quadroKanbanId === successBoard.id)?.estagio ?? null;
		if (shouldMoveSuccessStage({ estagioAtual: currentStage, estagioAlvo: plan.estagioAlvo })) {
			const moved = await moveControlOpportunityStage(
				opportunityId,
				{ quadroKanbanId: successBoard.id, estagio: plan.estagioAlvo },
				`${reference}:estagio:${normalizeStageName(plan.estagioAlvo)}`,
			);
			if (moved.alterado) movedTo = moved.estagio;
		}
	}

	// 3. Marcos novos: evento + interação, e o marco só é dado como entregue depois dos dois.
	//
	// Backfill silencioso: na primeira sincronização de uma organização que já existia, os marcos que
	// ela alcançou meses atrás não viram eventos — um workflow de parabéns pela primeira campanha
	// dispararia com meses de atraso. Eles são só registrados como entregues; o cartão vai direto ao
	// estágio certo (passo 2).
	const isBackfill = !state && now.getTime() - organization.dataInsercao.getTime() > BACKFILL_AGE_MS;
	const newMilestones: string[] = [];
	if (isBackfill) {
		for (const milestone of plan.novosMarcos) sent.add(milestone.chave);
		await persist({ marcosEnviados: [...sent] });
	}
	for (const milestone of isBackfill ? [] : plan.novosMarcos) {
		const occurredAt = (milestone.quando(snapshot) ?? now).toISOString();
		await sendControlEvent({
			evento: milestone.evento,
			eventId: `${reference}:${milestone.chave}`,
			oportunidadeId: opportunityId,
			propriedades: { organizacaoId: organizationId, marco: milestone.chave },
			dataOcorrencia: occurredAt,
		});
		await logControlInteraction(
			{ oportunidadeId: opportunityId, titulo: milestone.titulo, canal: "SITE", dataInteracao: occurredAt },
			`${reference}:interacao:${milestone.chave}`,
		);
		sent.add(milestone.chave);
		newMilestones.push(milestone.chave);
		await persist({ marcosEnviados: [...sent] });
	}

	// 4. Campos personalizados, só quando mudaram desde o último envio.
	const fieldsHash = createHash("sha256").update(JSON.stringify(customFields)).digest("hex");
	let fieldsUpdated = false;
	if (fieldsHash !== state?.camposHash) {
		const values = buildControlCustomFields({ valores: customFields, chavesDisponiveis: await getCustomFieldKeys() });
		if (Object.keys(values).length > 0) {
			await updateControlOpportunity(opportunityId, { camposPersonalizados: values });
			fieldsUpdated = true;
		}
	}

	await persist({ camposHash: fieldsHash, dataUltimaSincronizacao: now, ultimoErro: null });
	return {
		status: "SINCRONIZADO",
		oportunidadeId: opportunityId,
		marcosNovos: newMilestones,
		backfillSilencioso: isBackfill,
		estagioMovidoPara: movedTo,
		camposAtualizados: fieldsUpdated,
	};
}

/**
 * Versão para os pontos do produto (criação da organização, onboarding): nunca lança. Uma falha no
 * Control não pode travar o onboarding — ela fica registrada e o cron horário reconcilia.
 */
export async function syncControlLifecycleSafely(organizationId: string) {
	if (!isControlLifecycleSyncEnabled()) return null;
	try {
		return await syncControlLifecycle({ organizationId });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error("[CONTROL_LIFECYCLE] Falha ao sincronizar organização", organizationId, message);
		try {
			await db
				.insert(controlLifecycleSyncs)
				.values({ organizacaoId: organizationId, ultimoErro: message.slice(0, 2000) })
				.onConflictDoUpdate({ target: controlLifecycleSyncs.organizacaoId, set: { ultimoErro: message.slice(0, 2000) } });
		} catch {
			// O registro do erro é auxiliar; a falha original já foi logada.
		}
		return null;
	}
}
