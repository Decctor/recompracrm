import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { PreparationStationRuleSchema, PreparationStationSchema, type TPreparationStationRuleValue } from "@/schemas/preparation-stations";
import { type DBTransaction, db } from "@/services/drizzle";
import { agentPrinters, preparationStationRules, preparationStations, products } from "@/services/drizzle/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Estações de preparo: para onde vai cada item do TICKET_PREPARO. Modelo e decisões em
// docs/dev-planning/preparation-stations-plan.md. A estação é salva inteira (dados + lista completa
// de regras) e as invariantes da organização são validadas dentro da mesma transação:
// - com ≥1 estação ativa, exatamente uma ativa é padrão;
// - um grupo (comparado sem caixa e sem espaços nas pontas) ou produto pertence a no máximo uma estação.

function getSessionOrganizationId(session: TAuthUserSession) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return organizationId;
}

function assertCanManageStations(session: TAuthUserSession) {
	if (!session.membership?.permissoes.empresa.editar)
		throw new createHttpError.Forbidden("Você não possui permissão para gerenciar as estações de preparo da organização.");
}

// Mesma normalização do resolver (lib/sales/preparation-stations.ts): o grupo é texto livre.
function normalizeGroup(grupo: string) {
	return grupo.trim().toLocaleLowerCase("pt-BR");
}

const StationInputSchema = PreparationStationSchema.omit({ organizacaoId: true, dataInsercao: true, dataAtualizacao: true });
// `criterio` espelha valor.criterio (coluna fora do jsonb); o refine recusa payload incoerente.
const RuleInputSchema = PreparationStationRuleSchema.omit({ organizacaoId: true, estacaoId: true, dataInsercao: true }).refine(
	(rule) => rule.criterio === rule.valor.criterio,
	{ message: "Critério da regra não corresponde ao valor informado.", path: ["criterio"] },
);

// ============================================================================
// GET
// ============================================================================

const GetPreparationStationsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo inválido para o ID da estação de preparo." }).optional().nullable(),
});
export type TGetPreparationStationsInput = z.infer<typeof GetPreparationStationsInputSchema>;

// Regra PRODUTO não tem FK: o produto vem junto para exibição e chega `null` quando sumiu
// (a UI descarta a regra órfã; o resolver já a tolera).
type TStationWithRules = typeof preparationStations.$inferSelect & {
	regras: Array<Pick<typeof preparationStationRules.$inferSelect, "id" | "criterio" | "valor">>;
};
async function attachRuleProducts({ organizationId, stations }: { organizationId: string; stations: TStationWithRules[] }) {
	const productIds = [
		...new Set(stations.flatMap((station) => station.regras.flatMap((regra) => (regra.valor.criterio === "PRODUTO" ? [regra.valor.produtoId] : [])))),
	];
	const productRows =
		productIds.length > 0
			? await db
					.select({ id: products.id, nome: products.nome })
					.from(products)
					.where(and(eq(products.organizacaoId, organizationId), inArray(products.id, productIds)))
			: [];
	const productsById = new Map(productRows.map((product) => [product.id, product]));

	return stations.map((station) => ({
		...station,
		regras: station.regras.map((regra) => ({
			...regra,
			produto: regra.valor.criterio === "PRODUTO" ? (productsById.get(regra.valor.produtoId) ?? null) : null,
		})),
	}));
}

