import { SUBSCRIPTION_GRACE_PERIOD_DAYS } from "@/config";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

type TSubscriptionStatusMode = "success" | "warn" | "fail";

type TSubscriptionStatusData = {
	ativa: boolean;
	status: string;
	modo: TSubscriptionStatusMode;
	mensagem: string;
};

async function getSubscriptionStatus(): Promise<{ data: TSubscriptionStatusData; message: string }> {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Não autenticado.");
	if (!session.membership) throw new createHttpError.BadRequest("Nenhuma organização associada.");

	const orgId = session.membership.organizacao.id;
	const org = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
	});

	if (!org) throw new createHttpError.NotFound("Organização não encontrada.");

	const now = new Date();
	const stripeStatus = org.stripeSubscriptionStatus;
	const statusChangedAt = org.stripeSubscriptionStatusUltimaAlteracao;
	const trialStart = org.periodoTesteInicio;
	const trialEnd = org.periodoTesteFim;

	// 1. Active Stripe subscription
	if (stripeStatus === "active") {
		return {
			data: {
				ativa: true,
				status: "Assinatura ativa",
				modo: "success",
				mensagem: "Sua assinatura está ativa.",
			},
			message: "Status da assinatura obtido com sucesso.",
		};
	}

	// 2. Past due Stripe subscription (grace period)
	if (stripeStatus === "past_due") {
		const daysSinceChange = statusChangedAt
			? Math.floor((now.getTime() - new Date(statusChangedAt).getTime()) / (1000 * 60 * 60 * 24))
			: 0; // no timestamp = conservative, treat as just changed
		const daysRemaining = SUBSCRIPTION_GRACE_PERIOD_DAYS - daysSinceChange;

		if (daysRemaining > 0) {
			return {
				data: {
					ativa: true,
					status: "Pagamento pendente",
					modo: "warn",
					mensagem: `Pagamento pendente há ${daysSinceChange} dia${daysSinceChange !== 1 ? "s" : ""}. O acesso será suspenso em ${daysRemaining} dia${daysRemaining !== 1 ? "s" : ""}.`,
				},
				message: "Status da assinatura obtido com sucesso.",
			};
		}

		return {
			data: {
				ativa: false,
				status: "Acesso suspenso",
				modo: "fail",
				mensagem: "Pagamento pendente há mais de 15 dias. Acesso suspenso — regularize sua assinatura.",
			},
			message: "Status da assinatura obtido com sucesso.",
		};
	}

	// 3. Canceled subscription
	if (stripeStatus === "canceled") {
		return {
			data: {
				ativa: false,
				status: "Assinatura cancelada",
				modo: "fail",
				mensagem: "Sua assinatura foi cancelada. Adquira um plano para continuar utilizando a plataforma.",
			},
			message: "Status da assinatura obtido com sucesso.",
		};
	}

	// 4. Trial period (no Stripe subscription)
	if (trialStart && trialEnd) {
		const trialEndDate = new Date(trialEnd);
		const msUntilTrialEnd = trialEndDate.getTime() - now.getTime();
		const daysUntilTrialEnd = Math.ceil(msUntilTrialEnd / (1000 * 60 * 60 * 24));

		// Trial still active, more than 7 days left
		if (daysUntilTrialEnd > 7) {
			return {
				data: {
					ativa: true,
					status: "Período de teste",
					modo: "success",
					mensagem: `Período de teste ativo. Restam ${daysUntilTrialEnd} dias.`,
				},
				message: "Status da assinatura obtido com sucesso.",
			};
		}

		// Trial active, 7 days or less
		if (daysUntilTrialEnd > 0) {
			return {
				data: {
					ativa: true,
					status: "Teste encerrando",
					modo: "warn",
					mensagem: `Seu período de teste encerra em ${daysUntilTrialEnd} dia${daysUntilTrialEnd !== 1 ? "s" : ""}. Adquira um plano para não perder o acesso.`,
				},
				message: "Status da assinatura obtido com sucesso.",
			};
		}

		// Trial ended, within grace period
		const daysSinceTrialEnd = Math.floor(Math.abs(msUntilTrialEnd) / (1000 * 60 * 60 * 24));
		const graceDaysRemaining = SUBSCRIPTION_GRACE_PERIOD_DAYS - daysSinceTrialEnd;

		if (graceDaysRemaining > 0) {
			return {
				data: {
					ativa: true,
					status: "Teste encerrado",
					modo: "warn",
					mensagem: `Seu período de teste encerrou. Regularize em até ${graceDaysRemaining} dia${graceDaysRemaining !== 1 ? "s" : ""} para manter o acesso.`,
				},
				message: "Status da assinatura obtido com sucesso.",
			};
		}

		// Trial + grace expired
		return {
			data: {
				ativa: false,
				status: "Acesso suspenso",
				modo: "fail",
				mensagem: "Seu período de teste e o prazo de regularização expiraram. Adquira um plano para continuar.",
			},
			message: "Status da assinatura obtido com sucesso.",
		};
	}

	// 5. No subscription, no trial
	return {
		data: {
			ativa: false,
			status: "Sem assinatura",
			modo: "fail",
			mensagem: "Nenhuma assinatura encontrada. Adquira um plano para utilizar a plataforma.",
		},
		message: "Status da assinatura obtido com sucesso.",
	};
}

export type TGetSubscriptionStatusOutput = Awaited<ReturnType<typeof getSubscriptionStatus>>;

async function getSubscriptionStatusRoute(_request: NextRequest) {
	const result = await getSubscriptionStatus();
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSubscriptionStatusRoute });
