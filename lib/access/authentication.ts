import type { TAccessPrincipalTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { accessCredentials, accessPrincipals } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import type { NextRequest } from "next/server";
import { getRequestClientInfo, recordAccessEvent } from "./events";
import { constantTimeEqual, hashAccessSecret, parseAccessCredentialToken } from "./tokens";

// Credencial verificada, antes de qualquer decisão sobre organização. `organizationId` é nulo
// apenas para `CONTA_PLATAFORMA` — o principal que fala com a base inteira (Control, time interno).
// Quem consome escolhe o que fazer com isso: rotas de dispositivo exigem organização
// (`authenticateExternalRequest`), o agente de IA deriva daqui o modo ORG ou PLATAFORMA.
export type TVerifiedAccessCredential = {
	principalId: string;
	credentialId: string;
	clientId: string;
	clientCode: string;
	organizationId: string | null;
	principalType: TAccessPrincipalTypeEnum;
	responsibleUserId: string | null;
	// Loja do principal (agent desktop / POI). Viaja no contexto porque a linha do principal já foi
	// lida aqui: o claim de impressão, chamado a cada poucos segundos, não precisa relê-la.
	storeId: string | null;
	scopes: ReadonlySet<string>;
};

// Contexto de um principal externo autenticado. Handlers e regras de negócio não conhecem
// formato de token, algoritmo de hash nem mecânica de rotação — apenas este contexto (§9.5).
export type TExternalActorContext = TVerifiedAccessCredential & {
	organizationId: string;
};

// Sessões humanas e principals externos resolvem para um contexto comum de auditoria/atribuição.
export type TActorContext =
	| {
			kind: "USER";
			userId: string;
			organizationId: string;
	  }
	| {
			kind: "EXTERNAL_PRINCIPAL";
			principalId: string;
			clientId: string;
			organizationId: string;
			scopes: ReadonlySet<string>;
	  };

// Atualização amostrada do último uso/acesso: evita uma escrita síncrona por requisição
// sem perder a utilidade operacional do dado (§9.8).
const LAST_USE_SAMPLING_MINUTES = 5;

export async function verifyAccessCredentialFromRequest(request: NextRequest): Promise<TVerifiedAccessCredential> {
	const { enderecoIp, userAgent } = getRequestClientInfo(request);

	const authorizationHeader = request.headers.get("authorization");
	if (!authorizationHeader?.startsWith("Bearer ")) throw new createHttpError.Unauthorized("Credencial de acesso não informada.");

	const parsedToken = parseAccessCredentialToken(authorizationHeader.slice("Bearer ".length).trim());
	if (!parsedToken) throw new createHttpError.Unauthorized("Credencial de acesso inválida.");

	const credential = await db.query.accessCredentials.findFirst({
		where: eq(accessCredentials.idPublico, parsedToken.idPublico),
		with: {
			principal: {
				with: {
					cliente: true,
					grants: true,
				},
			},
		},
	});
	if (!credential) {
		await recordAccessEvent({ tipo: "AUTENTICACAO_FALHA", enderecoIp, userAgent, metadados: { motivo: "CREDENCIAL_NAO_ENCONTRADA" } });
		throw new createHttpError.Unauthorized("Credencial de acesso inválida.");
	}

	const failAuthentication = async (motivo: string, message: string) => {
		await recordAccessEvent({
			tipo: "AUTENTICACAO_FALHA",
			organizacaoId: credential.principal.organizacaoId,
			principalId: credential.principalId,
			credencialId: credential.id,
			enderecoIp,
			userAgent,
			metadados: { motivo },
		});
		throw new createHttpError.Unauthorized(message);
	};

	if (!constantTimeEqual(hashAccessSecret(parsedToken.segredo), credential.hashSegredo)) {
		await failAuthentication("SEGREDO_INCORRETO", "Credencial de acesso inválida.");
	}
	if (credential.dataRevogacao) await failAuthentication("CREDENCIAL_REVOGADA", "Credencial de acesso revogada.");
	if (credential.expiraEm && dayjs(credential.expiraEm).isBefore(dayjs())) {
		await failAuthentication("CREDENCIAL_EXPIRADA", "Credencial de acesso expirada.");
	}
	if (credential.principal.status !== "ATIVO" || credential.principal.dataRevogacao) {
		await failAuthentication("PRINCIPAL_INATIVO", "Dispositivo revogado ou inativo.");
	}
	if (credential.principal.cliente.status !== "ATIVO") {
		await failAuthentication("CLIENTE_INATIVO", "Aplicação cliente desativada.");
	}

	const scopes = new Set(credential.principal.grants.filter((grant) => !grant.dataRevogacao).map((grant) => grant.scope));

	const samplingCutoff = dayjs().subtract(LAST_USE_SAMPLING_MINUTES, "minutes");
	if (!credential.ultimoUso || dayjs(credential.ultimoUso).isBefore(samplingCutoff)) {
		const now = new Date();
		await Promise.all([
			db.update(accessCredentials).set({ ultimoUso: now }).where(eq(accessCredentials.id, credential.id)),
			db.update(accessPrincipals).set({ ultimoAcesso: now }).where(eq(accessPrincipals.id, credential.principalId)),
		]);
	}

	return {
		principalId: credential.principalId,
		credentialId: credential.id,
		clientId: credential.principal.accessClientId,
		clientCode: credential.principal.cliente.codigo,
		organizationId: credential.principal.organizacaoId,
		principalType: credential.principal.tipo,
		responsibleUserId: credential.principal.responsavelUsuarioId,
		storeId: credential.principal.lojaId,
		scopes,
	};
}

/**
 * Autenticação das rotas que operam **dentro de uma organização** — ponto de interação, agente
 * desktop, rotação de credencial.
 *
 * Uma credencial de plataforma é recusada aqui de propósito: ela não tem loja para imprimir,
 * lançar venda ou consultar cashback, e cair em qualquer dessas rotas com `organizacaoId` nulo
 * seria um filtro de tenancy silenciosamente ausente. Quem precisa dela usa o agente de IA.
 */
export async function authenticateExternalRequest(request: NextRequest): Promise<TExternalActorContext> {
	const credential = await verifyAccessCredentialFromRequest(request);
	if (!credential.organizationId) {
		throw new createHttpError.Forbidden("Esta credencial não está vinculada a uma organização.");
	}
	return { ...credential, organizationId: credential.organizationId };
}

// Igualdade exata, sem wildcards (§9.4 do plano).
export function requireExternalScope(actor: TExternalActorContext, scope: string) {
	if (!actor.scopes.has(scope)) throw new createHttpError.Forbidden(`Permissão necessária não concedida a este dispositivo: ${scope}.`);
}