async function getPreparationStations({ input, session }: { input: TGetPreparationStationsInput; session: TAuthUserSession }) {
	const organizationId = getSessionOrganizationId(session);

	if (input.id) {
		const station = await db.query.preparationStations.findFirst({
			where: and(eq(preparationStations.id, input.id), eq(preparationStations.organizacaoId, organizationId)),
			with: { regras: { columns: { id: true, criterio: true, valor: true }, orderBy: (fields, { asc }) => [asc(fields.dataInsercao)] } },
		});
		if (!station) throw new createHttpError.NotFound("Estação de preparo não encontrada.");
		const [hydrated] = await attachRuleProducts({ organizationId, stations: [station] });
		return { data: { byId: hydrated, default: null }, message: "Estação de preparo encontrada." };
	}

	const stations = await db.query.preparationStations.findMany({
		where: eq(preparationStations.organizacaoId, organizationId),
		with: { regras: { columns: { id: true, criterio: true, valor: true }, orderBy: (fields, { asc }) => [asc(fields.dataInsercao)] } },
		orderBy: (fields, { asc }) => [asc(fields.ordem), asc(fields.dataInsercao), asc(fields.id)],
	});
	return {
		data: { byId: null, default: await attachRuleProducts({ organizationId, stations }) },
		message: "Estações de preparo carregadas com sucesso.",
	};
}
export type TGetPreparationStationsOutput = Awaited<ReturnType<typeof getPreparationStations>>;

async function getPreparationStationsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetPreparationStationsInputSchema.parse({ id: request.nextUrl.searchParams.get("id") });
	const result = await getPreparationStations({ input, session });
	return NextResponse.json(result);
}

// ============================================================================
// Validação compartilhada (sempre dentro da transação)
// ============================================================================

/**
 * Deduplica as regras da própria estação e recusa as que outra estação da organização já tem.
 * Regras PRODUTO de produto inexistente na organização caem fora em silêncio: são órfãs (o produto
 * foi excluído enquanto o modal estava aberto) e nunca cruzam a fronteira da organização.
 */
async function prepareStationRules({
	tx,
	organizationId,
	stationId,
	rules,
}: {
	tx: DBTransaction;
	organizationId: string;
	stationId: string | null;
	rules: Array<{ valor: TPreparationStationRuleValue }>;
}) {
	const seenGroups = new Set<string>();
	const seenProducts = new Set<string>();
	const deduped: TPreparationStationRuleValue[] = [];
	for (const { valor } of rules) {
		if (valor.criterio === "GRUPO") {
			const key = normalizeGroup(valor.grupo);
			if (seenGroups.has(key)) continue;
			seenGroups.add(key);
			deduped.push({ criterio: "GRUPO", grupo: valor.grupo.trim() });
		} else {
			if (seenProducts.has(valor.produtoId)) continue;
			seenProducts.add(valor.produtoId);
			deduped.push({ criterio: "PRODUTO", produtoId: valor.produtoId });
		}
	}

	const productIds = [...seenProducts];
	const productRows =
		productIds.length > 0
			? await tx
					.select({ id: products.id, nome: products.nome })
					.from(products)
					.where(and(eq(products.organizacaoId, organizationId), inArray(products.id, productIds)))
			: [];
	const productNames = new Map(productRows.map((product) => [product.id, product.nome]));
	const valid = deduped.filter((valor) => valor.criterio === "GRUPO" || productNames.has(valor.produtoId));

	const otherRules = await tx
		.select({ valor: preparationStationRules.valor, estacaoNome: preparationStations.nome })
		.from(preparationStationRules)
		.innerJoin(preparationStations, eq(preparationStations.id, preparationStationRules.estacaoId))
		.where(and(eq(preparationStationRules.organizacaoId, organizationId), stationId ? ne(preparationStationRules.estacaoId, stationId) : undefined));
	const groupOwners = new Map<string, string>();
	const productOwners = new Map<string, string>();
	for (const rule of otherRules) {
		if (rule.valor.criterio === "GRUPO") groupOwners.set(normalizeGroup(rule.valor.grupo), rule.estacaoNome);
		else productOwners.set(rule.valor.produtoId, rule.estacaoNome);
	}

	for (const valor of valid) {
		if (valor.criterio === "GRUPO") {
			const owner = groupOwners.get(normalizeGroup(valor.grupo));
			if (owner) throw new createHttpError.BadRequest(`O grupo "${valor.grupo}" já está atribuído à estação "${owner}".`);
		} else {
			const owner = productOwners.get(valor.produtoId);
			if (owner) throw new createHttpError.BadRequest(`O produto "${productNames.get(valor.produtoId)}" já está atribuído à estação "${owner}".`);
		}
	}

	return valid;
}

