import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { syncMetaAdsCatalog } from "@/lib/integrations/meta/ads/catalog-sync";
import { consumeOAuthRedirect } from "@/lib/integrations/oauth-redirect";
import { META_ADS_SCOPES, META_GRAPH_API_VERSION } from "@/lib/integrations/meta/ads/types";
import { db } from "@/services/drizzle";
import { integrations, type TNewIntegrationEntity } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse, after, type NextRequest } from "next/server";

import { META_ADS_OAUTH_REDIRECT_COOKIE_NAME, META_ADS_OAUTH_STATE_COOKIE_NAME } from "../route";

type MetaError = { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
type MetaTokenResponse = { access_token?: string; token_type?: string; expires_in?: number; error?: MetaError };
type MetaDebugTokenResponse = {
	data?: {
		is_valid?: boolean;
		scopes?: string[];
		granular_scopes?: { scope?: string; target_ids?: string[] }[];
		user_id?: string;
	};
	error?: MetaError;
};
type MetaAdAccount = {
	id?: string;
	account_id?: string;
	name?: string;
	account_status?: number;
	currency?: string;
	timezone_name?: string;
	business?: { id?: string; name?: string };
};
type MetaAdAccountsResponse = { data?: MetaAdAccount[]; error?: MetaError };

const FALLBACK_REDIRECT = "/dashboard/settings?connected=meta-ads";

function buildGraphUrl(path: string) {
	return new URL(`https://graph.facebook.com/${META_GRAPH_API_VERSION}${path}`);
}

function getTokenExpiresAt(expiresIn: number | undefined) {
	if (!expiresIn) return null;
	return new Date(Date.now() + expiresIn * 1000).toISOString();
}

async function fetchMetaJson<T extends { error?: MetaError }>(url: URL, init?: RequestInit): Promise<T | { error: MetaError }> {
	const response = await fetch(url, init);
	const payload = (await response.json().catch(() => null)) as T | null;
	if (!payload || !response.ok || payload.error) {
		const error = (payload?.error as MetaError) ?? { message: `HTTP ${response.status}` };
		console.error("[ERROR] [META_ADS_OAUTH]", url.pathname, { status: response.status, code: error.code, message: error.message });
		return { error };
	}
	return payload;
}

function normalizeAdAccountId(account: MetaAdAccount) {
	if (account.id?.startsWith("act_")) return account.id;
	if (account.account_id) return `act_${account.account_id}`;
	return null;
}

function getSelectedMetaAdsTargetIds(tokenData: NonNullable<MetaDebugTokenResponse["data"]>) {
	const targetIds = new Set<string>();
	const selectableScopes = new Set<string>(META_ADS_SCOPES);
	for (const granularScope of tokenData.granular_scopes ?? []) {
		if (!granularScope.scope || !selectableScopes.has(granularScope.scope)) continue;
		for (const targetId of granularScope.target_ids ?? []) targetIds.add(targetId.replace(/^act_/, ""));
	}
	return targetIds;
}

function isReadableAdAccount(account: MetaAdAccount) {
	return account.name !== "unknown (Read-Only)";
}

function getSelectedMetaAdsAccounts(accounts: MetaAdAccount[], selectedTargetIds: Set<string>) {
	const readableAccounts = accounts.filter(isReadableAdAccount);
	// Se o usuário selecionou contas específicas, casamos por conta; senão, por negócio.
	const directMatches = readableAccounts.filter((account) => {
		const adAccountId = normalizeAdAccountId(account)?.replace(/^act_/, "");
		return adAccountId ? selectedTargetIds.has(adAccountId) : false;
	});
	if (directMatches.length > 0) return directMatches;
	return readableAccounts.filter((account) => (account.business?.id ? selectedTargetIds.has(account.business.id) : false));
}

function redirectWithError(redirectPath: string, message: string) {
	console.error("[ERROR] [META_ADS_OAUTH] redirecionando com erro", { redirectPath, message });
	const url = new URL(redirectPath, process.env.NEXT_PUBLIC_APP_URL);
	url.searchParams.set("error", message);
	return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
	console.log("[META_ADS_OAUTH] callback iniciado", { url: request.nextUrl.pathname, hasCode: !!request.nextUrl.searchParams.get("code") });
	const session = await getCurrentSessionUncached();
	if (!session) return NextResponse.json({ error: "Você não está autenticado." }, { status: 401 });
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) return NextResponse.json({ error: "Você precisa estar vinculado a uma organização." }, { status: 400 });
	console.log("[META_ADS_OAUTH] sessão ok", { organizacaoId, userId: session.user.id });

	const cookieStore = await cookies();
	const code = request.nextUrl.searchParams.get("code");
	const state = request.nextUrl.searchParams.get("state");
	const storedState = cookieStore.get(META_ADS_OAUTH_STATE_COOKIE_NAME)?.value ?? null;
	cookieStore.delete(META_ADS_OAUTH_STATE_COOKIE_NAME);
	const redirectPath = consumeOAuthRedirect(cookieStore, META_ADS_OAUTH_REDIRECT_COOKIE_NAME, FALLBACK_REDIRECT);

	if (!code || !state || !storedState || state !== storedState) {
		console.error("[ERROR] [META_ADS_OAUTH] validação de state falhou", {
			hasCode: !!code,
			hasState: !!state,
			hasStoredState: !!storedState,
			stateMatches: state === storedState,
		});
		return redirectWithError(redirectPath, "Estado OAuth inválido. Tente conectar novamente.");
	}

	const clientId = process.env.NEXT_PUBLIC_META_APP_ID;
	const clientSecret = process.env.META_APP_SECRET;
	if (!clientId || !clientSecret) return redirectWithError(redirectPath, "Credenciais do Meta não configuradas.");

	const redirectUri = new URL("/api/integrations/meta/ads/auth/callback", process.env.NEXT_PUBLIC_APP_URL).href;

	// 1. code -> short-lived token.
	const shortTokenUrl = buildGraphUrl("/oauth/access_token");
	shortTokenUrl.searchParams.set("client_id", clientId);
	shortTokenUrl.searchParams.set("redirect_uri", redirectUri);
	shortTokenUrl.searchParams.set("client_secret", clientSecret);
	shortTokenUrl.searchParams.set("code", code);
	const shortToken = await fetchMetaJson<MetaTokenResponse>(shortTokenUrl);
	if ("error" in shortToken || !shortToken.access_token) {
		console.error("[ERROR] [META_ADS_OAUTH] troca code->short token falhou", { redirectUri });
		return redirectWithError(redirectPath, "Falha ao autenticar com a Meta.");
	}

	// 2. short -> long-lived token.
	const longTokenUrl = buildGraphUrl("/oauth/access_token");
	longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
	longTokenUrl.searchParams.set("client_id", clientId);
	longTokenUrl.searchParams.set("client_secret", clientSecret);
	longTokenUrl.searchParams.set("fb_exchange_token", shortToken.access_token);
	const longToken = await fetchMetaJson<MetaTokenResponse>(longTokenUrl);
	const accessToken = ("error" in longToken ? undefined : longToken.access_token) ?? shortToken.access_token;
	const tokenExpiresAt = getTokenExpiresAt(("error" in longToken ? undefined : longToken.expires_in) ?? shortToken.expires_in);

	// 3. debug_token -> validade, escopos e contas selecionadas na autorização.
	const debugUrl = new URL("https://graph.facebook.com/debug_token");
	debugUrl.searchParams.set("input_token", accessToken);
	debugUrl.searchParams.set("access_token", `${clientId}|${clientSecret}`);
	const debugData = await fetchMetaJson<MetaDebugTokenResponse>(debugUrl);
	if ("error" in debugData || !debugData.data?.is_valid || !debugData.data.user_id) {
		console.error("[ERROR] [META_ADS_OAUTH] debug_token inválido", {
			isValid: "error" in debugData ? undefined : debugData.data?.is_valid,
			hasUserId: "error" in debugData ? undefined : !!debugData.data?.user_id,
		});
		return redirectWithError(redirectPath, "Token da Meta inválido.");
	}
	const tokenData = debugData.data;
	const metaUserId = tokenData.user_id as string;
	const scopes = tokenData.scopes ?? [];
	console.log("[META_ADS_OAUTH] token válido", { metaUserId, scopes, granularScopes: tokenData.granular_scopes });
	const missingScopes = META_ADS_SCOPES.filter((scope) => !scopes.includes(scope));
	if (missingScopes.length > 0) return redirectWithError(redirectPath, `Permissões Meta ausentes: ${missingScopes.join(", ")}.`);

	const selectedTargetIds = getSelectedMetaAdsTargetIds(tokenData);
	console.log("[META_ADS_OAUTH] target ids selecionados", { count: selectedTargetIds.size, targetIds: [...selectedTargetIds] });
	if (selectedTargetIds.size === 0) return redirectWithError(redirectPath, "Nenhuma conta de anúncios selecionada na autorização.");

	// 4. Contas acessíveis e cruzamento com as selecionadas.
	const accountsUrl = buildGraphUrl("/me/adaccounts");
	accountsUrl.searchParams.set("fields", "id,account_id,name,account_status,currency,timezone_name,business{id,name}");
	accountsUrl.searchParams.set("limit", "100");
	const accountsResult = await fetchMetaJson<MetaAdAccountsResponse>(accountsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
	if ("error" in accountsResult) return redirectWithError(redirectPath, "Falha ao listar contas de anúncios da Meta.");
	console.log("[META_ADS_OAUTH] contas retornadas pela Meta", {
		total: accountsResult.data?.length ?? 0,
		accounts: (accountsResult.data ?? []).map((a) => ({ id: a.id, account_id: a.account_id, name: a.name, businessId: a.business?.id })),
	});
	const accounts = getSelectedMetaAdsAccounts(accountsResult.data ?? [], selectedTargetIds);
	console.log("[META_ADS_OAUTH] contas após cruzamento com seleção", { count: accounts.length, ids: accounts.map((a) => a.id) });
	if (accounts.length === 0) return redirectWithError(redirectPath, "Nenhuma conta selecionada está acessível para este usuário Meta.");

	// 5. Uma linha `integrations` por conta selecionada (dedup por refExterno já existente).
	const existing = await db.query.integrations.findMany({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizacaoId), eq(fields.tipo, "META_ADS")),
	});
	const existingByRef = new Map(existing.flatMap((integration) => (integration.refExterno ? [[integration.refExterno, integration] as const] : [])));
	const existingRefs = new Set(existingByRef.keys());
	console.log("[META_ADS_OAUTH] integrações META_ADS já existentes", { count: existing.length, refs: [...existingRefs] });

	const newIntegrations: TNewIntegrationEntity[] = accounts.flatMap((account) => {
		const adAccountId = normalizeAdAccountId(account);
		const adAccountNumericId = account.account_id ?? adAccountId?.replace(/^act_/, "");
		if (!adAccountId || !adAccountNumericId || !account.name || existingRefs.has(adAccountId)) {
			console.log("[META_ADS_OAUTH] conta ignorada", {
				id: account.id,
				name: account.name,
				adAccountId,
				motivo: !adAccountId ? "sem adAccountId" : !adAccountNumericId ? "sem numericId" : !account.name ? "sem nome" : "já existe (dedup)",
			});
			return [];
		}
		return [
			{
				organizacaoId,
				tipo: "META_ADS" as const,
				ativo: true,
				status: "CONECTADO" as const,
				refExterno: adAccountId,
				apelido: account.name,
				autorId: session.user.id,
				configuracao: {
					tipo: "META_ADS" as const,
					accessToken,
					tokenExpiresAt,
					metaUserId,
					adAccountId,
					adAccountNumericId,
					adAccountName: account.name,
					scopes,
					...(account.currency ? { currency: account.currency } : {}),
					...(account.timezone_name ? { timezoneName: account.timezone_name } : {}),
					...(account.business?.id ? { businessId: account.business.id } : {}),
					...(account.business?.name ? { businessName: account.business.name } : {}),
				},
			},
		];
	});

	// Reconexão de uma conta já existente (token expirado, escopo novo): renova as credenciais e
	// reativa a linha, preservando o resto da configuração (CAPI, estado do catálogo).
	const reconnected: string[] = [];
	for (const account of accounts) {
		const adAccountId = normalizeAdAccountId(account);
		const current = adAccountId ? existingByRef.get(adAccountId) : undefined;
		if (!current || current.configuracao?.tipo !== "META_ADS") continue;
		await db
			.update(integrations)
			.set({
				ativo: true,
				status: "CONECTADO",
				ultimoErro: null,
				dataDesativacao: null,
				configuracao: { ...current.configuracao, accessToken, tokenExpiresAt, metaUserId, scopes },
			})
			.where(eq(integrations.id, current.id));
		reconnected.push(current.id);
	}

	console.log("[META_ADS_OAUTH] integrações a inserir", { count: newIntegrations.length, refs: newIntegrations.map((i) => i.refExterno) });
	const inserted = newIntegrations.length > 0 ? await db.insert(integrations).values(newIntegrations).returning({ id: integrations.id }) : [];
	if (inserted.length === 0 && reconnected.length === 0)
		console.warn("[META_ADS_OAUTH] nenhuma integração nova ou reconectada — redirecionando como sucesso mesmo assim");

	// Primeira leitura do catálogo depois da resposta: o redirect não espera a Meta.
	const toSync = [...inserted.map((row) => row.id), ...reconnected];
	after(async () => {
		for (const integrationId of toSync) {
			await syncMetaAdsCatalog({ integrationId, mode: "full" }).catch((error) =>
				console.error("[ERROR] [META_ADS_OAUTH] Falha na primeira sincronização do catálogo:", {
					integrationId,
					message: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	});

	const successUrl = new URL(redirectPath, process.env.NEXT_PUBLIC_APP_URL);
	successUrl.searchParams.set("connected", "meta-ads");
	return NextResponse.redirect(successUrl);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
