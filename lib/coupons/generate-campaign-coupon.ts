import { getPostponedDateFromReferenceDate } from "@/lib/dates";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import type { DBTransaction } from "@/services/drizzle";
import { couponGrants } from "@/services/drizzle/schema";

type GenerateCouponGrantForCampaignParams = {
	tx: DBTransaction;
	organizationId: string;
	clientId: string;
	campaignId: string;
	couponId: string;
	expirationMeasure: TTimeDurationUnitsEnum | null;
	expirationValue: number | null;
};

/**
 * Atribui um cupom INDIVIDUAL a um cliente como efeito colateral do disparo de uma campanha
 * (espelho do generateCashbackForCampaign). A atribuição expira conforme a configuração da
 * campanha; sem configuração, vale a vigência do próprio cupom (expiracaoData = null).
 */
export async function generateCouponGrantForCampaign({
	tx,
	organizationId,
	clientId,
	campaignId,
	couponId,
	expirationMeasure,
	expirationValue,
}: GenerateCouponGrantForCampaignParams): Promise<{
	grantId: string;
	couponCode: string;
	couponTitle: string;
	expirationDate: Date | null;
} | null> {
	const coupon = await tx.query.coupons.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, couponId), eq(fields.organizacaoId, organizationId)),
		columns: { id: true, codigo: true, titulo: true, ativo: true, escopo: true, vigenciaFim: true },
	});
	if (!coupon) {
		console.error(`[CAMPAIGN_COUPON] Coupon ${couponId} not found for organization ${organizationId}. Skipping coupon grant generation.`);
		return null;
	}
	if (!coupon.ativo) {
		console.log(`[CAMPAIGN_COUPON] Coupon ${couponId} is inactive. Skipping coupon grant generation.`);
		return null;
	}
	if (coupon.escopo !== "INDIVIDUAL") {
		console.error(`[CAMPAIGN_COUPON] Coupon ${couponId} is not INDIVIDUAL scoped. Skipping coupon grant generation.`);
		return null;
	}
	if (coupon.vigenciaFim && coupon.vigenciaFim < new Date()) {
		console.log(`[CAMPAIGN_COUPON] Coupon ${couponId} is expired. Skipping coupon grant generation.`);
		return null;
	}

	const expirationDate =
		expirationMeasure && expirationValue && expirationValue > 0
			? getPostponedDateFromReferenceDate({ date: new Date(), unit: expirationMeasure, value: expirationValue })
			: null;

	const insertedGrants = await tx
		.insert(couponGrants)
		.values({
			organizacaoId: organizationId,
			cupomId: coupon.id,
			clienteId: clientId,
			origem: "CAMPANHA",
			campanhaId: campaignId,
			quantidadeDisponivel: 1,
			expiracaoData: expirationDate,
		})
		.returning({ id: couponGrants.id });
	const grantId = insertedGrants[0]?.id;
	if (!grantId) {
		console.error(`[CAMPAIGN_COUPON] Failed to create coupon grant for client ${clientId} from campaign ${campaignId}.`);
		return null;
	}

	console.log(
		`[CAMPAIGN_COUPON] Granted coupon ${coupon.codigo} to client ${clientId} from campaign ${campaignId}. ` +
			`Expires: ${expirationDate?.toISOString() ?? "coupon validity"}.`,
	);

	return {
		grantId,
		couponCode: coupon.codigo,
		couponTitle: coupon.titulo,
		expirationDate,
	};
}

type GenerateCouponGrantsForCampaignBatchParams = {
	tx: DBTransaction;
	organizationId: string;
	campaignId: string;
	clientIds: string[];
	couponId: string;
	expirationMeasure: TTimeDurationUnitsEnum | null;
	expirationValue: number | null;
};

/**
 * Versão em lote (padrão generateCashbackForCampaignBatch): uma atribuição por cliente,
 * em um único insert, para os fluxos que disparam campanhas em massa.
 */
export async function generateCouponGrantsForCampaignBatch({
	tx,
	organizationId,
	campaignId,
	clientIds,
	couponId,
	expirationMeasure,
	expirationValue,
}: GenerateCouponGrantsForCampaignBatchParams): Promise<{
	generatedCount: number;
	couponCode: string | null;
	couponTitle: string | null;
	expirationDate: Date | null;
}> {
	const uniqueClientIds = Array.from(new Set(clientIds));
	if (uniqueClientIds.length === 0) return { generatedCount: 0, couponCode: null, couponTitle: null, expirationDate: null };

	const coupon = await tx.query.coupons.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, couponId), eq(fields.organizacaoId, organizationId)),
		columns: { id: true, codigo: true, titulo: true, ativo: true, escopo: true, vigenciaFim: true },
	});
	if (!coupon || !coupon.ativo || coupon.escopo !== "INDIVIDUAL" || (coupon.vigenciaFim && coupon.vigenciaFim < new Date())) {
		console.error(`[CAMPAIGN_COUPON] Coupon ${couponId} is unavailable for batch grant generation. Skipping batch.`);
		return { generatedCount: 0, couponCode: null, couponTitle: null, expirationDate: null };
	}

	const expirationDate =
		expirationMeasure && expirationValue && expirationValue > 0
			? getPostponedDateFromReferenceDate({ date: new Date(), unit: expirationMeasure, value: expirationValue })
			: null;

	await tx.insert(couponGrants).values(
		uniqueClientIds.map((clientId) => ({
			organizacaoId: organizationId,
			cupomId: coupon.id,
			clienteId: clientId,
			origem: "CAMPANHA" as const,
			campanhaId: campaignId,
			quantidadeDisponivel: 1,
			expiracaoData: expirationDate,
		})),
	);

	console.log(`[CAMPAIGN_COUPON] Granted coupon ${coupon.codigo} to ${uniqueClientIds.length} clients from campaign ${campaignId}.`);

	return { generatedCount: uniqueClientIds.length, couponCode: coupon.codigo, couponTitle: coupon.titulo, expirationDate };
}
