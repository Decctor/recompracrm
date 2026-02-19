"use server";
import { SESSION_COOKIE_NAME, checkSubscriptionStatus } from "@/config";
import { db } from "@/services/drizzle";
import { type TAuthSessionEntity, authSessions } from "@/services/drizzle/schema";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from "@oslojs/encoding";
import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import type { TAuthUserSession } from "./types";

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

export async function validateSession(token: string) {
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

	// We gotta find the session and its respective user in the db
	const session = await db.query.authSessions.findFirst({
		where: (fields, { eq }) => eq(fields.id, sessionId),
	});

	if (!session) return null;

	const user = await db.query.users.findFirst({
		where: (fields, { eq }) => eq(fields.id, session.usuarioId),
	});
	if (!user) {
		console.log("No user found running --validateSession-- method.");
		// // Deleting the session token cookie
		// await deleteSessionTokenCookie();
		return null;
	}

	const sessionUserActiveOrganizationId = session.organizacaoAtivaId;
	let sessionUserActiveOrganizationMembership: TAuthUserSession["membership"] | null = null;
	if (sessionUserActiveOrganizationId) {
		console.log(`[INFO] [VALIDATE SESSION] Active organization was defined with ID: ${sessionUserActiveOrganizationId}`);
		const membership = await db.query.organizationMembers.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.usuarioId, session.usuarioId), eq(fields.organizacaoId, sessionUserActiveOrganizationId)),
			with: {
				organizacao: true,
			},
		});
		if (membership) {
			sessionUserActiveOrganizationMembership = {
				id: membership.id,
				usuarioVendedorId: membership.usuarioVendedorId,
				organizacao: {
					id: membership.organizacao.id,
					nome: membership.organizacao.nome,
					cnpj: membership.organizacao.cnpj,
					logoUrl: membership.organizacao.logoUrl,
					assinaturaAtiva: checkSubscriptionStatus({
						stripeStatus: membership.organizacao.stripeSubscriptionStatus,
						stripeStatusUltimaAlteracao: membership.organizacao.stripeSubscriptionStatusUltimaAlteracao,
						trialPeriodStart: membership.organizacao.periodoTesteInicio,
						trialPeriodEnd: membership.organizacao.periodoTesteFim,
					}),
					assinaturaPlano: membership.organizacao.assinaturaPlano,
					corPrimaria: membership.organizacao.corPrimaria,
					corPrimariaForeground: membership.organizacao.corPrimariaForeground,
					corSecundaria: membership.organizacao.corSecundaria,
					corSecundariaForeground: membership.organizacao.corSecundariaForeground,
					configuracao: membership.organizacao.configuracao,
					integracaoTipo: membership.organizacao.integracaoTipo,
					integracaoConfiguracao: membership.organizacao.integracaoConfiguracao,
					integracaoDataUltimaSincronizacao: membership.organizacao.integracaoDataUltimaSincronizacao,
				},
				permissoes: membership.permissoes,
			};
		}
	} else {
		console.log(`[INFO] [VALIDATE SESSION] No active organization was defined, fetching the most recent one for user ${session.usuarioId}`);
		const memberships = await db.query.organizationMembers.findMany({
			where: (fields, { eq }) => eq(fields.usuarioId, session.usuarioId),
			with: {
				organizacao: true,
			},
			orderBy: (fields, { desc }) => desc(fields.dataInsercao),
		});
		const mostRecentMembership = memberships[0];
		if (mostRecentMembership) {
			sessionUserActiveOrganizationMembership = {
				id: mostRecentMembership.id,
				usuarioVendedorId: mostRecentMembership.usuarioVendedorId,
				organizacao: {
					id: mostRecentMembership.organizacao.id,
					nome: mostRecentMembership.organizacao.nome,
					cnpj: mostRecentMembership.organizacao.cnpj,
					logoUrl: mostRecentMembership.organizacao.logoUrl,
					assinaturaAtiva: checkSubscriptionStatus({
						stripeStatus: mostRecentMembership.organizacao.stripeSubscriptionStatus,
						stripeStatusUltimaAlteracao: mostRecentMembership.organizacao.stripeSubscriptionStatusUltimaAlteracao,
						trialPeriodStart: mostRecentMembership.organizacao.periodoTesteInicio,
						trialPeriodEnd: mostRecentMembership.organizacao.periodoTesteFim,
					}),
					assinaturaPlano: mostRecentMembership.organizacao.assinaturaPlano,
					corPrimaria: mostRecentMembership.organizacao.corPrimaria,
					corPrimariaForeground: mostRecentMembership.organizacao.corPrimariaForeground,
					corSecundaria: mostRecentMembership.organizacao.corSecundaria,
					corSecundariaForeground: mostRecentMembership.organizacao.corSecundariaForeground,
					configuracao: mostRecentMembership.organizacao.configuracao,
					integracaoTipo: mostRecentMembership.organizacao.integracaoTipo,
					integracaoConfiguracao: mostRecentMembership.organizacao.integracaoConfiguracao,
					integracaoDataUltimaSincronizacao: mostRecentMembership.organizacao.integracaoDataUltimaSincronizacao,
				},
				permissoes: mostRecentMembership.permissoes,
			};
			await db.update(authSessions).set({ organizacaoAtivaId: mostRecentMembership.organizacao.id }).where(eq(authSessions.id, session.id));
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
	// Checking if the session is expired
	if (Date.now() > new Date(session.dataExpiracao).getTime()) {
		console.log("Session expired running --validateSession--");
		// If so, deleting the session
		await db.delete(authSessions).where(eq(authSessions.id, session.id));

		// // Deleting the session token cookie
		// await deleteSessionTokenCookie();
		return null;
	}
	// Checking if session expires in less 15 days
	if (dayjs().add(15, "days").isAfter(dayjs(session.dataExpiracao))) {
		// If so, extending the session to a month from now
		await db
			.update(authSessions)
			.set({ dataExpiracao: dayjs().add(1, "month").toDate() })
			.where(eq(authSessions.id, session.id));
	}

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
