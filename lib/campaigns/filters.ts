import { type DBTransaction, db } from "@/services/drizzle";
import { clients, productClientReferences } from "@/services/drizzle/schema";
import type { TCampaignFilterCondition, TCampaignFilterTreeNode, TCampaignFilters } from "@/schemas/campaigns";
import { and, count, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";

type TCampaignAudienceExecutor = typeof db | DBTransaction;

type TResolveCampaignAudienceClientIdsParams = {
	executor?: TCampaignAudienceExecutor;
	organizationId: string;
	segmentations?: string[] | null;
	filters?: TCampaignFilters | null;
	/**
	 * Restringe a resolução a estes clientes. Quem só precisa saber se UM cliente pertence à
	 * audiência (gatilhos de venda no POI e na ingestão) não deve materializar a organização
	 * inteira — antes, cada venda baixava todos os ids da org uma vez por campanha, e isso era a
	 * maior fonte de egress do banco. Toda folha da árvore é interseccionada com este conjunto;
	 * como ∩, ∪ e "universo menos filho" distribuem sobre a interseção, o resultado é exatamente
	 * `audiência completa ∩ restrição` — pertencimento idêntico para qualquer cliente restrito.
	 * Ausente = audiência completa (expansão de disparo, preview, públicos da Meta).
	 */
	restrictToClientIds?: string[] | null;
};

type TCampaignAudiencePreview = {
	totalClients: number;
	bySegment: Record<string, number>;
	clientsWithoutRfm: number;
	clientIds: string[];
};

type TCampaignAudienceSource = {
	id: string;
	segmentacoes?: Array<{ segmentacao: string | null }>;
	filtros?: TCampaignFilters | null;
};

type TCampaignAudienceResolutionContext = {
	executor: TCampaignAudienceExecutor;
	organizationId: string;
	// Null = sem restrição. Nunca vazio aqui: o chamador curto-circuita antes de consultar.
	restrictToClientIds: string[] | null;
	allOrganizationClientIdsPromise?: Promise<string[]>;
};

function clientIdRestriction(context: Pick<TCampaignAudienceResolutionContext, "restrictToClientIds">) {
	return context.restrictToClientIds ? [inArray(clients.id, context.restrictToClientIds)] : [];
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>) {
	return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)));
}

function intersectSets(left: Set<string>, right: Set<string>) {
	return new Set(Array.from(left).filter((value) => right.has(value)));
}

function unionSets(sets: Set<string>[]) {
	const result = new Set<string>();
	for (const set of sets) {
		for (const value of set) result.add(value);
	}
	return result;
}

async function mapWithConcurrency<TInput, TOutput>(items: TInput[], concurrency: number, mapper: (item: TInput) => Promise<TOutput>) {
	const results: TOutput[] = [];
	for (let index = 0; index < items.length; index += concurrency) {
		const slice = items.slice(index, index + concurrency);
		results.push(...(await Promise.all(slice.map(mapper))));
	}
	return results;
}

function isEffectivelyEmptyFilters(filters: TCampaignFilters | null | undefined) {
	return !filters || filters.itens.length === 0;
}

async function getAllOrganizationClientIds(context: TCampaignAudienceResolutionContext) {
	if (!context.allOrganizationClientIdsPromise) {
		context.allOrganizationClientIdsPromise = context.executor
			.select({ id: clients.id })
			.from(clients)
			.where(and(eq(clients.organizacaoId, context.organizationId), ...clientIdRestriction(context)))
			.then((rows) => rows.map((row) => row.id));
	}

	return context.allOrganizationClientIdsPromise;
}

async function getSegmentedClientIds({ segmentations, context }: { segmentations: string[]; context: TCampaignAudienceResolutionContext }) {
	if (segmentations.length === 0) return getAllOrganizationClientIds(context);

	const rows = await context.executor
		.select({ id: clients.id })
		.from(clients)
		.where(and(eq(clients.organizacaoId, context.organizationId), inArray(clients.analiseRFMTitulo, segmentations), ...clientIdRestriction(context)));

	return rows.map((row) => row.id);
}

