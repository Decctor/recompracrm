import "server-only";
import { AppSubscriptionPlans } from "@/config";
import {
	type TEarningsCommission,
	type TEarningsPayout,
	type TEarningsReferral,
	buildPartnerEarningsSummary,
	buildPartnerStore,
	detectPixKeyType,
	getCommissionPayoutDate,
	getNextPayoutDate,
	getStoreInitials,
	maskPixKey,
} from "@/lib/platform-partnerships/earnings";
import { db } from "@/services/drizzle";
import { platformPartnerCommissions, platformPartnerPayouts, platformPartnerReferrals, platformPartners } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Carrega tudo o que o painel do parceiro mostra e passa pelas regras de `earnings.ts`. Um parceiro
 * tem dezenas de lojas, não milhares: uma leitura só alimenta início, lojas e extrato, e as três
 * telas contam a mesma história.
 */
export async function getPartnerByUserId(userId: string) {
	const partner = await db.query.platformPartners.findFirst({
		where: eq(platformPartners.usuarioId, userId),
		columns: {
			id: true,
			status: true,
			codigo: true,
			nome: true,
			tipoPessoa: true,
			chavePix: true,
			chavePixTipo: true,
			mensagemDivulgacao: true,
			dataCartaoVisualizado: true,
			dataAprovacao: true,
			dataInsercao: true,
		},
	});
	return partner ?? null;
}

function getPlanMonthlyPriceCentavos(plano: string | null) {
	if (!plano || !(plano in AppSubscriptionPlans)) return null;
	return Math.round(AppSubscriptionPlans[plano as keyof typeof AppSubscriptionPlans].pricing.monthly.price * 100);
}

export async function loadPartnerPanel({ partnerId, now = new Date() }: { partnerId: string; now?: Date }) {
	const [referralRows, commissionRows, payoutRows] = await Promise.all([
		db.query.platformPartnerReferrals.findMany({
			where: eq(platformPartnerReferrals.partnerId, partnerId),
			columns: { id: true, organizacaoNomeSnapshot: true, dataInsercao: true, status: true },
			with: {
				organizacao: {
					columns: {
						id: true,
						nome: true,
						assinaturaPlano: true,
						stripeSubscriptionStatus: true,
						periodoTesteFim: true,
						assinaturaPeriodoPagoFim: true,
					},
				},
			},
			orderBy: (fields, { desc }) => desc(fields.dataInsercao),
		}),
		db.query.platformPartnerCommissions.findMany({
			where: eq(platformPartnerCommissions.partnerId, partnerId),
			columns: {
				id: true,
				referralId: true,
				payoutId: true,
				numeroInvoiceAssinatura: true,
				valorInvoiceBrutoCentavos: true,
				valorBaseComissionavelCentavos: true,
				percentualComissaoBps: true,
				valorComissaoCentavos: true,
				ajusteOrigemCommissionId: true,
				status: true,
				dataElegibilidade: true,
				dataInsercao: true,
			},
		}),
		db.query.platformPartnerPayouts.findMany({
			where: eq(platformPartnerPayouts.partnerId, partnerId),
			columns: {
				id: true,
				status: true,
				valorTotalCentavos: true,
				dataPrevista: true,
				dataPagamento: true,
				competenciaInicio: true,
				competenciaFim: true,
				dataInsercao: true,
			},
			orderBy: (fields, { desc }) => desc(fields.dataInsercao),
		}),
	]);

	const commissions: TEarningsCommission[] = commissionRows;
	const payouts: TEarningsPayout[] = payoutRows;
	const payoutsById = new Map(payouts.map((payout) => [payout.id, payout]));
	const referrals: TEarningsReferral[] = referralRows.map((referral) => ({
		...referral,
		commissions: commissions.filter((commission) => commission.referralId === referral.id),
	}));

	const stores = referrals.map((referral) =>
		buildPartnerStore({
			referral,
			fallbackBaseCentavos: getPlanMonthlyPriceCentavos(referral.organizacao?.assinaturaPlano ?? null),
			payoutsById,
			now,
		}),
	);
	const resumo = buildPartnerEarningsSummary({ commissions, payouts, stores, now });

	// Extrato: comissões, PIX pagos e lojas que entraram, do mais recente para o mais antigo.
	const nextPayoutDate = getNextPayoutDate(now);
	const storesById = new Map(stores.map((store) => [store.id, store]));
	const extrato = [
		...commissions.map((commission) => ({
			tipo: "COMISSAO" as const,
			id: commission.id,
			data: commission.dataInsercao,
			lojaId: commission.referralId,
			lojaNome: storesById.get(commission.referralId)?.nome ?? "Loja",
			lojaIniciais: storesById.get(commission.referralId)?.iniciais ?? "?",
			numeroInvoiceAssinatura: commission.numeroInvoiceAssinatura,
			percentualComissaoBps: commission.percentualComissaoBps,
			ajuste: commission.ajusteOrigemCommissionId !== null,
			valorCentavos: commission.valorComissaoCentavos,
			status: commission.status,
			dataPix: getCommissionPayoutDate({ commission, payoutsById, nextPayoutDate }),
			payoutId: null,
		})),
		...payouts
			.filter((payout) => payout.status === "PAGO")
			.map((payout) => ({
				tipo: "PIX" as const,
				id: payout.id,
				data: payout.dataPagamento ?? payout.dataInsercao,
				competenciaInicio: payout.competenciaInicio,
				competenciaFim: payout.competenciaFim,
				valorCentavos: payout.valorTotalCentavos,
				payoutId: payout.id,
			})),
		...stores.map((store) => ({
			tipo: "INDICACAO" as const,
			id: `indicacao-${store.id}`,
			data: store.dataEntrada,
			lojaId: store.id,
			lojaNome: store.nome,
			lojaIniciais: store.iniciais,
			situacao: store.situacao,
			payoutId: null,
		})),
	].sort((a, b) => b.data.getTime() - a.data.getTime());

	return { stores, resumo, extrato, payouts, commissions };
}

/** Detalhe de um PIX do parceiro, com as comissões que o compõem. `null` se não for dele. */
export async function getPartnerPayoutDetail({ partnerId, payoutId }: { partnerId: string; payoutId: string }) {
	const payout = await db.query.platformPartnerPayouts.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, payoutId), eq(fields.partnerId, partnerId)),
		columns: {
			id: true,
			status: true,
			competenciaInicio: true,
			competenciaFim: true,
			valorTotalCentavos: true,
			metodo: true,
			chavePixSnapshot: true,
			comprovanteUrl: true,
			dataPrevista: true,
			dataPagamento: true,
			dataInsercao: true,
		},
		with: {
			commissions: {
				columns: {
					id: true,
					numeroInvoiceAssinatura: true,
					valorInvoiceBrutoCentavos: true,
					percentualComissaoBps: true,
					valorComissaoCentavos: true,
					ajusteOrigemCommissionId: true,
					status: true,
				},
				with: {
					referral: {
						columns: { id: true, organizacaoNomeSnapshot: true },
						with: { organizacao: { columns: { nome: true } } },
					},
				},
			},
		},
	});
	if (!payout || payout.status === "CANCELADO") return null;

	const partner = await db.query.platformPartners.findFirst({
		where: eq(platformPartners.id, partnerId),
		columns: { nome: true, cpfCnpj: true, chavePix: true, chavePixTipo: true },
	});

	const { chavePixSnapshot, commissions, ...rest } = payout;
	const chavePix = chavePixSnapshot ?? partner?.chavePix ?? null;
	return {
		...rest,
		parceiroNome: partner?.nome ?? null,
		// O snapshot pode ser uma chave antiga: o tipo cadastrado só vale se for a mesma chave.
		chavePixMascarada: chavePix
			? maskPixKey(chavePix, (chavePix === partner?.chavePix ? partner.chavePixTipo : null) ?? detectPixKeyType(chavePix))
			: null,
		comissoes: commissions
			.filter((commission) => commission.status !== "CANCELADA")
			.map(({ referral, ajusteOrigemCommissionId, ...commission }) => {
				const lojaNome = referral.organizacao?.nome ?? referral.organizacaoNomeSnapshot ?? "Loja excluída";
				return { ...commission, ajuste: ajusteOrigemCommissionId !== null, lojaId: referral.id, lojaNome, lojaIniciais: getStoreInitials(lojaNome) };
			})
			.sort((a, b) => b.valorComissaoCentavos - a.valorComissaoCentavos),
	};
}
export type TPartnerPayoutDetail = Exclude<Awaited<ReturnType<typeof getPartnerPayoutDetail>>, null>;
