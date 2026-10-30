import { uploadPublicAsset } from "@/lib/files-storage/public-assets";
import type { TMediaAdNameHistory, TMediaAdsCatalogSyncState } from "@/schemas/media-ads";
import { db } from "@/services/drizzle";
import { type TMediaAdEntity, type TNewMediaAdEntity, integrations, mediaAds } from "@/services/drizzle/schema";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type TMetaAdsCatalogNode, fetchMetaAdsCatalog, fetchMetaAdsCatalogNodes } from "./catalog";
import { markMetaAdsIntegrationStatus } from "./config";
import { type TMediaAdsSyncMode, appendPreviousName, normalizeName, resolveSyncMode } from "./catalog-sync-rules";
import type { TMetaAdsCatalogAd } from "./library";

/**
 * Sincronização do catálogo `media_ads` de uma conta Meta Ads.
 *
 * Duas cadências: a **completa** relê todos os anúncios e marca com `removidoEm` os que sumiram; a
 * **incremental** lê só os alterados desde a última rodada. As duas releem a lista leve de campanhas
 * e conjuntos, porque renomear ou pausar uma campanha não muda o `updated_time` dos anúncios dela.
 */

/** Folga no corte incremental: o relógio da Meta e o nosso não são o mesmo. */
const INCREMENTAL_OVERLAP_MS = 15 * 60 * 1000;
/** Capas baixadas por rodada. O resto fica para a próxima. */
const COVERS_PER_RUN = 150;
const COVER_CONCURRENCY = 5;
const UPSERT_CHUNK = 200;

export type TMediaAdsSyncResult = {
	integrationId: string;
	mode: "full" | "incremental";
	read: number;
	written: number;
	removed: number;
	renamedNodes: number;
	covers: number;
	truncated: boolean;
};

type TScope = { organizacaoId: string; integrationId: string; contaExternaId: string };

export async function syncMetaAdsCatalog(params: { integrationId: string; mode?: TMediaAdsSyncMode }): Promise<TMediaAdsSyncResult> {
	const integration = await db.query.integrations.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, params.integrationId), eq(fields.tipo, "META_ADS")),
	});
	if (!integration?.ativo || integration.configuracao?.tipo !== "META_ADS") {
		throw new createHttpError.NotFound("Integração do Meta Ads inexistente ou inativa.");
	}
	const config = integration.configuracao;
	if (config.tokenExpiresAt && new Date(config.tokenExpiresAt) <= new Date()) {
		await markMetaAdsIntegrationStatus({ integrationId: integration.id, status: "EXPIRADO", erro: "Token do Meta Ads expirado." });
		throw new createHttpError.Unauthorized("Credenciais do Meta Ads expiradas. Reconecte a integração.");
	}

	const scope: TScope = { organizacaoId: integration.organizacaoId, integrationId: integration.id, contaExternaId: config.adAccountId };
	const startedAt = new Date();
	const previousState = config.catalogo;
	const mode = resolveSyncMode({
		requested: params.mode ?? "auto",
		lastFullAt: previousState?.ultimaCompletaEm,
		lastSuccessAt: integration.dataUltimaSincronizacao,
		now: startedAt,
	});

	try {
		const updatedSince =
			mode === "incremental" && integration.dataUltimaSincronizacao
				? new Date(integration.dataUltimaSincronizacao.getTime() - INCREMENTAL_OVERLAP_MS)
				: undefined;
		const [{ ads, truncated }, nodes] = await Promise.all([fetchMetaAdsCatalog({ config, updatedSince }), fetchMetaAdsCatalogNodes({ config })]);

		const campaigns = new Map(nodes.campaigns.map((node) => [node.id, node]));
		const adsets = new Map(nodes.adsets.map((node) => [node.id, node]));
		const written = await upsertAds(scope, ads, campaigns, adsets, startedAt);
		const renamedNodes = await applyNodeChanges(scope, campaigns, adsets);
		// Varredura truncada não viu a conta inteira: marcar removidos apagaria anúncios que só ficaram fora da página.
		const removed = mode === "full" && !truncated ? await markRemoved(scope, startedAt) : 0;
		const covers = await refreshCovers(scope);

		const total = await db.$count(mediaAds, and(eq(mediaAds.integracaoId, integration.id), isNull(mediaAds.removidoEm)));
		await writeState({
			integrationId: integration.id,
			success: true,
			catalogo: {
				ultimaCompletaEm: mode === "full" ? startedAt.toISOString() : (previousState?.ultimaCompletaEm ?? null),
				ultimaTentativaEm: startedAt.toISOString(),
				anuncios: total,
				truncado: truncated,
			},
			at: startedAt,
		});
		return { integrationId: integration.id, mode, read: ads.length, written, removed, renamedNodes, covers, truncated };
	} catch (error) {
		const unauthorized = createHttpError.isHttpError(error) && error.status === 401;
		await writeState({
			integrationId: integration.id,
			success: false,
			expired: unauthorized,
			error: error instanceof Error ? error.message : String(error),
			catalogo: {
				ultimaCompletaEm: previousState?.ultimaCompletaEm ?? null,
				ultimaTentativaEm: startedAt.toISOString(),
				anuncios: previousState?.anuncios ?? 0,
				truncado: previousState?.truncado ?? false,
			},
			at: startedAt,
		});
		throw error;
	}
}

