import { applyCampaignBonusToInteractionMetadata } from "@/lib/campaigns/interaction-metadata";
import { getPostponedDateFromReferenceDate } from "@/lib/dates";
import { formatDateAsLocale } from "@/lib/formatting";
import type { TInteractionContextMetadados } from "@/lib/message-templates";
import type { TCashbackProgramAccumulationTypeEnum, TTimeDurationUnitsEnum } from "@/schemas/enums";
import { type DBTransaction, db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackPrograms, coupons } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";

/**
 * Bônus de campanha (cashback/cupom) no envio — Fase 3 do redesign.
 *
 * O bônus é concedido na mesma transação que registra a interação, depois que o provedor aceitou
 * a mensagem. Como a mensagem precisa renderizar o código do cupom e o novo saldo ANTES do envio,
 * `projectCampaignSendContext` calcula o contexto projetado (sem escrever nada); a concessão real
 * (`grantCampaignBonusOnSend`) acontece só se o envio saiu. Não existe mais estorno: quem não
 * recebeu a mensagem nunca ganhou o bônus.
 */

export type TCampaignBonusConfig = {
	id: string;
	cashbackGeracaoAtivo: boolean;
	cashbackGeracaoTipo: TCashbackProgramAccumulationTypeEnum | null;
	cashbackGeracaoValor: number | null;
	cashbackGeracaoExpiracaoMedida: TTimeDurationUnitsEnum | null;
	cashbackGeracaoExpiracaoValor: number | null;
	cupomGeracaoAtivo?: boolean | null;
	cupomGeracaoCupomId?: string | null;
	cupomGeracaoExpiracaoMedida?: TTimeDurationUnitsEnum | null;
	cupomGeracaoExpiracaoValor?: number | null;
};

export type TCampaignSendBonusProgram = {
	ativo: boolean;
	terminologia: TInteractionContextMetadados["terminologia"];
} | null;

export async function loadOrganizationCashbackProgramForSend(organizationId: string): Promise<TCampaignSendBonusProgram> {
	const program = await db.query.cashbackPrograms.findFirst({
		where: eq(cashbackPrograms.organizacaoId, organizationId),
		columns: { ativo: true, terminologia: true },
	});
	return program ?? null;
}

type TProjectedCoupon = Pick<TInteractionContextMetadados, "cupomCodigo" | "cupomTitulo" | "cupomExpiracaoData">;

async function projectCouponContext({
	organizationId,
	campaign,
	now,
}: {
	organizationId: string;
	campaign: TCampaignBonusConfig;
	now: Date;
}): Promise<TProjectedCoupon> {
	if (!campaign.cupomGeracaoAtivo || !campaign.cupomGeracaoCupomId) return {};

	const coupon = await db.query.coupons.findFirst({
		where: and(eq(coupons.id, campaign.cupomGeracaoCupomId), eq(coupons.organizacaoId, organizationId)),
		columns: { codigo: true, titulo: true, ativo: true, escopo: true, vigenciaFim: true },
	});
	if (!coupon || !coupon.ativo || coupon.escopo !== "INDIVIDUAL" || (coupon.vigenciaFim && coupon.vigenciaFim < now)) return {};

	const expirationDate =
		campaign.cupomGeracaoExpiracaoMedida && campaign.cupomGeracaoExpiracaoValor && campaign.cupomGeracaoExpiracaoValor > 0
			? getPostponedDateFromReferenceDate({ date: now, unit: campaign.cupomGeracaoExpiracaoMedida, value: campaign.cupomGeracaoExpiracaoValor })
			: null;

	return {
		cupomCodigo: coupon.codigo,
		cupomTitulo: coupon.titulo,
		cupomExpiracaoData: (expirationDate ? formatDateAsLocale(expirationDate) : undefined) ?? undefined,
	};
}

