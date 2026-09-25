import type { TCanonicalClient, TCanonicalImportBatch } from "@/lib/data-connectors";
import { normalizeLocation } from "@/lib/geo/brazilian-locations";
import { linkPartnerToClient } from "@/lib/partners/link-partner-to-client";
import { catalogLinks, clients, partners, productAddOnOptions, productAddOns, productVariants, products, sellers } from "@/services/drizzle/schema";
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { collectBatchLookupKeys, normalizeClientName as normalizeName, type TBatchLookupKeys } from "./batch-lookup-keys";
import type { TDataCollectingV2Executor, TResolvedAuxiliaryEntities, TResolvedClientForImport } from "./types";

/**
 * Como as entidades existentes são carregadas para o contexto do lote:
 * - FULL: a organização inteira, a cada lote (comportamento histórico — a maior fonte de egress
 *   do banco depois das audiências de campanha).
 * - TARGETED: só as linhas que casam com as chaves do lote (`collectBatchLookupKeys`).
 * - SHADOW: carrega das duas formas, usa FULL e registra qualquer chave cujo lookup divirja.
 *   Modo de validação; troca-se por env sem deploy.
 * TARGETED é o padrão: validado em ensaio diferencial com rollback contra o commit anterior
 * (scripts/diff-data-collecting-rollback.ts) — as únicas diferenças foram escolhas entre registros
 * duplicados, que antes dependiam da ordem física das linhas. FULL e SHADOW ficam como kill switch.
 */
type TAuxiliaryLoadMode = "FULL" | "SHADOW" | "TARGETED";

function resolveAuxiliaryLoadMode(): TAuxiliaryLoadMode {
	const value = process.env.DATA_COLLECTING_AUX_LOAD_MODE;
	return value === "FULL" || value === "SHADOW" ? value : "TARGETED";
}

// Os mapas do contexto são "última linha vence" quando duas entidades compartilham a chave (dois
// clientes "Bruno", dois produtos com o mesmo código). Sem ORDER BY a vencedora era a ordem física
// do heap — arbitrária e diferente entre o carregamento completo e o direcionado. Para clientes a
// ordem física tinha um efeito consistente: a linha atualizada por último (a duplicata que recebeu
// a venda mais recente) ia para o fim e seguia vencendo. A ordem explícita reproduz essa regra —
// a duplicata com a compra mais recente vence — e desempata por data de cadastro e id.
const LAST_PURCHASE_WINS_CLIENTS = [sql`${clients.ultimaCompraData} asc nulls first`, asc(clients.dataInsercao), asc(clients.id)];

type TShadowAudit = {
	compared: number;
	mismatches: Array<{ entity: string; key: string; full: string | null; targeted: string | null }>;
};

async function loadRows<TRow>(
	mode: TAuxiliaryLoadMode,
	keys: TBatchLookupKeys,
	load: (keys: TBatchLookupKeys | null) => Promise<TRow[]>,
): Promise<{ rows: TRow[]; shadowRows: TRow[] | null }> {
	if (mode === "FULL") return { rows: await load(null), shadowRows: null };
	if (mode === "TARGETED") return { rows: await load(keys), shadowRows: null };
	const rows = await load(null);
	const shadowRows = await load(keys);
	return { rows, shadowRows };
}

// Compara, chave a chave, o que o lote enxergaria em cada mapa do contexto.
function auditLookups<TValue>(
	audit: TShadowAudit,
	entity: string,
	keys: string[],
	full: Map<string, TValue>,
	targeted: Map<string, TValue>,
	pick: (value: TValue) => string | null,
) {
	for (const key of keys) {
		const fullValue = full.has(key) ? pick(full.get(key) as TValue) : null;
		const targetedValue = targeted.has(key) ? pick(targeted.get(key) as TValue) : null;
		audit.compared += 1;
		if (fullValue !== targetedValue) audit.mismatches.push({ entity, key, full: fullValue, targeted: targetedValue });
	}
}

