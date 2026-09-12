import { db } from "@/services/drizzle";
import { accessOauthAuthorizationCodes, accessOauthClients, accessPrincipals } from "@/services/drizzle/schema";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase32LowerCaseNoPadding, encodeBase64urlNoPadding } from "@oslojs/encoding";
import dayjs from "dayjs";
import { and, eq, isNull } from "drizzle-orm";
import createHttpError from "http-errors";
import { AGENT_MUTATION_ACCESS_SCOPES, AGENT_READ_ACCESS_SCOPES, getDefaultAgentAccessScopes } from "./clients-catalog";
import { provisionAgentPrincipal, revokePrincipal } from "./credentials";
import { recordAccessEvent } from "./events";
import { constantTimeEqual, hashAccessSecret } from "./tokens";

/**
 * OAuth 2.1 para conexões MCP — o servidor de autorização mínimo que os conectores do Claude.ai
 * e do ChatGPT exigem (registro dinâmico + authorization code + PKCE).
 *
 * O desenho deliberado: OAuth aqui é só uma porta de entrada self-service para
 * `provisionAgentPrincipal`. O access token emitido é uma CHAVE_API comum sobre um principal
 * CONTA_SERVICO — revogação, auditoria, scopes e rotação continuam no modelo de acesso
 * existente, e o endpoint MCP não sabe que OAuth existe.
 *
 * A indireção do RFC 9728 (`/.well-known/oauth-protected-resource` apontando para o AS) é a
 * saída de emergência: se um dia este AS interno não bastar, o ponteiro muda para um IdP
 * externo e os clientes redescobrem sozinhos.
 */

// Tempo de vida do código de autorização: o redirect é imediato, mas navegador lento em rede
// móvel existe. O teto da RFC 6749 é 10 minutos; 5 é folga suficiente.
const AUTHORIZATION_CODE_TTL_MINUTES = 5;

// Scopes que o fluxo OAuth pode conceder. `agent:clients:pii` e `platform:*` ficam de fora de
// propósito: PII e travessia de organização exigem emissão administrativa, nunca self-service.
export const OAUTH_SUPPORTED_SCOPES: string[] = [
	"agent:results:read",
	"agent:clients:read",
	"agent:products:read",
	"agent:campaigns:read",
	"agent:sales:read",
	"agent:finances:read",
	"agent:finances:reconcile",
	"agent:members:read",
	"agent:message-templates:read",
	"agent:campaigns:write",
	"agent:campaigns:activate",
	"agent:message-templates:write",
	"agent:message-templates:submit",
	"agent:message-template-media:write",
];

// O redirect é o único sinal confiável de quem é o cliente: `client_name` é texto livre do
// registro. Hosts conhecidos caem nas aplicações do catálogo (revogável por aplicação);
// o resto cai no genérico AGENT_MCP, cujo teto é só leitura.
const KNOWN_REDIRECT_CLIENT_CODES: Array<{ hosts: string[]; codigo: string }> = [
	{ hosts: ["claude.ai", "claude.com", "anthropic.com"], codigo: "AGENT_CLAUDE" },
	{ hosts: ["chatgpt.com", "chat.openai.com", "openai.com"], codigo: "AGENT_CHATGPT" },
];
const FALLBACK_OAUTH_CLIENT_CODE = "AGENT_MCP";

function hostMatches(host: string, knownHost: string) {
	return host === knownHost || host.endsWith(`.${knownHost}`);
}

export function resolveAccessClientCodigoForRedirectUris(redirectUris: string[]): string {
	for (const uri of redirectUris) {
		const host = new URL(uri).hostname.toLowerCase();
		const known = KNOWN_REDIRECT_CLIENT_CODES.find((entry) => entry.hosts.some((knownHost) => hostMatches(host, knownHost)));
		if (known) return known.codigo;
	}
	return FALLBACK_OAUTH_CLIENT_CODE;
}

// https obrigatório, exceto loopback (desenvolvimento e clientes desktop como o Cursor, que
// abrem um servidor local para receber o callback). Fragment é proibido pela RFC 6749 §3.1.2.
export function isValidOauthRedirectUri(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.hash) return false;
	if (url.protocol === "https:") return true;
	if (url.protocol === "http:") return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
	return false;
}