export function computeCampaignCashbackAmount({ campaign, saleValue }: { campaign: TCampaignBonusConfig; saleValue: number | null }): number {
	if (!campaign.cashbackGeracaoAtivo || !campaign.cashbackGeracaoTipo || !campaign.cashbackGeracaoValor || campaign.cashbackGeracaoValor <= 0)
		return 0;
	if (campaign.cashbackGeracaoTipo === "PERCENTUAL") {
		if (saleValue == null || saleValue <= 0) return 0;
		return saleValue * (campaign.cashbackGeracaoValor / 100);
	}
	return campaign.cashbackGeracaoValor;
}

/**
 * Contexto de variáveis para renderizar a mensagem: contexto congelado no enfileiramento +
 * saldo atual do cliente + projeção do bônus que será concedido se o envio sair.
 * Só leitura; nada é gravado aqui.
 */
export async function projectCampaignSendContext({
	organizationId,
	clientId,
	campaign,
	program,
	baseContext,
	saleValue,
	now = new Date(),
}: {
	organizationId: string;
	clientId: string;
	campaign: TCampaignBonusConfig;
	program: TCampaignSendBonusProgram;
	baseContext: TInteractionContextMetadados | null | undefined;
	saleValue: number | null;
	now?: Date;
}): Promise<TInteractionContextMetadados> {
	const [balance, couponContext] = await Promise.all([
		db.query.cashbackProgramBalances.findFirst({
			where: and(eq(cashbackProgramBalances.organizacaoId, organizationId), eq(cashbackProgramBalances.clienteId, clientId)),
			columns: { saldoValorDisponivel: true, saldoValorAcumuladoTotal: true, saldoValorResgatadoTotal: true },
		}),
		projectCouponContext({ organizationId, campaign, now }),
	]);

	// O saldo atual prevalece sobre o congelado no gatilho: entre o enfileiramento e o envio o
	// cliente pode ter acumulado/resgatado, e a mensagem deve refletir o que ele verá na loja.
	const availableBalance = balance?.saldoValorDisponivel ?? baseContext?.cashbackSaldoDisponivel ?? 0;
	const accumulatedTotal = balance?.saldoValorAcumuladoTotal ?? baseContext?.cashbackTotalAcumuladoVida ?? 0;
	const redeemedTotal = balance?.saldoValorResgatadoTotal ?? baseContext?.cashbackTotalResgatadoVida ?? 0;

	const bonusAmount = program?.ativo ? computeCampaignCashbackAmount({ campaign, saleValue }) : 0;

	return {
		...baseContext,
		terminologia: baseContext?.terminologia ?? program?.terminologia ?? "DINHEIRO",
		cashbackSaldoDisponivel: availableBalance + bonusAmount,
		compraCashbackNovoSaldo: (baseContext?.compraCashbackNovoSaldo ?? availableBalance) + bonusAmount,
		cashbackTotalAcumuladoVida: accumulatedTotal + bonusAmount,
		cashbackTotalResgatadoVida: redeemedTotal,
		...couponContext,
	};
}

/**
 * Concede o bônus de fato (transações de cashback e atribuição de cupom), dentro da transação que
 * registra a interação. Devolve o contexto com os valores reais pós-concessão, que é o que fica
 * em interactions.metadados.
 */
export async function grantCampaignBonusOnSend({
	tx,
	organizationId,
	clientId,
	campaign,
	interactionId,
	saleId,
	saleValue,
	context,
}: {
	tx: DBTransaction;
	organizationId: string;
	clientId: string;
	campaign: TCampaignBonusConfig;
	interactionId: string;
	saleId: string | null;
	saleValue: number | null;
	context: TInteractionContextMetadados;
}): Promise<{ metadata: TInteractionContextMetadados; bonusAmount: number | null }> {
	const result = await applyCampaignBonusToInteractionMetadata({
		tx,
		baseMetadata: context,
		campaign,
		organizationId,
		clientId,
		saleId,
		saleValue,
		interactionId,
		enabled: true,
	});
	return { metadata: result.metadata, bonusAmount: result.bonusAmount };
}