async function resolveConditionClientIds(condition: TCampaignFilterCondition, context: TCampaignAudienceResolutionContext) {
	if (condition.tipo === "LOCALIZAÇÃO") {
		const conditions = [eq(clients.organizacaoId, context.organizationId), ...clientIdRestriction(context)];
		if (condition.configuracao.estados?.length) conditions.push(inArray(clients.localizacaoEstado, condition.configuracao.estados));
		if (condition.configuracao.cidades?.length) conditions.push(inArray(clients.localizacaoCidade, condition.configuracao.cidades));
		if (condition.configuracao.bairros?.length) conditions.push(inArray(clients.localizacaoBairro, condition.configuracao.bairros));

		const rows = await context.executor
			.select({ id: clients.id })
			.from(clients)
			.where(and(...conditions));

		return new Set(rows.map((row) => row.id));
	}

	const rows = await context.executor
		.select({ clientId: productClientReferences.clienteId })
		.from(productClientReferences)
		.where(
			and(
				eq(productClientReferences.organizacaoId, context.organizationId),
				eq(productClientReferences.produtoId, condition.configuracao.produtoId),
				eq(productClientReferences.janela, condition.configuracao.janela),
				gt(productClientReferences.rankingValor, 0),
				lte(productClientReferences.rankingValor, condition.configuracao.top),
				...(context.restrictToClientIds ? [inArray(productClientReferences.clienteId, context.restrictToClientIds)] : []),
			),
		);

	return new Set(rows.map((row) => row.clientId));
}

async function resolveFilterNodeClientIds(
	node: TCampaignFilters | TCampaignFilterTreeNode,
	context: TCampaignAudienceResolutionContext,
): Promise<Set<string>> {
	if (node.tipo === "CONDICAO") {
		return resolveConditionClientIds(node.condicao, context);
	}

	if (node.itens.length === 0) {
		return new Set(await getAllOrganizationClientIds(context));
	}

	if (node.operador === "NOT") {
		const universe = new Set(await getAllOrganizationClientIds(context));
		const [child] = node.itens;
		if (!child) return universe;
		const childSet = await resolveFilterNodeClientIds(child, context);
		for (const clientId of childSet) universe.delete(clientId);
		return universe;
	}

	const childSets = await Promise.all(node.itens.map((child) => resolveFilterNodeClientIds(child, context)));
	if (childSets.length === 0) return new Set(await getAllOrganizationClientIds(context));

	if (node.operador === "OR") {
		return unionSets(childSets);
	}

	let result = childSets[0] ?? new Set<string>();
	for (let index = 1; index < childSets.length; index += 1) {
		result = intersectSets(result, childSets[index] ?? new Set<string>());
	}
	return result;
}

export async function resolveCampaignAudienceClientIds({
	executor = db,
	organizationId,
	segmentations,
	filters,
	restrictToClientIds,
}: TResolveCampaignAudienceClientIdsParams) {
	// Restrição vazia = audiência vazia por construção; não vale nenhuma consulta.
	if (restrictToClientIds && restrictToClientIds.length === 0) return [];

	const normalizedSegmentations = uniqueNonEmptyStrings(segmentations ?? []);
	const context: TCampaignAudienceResolutionContext = {
		executor,
		organizationId,
		restrictToClientIds: restrictToClientIds ?? null,
	};

	// O universo só é materializado quando é a base (sem segmentação) ou quando a árvore de
	// filtros o exige (nó vazio / NOT) — com segmentação e sem filtros ele era baixado e descartado.
	const [segmentationClientIds, filterClientIds] = await Promise.all([
		normalizedSegmentations.length > 0
			? getSegmentedClientIds({ segmentations: normalizedSegmentations, context })
			: Promise.resolve<string[] | null>(null),
		isEffectivelyEmptyFilters(filters) ? Promise.resolve<Set<string> | null>(null) : resolveFilterNodeClientIds(filters as TCampaignFilters, context),
	]);

	const baseSet = segmentationClientIds ? new Set(segmentationClientIds) : new Set(await getAllOrganizationClientIds(context));
	if (!filterClientIds) return Array.from(baseSet);

	return Array.from(intersectSets(baseSet, filterClientIds));
}

/**
 * Remove clientes com comunicação pausada (`clients.comunicacaoPausadaAte` no futuro) de uma
 * lista de destinatários. A pausa é um opt-out de DISPARO, não de pertencimento a audiência:
 * vale para todo enqueue de campanha (e para a fila da carteira do vendedor), mas não para
 * preview de audiência nem para sincronização de públicos de anúncios.
 */
