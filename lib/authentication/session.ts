"use server";
import { SESSION_COOKIE_NAME, resolveSubscriptionAccess } from "@/config";
import { db } from "@/services/drizzle";
import { type TAuthSessionEntity, type TOrganizationEntity, type TOrganizationMemberEntity, authSessions } from "@/services/drizzle/schema";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from "@oslojs/encoding";
import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { TAuthSessionIntegrationSummary, TAuthUserSession } from "./types";

async function loadSessionIntegrationSummaries(organizationId: string): Promise<TAuthSessionIntegrationSummary[]> {
	const rows = await db.query.integrations.findMany({
		where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
		columns: {
			id: true,
			tipo: true,
			apelido: true,
			refExterno: true,
			ativo: true,
			status: true,
			dataUltimaSincronizacao: true,
		},
		orderBy: (fields, { asc }) => asc(fields.dataInsercao),
	});
	return rows;
}

export async function generateSessionToken(): Promise<string> {
	const tokenBytes = new Uint8Array(20);
	crypto.getRandomValues(tokenBytes);
	const token = encodeBase32LowerCaseNoPadding(tokenBytes).toLowerCase();
	return token;
}

type CreateSessionParams = {
	token: string;
	userId: string;
};
export async function createSession({ token, userId }: CreateSessionParams) {
	try {
		const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

		const sessionUserMembership = await db.query.organizationMembers.findFirst({
			where: (fields, { eq }) => eq(fields.usuarioId, userId),
		});
		const session: TAuthSessionEntity = {
			id: sessionId,
			usuarioId: userId,
			usuarioAgente: null,
			usuarioDispositivo: null,
			usuarioEnderecoIp: null,
			usuarioNavegador: null,
			organizacaoAtivaId: sessionUserMembership?.organizacaoId ?? null,
			dataExpiracao: dayjs().add(1, "month").toDate(),
		};

		await db.insert(authSessions).values(session).returning({ insertedId: authSessions.id });
		return session;
	} catch (error) {
		console.log("Error running createSession", error);
		throw error;
	}
}

type TSessionMembershipRow = Pick<TOrganizationMemberEntity, "id" | "usuarioVendedorId" | "permissoes"> & {
	organizacao: TOrganizationEntity;
};
function buildSessionMembership(membership: TSessionMembershipRow, integracoes: TAuthSessionIntegrationSummary[]): NonNullable<TAuthUserSession["membership"]> {
	const organizacao = membership.organizacao;
	return {
		id: membership.id,
		usuarioVendedorId: membership.usuarioVendedorId,
		organizacao: {
			id: organizacao.id,
			nome: organizacao.nome,
			slug: organizacao.slug,
			cnpj: organizacao.cnpj,
			logoUrl: organizacao.logoUrl,
			assinaturaAtiva: resolveSubscriptionAccess({
				stripeStatus: organizacao.stripeSubscriptionStatus,
				stripeStatusChangedAt: organizacao.stripeSubscriptionStatusUltimaAlteracao,
				trialStart: organizacao.periodoTesteInicio,
				trialEnd: organizacao.periodoTesteFim,
				paidPeriodEnd: organizacao.assinaturaPeriodoPagoFim,
				provisionalAccessEnd: organizacao.assinaturaAcessoProvisorioFim,
			}).active,
			assinaturaPlano: organizacao.assinaturaPlano,
			corPrimaria: organizacao.corPrimaria,
			corPrimariaForeground: organizacao.corPrimariaForeground,
			corSecundaria: organizacao.corSecundaria,
			corSecundariaForeground: organizacao.corSecundariaForeground,
			poiQrCodeKioskDataUrl: organizacao.poiQrCodeKioskDataUrl,
			poiQrCodeMobileDataUrl: organizacao.poiQrCodeMobileDataUrl,
			poiConfirmacaoValorObrigatoria: organizacao.poiConfirmacaoValorObrigatoria,
			poiConfiguracao: organizacao.poiConfiguracao,
			configuracao: organizacao.configuracao,
			fiscalEmissaoAutomatica: organizacao.fiscalEmissaoAutomatica,
			integracoes,
			dataOnboardingConclusao: organizacao.dataOnboardingConclusao,
		},
		permissoes: membership.permissoes,
	};
}

/**
 * Roda em toda requisição autenticada, então o número de idas ao banco em série importa: sessão +
 * usuário saem numa única query, e membership, integrações e a renovação da sessão dependem só da
 * sessão — vão juntas, em paralelo.
 */
