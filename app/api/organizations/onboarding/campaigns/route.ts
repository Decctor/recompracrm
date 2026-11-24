import { OnboardingCampaignPresetsByKey, type TOnboardingCampaignPresetKey } from "@/config/onboarding-campaign-presets";
import { seedOnboardingMessageTemplates, type TOnboardingMessageTemplateKey } from "@/config/onboarding-message-templates";
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertCanActivateCampaigns, assertCanEditCampaigns } from "@/lib/campaigns/access";
import { canActivateCampaigns } from "@/lib/permissions/campaigns";
import { getJourney, reconcileOnboardingCampaigns, updateJourneyProgress } from "@/lib/onboarding";
import { db } from "@/services/drizzle";
import { campaignSegmentations, campaigns, interactions } from "@/services/drizzle/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

/**
 * Semeia as campanhas escolhidas na etapa de campanhas.
 *
 * - Cada preset é parametrizado por cashback ativo; os templates por organização que as
 *   campanhas referenciam são semeados aqui (variante COM_CASHBACK ou SEM_CASHBACK).
 * - A campanha nasce PREPARADA (`ativo: false`) e identificada por `chavePreset`. Ela só passa a
 *   enviar quando `reconcileOnboardingCampaigns` a encontra pronta E liberada pelo usuário.
 * - Idempotente: upsert por (organização, chavePreset). Presets desmarcados são removidos só se
 *   ainda não enviaram nada; senão ficam como estão, pois já pertencem ao histórico da org.
 */
const SeedOnboardingCampaignsInputSchema = z.object({
	cashbackAtivo: z.boolean({ invalid_type_error: "Tipo inválido para cashback ativo." }),
	selectedKeys: z.array(z.string({ invalid_type_error: "Tipo inválido para a chave da campanha." })),
	// Intenção de liberar envios assim que estiverem prontas. Opcional: a liberação também pode
	// vir depois, pela tela de entrada ou pelo painel de ativação.
	enableSendingKeys: z.array(z.string({ invalid_type_error: "Tipo inválido para a chave da campanha." })).default([]),
});
export type TSeedOnboardingCampaignsInput = z.infer<typeof SeedOnboardingCampaignsInputSchema>;

async function seedOnboardingCampaigns({ input, session }: { input: TSeedOnboardingCampaignsInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para configurar campanhas.");

	const variant = input.cashbackAtivo ? "COM_CASHBACK" : "SEM_CASHBACK";

	const selectedPresets = input.selectedKeys
		.map((key) => OnboardingCampaignPresetsByKey.get(key as TOnboardingCampaignPresetKey))
		.filter((preset): preset is NonNullable<typeof preset> => !!preset && (input.cashbackAtivo || !preset.requiresCashback));
	const selectedKeys: string[] = selectedPresets.map((preset) => preset.key);

	// Primeiro telefone conectado, quando houver. Sem telefone a campanha fica preparada e a
	// reconciliação preenche o vínculo quando o número chegar (ver reconcile).
	const connection = await db.query.whatsappConnections.findFirst({
		where: (fields, { eq: equals }) => equals(fields.organizacaoId, organizacaoId),
		with: { telefones: { columns: { id: true }, where: (phone, { isNull }) => isNull(phone.dataDesativacao), limit: 1 } },
	});
	const whatsappConexaoTelefoneId = connection?.telefones[0]?.id ?? null;

	const seeded = await db.transaction(async (tx) => {
		const templateKeys = Array.from(new Set(selectedPresets.map((preset) => preset.templateKey))) as TOnboardingMessageTemplateKey[];
		const templateIdByKey = await seedOnboardingMessageTemplates({
			tx,
			organizationId: organizacaoId,
			autorId: session.user.id,
			variant,
			keys: templateKeys,
		});

		// Presets desmarcados: remove só campanhas que nunca geraram interação.
		const managed = await tx
			.select({ id: campaigns.id, chavePreset: campaigns.chavePreset })
			.from(campaigns)
			.where(and(eq(campaigns.organizacaoId, organizacaoId), isNotNull(campaigns.chavePreset)));
		const unselected = managed.filter((row) => row.chavePreset && !selectedKeys.includes(row.chavePreset));
		if (unselected.length > 0) {
			const unselectedIds = unselected.map((row) => row.id);
			const withInteractions = await tx
				.selectDistinct({ campanhaId: interactions.campanhaId })
				.from(interactions)
				.where(inArray(interactions.campanhaId, unselectedIds));
			const usedIds = new Set(withInteractions.map((row) => row.campanhaId));
			const removableIds = unselectedIds.filter((id) => !usedIds.has(id));
			if (removableIds.length > 0) {
				await tx.delete(campaignSegmentations).where(inArray(campaignSegmentations.campanhaId, removableIds));
				await tx.delete(campaigns).where(inArray(campaigns.id, removableIds));
			}
			// As que ficaram (com histórico) apenas deixam de enviar.
			const keptIds = unselectedIds.filter((id) => usedIds.has(id));
			if (keptIds.length > 0) await tx.update(campaigns).set({ ativo: false }).where(inArray(campaigns.id, keptIds));
		}

		const result: Array<{ id: string; chave: string }> = [];
		for (const preset of selectedPresets) {
			const whatsappTemplateId = templateIdByKey.get(preset.templateKey);
			if (!whatsappTemplateId) continue;

			const fields = preset.buildCampaignFields(input.cashbackAtivo);
			const existing = managed.find((row) => row.chavePreset === preset.key);

			if (existing) {
				// Mantém `ativo` como está: a reconciliação decide. Atualiza parâmetros e vínculos.
				await tx
					.update(campaigns)
					.set({ ...fields, ativo: undefined, whatsappTemplateId, whatsappConexaoTelefoneId })
					.where(eq(campaigns.id, existing.id));
				await tx.delete(campaignSegmentations).where(eq(campaignSegmentations.campanhaId, existing.id));
				if (preset.segmentacoes.length > 0) {
					await tx
						.insert(campaignSegmentations)
						.values(preset.segmentacoes.map((segmentacao) => ({ campanhaId: existing.id, organizacaoId, segmentacao })));
				}
				result.push({ id: existing.id, chave: preset.key });
				continue;
			}

			const inserted = await tx
				.insert(campaigns)
				.values({
					...fields,
					ativo: false,
					chavePreset: preset.key,
					organizacaoId,
					autorId: session.user.id,
					whatsappTemplateId,
					whatsappConexaoTelefoneId,
				})
				.returning({ id: campaigns.id });
			const campaignId = inserted[0]?.id;
			if (!campaignId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar campanha.");

			if (preset.segmentacoes.length > 0) {
				await tx.insert(campaignSegmentations).values(preset.segmentacoes.map((segmentacao) => ({ campanhaId: campaignId, organizacaoId, segmentacao })));
			}
			result.push({ id: campaignId, chave: preset.key });
		}
		return result;
	});

	// Respostas da etapa ficam na jornada (quando ela existe; o seed também serve à tela de campanhas).
	const journey = await getJourney({ executor: db, organizationId: organizacaoId, produto: "CRM" });
	if (journey) {
		const enabled = new Set(journey.respostas.campanhasComEnvioHabilitado.filter((key) => selectedKeys.includes(key)));
		for (const key of input.enableSendingKeys) if (selectedKeys.includes(key)) enabled.add(key);
		await updateJourneyProgress({
			executor: db,
			organizationId: organizacaoId,
			produto: "CRM",
			respostas: {
				campanhasSelecionadas: selectedKeys,
				campanhasComEnvioHabilitado: Array.from(enabled),
				campanhasNenhumaPorEnquanto: selectedKeys.length === 0,
			},
		});
	}

	// Envios liberados antes (por outra pessoa) não entram no ar pela mão de quem não pode ativar.
	const { readiness } = await reconcileOnboardingCampaigns({
		executor: db,
		organizationId: organizacaoId,
		canActivate: canActivateCampaigns(session.membership?.permissoes),
	});

	for (const item of seeded) {
		try {
			await captureServerEvent({
				distinctId: session.user.id,
				event: "campaign_prepared",
				properties: { organization_id: organizacaoId, chave: item.chave },
			});
		} catch (error) {
			console.error("[WARN] [ONBOARDING_CAMPAIGNS] Falha ao capturar evento:", error);
		}
	}

	const campaignsOut = readiness.campanhas.filter((campaign) => seeded.some((item) => item.id === campaign.id));
	return {
		data: { campaigns: campaignsOut },
		message:
			seeded.length === 0
				? "Nenhuma campanha preparada por enquanto."
				: `${seeded.length === 1 ? "1 campanha preparada" : `${seeded.length} campanhas preparadas`}.`,
	};
}
export type TSeedOnboardingCampaignsOutput = Awaited<ReturnType<typeof seedOnboardingCampaigns>>;

async function seedOnboardingCampaignsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanEditCampaigns(session);
	const input = SeedOnboardingCampaignsInputSchema.parse(await request.json());
	// Pedir a liberação dos envios junto com a criação é colocar as campanhas no ar.
	if (input.enableSendingKeys.length > 0) assertCanActivateCampaigns(session);
	const result = await seedOnboardingCampaigns({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: seedOnboardingCampaignsRoute });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