type TRegisterOauthClientParams = {
	clientName?: string | null;
	redirectUris: string[];
	registrationMetadata?: Record<string, unknown> | null;
	enderecoIp?: string | null;
	userAgent?: string | null;
};
export async function registerOauthClient(params: TRegisterOauthClientParams) {
	const invalidUri = params.redirectUris.find((uri) => !isValidOauthRedirectUri(uri));
	if (invalidUri) throw new createHttpError.BadRequest(`redirect_uri inválida: ${invalidUri}`);

	const codigo = resolveAccessClientCodigoForRedirectUris(params.redirectUris);
	const catalogClient = await db.query.accessClients.findFirst({
		where: (fields, { eq: whereEq }) => whereEq(fields.codigo, codigo),
	});
	if (!catalogClient || catalogClient.status !== "ATIVO") {
		throw new createHttpError.InternalServerError(`Aplicação de catálogo indisponível para registro OAuth: ${codigo}.`);
	}

	const nome = params.clientName?.trim() || catalogClient.nome;
	const [oauthClient] = await db
		.insert(accessOauthClients)
		.values({
			accessClientId: catalogClient.id,
			nome: nome.slice(0, 255),
			redirectUris: params.redirectUris,
			metadadosRegistro: params.registrationMetadata ?? null,
		})
		.returning();

	await recordAccessEvent({
		tipo: "OAUTH_CLIENTE_REGISTRADO",
		enderecoIp: params.enderecoIp,
		userAgent: params.userAgent,
		metadados: { oauthClientId: oauthClient.id, accessClientCodigo: codigo, redirectUris: params.redirectUris },
	});

	return oauthClient;
}

/**
 * Valida os parâmetros de autorização e resolve os scopes efetivos. Usado tanto pela página de
 * consentimento (para renderizar) quanto pela emissão do código (para não confiar no que a
 * página devolveu).
 */
type TResolveAuthorizationContextParams = {
	clientId: string;
	redirectUri: string;
	scope?: string | null;
	// Consentimento de plataforma (CONTA_PLATAFORMA): scopes fixos de leitura + platform:*.
	// Quem chama PRECISA ter verificado `user.admin` — este módulo só valida o teto do cliente.
	platform?: boolean;
	// Opt-in explícito do admin: adiciona as mutações ao consentimento de plataforma (gestão
	// assistida). A escrita ainda depende, POR CHAMADA, de o responsável pertencer à organização
	// e de ela estar com `consultoriaAtiva` — ver `resolveResponsibleUser`.
	platformMutations?: boolean;
};
export async function resolveOauthAuthorizationContext(params: TResolveAuthorizationContextParams) {
	const oauthClient = await db.query.accessOauthClients.findFirst({
		where: eq(accessOauthClients.id, params.clientId),
		with: { cliente: true },
	});
	if (!oauthClient || oauthClient.status !== "ATIVO") throw new createHttpError.BadRequest("Cliente OAuth não encontrado ou inativo.");
	if (oauthClient.cliente.status !== "ATIVO") throw new createHttpError.BadRequest("Aplicação cliente desativada.");
	if (!oauthClient.redirectUris.includes(params.redirectUri)) {
		throw new createHttpError.BadRequest("redirect_uri não registrada para este cliente.");
	}

	// Modo plataforma ignora o `scope` pedido: o conjunto é fixo (leituras + platform:*) e o
	// gate é o teto do catálogo — o genérico AGENT_MCP não carrega platform:* e cai aqui.
	if (params.platform) {
		const platformScopes: string[] = [
			...getDefaultAgentAccessScopes({ isPlatform: true }),
			...(params.platformMutations ? AGENT_MUTATION_ACCESS_SCOPES : []),
		];
		const missingScopes = platformScopes.filter((scope) => !oauthClient.cliente.escoposPermitidos.includes(scope));
		if (missingScopes.length > 0) throw new createHttpError.BadRequest("Esta aplicação não suporta acesso de plataforma.");
		return { oauthClient, scopes: platformScopes };
	}

	// Interseção pedido ∩ suportado ∩ teto da aplicação. Sem pedido explícito, o padrão de
	// leitura — o mesmo racional do painel: mutação é opt-in, nunca consequência do silêncio.
	const requestedScopes = (params.scope ?? "")
		.split(" ")
		.map((scope) => scope.trim())
		.filter(Boolean);
	const allowedScopes = OAUTH_SUPPORTED_SCOPES.filter((scope) => oauthClient.cliente.escoposPermitidos.includes(scope));
	const scopes =
		requestedScopes.length > 0
			? requestedScopes.filter((scope) => allowedScopes.includes(scope))
			: AGENT_READ_ACCESS_SCOPES.filter((scope) => allowedScopes.includes(scope));
	if (scopes.length === 0) throw new createHttpError.BadRequest("Nenhum scope solicitado é suportado por esta aplicação.");

	return { oauthClient, scopes };
}