export async function validateSession(token: string) {
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

	const sessionWithUser = await db.query.authSessions.findFirst({
		where: (fields, { eq }) => eq(fields.id, sessionId),
		with: { usuario: true },
	});

	if (!sessionWithUser) return null;
	const { usuario: user, ...session } = sessionWithUser;

	// Sessão expirada não precisa de mais nenhuma consulta.
	if (Date.now() > new Date(session.dataExpiracao).getTime()) {
		console.log("Session expired running --validateSession--");
		await db.delete(authSessions).where(eq(authSessions.id, session.id));
		return null;
	}

	if (!user) {
		console.log("No user found running --validateSession-- method.");
		return null;
	}

	// Expira em menos de 15 dias: renova para um mês a partir de agora (em paralelo com as leituras).
	const extendSessionPromise = dayjs().add(15, "days").isAfter(dayjs(session.dataExpiracao))
		? db
				.update(authSessions)
				.set({ dataExpiracao: dayjs().add(1, "month").toDate() })
				.where(eq(authSessions.id, session.id))
		: null;

	const sessionUserActiveOrganizationId = session.organizacaoAtivaId;
	let sessionUserActiveOrganizationMembership: TAuthUserSession["membership"] | null = null;
	if (sessionUserActiveOrganizationId) {
		console.log(`[INFO] [VALIDATE SESSION] Active organization was defined with ID: ${sessionUserActiveOrganizationId}`);
		const [membership, integracoes] = await Promise.all([
			db.query.organizationMembers.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.usuarioId, session.usuarioId), eq(fields.organizacaoId, sessionUserActiveOrganizationId)),
				with: {
					organizacao: true,
				},
			}),
			loadSessionIntegrationSummaries(sessionUserActiveOrganizationId),
			extendSessionPromise,
		]);
		if (membership) {
			sessionUserActiveOrganizationMembership = buildSessionMembership(membership, integracoes);
		}
	} else {
		console.log(`[INFO] [VALIDATE SESSION] No active organization was defined, fetching the most recent one for user ${session.usuarioId}`);
		const [mostRecentMembership] = await Promise.all([
			db.query.organizationMembers.findFirst({
				where: (fields, { eq }) => eq(fields.usuarioId, session.usuarioId),
				with: {
					organizacao: true,
				},
				orderBy: (fields, { desc }) => desc(fields.dataInsercao),
			}),
			extendSessionPromise,
		]);
		if (mostRecentMembership) {
			const [integracoes] = await Promise.all([
				loadSessionIntegrationSummaries(mostRecentMembership.organizacao.id),
				db.update(authSessions).set({ organizacaoAtivaId: mostRecentMembership.organizacao.id }).where(eq(authSessions.id, session.id)),
			]);
			sessionUserActiveOrganizationMembership = buildSessionMembership(mostRecentMembership, integracoes);
			session.organizacaoAtivaId = mostRecentMembership.organizacao.id;
		}
	}
	const authSession: TAuthUserSession = {
		session: {
			id: session.id,
			usuarioId: session.usuarioId,
			usuarioDispositivo: session.usuarioDispositivo,
			usuarioNavegador: session.usuarioNavegador,
			organizacaoAtivaId: session.organizacaoAtivaId,
			dataExpiracao: session.dataExpiracao,
		},
		user: {
			admin: user.admin,
			id: session.usuarioId,
			nome: user.nome,
			telefone: user.telefone,
			avatarUrl: user.avatarUrl,
			email: user.email,
		},
		membership: sessionUserActiveOrganizationMembership,
	};

	return authSession;
}

export const getCurrentSession = async () => {
	const cookieStore = await cookies();

	const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
	if (token === null) return null;

	const sessionResult = await validateSession(token);
	return sessionResult;
};

export const getCurrentSessionUncached = async () => {
	const cookieStore = await cookies();

	const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
	if (token === null) return null;

	const sessionResult = await validateSession(token);
	return sessionResult;
};

type SetSessionCookieParams = {
	token: string;
	expiresAt: Date;
};
export async function setSetSessionCookie({ token, expiresAt }: SetSessionCookieParams) {
	try {
		const cookiesStore = await cookies();
		const resp = cookiesStore.set(SESSION_COOKIE_NAME, token, {
			httpOnly: true,
			path: "/",
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			expires: new Date(expiresAt),
		});
	} catch (error) {
		console.log("ERROR SETTING THE COOKIE", error);
		throw error;
	}
}

export async function deleteSession(sessionId: string) {
	return await db.delete(authSessions).where(eq(authSessions.id, sessionId));
}

export async function deleteSessionTokenCookie() {
	const cookiesStore = await cookies();

	cookiesStore.set(SESSION_COOKIE_NAME, "", {
		httpOnly: true,
		path: "/",
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
	});

	return;
}