async function replaceStationRules({
	tx,
	organizationId,
	stationId,
	rules,
}: {
	tx: DBTransaction;
	organizationId: string;
	stationId: string;
	rules: TPreparationStationRuleValue[];
}) {
	await tx
		.delete(preparationStationRules)
		.where(and(eq(preparationStationRules.organizacaoId, organizationId), eq(preparationStationRules.estacaoId, stationId)));
	if (rules.length === 0) return;
	await tx.insert(preparationStationRules).values(
		rules.map((valor) => ({
			organizacaoId: organizationId,
			estacaoId: stationId,
			// A coluna espelha valor.criterio (fora do jsonb para filtrar e indexar); o input já garante que
			// o `criterio` enviado é igual a valor.criterio, então derivar daqui é o mesmo valor.
			criterio: valor.criterio,
			valor,
		})),
	);
}

/** Com ≥1 estação ativa, exatamente uma ativa é padrão. Chamado depois da escrita, na transação. */
async function assertSingleDefaultStation({
	tx,
	organizationId,
	failureMessage,
}: {
	tx: DBTransaction;
	organizationId: string;
	failureMessage: string;
}) {
	const stations = await tx
		.select({ id: preparationStations.id, ativa: preparationStations.ativa, padrao: preparationStations.padrao })
		.from(preparationStations)
		.where(eq(preparationStations.organizacaoId, organizationId));
	const activeStations = stations.filter((station) => station.ativa);
	const activeDefaults = activeStations.filter((station) => station.padrao);
	if (activeStations.length > 0 && activeDefaults.length !== 1) throw new createHttpError.BadRequest(failureMessage);
}

/** Marcar uma estação como padrão desmarca as demais da organização. */
async function clearOtherDefaults({ tx, organizationId, stationId }: { tx: DBTransaction; organizationId: string; stationId: string }) {
	await tx
		.update(preparationStations)
		.set({ padrao: false })
		.where(and(eq(preparationStations.organizacaoId, organizationId), ne(preparationStations.id, stationId), eq(preparationStations.padrao, true)));
}

/** Há outra estação ativa e padrão na organização (além de `stationId`)? */
async function hasOtherActiveDefault({ tx, organizationId, stationId }: { tx: DBTransaction; organizationId: string; stationId: string | null }) {
	const rows = await tx
		.select({ id: preparationStations.id })
		.from(preparationStations)
		.where(
			and(
				eq(preparationStations.organizacaoId, organizationId),
				eq(preparationStations.ativa, true),
				eq(preparationStations.padrao, true),
				stationId ? ne(preparationStations.id, stationId) : undefined,
			),
		)
		.limit(1);
	return rows.length > 0;
}