async function upsertAds(
	scope: TScope,
	ads: TMetaAdsCatalogAd[],
	campaigns: Map<string, TMetaAdsCatalogNode>,
	adsets: Map<string, TMetaAdsCatalogNode>,
	syncedAt: Date,
) {
	let written = 0;
	for (let offset = 0; offset < ads.length; offset += UPSERT_CHUNK) {
		const chunk = ads.slice(offset, offset + UPSERT_CHUNK);
		const existing = await db
			.select({
				anuncioId: mediaAds.anuncioId,
				anuncioNome: mediaAds.anuncioNome,
				campanhaNome: mediaAds.campanhaNome,
				campanhaObjetivo: mediaAds.campanhaObjetivo,
				conjuntoNome: mediaAds.conjuntoNome,
				nomesAnteriores: mediaAds.nomesAnteriores,
			})
			.from(mediaAds)
			.where(
				and(
					eq(mediaAds.organizacaoId, scope.organizacaoId),
					eq(mediaAds.plataforma, "META"),
					inArray(
						mediaAds.anuncioId,
						chunk.map((ad) => ad.anuncioId),
					),
				),
			);
		const byAdId = new Map(existing.map((row) => [row.anuncioId, row]));

		const values: TNewMediaAdEntity[] = chunk.map((ad) => {
			const previous = byAdId.get(ad.anuncioId);
			let history: TMediaAdNameHistory = previous?.nomesAnteriores ?? {};
			history = appendPreviousName(history, "anuncio", previous?.anuncioNome, ad.anuncioNome);
			history = appendPreviousName(history, "campanha", previous?.campanhaNome, ad.campanhaNome);
			history = appendPreviousName(history, "conjunto", previous?.conjuntoNome, ad.conjuntoNome);
			const campaign = ad.campanhaId ? campaigns.get(ad.campanhaId) : undefined;
			const adset = ad.conjuntoId ? adsets.get(ad.conjuntoId) : undefined;
			return {
				organizacaoId: scope.organizacaoId,
				integracaoId: scope.integrationId,
				plataforma: "META",
				contaExternaId: scope.contaExternaId,
				...ad,
				campanhaObjetivo: campaign?.objective ?? previous?.campanhaObjetivo ?? null,
				campanhaStatus: campaign?.effective_status ?? null,
				conjuntoStatus: adset?.effective_status ?? null,
				nomesAnteriores: history,
				sincronizadoEm: syncedAt,
				removidoEm: null,
			};
		});

		if (values.length === 0) continue;
		await db
			.insert(mediaAds)
			.values(values)
			.onConflictDoUpdate({
				target: [mediaAds.organizacaoId, mediaAds.plataforma, mediaAds.anuncioId],
				set: {
					integracaoId: sql`excluded.integracao_id`,
					contaExternaId: sql`excluded.conta_externa_id`,
					campanhaId: sql`excluded.campanha_id`,
					campanhaNome: sql`excluded.campanha_nome`,
					campanhaObjetivo: sql`excluded.campanha_objetivo`,
					campanhaStatus: sql`excluded.campanha_status`,
					conjuntoId: sql`excluded.conjunto_id`,
					conjuntoNome: sql`excluded.conjunto_nome`,
					conjuntoStatus: sql`excluded.conjunto_status`,
					anuncioNome: sql`excluded.anuncio_nome`,
					status: sql`excluded.status`,
					statusConfigurado: sql`excluded.status_configurado`,
					criativoId: sql`excluded.criativo_id`,
					titulo: sql`excluded.titulo`,
					corpo: sql`excluded.corpo`,
					tipoMidia: sql`excluded.tipo_midia`,
					cartoes: sql`excluded.cartoes`,
					videoId: sql`excluded.video_id`,
					cta: sql`excluded.cta`,
					urlDestino: sql`excluded.url_destino`,
					permalink: sql`excluded.permalink`,
					urlTags: sql`excluded.url_tags`,
					capaOrigemUrl: sql`excluded.capa_origem_url`,
					nomesAnteriores: sql`excluded.nomes_anteriores`,
					atualizadoNaPlataformaEm: sql`excluded.atualizado_na_plataforma_em`,
					sincronizadoEm: sql`excluded.sincronizado_em`,
					removidoEm: sql`null`,
					dataAtualizacao: new Date(),
				},
			});
		written += values.length;
	}
	return written;
}