function createEmptyContext(): TResolvedAuxiliaryEntities {
	return {
		clientsByExternalId: new Map(),
		clientsByName: new Map(),
		clientsByBasePhone: new Map(),
		productsByCode: new Map(),
		productsByExternalItemId: new Map(),
		variantsByCode: new Map(),
		sellersByIdentifier: new Map(),
		partnersByIdentifier: new Map(),
		productAddOnsByExternalId: new Map(),
		productAddOnOptionsByExternalId: new Map(),
		createdClientsCount: 0,
		createdProductsCount: 0,
		createdSellersCount: 0,
		createdPartnersCount: 0,
	};
}

function loadExistingClients(tx: TDataCollectingV2Executor, organizationId: string, keys: TBatchLookupKeys | null) {
	const conditions = [eq(clients.organizacaoId, organizationId)];
	if (keys) {
		const matchers = [];
		if (keys.clientExternalIds.length > 0) matchers.push(inArray(clients.idExterno, keys.clientExternalIds));
		if (keys.clientBasePhones.length > 0) matchers.push(inArray(clients.telefoneBase, keys.clientBasePhones));
		// Mesma normalização de `clientsByName` (trim + upper), aplicada do lado do banco.
		if (keys.clientNames.length > 0) matchers.push(inArray(sql`upper(btrim(${clients.nome}))`, keys.clientNames));
		if (matchers.length === 0) return Promise.resolve([]);
		conditions.push(or(...matchers)!);
	}
	return tx.query.clients.findMany({
		where: and(...conditions),
		orderBy: LAST_PURCHASE_WINS_CLIENTS,
		columns: {
			id: true,
			idExterno: true,
			nome: true,
			telefoneBase: true,
			analiseRFMTitulo: true,
			metadataTotalCompras: true,
			metadataValorTotalCompras: true,
		},
	});
}

function indexExistingClients(context: TResolvedAuxiliaryEntities, rows: Awaited<ReturnType<typeof loadExistingClients>>) {
	for (const client of rows) {
		const resolvedClient = buildResolvedClient(client, false);
		if (client.idExterno) context.clientsByExternalId.set(client.idExterno, resolvedClient);
		indexClient(context, resolvedClient);
	}
}

function loadExistingProducts(tx: TDataCollectingV2Executor, organizationId: string, keys: TBatchLookupKeys | null) {
	if (keys && keys.productCodes.length === 0) return Promise.resolve([]);
	return tx.query.products.findMany({
		where: and(eq(products.organizacaoId, organizationId), ...(keys ? [inArray(products.codigo, keys.productCodes)] : [])),
		// Códigos duplicados existem (cadastro manual + criação pelo conector). Vence o produto que a
		// integração sincronizou por último — o registro que ela mesma mantém; nulls first deixa o
		// cadastro manual perder o desempate. A tabela não tem data_insercao; o id fecha a ordem.
		orderBy: [sql`${products.dataUltimaSincronizacao} asc nulls first`, asc(products.id)],
		columns: { id: true, codigo: true },
	});
}

function loadExistingVariants(tx: TDataCollectingV2Executor, organizationId: string, keys: TBatchLookupKeys | null) {
	if (keys && keys.productCodes.length === 0) return Promise.resolve([]);
	return tx.query.productVariants.findMany({
		where: and(eq(productVariants.organizacaoId, organizationId), ...(keys ? [inArray(productVariants.codigo, keys.productCodes)] : [])),
		orderBy: [asc(productVariants.id)],
		columns: { id: true, produtoId: true, codigo: true },
		with: {
			valoresOpcoes: {
				with: {
					opcao: { columns: { nome: true } },
					valor: { columns: { nome: true } },
				},
			},
		},
	});
}

function loadCatalogLinks(tx: TDataCollectingV2Executor, organizationId: string, keys: TBatchLookupKeys | null) {
	if (keys && keys.productExternalItemIds.length === 0) return Promise.resolve([]);
	return tx.query.catalogLinks.findMany({
		where: and(
			eq(catalogLinks.organizacaoId, organizationId),
			ne(catalogLinks.status, "DESVINCULADO"),
			...(keys ? [inArray(catalogLinks.externoItemId, keys.productExternalItemIds)] : []),
		),
		orderBy: [asc(catalogLinks.dataInsercao), asc(catalogLinks.id)],
		columns: { produtoId: true, produtoVarianteId: true, externoItemId: true },
	});
}

function loadExistingSellers(tx: TDataCollectingV2Executor, organizationId: string, keys: TBatchLookupKeys | null) {
	if (keys && keys.sellerIdentifiers.length === 0) return Promise.resolve([]);
	return tx.query.sellers.findMany({
		where: and(
			eq(sellers.organizacaoId, organizationId),
			// A chave do mapa é `identificador || nome`: um superconjunto pelas duas colunas é seguro.
			...(keys ? [or(inArray(sellers.identificador, keys.sellerIdentifiers), inArray(sellers.nome, keys.sellerIdentifiers))!] : []),
		),
		orderBy: [asc(sellers.dataInsercao), asc(sellers.id)],
		columns: { id: true, identificador: true, nome: true },
	});
}

function loadExistingPartners(tx: TDataCollectingV2Executor, organizationId: string, keys: TBatchLookupKeys | null) {
	if (keys && keys.partnerIdentifiers.length === 0) return Promise.resolve([]);
	return tx.query.partners.findMany({
		where: and(eq(partners.organizacaoId, organizationId), ...(keys ? [inArray(partners.identificador, keys.partnerIdentifiers)] : [])),
		orderBy: [asc(partners.dataInsercao), asc(partners.id)],
		columns: { id: true, identificador: true, clienteId: true },
	});
}

export function getCanonicalClientResolutionKey(batch: TCanonicalImportBatch, client: TCanonicalClient | null): string | null {
	if (!client) return null;

	const nameKey = normalizeName(client.name);

	if (batch.policies.clientResolutionStrategy === "EXTERNAL_ID_THEN_PHONE") {
		return client.externalId || client.basePhone || null;
	}

	if (batch.policies.clientResolutionStrategy === "NAME_THEN_PHONE") {
		return nameKey || client.basePhone || null;
	}

	return client.externalId || client.basePhone || nameKey || null;
}

function uniqueBy<T>(values: T[], getKey: (value: T) => string | null | undefined) {
	const map = new Map<string, T>();
	for (const value of values) {
		const key = getKey(value);
		if (!key || map.has(key)) continue;
		map.set(key, value);
	}
	return Array.from(map.values());
}

function buildResolvedClient(
	client: {
		id: string;
		nome: string;
		telefoneBase: string;
		analiseRFMTitulo: string | null;
		metadataTotalCompras: number | null;
		metadataValorTotalCompras: number | null;
	},
	isNew: boolean,
): TResolvedClientForImport {
	return {
		id: client.id,
		name: client.nome,
		basePhone: client.telefoneBase,
		rfmTitle: client.analiseRFMTitulo,
		metadataTotalPurchases: client.metadataTotalCompras ?? 0,
		metadataTotalPurchaseValue: client.metadataValorTotalCompras ?? 0,
		isNew,
	};
}

function indexClient(context: TResolvedAuxiliaryEntities, client: TResolvedClientForImport, canonicalClient?: TCanonicalClient | null) {
	if (canonicalClient?.externalId) context.clientsByExternalId.set(canonicalClient.externalId, client);

	const nameKey = normalizeName(canonicalClient?.name ?? client.name);
	if (nameKey) context.clientsByName.set(nameKey, client);

	if (canonicalClient?.basePhone || client.basePhone) {
		context.clientsByBasePhone.set(canonicalClient?.basePhone || client.basePhone, client);
	}
}

export function resolveClientForCanonicalSale(batch: TCanonicalImportBatch, context: TResolvedAuxiliaryEntities, client: TCanonicalClient | null) {
	if (!client) return null;

	if (batch.policies.clientResolutionStrategy === "EXTERNAL_ID_THEN_PHONE") {
		if (client.externalId) {
			const byExternalId = context.clientsByExternalId.get(client.externalId);
			if (byExternalId) return byExternalId;
		}

		if (client.basePhone) {
			return context.clientsByBasePhone.get(client.basePhone) ?? null;
		}

		return null;
	}

	if (batch.policies.clientResolutionStrategy === "NAME_THEN_PHONE") {
		const byName = context.clientsByName.get(normalizeName(client.name));
		if (byName) return byName;
	}

	if (client.basePhone) {
		const byPhone = context.clientsByBasePhone.get(client.basePhone);
		if (byPhone) return byPhone;
	}

	return context.clientsByName.get(normalizeName(client.name)) ?? null;
}

// Venda válida mais antiga do batch para o cliente — origem de primeiraCompraData e, quando o
// conector emite vendedores (Online Software, Bling), do autorVendedorId do cadastro
// (docs/dev-planning/client-authorship-plan.md §4.E).
function getFirstValidSaleForClient(batch: TCanonicalImportBatch, client: TCanonicalClient) {
	const clientKey = getCanonicalClientResolutionKey(batch, client);
	if (!clientKey) return null;

	const clientSales = batch.sales
		.filter((sale) => sale.isValidSale && getCanonicalClientResolutionKey(batch, sale.client) === clientKey)
		.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());

	return clientSales[0] ?? null;
}

export async function syncAuxiliaryEntities({
	tx,
	batch,
}: {
	tx: TDataCollectingV2Executor;
	batch: TCanonicalImportBatch;
}): Promise<TResolvedAuxiliaryEntities> {
	const context = createEmptyContext();
	const mode = resolveAuxiliaryLoadMode();
	const keys = collectBatchLookupKeys(batch);
	const audit: TShadowAudit | null = mode === "SHADOW" ? { compared: 0, mismatches: [] } : null;
	const organizationId = batch.organizationId;

	const existingClients = await loadRows(mode, keys, (scope) => loadExistingClients(tx, organizationId, scope));
	indexExistingClients(context, existingClients.rows);
	if (audit && existingClients.shadowRows) {
		const shadow = createEmptyContext();
		indexExistingClients(shadow, existingClients.shadowRows);
		auditLookups(audit, "clientsByExternalId", keys.clientExternalIds, context.clientsByExternalId, shadow.clientsByExternalId, (client) => client.id);
		auditLookups(audit, "clientsByBasePhone", keys.clientBasePhones, context.clientsByBasePhone, shadow.clientsByBasePhone, (client) => client.id);
		auditLookups(audit, "clientsByName", keys.clientNames, context.clientsByName, shadow.clientsByName, (client) => client.id);
	}

	// Sellers sincronizam ANTES dos clientes: o autorVendedorId do cliente novo referencia o
	// vendedor da primeira venda, que pode estar sendo criado neste mesmo batch.
	const existingSellers = await loadRows(mode, keys, (scope) => loadExistingSellers(tx, organizationId, scope));
	for (const seller of existingSellers.rows) context.sellersByIdentifier.set(seller.identificador || seller.nome, seller.id);
	if (audit && existingSellers.shadowRows) {
		const shadow = new Map<string, string>();
		for (const seller of existingSellers.shadowRows) shadow.set(seller.identificador || seller.nome, seller.id);
		auditLookups(audit, "sellersByIdentifier", keys.sellerIdentifiers, context.sellersByIdentifier, shadow, (id) => id);
	}

	for (const seller of uniqueBy(batch.sellers, (value) => value.identifier)) {
		if (context.sellersByIdentifier.has(seller.identifier)) continue;
		const inserted = await tx
			.insert(sellers)
			.values({ organizacaoId: batch.organizationId, nome: seller.name, identificador: seller.identifier })
			.returning({ id: sellers.id });
		context.sellersByIdentifier.set(seller.identifier, inserted[0].id);
		context.createdSellersCount += 1;
	}

	for (const client of uniqueBy(
		batch.sales.map((sale) => sale.client).filter((value): value is TCanonicalClient => !!value),
		(client) => `${client.externalId ?? ""}|${normalizeName(client.name)}|${client.basePhone}`,
	)) {
		if (!getCanonicalClientResolutionKey(batch, client)) continue;
		const existingClient = resolveClientForCanonicalSale(batch, context, client);
		if (existingClient) {
			// Telefones 0800/localizer do iFood são rotas temporárias, não identidade do cliente. Se
			// uma versão anterior do conector os persistiu, o próximo sync corrige o cadastro.
			if (client.phoneIsTemporary && existingClient.basePhone) {
				const previousBasePhone = existingClient.basePhone;
				await tx.update(clients).set({ telefone: "", telefoneBase: "" }).where(eq(clients.id, existingClient.id));
				existingClient.basePhone = "";
				if (context.clientsByBasePhone.get(previousBasePhone)?.id === existingClient.id) context.clientsByBasePhone.delete(previousBasePhone);
			}
			continue;
		}

		const firstSale = getFirstValidSaleForClient(batch, client);
		const firstPurchaseDate = firstSale?.occurredAt ?? null;
		const authorSellerId = firstSale?.seller ? (context.sellersByIdentifier.get(firstSale.seller.identifier) ?? null) : null;
		// Cada conector entrega a UF num formato: a NuvemShop manda "Paraná" por extenso, o
		// CardapioWeb manda a sigla. Normalizar aqui — o ponto por onde toda integracao passa —
		// evita gravar torto e quebrar o escopo fiscal (CFOP intra vs interestadual) e os
		// filtros de publico de campanha, que casam por igualdade exata.
		const location = normalizeLocation({ estado: client.location?.state, cidade: client.location?.city });
		const inserted = await tx
			.insert(clients)
			.values({
				organizacaoId: batch.organizationId,
				autorVendedorId: authorSellerId,
				idExterno: client.externalId,
				nome: client.name,
				cpfCnpj: client.cpfCnpj,
				inscricaoEstadual: client.stateRegistration,
				telefone: client.phone,
				telefoneBase: client.basePhone,
				email: client.email,
				localizacaoCep: client.location?.cep,
				localizacaoEstado: location.estado,
				localizacaoCidade: location.cidade,
				localizacaoBairro: client.location?.neighborhood,
				localizacaoLogradouro: client.location?.street,
				localizacaoNumero: client.location?.number,
				localizacaoComplemento: client.location?.complement,
				localizacaoLatitude: client.location?.latitude,
				localizacaoLongitude: client.location?.longitude,
				primeiraCompraData: firstPurchaseDate,
				ultimaCompraData: firstPurchaseDate,
				analiseRFMTitulo: "CLIENTES RECENTES",
			})
			.returning({
				id: clients.id,
				nome: clients.nome,
				telefoneBase: clients.telefoneBase,
				analiseRFMTitulo: clients.analiseRFMTitulo,
				metadataTotalCompras: clients.metadataTotalCompras,
				metadataValorTotalCompras: clients.metadataValorTotalCompras,
			});

		const resolvedClient = buildResolvedClient(inserted[0], true);
		indexClient(context, resolvedClient, client);
		context.createdClientsCount += 1;
	}

	const existingProducts = await loadRows(mode, keys, (scope) => loadExistingProducts(tx, organizationId, scope));
	for (const product of existingProducts.rows) context.productsByCode.set(product.codigo, product.id);
	if (audit && existingProducts.shadowRows) {
		const shadow = new Map(existingProducts.shadowRows.map((product) => [product.codigo, product.id]));
		auditLookups(audit, "productsByCode", keys.productCodes, context.productsByCode, shadow, (id) => id);
	}

	// Variantes estruturadas: indexadas pelo código (SKU) para que itens de venda liguem à variante
	// certa em vez de criar um produto plano duplicado.
	const existingVariants = await loadRows(mode, keys, (scope) => loadExistingVariants(tx, organizationId, scope));
	const indexVariants = (target: TResolvedAuxiliaryEntities["variantsByCode"], rows: typeof existingVariants.rows) => {
		for (const variant of rows) {
			if (!variant.codigo) continue;
			target.set(variant.codigo, {
				produtoId: variant.produtoId,
				produtoVarianteId: variant.id,
				opcoes: variant.valoresOpcoes.map((assignment) => ({ eixo: assignment.opcao.nome, valor: assignment.valor.nome })),
			});
		}
	};
	indexVariants(context.variantsByCode, existingVariants.rows);
	if (audit && existingVariants.shadowRows) {
		const shadow: TResolvedAuxiliaryEntities["variantsByCode"] = new Map();
		indexVariants(shadow, existingVariants.shadowRows);
		auditLookups(audit, "variantsByCode", keys.productCodes, context.variantsByCode, shadow, (variant) => variant.produtoVarianteId);
	}

	// Vínculos de catálogo: um item remoto já mapeado dispensa qualquer heurística de código, e
	// impede a criação de produto duplicado quando o `externalCode` do provedor não bate com o
	// `codigo` interno — origem do lixo "grupo iFood, preço nulo" no cadastro.
	const links = await loadRows(mode, keys, (scope) => loadCatalogLinks(tx, organizationId, scope));
	const indexLinks = (target: TResolvedAuxiliaryEntities["productsByExternalItemId"], rows: typeof links.rows) => {
		for (const link of rows) {
			if (!link.externoItemId || !link.produtoId) continue;
			target.set(link.externoItemId, {
				produtoId: link.produtoId,
				produtoVarianteId: link.produtoVarianteId,
				opcoes: [],
			});
		}
	};
	indexLinks(context.productsByExternalItemId, links.rows);
	if (audit && links.shadowRows) {
		const shadow: TResolvedAuxiliaryEntities["productsByExternalItemId"] = new Map();
		indexLinks(shadow, links.shadowRows);
		auditLookups(
			audit,
			"productsByExternalItemId",
			keys.productExternalItemIds,
			context.productsByExternalItemId,
			shadow,
			(link) => `${link.produtoId}:${link.produtoVarianteId ?? ""}`,
		);
	}

	for (const product of uniqueBy(batch.products, (value) => value.code)) {
		if (context.productsByCode.has(product.code)) continue;
		// Já existe como variante estruturada: não cria produto plano duplicado.
		if (context.variantsByCode.has(product.code)) continue;
		// Já vinculado a um item remoto: o produto existe, só não é encontrável pelo código.
		if (product.externalId && context.productsByExternalItemId.has(product.externalId)) continue;
		const inserted = await tx
			.insert(products)
			.values({
				organizacaoId: batch.organizationId,
				codigo: product.code,
				nome: product.description,
				unidade: product.unit,
				grupo: product.group,
				ncm: product.ncm,
				tipo: product.type,
				dataUltimaSincronizacao: new Date(),
			})
			.returning({ id: products.id });
		context.productsByCode.set(product.code, inserted[0].id);
		context.createdProductsCount += 1;
	}

	const existingPartners = await loadRows(mode, keys, (scope) => loadExistingPartners(tx, organizationId, scope));
	for (const partner of existingPartners.rows)
		context.partnersByIdentifier.set(partner.identificador, { id: partner.id, clientId: partner.clienteId });
	if (audit && existingPartners.shadowRows) {
		const shadow = new Map(existingPartners.shadowRows.map((partner) => [partner.identificador, { id: partner.id, clientId: partner.clienteId }]));
		auditLookups(audit, "partnersByIdentifier", keys.partnerIdentifiers, context.partnersByIdentifier, shadow, (partner) => partner.id);
	}

	// Resumo do modo sombra: uma linha por lote, visível no log do cron/webhook. Zero divergências
	// ao longo de alguns dias de lotes reais é o critério para trocar o env para TARGETED.
	if (audit) {
		const summary = `[DATA_COLLECTING_V2] [AUX_SHADOW] [ORG: ${organizationId}] [INTEGRATION: ${batch.integrationId}] ${audit.compared} chave(s) comparada(s), ${audit.mismatches.length} divergência(s).`;
		if (audit.mismatches.length > 0) console.warn(summary, { mismatches: audit.mismatches.slice(0, 50) });
		else console.log(summary);
	}

	for (const partner of uniqueBy(batch.partners, (value) => value.identifier)) {
		if (context.partnersByIdentifier.has(partner.identifier)) continue;
		const linkage = partner.clientLink
			? await linkPartnerToClient({
					tx,
					orgId: batch.organizationId,
					partner: {
						nome: partner.clientLink.name,
						cpfCnpj: partner.clientLink.cpfCnpj,
					},
					createClientIfNotFound: true,
				})
			: { clientId: null };

		const inserted = await tx
			.insert(partners)
			.values({
				organizacaoId: batch.organizationId,
				nome: partner.name,
				identificador: partner.identifier,
				codigoAfiliacao: partner.affiliateCode,
				cpfCnpj: partner.cpfCnpj,
				clienteId: linkage.clientId,
			})
			.returning({ id: partners.id });
		context.partnersByIdentifier.set(partner.identifier, { id: inserted[0].id, clientId: linkage.clientId });
		context.createdPartnersCount += 1;
	}

	const existingAddOns = await tx.query.productAddOns.findMany({
		where: eq(productAddOns.organizacaoId, batch.organizationId),
		columns: { id: true, idExterno: true },
	});
	for (const addOn of existingAddOns) {
		if (addOn.idExterno) context.productAddOnsByExternalId.set(addOn.idExterno, addOn.id);
	}

	for (const addOn of uniqueBy(batch.productAddOns, (value) => value.externalId)) {
		if (context.productAddOnsByExternalId.has(addOn.externalId)) continue;
		const inserted = await tx
			.insert(productAddOns)
			.values({
				organizacaoId: batch.organizationId,
				idExterno: addOn.externalId,
				nome: addOn.name,
				minOpcoes: addOn.minOptions,
				maxOpcoes: addOn.maxOptions,
			})
			.returning({ id: productAddOns.id });
		context.productAddOnsByExternalId.set(addOn.externalId, inserted[0].id);
	}

	const existingAddOnOptions = await tx.query.productAddOnOptions.findMany({
		where: eq(productAddOnOptions.organizacaoId, batch.organizationId),
		columns: { id: true, idExterno: true, produtoAddOnId: true, ativo: true },
	});
	const addOnExternalIdsById = new Map(existingAddOns.filter((addOn) => addOn.idExterno).map((addOn) => [addOn.id, addOn.idExterno!]));
	for (const option of existingAddOnOptions.filter((option) => option.ativo)) {
		if (option.idExterno) context.productAddOnOptionsByExternalId.set(option.idExterno, option.id);
	}
	for (const option of existingAddOnOptions.filter((option) => option.ativo && option.idExterno && !option.idExterno.includes(":"))) {
		const addOnExternalId = addOnExternalIdsById.get(option.produtoAddOnId);
		if (addOnExternalId) context.productAddOnOptionsByExternalId.set(`${addOnExternalId}:${option.idExterno}`, option.id);
	}

	for (const option of uniqueBy(batch.productAddOnOptions, (value) => value.externalId)) {
		if (context.productAddOnOptionsByExternalId.has(option.externalId)) continue;
		const addOnId = context.productAddOnsByExternalId.get(option.addOnExternalId);
		if (!addOnId) continue;
		const inserted = await tx
			.insert(productAddOnOptions)
			.values({
				organizacaoId: batch.organizationId,
				produtoAddOnId: addOnId,
				idExterno: option.externalId,
				nome: option.name,
				codigo: option.code,
				precoDelta: option.priceDelta,
				maxQtdePorItem: option.maxQuantityPerItem,
			})
			.returning({ id: productAddOnOptions.id });
		context.productAddOnOptionsByExternalId.set(option.externalId, inserted[0].id);
	}

	return context;
}