// As invariantes (padrão única, grupo/produto em uma estação só) são lidas e escritas na mesma
// transação, mas em READ COMMITTED dois salvamentos simultâneos passariam juntos pela validação.
// O lock por organização serializa as escritas de estações; leituras não esperam.
async function lockOrganizationStations({ tx, organizationId }: { tx: DBTransaction; organizationId: string }) {
	await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`preparation-stations:${organizationId}`}))`);
}

function assertDefaultIsActive(station: { ativa: boolean; padrao: boolean }) {
	if (station.padrao && !station.ativa) throw new createHttpError.BadRequest("A estação padrão precisa estar ativa.");
}

// ============================================================================
// POST
// ============================================================================

const CreatePreparationStationInputSchema = z.object({
	station: StationInputSchema,
	rules: z.array(RuleInputSchema, {
		required_error: "Regras da estação de preparo não informadas.",
		invalid_type_error: "Tipo não válido para as regras da estação de preparo.",
	}),
});
export type TCreatePreparationStationInput = z.infer<typeof CreatePreparationStationInputSchema>;

async function createPreparationStation({ input, session }: { input: TCreatePreparationStationInput; session: TAuthUserSession }) {
	const organizationId = getSessionOrganizationId(session);
	assertDefaultIsActive(input.station);

	const insertedId = await db.transaction(async (tx) => {
		await lockOrganizationStations({ tx, organizationId });
		const existing = await tx
			.select({ id: preparationStations.id })
			.from(preparationStations)
			.where(eq(preparationStations.organizacaoId, organizationId));
		const rules = await prepareStationRules({ tx, organizationId, stationId: null, rules: input.rules });

		// A primeira estação ativa nasce padrão: sem isso, o que nenhuma regra captura não teria destino.
		const padrao = input.station.padrao || (input.station.ativa && !(await hasOtherActiveDefault({ tx, organizationId, stationId: null })));

		const [inserted] = await tx
			.insert(preparationStations)
			.values({
				organizacaoId: organizationId,
				nome: input.station.nome,
				// Nova estação vai para o fim da lista.
				ordem: existing.length,
				ativa: input.station.ativa,
				padrao,
				escopoTicket: input.station.escopoTicket,
			})
			.returning({ id: preparationStations.id });

		if (padrao) await clearOtherDefaults({ tx, organizationId, stationId: inserted.id });
		await replaceStationRules({ tx, organizationId, stationId: inserted.id, rules });
		await assertSingleDefaultStation({ tx, organizationId, failureMessage: "Defina uma estação ativa como padrão." });
		return inserted.id;
	});

	return { data: { insertedId }, message: "Estação de preparo criada com sucesso." };
}
export type TCreatePreparationStationOutput = Awaited<ReturnType<typeof createPreparationStation>>;

async function createPreparationStationRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanManageStations(session);
	const input = CreatePreparationStationInputSchema.parse(await request.json());
	const result = await createPreparationStation({ input, session });
	return NextResponse.json(result);
}

// ============================================================================
// PUT
// ============================================================================

const UpdatePreparationStationInputSchema = z.object({
	stationId: z.string({
		required_error: "ID da estação de preparo não informado.",
		invalid_type_error: "Tipo não válido para o ID da estação de preparo.",
	}),
	station: StationInputSchema,
	// Lista inteira: substitui as regras da estação (sem soft-delete).
	rules: z.array(RuleInputSchema, {
		required_error: "Regras da estação de preparo não informadas.",
		invalid_type_error: "Tipo não válido para as regras da estação de preparo.",
	}),
});
export type TUpdatePreparationStationInput = z.infer<typeof UpdatePreparationStationInputSchema>;

async function updatePreparationStation({ input, session }: { input: TUpdatePreparationStationInput; session: TAuthUserSession }) {
	const organizationId = getSessionOrganizationId(session);
	assertDefaultIsActive(input.station);

	await db.transaction(async (tx) => {
		await lockOrganizationStations({ tx, organizationId });
		const current = await tx.query.preparationStations.findFirst({
			where: and(eq(preparationStations.id, input.stationId), eq(preparationStations.organizacaoId, organizationId)),
			columns: { id: true, padrao: true, ativa: true },
		});
		if (!current) throw new createHttpError.NotFound("Estação de preparo não encontrada.");

		const rules = await prepareStationRules({ tx, organizationId, stationId: current.id, rules: input.rules });
		const otherActiveStations = await tx
			.select({ padrao: preparationStations.padrao })
			.from(preparationStations)
			.where(and(eq(preparationStations.organizacaoId, organizationId), eq(preparationStations.ativa, true), ne(preparationStations.id, current.id)));
		const otherActiveDefault = otherActiveStations.some((station) => station.padrao);
		// Sem outra padrão ativa, a estação vira padrão quando: é a única ativa (não há o que desmarcar)
		// ou está sendo reativada/não era padrão. Desmarcar a padrão com outras ativas não é
		// autocorrigido: a validação abaixo recusa e pede para escolher outra.
		const padrao = input.station.padrao || (input.station.ativa && !otherActiveDefault && (otherActiveStations.length === 0 || !current.padrao));

		await tx
			.update(preparationStations)
			.set({
				nome: input.station.nome,
				ordem: input.station.ordem,
				ativa: input.station.ativa,
				padrao,
				escopoTicket: input.station.escopoTicket,
			})
			.where(and(eq(preparationStations.id, current.id), eq(preparationStations.organizacaoId, organizationId)));

		if (padrao) await clearOtherDefaults({ tx, organizationId, stationId: current.id });
		await replaceStationRules({ tx, organizationId, stationId: current.id, rules });
		await assertSingleDefaultStation({
			tx,
			organizationId,
			failureMessage:
				current.padrao && !padrao
					? "Esta é a estação padrão. Marque outra estação ativa como padrão antes de desmarcar ou desativar esta."
					: "Defina uma estação ativa como padrão.",
		});
	});

	return { data: { updatedId: input.stationId }, message: "Estação de preparo atualizada com sucesso." };
}
export type TUpdatePreparationStationOutput = Awaited<ReturnType<typeof updatePreparationStation>>;

async function updatePreparationStationRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanManageStations(session);
	const input = UpdatePreparationStationInputSchema.parse(await request.json());
	const result = await updatePreparationStation({ input, session });
	return NextResponse.json(result);
}

// ============================================================================
// DELETE
// ============================================================================

const DeletePreparationStationInputSchema = z.object({
	id: z.string({
		required_error: "ID da estação de preparo não informado.",
		invalid_type_error: "Tipo não válido para o ID da estação de preparo.",
	}),
});
export type TDeletePreparationStationInput = z.infer<typeof DeletePreparationStationInputSchema>;

async function deletePreparationStation({ input, session }: { input: TDeletePreparationStationInput; session: TAuthUserSession }) {
	const organizationId = getSessionOrganizationId(session);

	await db.transaction(async (tx) => {
		await lockOrganizationStations({ tx, organizationId });
		const current = await tx.query.preparationStations.findFirst({
			where: and(eq(preparationStations.id, input.id), eq(preparationStations.organizacaoId, organizationId)),
			columns: { id: true },
		});
		if (!current) throw new createHttpError.NotFound("Estação de preparo não encontrada.");

		// Regras caem por cascade; print_jobs.estacao_preparo_id vira NULL (FK set null).
		await tx.delete(preparationStations).where(and(eq(preparationStations.id, current.id), eq(preparationStations.organizacaoId, organizationId)));
		// estacoes_preparo é jsonb sem FK: tira o id das impressoras para não deixar referência morta.
		await tx
			.update(agentPrinters)
			.set({ estacoesPreparo: sql`${agentPrinters.estacoesPreparo} - ${current.id}::text` })
			.where(and(eq(agentPrinters.organizacaoId, organizationId), sql`${agentPrinters.estacoesPreparo} @> ${JSON.stringify([current.id])}::jsonb`));

		await assertSingleDefaultStation({
			tx,
			organizationId,
			failureMessage: "Esta é a estação padrão. Marque outra estação ativa como padrão antes de excluí-la.",
		});
	});

	return { data: { deletedId: input.id }, message: "Estação de preparo excluída com sucesso." };
}
export type TDeletePreparationStationOutput = Awaited<ReturnType<typeof deletePreparationStation>>;

async function deletePreparationStationRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanManageStations(session);
	const input = DeletePreparationStationInputSchema.parse({ id: request.nextUrl.searchParams.get("id") ?? undefined });
	const result = await deletePreparationStation({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getPreparationStationsRoute });
export const POST = appApiHandler({ POST: createPreparationStationRoute });
export const PUT = appApiHandler({ PUT: updatePreparationStationRoute });
export const DELETE = appApiHandler({ DELETE: deletePreparationStationRoute });