/**
 * Leva nome, status e objetivo atuais de campanhas e conjuntos a todas as linhas deles — inclusive
 * às que a rodada incremental não releu —, guardando o nome anterior no histórico.
 */
async function applyNodeChanges(scope: TScope, campaigns: Map<string, TMetaAdsCatalogNode>, adsets: Map<string, TMetaAdsCatalogNode>) {
	const rows = await db
		.selectDistinct({
			campanhaId: mediaAds.campanhaId,
			campanhaNome: mediaAds.campanhaNome,
			campanhaObjetivo: mediaAds.campanhaObjetivo,
			campanhaStatus: mediaAds.campanhaStatus,
			conjuntoId: mediaAds.conjuntoId,
			conjuntoNome: mediaAds.conjuntoNome,
			conjuntoStatus: mediaAds.conjuntoStatus,
		})
		.from(mediaAds)
		.where(and(eq(mediaAds.integracaoId, scope.integrationId), isNull(mediaAds.removidoEm)));

	const changedCampaigns = new Map<string, { node: TMetaAdsCatalogNode; previousName: string | null }>();
	const changedAdsets = new Map<string, { node: TMetaAdsCatalogNode; previousName: string | null }>();
	for (const row of rows) {
		const campaign = row.campanhaId ? campaigns.get(row.campanhaId) : undefined;
		if (
			row.campanhaId &&
			campaign &&
			((campaign.name && campaign.name !== row.campanhaNome) ||
				(campaign.objective ?? null) !== row.campanhaObjetivo ||
				(campaign.effective_status ?? null) !== row.campanhaStatus)
		) {
			changedCampaigns.set(row.campanhaId, { node: campaign, previousName: row.campanhaNome });
		}
		const adset = row.conjuntoId ? adsets.get(row.conjuntoId) : undefined;
		if (row.conjuntoId && adset && ((adset.name && adset.name !== row.conjuntoNome) || (adset.effective_status ?? null) !== row.conjuntoStatus)) {
			changedAdsets.set(row.conjuntoId, { node: adset, previousName: row.conjuntoNome });
		}
	}

	for (const [campanhaId, { node, previousName }] of changedCampaigns) {
		await db
			.update(mediaAds)
			.set({
				campanhaNome: node.name ?? previousName,
				campanhaObjetivo: node.objective ?? null,
				campanhaStatus: node.effective_status ?? null,
				nomesAnteriores: historyAppendSql("campanha", previousName, node.name),
				dataAtualizacao: new Date(),
			})
			.where(and(eq(mediaAds.integracaoId, scope.integrationId), eq(mediaAds.campanhaId, campanhaId)));
	}
	for (const [conjuntoId, { node, previousName }] of changedAdsets) {
		await db
			.update(mediaAds)
			.set({
				conjuntoNome: node.name ?? previousName,
				conjuntoStatus: node.effective_status ?? null,
				nomesAnteriores: historyAppendSql("conjunto", previousName, node.name),
				dataAtualizacao: new Date(),
			})
			.where(and(eq(mediaAds.integracaoId, scope.integrationId), eq(mediaAds.conjuntoId, conjuntoId)));
	}
	return changedCampaigns.size + changedAdsets.size;
}

/** `nomes_anteriores[key] ||= [previous]`, sem duplicar, em SQL — a mesma campanha atravessa várias linhas. */
function historyAppendSql(key: "campanha" | "conjunto", previous: string | null, next: string | undefined) {
	const old = normalizeName(previous);
	if (!old || old === normalizeName(next)) return sql`${mediaAds.nomesAnteriores}`;
	return sql`case
		when jsonb_exists(coalesce(${mediaAds.nomesAnteriores} -> ${key}, '[]'::jsonb), ${old}) then ${mediaAds.nomesAnteriores}
		else jsonb_set(${mediaAds.nomesAnteriores}, ${`{${key}}`}::text[], coalesce(${mediaAds.nomesAnteriores} -> ${key}, '[]'::jsonb) || to_jsonb(${old}::text))
	end`;
}

