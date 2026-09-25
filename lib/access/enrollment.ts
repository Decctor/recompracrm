import type { TAccessPrincipalTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import {
	type TAccessClientEntity,
	accessClients,
	accessCredentials,
	accessEnrollmentChallenges,
	accessGrants,
	accessPrincipals,
} from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, lt, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { recordAccessEvent } from "./events";
import { generateAccessCredentialToken, hashAccessSecret } from "./tokens";

// Alfabeto sem ambiguidade visual (sem 0/O, 1/I/L) — ≈49 bits em 10 caracteres, digitável
// em tablet e inviável de forçar dentro do TTL com o rate limiting ativo (§9.6 do plano).
const ENROLLMENT_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ENROLLMENT_CODE_LENGTH = 10;
const DEFAULT_CHALLENGE_TTL_MINUTES = 15;

function generateEnrollmentCode() {
	const randomBytes = new Uint8Array(ENROLLMENT_CODE_LENGTH);
	crypto.getRandomValues(randomBytes);
	let code = "";
	for (const byte of randomBytes) {
		code += ENROLLMENT_CODE_ALPHABET[byte % ENROLLMENT_CODE_ALPHABET.length];
	}
	// Exibido como XXXXX-XXXXX para facilitar a digitação.
	return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function normalizeEnrollmentCode(code: string) {
	return code.toUpperCase().replace(/[^2-9A-Z]/g, "");
}

// O tipo do principal deriva da categoria da aplicação cliente — não é escolhido pelo chamador.
const CLIENT_CATEGORY_PRINCIPAL_TYPES: Record<TAccessClientEntity["categoria"], TAccessPrincipalTypeEnum> = {
	NATIVO_MOBILE: "DISPOSITIVO",
	NATIVO_WEB_KIOSK: "DISPOSITIVO",
	TERMINAL_PAGAMENTO: "DISPOSITIVO",
	NATIVO_DESKTOP: "AGENTE_DESKTOP",
	SERVIDOR_EXTERNO: "CONTA_SERVICO",
	APLICACAO_PARCEIRA: "CONTA_SERVICO",
};

type TCreateEnrollmentChallengeParams = {
	principalId?: string | null;
	accessClientCodigo: string;
	organizacaoId: string;
	criadoPorId: string;
	nomeSugerido?: string | null;
	escoposSolicitados?: string[] | null;
	expiraEmMinutos?: number | null;
	maximoUsos?: number | null;
};
export async function createEnrollmentChallenge(params: TCreateEnrollmentChallengeParams) {
	const client = await db.query.accessClients.findFirst({
		where: and(eq(accessClients.codigo, params.accessClientCodigo), eq(accessClients.status, "ATIVO")),
	});
	if (!client) throw new createHttpError.NotFound("Aplicação cliente não encontrada ou inativa.");

	if (params.principalId) {
		const principal = await db.query.accessPrincipals.findFirst({
			where: and(eq(accessPrincipals.id, params.principalId), eq(accessPrincipals.organizacaoId, params.organizacaoId)),
		});
		if (!principal || principal.accessClientId !== client.id) throw new createHttpError.NotFound("Dispositivo não encontrado.");
		if (principal.tipo !== "AGENTE_DESKTOP") throw new createHttpError.BadRequest("A reconexão está disponível apenas para agentes desktop.");
		if (principal.status !== "ATIVO" || principal.dataRevogacao) throw new createHttpError.BadRequest("Dispositivo revogado ou inativo.");
	}

	// Interseção com o teto do cliente já na criação — o desafio nunca carrega scopes acima do permitido.
	const escoposSolicitados = params.escoposSolicitados?.length
		? params.escoposSolicitados.filter((scope) => client.escoposPermitidos.includes(scope))
		: client.escoposPermitidos;
	if (escoposSolicitados.length === 0) throw new createHttpError.BadRequest("Nenhum scope válido para esta aplicação cliente.");

	const code = generateEnrollmentCode();
	const expiraEm = dayjs()
		.add(params.expiraEmMinutos ?? DEFAULT_CHALLENGE_TTL_MINUTES, "minutes")
		.toDate();

	const [challenge] = await db
		.insert(accessEnrollmentChallenges)
		.values({
			principalId: params.principalId ?? null,
			accessClientId: client.id,
			organizacaoId: params.organizacaoId,
			hashCodigo: hashAccessSecret(normalizeEnrollmentCode(code)),
			nomeSugerido: params.nomeSugerido ?? null,
			escoposSolicitados,
			expiraEm,
			maximoUsos: params.maximoUsos ?? 1,
			criadoPorId: params.criadoPorId,
		})
		.returning({ id: accessEnrollmentChallenges.id });

	// O código é exibido uma única vez — apenas o hash é persistido.
	return { challengeId: challenge.id, code, expiraEm, escoposSolicitados, accessClientCodigo: client.codigo };
}

type TConsumeEnrollmentChallengeParams = {
	code: string;
	nome?: string | null;
	metadados?: Record<string, unknown> | null;
	enderecoIp: string | null;
	userAgent: string | null;
};
export async function consumeEnrollmentChallenge(params: TConsumeEnrollmentChallengeParams) {
	const failEnrollment = async (motivo: string, organizacaoId?: string | null) => {
		await recordAccessEvent({
			tipo: "ENROLLMENT_FALHA",
			organizacaoId,
			enderecoIp: params.enderecoIp,
			userAgent: params.userAgent,
			metadados: { motivo },
		});
		throw new createHttpError.Unauthorized("Código de ativação inválido ou expirado.");
	};

	const challenge = await db.query.accessEnrollmentChallenges.findFirst({
		where: eq(accessEnrollmentChallenges.hashCodigo, hashAccessSecret(normalizeEnrollmentCode(params.code))),
		// organizacao.nome viaja na resposta: o dispositivo exibe a organização vinculada sem
		// precisar de uma segunda chamada (configuration) logo após o pareamento.
		with: { cliente: true, organizacao: { columns: { nome: true } } },
	});
	if (!challenge) return await failEnrollment("CODIGO_NAO_ENCONTRADO");
	if (dayjs(challenge.expiraEm).isBefore(dayjs())) return await failEnrollment("CODIGO_EXPIRADO", challenge.organizacaoId);
	if (challenge.cliente.status !== "ATIVO") return await failEnrollment("CLIENTE_INATIVO", challenge.organizacaoId);

	const result = await db.transaction(async (tx) => {
		// Guarda de concorrência: o incremento condicionado a quantidade_usos < maximo_usos garante
		// que dois consumos simultâneos do mesmo código não excedam o limite.
		const [consumedChallenge] = await tx
			.update(accessEnrollmentChallenges)
			.set({
				quantidadeUsos: sql`${accessEnrollmentChallenges.quantidadeUsos} + 1`,
				dataConsumo: new Date(),
			})
			.where(and(eq(accessEnrollmentChallenges.id, challenge.id), lt(accessEnrollmentChallenges.quantidadeUsos, accessEnrollmentChallenges.maximoUsos)))
			.returning({ id: accessEnrollmentChallenges.id });
		if (!consumedChallenge) return null;

		let principal: { id: string; tipo: TAccessPrincipalTypeEnum; nome: string };
		if (challenge.principalId) {
			const [existingPrincipal] = await tx
				.update(accessPrincipals)
				.set({ ...(params.metadados ? { metadados: params.metadados } : {}), ultimoAcesso: new Date(), dataAtualizacao: new Date() })
				.where(and(eq(accessPrincipals.id, challenge.principalId), eq(accessPrincipals.status, "ATIVO")))
				.returning({ id: accessPrincipals.id, tipo: accessPrincipals.tipo, nome: accessPrincipals.nome });
			if (!existingPrincipal) return null;
			principal = existingPrincipal;
		} else {
			const [newPrincipal] = await tx
				.insert(accessPrincipals)
				.values({
					accessClientId: challenge.accessClientId,
					organizacaoId: challenge.organizacaoId,
					tipo: CLIENT_CATEGORY_PRINCIPAL_TYPES[challenge.cliente.categoria],
					nome: params.nome ?? challenge.nomeSugerido ?? `${challenge.cliente.nome} (novo dispositivo)`,
					metadados: params.metadados ?? null,
				})
				.returning({ id: accessPrincipals.id, tipo: accessPrincipals.tipo, nome: accessPrincipals.nome });
			principal = newPrincipal;
		}

		// Reforço do teto no consumo: mesmo que o teto do cliente tenha diminuído após a criação do desafio.
		const grantedScopes = challenge.escoposSolicitados.filter((scope) => challenge.cliente.escoposPermitidos.includes(scope));
		if (!challenge.principalId && grantedScopes.length > 0) {
			await tx.insert(accessGrants).values(
				grantedScopes.map((scope) => ({
					principalId: principal.id,
					scope,
					concedidoPorId: challenge.criadoPorId,
				})),
			);
		}

		const credentialType = principal.tipo === "CONTA_SERVICO" ? ("CHAVE_API" as const) : ("TOKEN_DISPOSITIVO" as const);
		const generated = generateAccessCredentialToken({ tipo: credentialType });
		const [credential] = await tx
			.insert(accessCredentials)
			.values({
				principalId: principal.id,
				tipo: credentialType,
				idPublico: generated.idPublico,
				prefixoExibicao: generated.prefixoExibicao,
				hashSegredo: generated.hashSegredo,
				descricao: challenge.principalId ? "Credencial criada para reconexão do agente desktop." : "Credencial criada no enrollment.",
			})
			.returning({ id: accessCredentials.id });

		return { principal, credentialId: credential.id, token: generated.token, grantedScopes };
	});
	if (!result) return await failEnrollment("USOS_ESGOTADOS", challenge.organizacaoId);

	await recordAccessEvent({
		tipo: "ENROLLMENT_CONCLUIDO",
		organizacaoId: challenge.organizacaoId,
		principalId: result.principal.id,
		credencialId: result.credentialId,
		enderecoIp: params.enderecoIp,
		userAgent: params.userAgent,
		metadados: { accessClientCodigo: challenge.cliente.codigo, scopes: result.grantedScopes },
	});

	// O token é devolvido uma única vez — o chamador o guarda em armazenamento seguro.
	return {
		token: result.token,
		principal: {
			id: result.principal.id,
			nome: result.principal.nome,
			tipo: result.principal.tipo,
			organizacaoId: challenge.organizacaoId,
			organizacaoNome: challenge.organizacao.nome,
		},
		scopes: result.grantedScopes,
	};
}
