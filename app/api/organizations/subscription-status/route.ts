import { resolveSubscriptionAccess } from "@/config";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getSubscriptionActivationContext } from "@/lib/onboarding/activation-status";
import { resolveBuiltSummary, resolveTrialNarrative, type TBuiltSummaryItem, type TTrialNarrative } from "@/lib/subscriptions/activation-narrative";
import { db } from "@/services/drizzle";
import dayjs from "dayjs";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

type TSubscriptionStatusMode = "success" | "warn" | "fail";

/**
 * O que a superfície de assinatura deve oferecer como ação principal. `ATUALIZAR_PAGAMENTO`
 * só aparece quando existe uma cobrança em aberto que o portal do Stripe resolve — quem teve
 * o cartão recusado não precisa escolher plano de novo, precisa trocar o meio de pagamento.
 * Criar um segundo checkout nesse estado gera assinatura duplicada no Stripe.
 */
export type TSubscriptionStatusAction = "ASSINAR" | "ATUALIZAR_PAGAMENTO";

type TSubscriptionStatusData = {
	ativa: boolean;
	status: string;
	modo: TSubscriptionStatusMode;
	mensagem: string;
	acao: TSubscriptionStatusAction;
	/** Antes da ativação, o selo leva ao próximo passo da loja em vez de abrir os planos. */
	proximoPasso: TTrialNarrative["proximoPasso"];
	/** O que a loja já construiu, com números exatos; vazio fora do fim do teste e do bloqueio. */
	construido: TBuiltSummaryItem[];
};