export async function filterCommunicationPausedClientIds({
	executor = db,
	organizationId,
	clientIds,
}: {
	executor?: TCampaignAudienceExecutor;
	organizationId: string;
	clientIds: string[];
}) {
	if (clientIds.length === 0) return clientIds;

	const pausedRows = await executor
		.select({ id: clients.id })
		.from(clients)
		.where(
			and(
				eq(clients.organizacaoId, organizationId),
				inArray(clients.id, clientIds),
				isNotNull(clients.comunicacaoPausadaAte),
				sql`${clients.comunicacaoPausadaAte} > now()`,
			),
		);
	if (pausedRows.length === 0) return clientIds;

	const pausedIds = new Set(pausedRows.map((row) => row.id));
	return clientIds.filter((clientId) => !pausedIds.has(clientId));
}

export async function resolveCampaignAudienceClientIdsForCampaign({
	executor = db,
	organizationId,
	campaign,
	restrictToClientIds,
}: {
	executor?: TCampaignAudienceExecutor;
	organizationId: string;
	campaign: TCampaignAudienceSource;
	restrictToClientIds?: string[] | null;
}) {
	const clientIds = await resolveCampaignAudienceClientIds({
		executor,
		organizationId,
		segmentations:
			campaign.segmentacoes?.map((segmentation) => segmentation.segmentacao).filter((segmentacao): segmentacao is string => !!segmentacao) ?? [],
		filters: campaign.filtros,
		restrictToClientIds,
	});

	// Enqueue de campanha nunca alcança clientes com comunicação pausada.
	return filterCommunicationPausedClientIds({ executor, organizationId, clientIds });
}

/**
 * Audiências por campanha. Para gatilhos de venda passe `restrictToClientIds` com os clientes da
 * venda/lote: os conjuntos passam a conter só esses clientes, e é só isso que
 * `campaignAudienceIncludesClient` consulta.
 */
export async function resolveCampaignAudiencesByCampaignId({
	executor = db,
	organizationId,
	campaigns,
	concurrency = 5,
	restrictToClientIds,
}: {
	executor?: TCampaignAudienceExecutor;
	organizationId: string;
	campaigns: TCampaignAudienceSource[];
	concurrency?: number;
	restrictToClientIds?: string[] | null;
}) {
	const entries = await mapWithConcurrency(campaigns, concurrency, async (campaign) => {
		const clientIds = await resolveCampaignAudienceClientIdsForCampaign({
			executor,
			organizationId,
			campaign,
			restrictToClientIds,
		});

		return [campaign.id, new Set(clientIds)] as const;
	});

	return new Map(entries);
}

export function campaignAudienceHasClient(audiencesByCampaignId: Map<string, Set<string>>, campaignId: string, clientId: string | null) {
	if (!clientId) return false;
	return audiencesByCampaignId.get(campaignId)?.has(clientId) ?? false;
}

export async function countCampaignAudienceClients(params: TResolveCampaignAudienceClientIdsParams) {
	const clientIds = await resolveCampaignAudienceClientIds(params);
	return clientIds.length;
}

export async function previewCampaignAudience({
	executor = db,
	organizationId,
	segmentations,
	filters,
}: TResolveCampaignAudienceClientIdsParams): Promise<TCampaignAudiencePreview> {
	const clientIds = await resolveCampaignAudienceClientIds({
		executor,
		organizationId,
		segmentations,
		filters,
	});

	if (clientIds.length === 0) {
		return {
			totalClients: 0,
			bySegment: {},
			clientsWithoutRfm: 0,
			clientIds: [],
		};
	}

	const grouped = await executor
		.select({
			titulo: clients.analiseRFMTitulo,
			qty: count(),
		})
		.from(clients)
		.where(and(eq(clients.organizacaoId, organizationId), inArray(clients.id, clientIds)))
		.groupBy(clients.analiseRFMTitulo);

	const bySegment: Record<string, number> = {};
	let totalClients = 0;
	let clientsWithoutRfm = 0;

	for (const row of grouped) {
		const qty = Number(row.qty);
		totalClients += qty;
		if (!row.titulo || row.titulo === "") {
			clientsWithoutRfm += qty;
			continue;
		}

		bySegment[row.titulo] = qty;
	}

	return {
		totalClients,
		bySegment,
		clientsWithoutRfm,
		clientIds,
	};
}