async function markRemoved(scope: TScope, runStartedAt: Date) {
	const removed = await db
		.update(mediaAds)
		.set({ removidoEm: new Date(), dataAtualizacao: new Date() })
		.where(and(eq(mediaAds.integracaoId, scope.integrationId), isNull(mediaAds.removidoEm), lt(mediaAds.sincronizadoEm, runStartedAt)))
		.returning({ id: mediaAds.id });
	return removed.length;
}

/**
 * Copia capas para o nosso storage, só quando o criativo mudou desde a última cópia (ou nunca houve).
 * Falha numa capa não derruba a sincronização — a UI cai para a capa da Meta enquanto ela vale.
 */
async function refreshCovers(scope: TScope) {
	const pending = await db
		.select({ id: mediaAds.id, anuncioId: mediaAds.anuncioId, criativoId: mediaAds.criativoId, capaOrigemUrl: mediaAds.capaOrigemUrl })
		.from(mediaAds)
		.where(
			and(
				eq(mediaAds.integracaoId, scope.integrationId),
				isNull(mediaAds.removidoEm),
				sql`${mediaAds.capaOrigemUrl} is not null`,
				sql`(${mediaAds.capaUrl} is null or ${mediaAds.capaCriativoId} is distinct from ${mediaAds.criativoId})`,
			),
		)
		.limit(COVERS_PER_RUN);

	let stored = 0;
	for (let offset = 0; offset < pending.length; offset += COVER_CONCURRENCY) {
		const batch = pending.slice(offset, offset + COVER_CONCURRENCY);
		const results = await Promise.allSettled(batch.map((row) => storeCover(scope, row)));
		stored += results.filter((result) => result.status === "fulfilled" && result.value).length;
	}
	return stored;
}

async function storeCover(scope: TScope, row: Pick<TMediaAdEntity, "id" | "anuncioId" | "criativoId" | "capaOrigemUrl">) {
	if (!row.capaOrigemUrl) return false;
	try {
		const response = await fetch(row.capaOrigemUrl, { signal: AbortSignal.timeout(15_000) });
		if (!response.ok) return false;
		const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
		if (!contentType.startsWith("image/")) return false;
		const extension = contentType.split("/")[1] ?? "jpg";
		const uploaded = await uploadPublicAsset({
			storagePath: `media-ads/${scope.organizacaoId}/${row.anuncioId}/${row.criativoId ?? "capa"}.${extension}`,
			body: Buffer.from(await response.arrayBuffer()),
			contentType,
			errorLabel: "capa do anúncio",
		});
		await db
			.update(mediaAds)
			.set({ capaUrl: uploaded.publicUrl, capaCriativoId: row.criativoId, dataAtualizacao: new Date() })
			.where(eq(mediaAds.id, row.id));
		return true;
	} catch (error) {
		console.error("[ERROR] [MEDIA_ADS] Falha ao copiar capa:", {
			anuncioId: row.anuncioId,
			message: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

async function writeState(params: {
	integrationId: string;
	success: boolean;
	expired?: boolean;
	error?: string;
	catalogo: TMediaAdsCatalogSyncState;
	at: Date;
}) {
	await db
		.update(integrations)
		.set({
			// Só a chave `catalogo`: a config inteira lida no início pode ter sido editada (CAPI) durante a rodada.
			configuracao: sql`jsonb_set(coalesce(${integrations.configuracao}, '{}'::jsonb), '{catalogo}', ${JSON.stringify(params.catalogo)}::jsonb)`,
			...(params.success
				? {
						status: "CONECTADO" as const,
						ultimoErro: params.catalogo.truncado ? "Catálogo truncado: a conta tem mais anúncios que o teto de leitura." : null,
						dataUltimaSincronizacao: params.at,
					}
				: { status: params.expired ? ("EXPIRADO" as const) : ("ERRO" as const), ultimoErro: params.error ?? null }),
		})
		.where(eq(integrations.id, params.integrationId));
}

/** Integrações META_ADS ativas com token válido, para o cron. */
export async function getActiveMetaAdsIntegrationIds(): Promise<string[]> {
	const rows = await db.query.integrations.findMany({
		where: (fields, { and, eq }) => and(eq(fields.tipo, "META_ADS"), eq(fields.ativo, true)),
		columns: { id: true, configuracao: true, status: true },
	});
	const now = Date.now();
	return rows
		.filter((row) => row.configuracao?.tipo === "META_ADS" && row.status !== "EXPIRADO")
		.filter((row) => {
			const expiresAt = row.configuracao?.tipo === "META_ADS" ? row.configuracao.tokenExpiresAt : null;
			return !expiresAt || Date.parse(expiresAt) > now;
		})
		.map((row) => row.id);
}