type TIssueAuthorizationCodeParams = {
	clientId: string;
	redirectUri: string;
	scope?: string | null;
	codeChallenge: string;
	resource?: string | null;
	// Nulo = consentimento de plataforma (CONTA_PLATAFORMA). A rota de aprovação é quem exige
	// `user.admin` para chegar aqui com nulo; o teto do catálogo é a segunda rede.
	organizacaoId: string | null;
	usuarioId: string;
	// Só tem efeito no consentimento de plataforma; a rota de aprovação exige `user.admin`.
	platformMutations?: boolean;
	enderecoIp?: string | null;
	userAgent?: string | null;
};
export async function issueOauthAuthorizationCode(params: TIssueAuthorizationCodeParams) {
	const { oauthClient, scopes } = await resolveOauthAuthorizationContext({ ...params, platform: params.organizacaoId === null });

	const codeBytes = new Uint8Array(32);
	crypto.getRandomValues(codeBytes);
	const code = encodeBase32LowerCaseNoPadding(codeBytes);

	await db.insert(accessOauthAuthorizationCodes).values({
		oauthClientId: oauthClient.id,
		organizacaoId: params.organizacaoId,
		usuarioId: params.usuarioId,
		hashCodigo: hashAccessSecret(code),
		redirectUri: params.redirectUri,
		codeChallenge: params.codeChallenge,
		scopes,
		resource: params.resource ?? null,
		expiraEm: dayjs().add(AUTHORIZATION_CODE_TTL_MINUTES, "minutes").toDate(),
	});

	await recordAccessEvent({
		tipo: "OAUTH_CODIGO_EMITIDO",
		organizacaoId: params.organizacaoId,
		enderecoIp: params.enderecoIp,
		userAgent: params.userAgent,
		metadados: { oauthClientId: oauthClient.id, usuarioId: params.usuarioId, scopes },
	});

	return { code, scopes };
}

// PKCE S256 (única transformação aceita): challenge = base64url(sha256(verifier)), sem padding.
export function verifyPkceS256Challenge({ codeVerifier, codeChallenge }: { codeVerifier: string; codeChallenge: string }) {
	const computed = encodeBase64urlNoPadding(sha256(new TextEncoder().encode(codeVerifier)));
	return constantTimeEqual(computed, codeChallenge);
}

/**
 * Erro do endpoint de token no vocabulário da RFC 6749 §5.2 — o corpo da resposta precisa ser
 * `{ error, error_description }`, não o envelope padrão da aplicação.
 */
export class OauthTokenError extends Error {
	readonly error: "invalid_request" | "invalid_grant" | "invalid_client" | "unsupported_grant_type";
	constructor(error: OauthTokenError["error"], description: string) {
		super(description);
		this.error = error;
	}
}