async function getSubscriptionStatus(): Promise<{ data: TSubscriptionStatusData; message: string }> {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Não autenticado.");
	if (!session.membership) throw new createHttpError.BadRequest("Nenhuma organização associada.");

	const orgId = session.membership.organizacao.id;
	const org = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
		// Only what the access decision and the action read — the full row carries the POI QR code
		// data URLs and the configuration jsonb, and this endpoint runs on most page loads.
		columns: {
			stripeCustomerId: true,
			stripeSubscriptionStatus: true,
			stripeSubscriptionStatusUltimaAlteracao: true,
			periodoTesteInicio: true,
			periodoTesteFim: true,
			assinaturaPeriodoPagoFim: true,
			assinaturaAcessoProvisorioFim: true,
		},
	});

	if (!org) throw new createHttpError.NotFound("Organização não encontrada.");

	// Decisão de acesso centralizada (mesma função usada em assinaturaAtiva da sessão) — aqui só
	// traduzimos o resultado em status/mensagem para o banner e o paywall.
	const access = resolveSubscriptionAccess({
		stripeStatus: org.stripeSubscriptionStatus,
		stripeStatusChangedAt: org.stripeSubscriptionStatusUltimaAlteracao,
		trialStart: org.periodoTesteInicio,
		trialEnd: org.periodoTesteFim,
		paidPeriodEnd: org.assinaturaPeriodoPagoFim,
		provisionalAccessEnd: org.assinaturaAcessoProvisorioFim,
	});
	console.log("[INFO] [SUBSCRIPTION_STATUS]", {
		orgId,
		stripeStatus: org.stripeSubscriptionStatus,
		reason: access.reason,
		mode: access.mode,
		daysRemaining: access.daysRemaining,
	});

	// O portal do Stripe exige um customer — sem ele a rota `billing-portal` responde 400, então
	// o fallback é sempre o checkout.
	const canUseBillingPortal = !!org.stripeCustomerId;
	const acaoDeCobrancaPendente: TSubscriptionStatusAction = canUseBillingPortal ? "ATUALIZAR_PAGAMENTO" : "ASSINAR";

	const respond = (
		data: Omit<TSubscriptionStatusData, "proximoPasso" | "construido"> & Partial<Pick<TSubscriptionStatusData, "proximoPasso" | "construido">>,
	) => ({
		data: { proximoPasso: null, construido: [], ...data },
		message: "Status da assinatura obtido com sucesso.",
	});

	// Perto do fim do teste, na carência e no bloqueio depois do teste, o texto depende da ativação
	// (lib/subscriptions/activation-narrative.ts). É a única parte cara do endpoint, por isso só roda
	// nesses estados, e uma falha nela nunca derruba o selo nem o paywall: cai no texto de sempre.
	const trialNarrativeNeeded = (access.reason === "TRIAL" && access.mode !== "success") || access.reason === "TRIAL_GRACE";
	const trialExpired = access.reason === "BLOQUEADO" && !!org.periodoTesteInicio && !!org.periodoTesteFim && !org.stripeSubscriptionStatus;
	let narrative: TTrialNarrative | null = null;
	let construido: TBuiltSummaryItem[] = [];
	if ((trialNarrativeNeeded || trialExpired) && org.periodoTesteFim) {
		try {
			const context = await getSubscriptionActivationContext({ executor: db, organizationId: orgId });
			if (trialNarrativeNeeded && (access.reason === "TRIAL" || access.reason === "TRIAL_GRACE")) {
				narrative = resolveTrialNarrative({
					reason: access.reason,
					daysRemaining: access.daysRemaining ?? 0,
					trialEnd: org.periodoTesteFim,
					activation: context.activation,
				});
			}
			if (access.reason === "TRIAL_GRACE" || trialExpired)
				construido = resolveBuiltSummary({ segmento: context.activation.segmento, counts: context.counts });
		} catch (error) {
			console.error("[WARN] [SUBSCRIPTION_STATUS] Falha ao calcular a ativação:", error);
		}
	}
	const plural = (days: number) => (days !== 1 ? "s" : "");

	if (access.reason === "PAGO") {
		return respond({
			ativa: true,
			status: "Assinatura ativa",
			modo: "success",
			mensagem: "Sua assinatura está ativa.",
			acao: "ASSINAR",
		});
	}

	if (access.reason === "PROVISORIO") {
		// Boleto emitido ou PIX aguardando confirmação — acesso otimista com data-limite local.
		const limitDate = org.assinaturaAcessoProvisorioFim ? dayjs(org.assinaturaAcessoProvisorioFim).format("DD/MM/YYYY") : null;
		return respond({
			ativa: true,
			status: "Confirmando pagamento",
			modo: "warn",
			mensagem: limitDate
				? `Aguardando a confirmação do seu pagamento. Se você pagou por boleto, a compensação pode levar até 2 dias úteis. Seu acesso está garantido até ${limitDate}.`
				: "Aguardando a confirmação do seu pagamento. Isso pode levar alguns minutos.",
			acao: acaoDeCobrancaPendente,
		});
	}

	if (access.reason === "GRACE_PAST_DUE") {
		const daysRemaining = access.daysRemaining ?? 0;
		return respond({
			ativa: true,
			status: "Pagamento pendente",
			modo: "warn",
			mensagem: `Pagamento pendente. O acesso será suspenso em ${daysRemaining} dia${plural(daysRemaining)} — regularize sua assinatura.`,
			acao: acaoDeCobrancaPendente,
		});
	}

	if (access.reason === "TRIAL") {
		const daysRemaining = access.daysRemaining ?? 0;
		if (access.mode === "success") {
			return respond({
				ativa: true,
				status: "Período de teste ativo",
				modo: "success",
				mensagem: `Período de teste ativo. Restam ${daysRemaining} dias.`,
				acao: "ASSINAR",
			});
		}
		return respond({
			ativa: true,
			status: narrative?.status ?? `Período de teste encerra em ${daysRemaining} dia${plural(daysRemaining)}`,
			modo: "warn",
			mensagem:
				narrative?.mensagem ?? `Seu período de teste encerra em ${daysRemaining} dia${plural(daysRemaining)}. Adquira um plano para não perder o acesso.`,
			acao: "ASSINAR",
			proximoPasso: narrative?.proximoPasso ?? null,
		});
	}

	if (access.reason === "TRIAL_GRACE") {
		const daysRemaining = access.daysRemaining ?? 0;
		return respond({
			ativa: true,
			status: narrative?.status ?? "Teste encerrado",
			modo: "warn",
			mensagem:
				narrative?.mensagem ?? `Seu período de teste encerrou. Regularize em até ${daysRemaining} dia${plural(daysRemaining)} para manter o acesso.`,
			acao: "ASSINAR",
			proximoPasso: narrative?.proximoPasso ?? null,
			construido,
		});
	}

	// BLOQUEADO — a mensagem varia com o motivo do bloqueio.
	if (org.stripeSubscriptionStatus === "past_due") {
		return respond({
			ativa: false,
			status: "Acesso suspenso",
			modo: "fail",
			mensagem: "Pagamento pendente há mais de 15 dias. Acesso suspenso — regularize sua assinatura.",
			acao: acaoDeCobrancaPendente,
		});
	}

	if (
		org.stripeSubscriptionStatus === "incomplete" ||
		org.stripeSubscriptionStatus === "incomplete_expired" ||
		org.stripeSubscriptionStatus === "unpaid"
	) {
		// `incomplete_expired` é terminal: a fatura inicial morreu e o portal não tem o que abrir,
		// então esse caso volta para o checkout mesmo tendo customer no Stripe.
		const expirou = org.stripeSubscriptionStatus === "incomplete_expired";
		return respond({
			ativa: false,
			status: "Pagamento não confirmado",
			modo: "fail",
			mensagem: "Não conseguimos confirmar o pagamento da sua assinatura. Regularize para continuar utilizando a plataforma.",
			acao: expirou ? "ASSINAR" : acaoDeCobrancaPendente,
		});
	}

	if (org.stripeSubscriptionStatus === "canceled") {
		return respond({
			ativa: false,
			status: "Assinatura cancelada",
			modo: "fail",
			mensagem: "Sua assinatura foi cancelada. Adquira um plano para continuar utilizando a plataforma.",
			acao: "ASSINAR",
		});
	}

	if (org.periodoTesteInicio && org.periodoTesteFim) {
		return respond({
			ativa: false,
			status: "Acesso suspenso",
			modo: "fail",
			mensagem: "Seu período de teste e o prazo de regularização expiraram. Adquira um plano para continuar.",
			acao: "ASSINAR",
			construido,
		});
	}

	return respond({
		ativa: false,
		status: "Sem assinatura",
		modo: "fail",
		mensagem: "Nenhuma assinatura encontrada. Adquira um plano para utilizar a plataforma.",
		acao: "ASSINAR",
	});
}

export type TGetSubscriptionStatusOutput = Awaited<ReturnType<typeof getSubscriptionStatus>>;

async function getSubscriptionStatusRoute(_request: NextRequest) {
	const result = await getSubscriptionStatus();
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSubscriptionStatusRoute });
