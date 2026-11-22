import { createHash } from "node:crypto";

import { loadOrganizationActivity } from "@/lib/onboarding/activity";
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
import { campaigns, controlLifecycleSyncs } from "@/services/drizzle/schema";
import { count, eq, sql } from "drizzle-orm";

import {
	buildControlCustomFields,
	CONTROL_COMMERCIAL_BOARD_NAME,
	CONTROL_COMMERCIAL_TRIAL_STAGE_NAME,
	CONTROL_SUCCESS_BOARD_NAME,
	controlOrganizationReference,
	isMilestoneEventDue,
	normalizeStageName,
	planControlLifecycleSync,
	resolveStuckNotices,
	resolveTrialEndingNotice,
	shouldBackfillSilently,
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
	// Vendas, entregas e resgates vêm do mesmo leitor que a ativação do hub usa: os dois contam igual.
	const [readiness, activity, [campaignCounts]] = await Promise.all([
		getOnboardingReadiness({ executor: db, organizationId }),
		loadOrganizationActivity({ executor: db, organizationId, criadaEm: organization.dataInsercao, now }),
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
		fonteDadosDefinida: readiness.fonteDados.definida,
		whatsappOficialConectado: readiness.whatsapp.oficialConectadoEm !== null,
		whatsappOficialConectadoEm: readiness.whatsapp.oficialConectadoEm,
		primeiraVendaEm: activity.primeiraVendaEm,
		primeiroEnvioCampanhaEm: activity.envios.primeiraEntregaEm,
		primeiroResgateEm: activity.primeiroResgateEm,
		enviosCampanhaUltimos14Dias: activity.envios.entregas14Dias,
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
		envios_campanha_14d: activity.envios.entregas14Dias,
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
	const isBackfill = shouldBackfillSilently({ marcosEnviados: state?.marcosEnviados ?? [], organizacaoCriadaEm: organization.dataInsercao, now });
	const newMilestones: string[] = [];
	if (isBackfill) {
		for (const milestone of plan.novosMarcos) sent.add(milestone.chave);
		await persist({ marcosEnviados: [...sent] });
	}
	for (const milestone of isBackfill ? [] : plan.novosMarcos) {
		const occurredAt = (milestone.quando(snapshot) ?? now).toISOString();
		// Marco descoberto tarde (ver `eventoAteDias`): fica na linha do tempo com a data real, mas sem
		// evento, para nenhum workflow comemorar algo de meses atrás.
		if (isMilestoneEventDue({ milestone, snapshot })) {
			await sendControlEvent({
				evento: milestone.evento,
				eventId: `${reference}:${milestone.chave}`,
				oportunidadeId: opportunityId,
				propriedades: { organizacaoId: organizationId, marco: milestone.chave },
				dataOcorrencia: occurredAt,
			});
		}
		await logControlInteraction(
			{ oportunidadeId: opportunityId, titulo: milestone.titulo, canal: "SITE", dataInteracao: occurredAt },
			`${reference}:interacao:${milestone.chave}`,
		);
		sent.add(milestone.chave);
		newMilestones.push(milestone.chave);
		await persist({ marcosEnviados: [...sent] });
	}

	// 3b. Aviso de fim do teste: evento de serviço, não marco (não move o cartão). Vale também no
	// backfill, porque é sobre o teste que termina agora, não sobre o passado.
	const trialNotice = resolveTrialEndingNotice({
		periodoTesteFim: organization.periodoTesteFim,
		stripeSubscriptionStatus: organization.stripeSubscriptionStatus,
		now,
	});
	if (trialNotice && !sent.has(trialNotice.chave)) {
		await sendControlEvent({
			evento: trialNotice.evento,
			eventId: `${reference}:${trialNotice.chave}`,
			oportunidadeId: opportunityId,
			propriedades: { organizacaoId: organizationId, fimDoTeste: trialNotice.fimDoTeste },
			dataOcorrencia: now.toISOString(),
		});
		sent.add(trialNotice.chave);
		newMilestones.push(trialNotice.chave);
		await persist({ marcosEnviados: [...sent] });
	}

	// 3c. Avisos de "parado", pelo estado de agora (o cartão pode nunca entrar no estágio do
	// empurrão). Uma vez cada; valem também no backfill, porque são sobre a situação atual.
	for (const notice of resolveStuckNotices({
		snapshot,
		periodoTesteFim: organization.periodoTesteFim,
		stripeSubscriptionStatus: organization.stripeSubscriptionStatus,
	})) {
		if (sent.has(notice.chave)) continue;
		await sendControlEvent({
			evento: notice.evento,
			eventId: `${reference}:${notice.chave}`,
			oportunidadeId: opportunityId,
			propriedades: { organizacaoId: organizationId, aviso: notice.evento },
			dataOcorrencia: now.toISOString(),
		});
		sent.add(notice.chave);
		newMilestones.push(notice.chave);
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