type TExchangeAuthorizationCodeParams = {
	code: string;
	clientId: string;
	redirectUri: string;
	codeVerifier: string;
	enderecoIp?: string | null;
	userAgent?: string | null;
};
export async function exchangeOauthAuthorizationCode(params: TExchangeAuthorizationCodeParams) {
	const failExchange = async (error: OauthTokenError["error"], motivo: string, description: string): Promise<never> => {
		await recordAccessEvent({
			tipo: "OAUTH_FALHA",
			enderecoIp: params.enderecoIp,
			userAgent: params.userAgent,
			metadados: { etapa: "TOKEN", motivo, oauthClientId: params.clientId },
		});
		throw new OauthTokenError(error, description);
	};

	const codeRow = await db.query.accessOauthAuthorizationCodes.findFirst({
		where: eq(accessOauthAuthorizationCodes.hashCodigo, hashAccessSecret(params.code)),
		with: {
			oauthClient: { with: { cliente: true } },
			usuario: { columns: { id: true, nome: true } },
		},
	});
	if (!codeRow) return failExchange("invalid_grant", "CODIGO_NAO_ENCONTRADO", "Código de autorização inválido.");
	if (codeRow.oauthClientId !== params.clientId) return failExchange("invalid_grant", "CLIENTE_DIVERGENTE", "Código não pertence a este cliente.");
	if (codeRow.redirectUri !== params.redirectUri)
		return failExchange("invalid_grant", "REDIRECT_DIVERGENTE", "redirect_uri não confere com a autorização.");
	if (dayjs(codeRow.expiraEm).isBefore(dayjs())) return failExchange("invalid_grant", "CODIGO_EXPIRADO", "Código de autorização expirado.");
	if (!verifyPkceS256Challenge({ codeVerifier: params.codeVerifier, codeChallenge: codeRow.codeChallenge })) {
		return failExchange("invalid_grant", "PKCE_INVALIDO", "Verificação PKCE falhou.");
	}

	// Uso único com guarda atômica: o UPDATE condicional é quem decide o vencedor se o mesmo
	// código chegar duas vezes — a leitura acima é só contexto.
	const consumed = await db
		.update(accessOauthAuthorizationCodes)
		.set({ dataConsumo: new Date() })
		.where(and(eq(accessOauthAuthorizationCodes.id, codeRow.id), isNull(accessOauthAuthorizationCodes.dataConsumo)))
		.returning({ id: accessOauthAuthorizationCodes.id });
	if (consumed.length === 0) return failExchange("invalid_grant", "CODIGO_JA_USADO", "Código de autorização já utilizado.");

	// Reconexão substitui a conexão anterior: o mesmo cliente OAuth re-autorizado pelo mesmo
	// usuário no mesmo balde — (cliente, org, usuário), com plataforma como balde próprio —
	// revoga o principal antigo em vez de acumular credenciais órfãs. A conexão de plataforma
	// de um admin coexiste com a conexão de organização dele. `referenciaExterna` é o elo
	// entre o principal e o registro OAuth.
	const referenciaExterna = `oauth:${codeRow.oauthClientId}`;
	const previousPrincipals = await db.query.accessPrincipals.findMany({
		where: (fields, { and: whereAnd, eq: whereEq, isNull: whereIsNull }) =>
			whereAnd(
				whereEq(fields.referenciaExterna, referenciaExterna),
				codeRow.organizacaoId ? whereEq(fields.organizacaoId, codeRow.organizacaoId) : whereIsNull(fields.organizacaoId),
				whereEq(fields.responsavelUsuarioId, codeRow.usuarioId),
				whereIsNull(fields.dataRevogacao),
			),
		columns: { id: true },
	});
	for (const previous of previousPrincipals) {
		await revokePrincipal({
			principalId: previous.id,
			organizacaoId: codeRow.organizacaoId,
			enderecoIp: params.enderecoIp,
			userAgent: params.userAgent,
		});
	}

	const provisioned = await provisionAgentPrincipal({
		accessClientCodigo: codeRow.oauthClient.cliente.codigo,
		organizacaoId: codeRow.organizacaoId,
		nome: `${codeRow.oauthClient.nome} — conexão OAuth de ${codeRow.usuario.nome}${codeRow.organizacaoId ? "" : " (plataforma)"}`,
		scopes: codeRow.scopes,
		criadoPorId: codeRow.usuarioId,
		responsavelUsuarioId: codeRow.usuarioId,
		descricao: "Credencial emitida por consentimento OAuth.",
	});

	await db
		.update(accessOauthAuthorizationCodes)
		.set({ principalId: provisioned.principal.id })
		.where(eq(accessOauthAuthorizationCodes.id, codeRow.id));

	await db.update(accessOauthClients).set({ dataAtualizacao: new Date() }).where(eq(accessOauthClients.id, codeRow.oauthClientId));

	// `referenciaExterna` não faz parte do provisionamento genérico; gravada aqui, onde o
	// vínculo OAuth↔principal existe.
	await db.update(accessPrincipals).set({ referenciaExterna }).where(eq(accessPrincipals.id, provisioned.principal.id));

	await recordAccessEvent({
		tipo: "OAUTH_TOKEN_EMITIDO",
		organizacaoId: codeRow.organizacaoId,
		principalId: provisioned.principal.id,
		enderecoIp: params.enderecoIp,
		userAgent: params.userAgent,
		metadados: { oauthClientId: codeRow.oauthClientId, usuarioId: codeRow.usuarioId, scopes: codeRow.scopes },
	});

	return { accessToken: provisioned.token, scopes: codeRow.scopes };
}
