import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { generatePublicToken, hashPublicToken } from "@/lib/tabs";
import { findOpenTabByServiceCard, findServiceCard } from "@/lib/tabs/service-cards";
import {
	compareServiceCardCodes,
	normalizeServiceCardCode,
	SERVICE_CARD_MAX_BATCH_SIZE,
	SERVICE_CARD_MAX_CODE_LENGTH,
} from "@/lib/tabs/service-card-codes";
import { db } from "@/services/drizzle";
import { serviceCards, tabs } from "@/services/drizzle/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// Comandas fixas (serviceCards) — cadastro. "Em uso" e derivado da tab aberta
// que aponta para o cartao; nunca persistido. Ver docs/tabs/service-cards.md.
// ============================================================================

const ServiceCardCodeSchema = z
	.string({ required_error: "Codigo da comanda nao informado.", invalid_type_error: "Tipo nao valido para codigo da comanda." })
	.trim()
	.min(1, { message: "Codigo da comanda nao informado." })
	.max(SERVICE_CARD_MAX_CODE_LENGTH, { message: `O codigo da comanda deve ter ate ${SERVICE_CARD_MAX_CODE_LENGTH} caracteres.` })
	// Impresso no cartao e digitado no balcao: letras, numeros e hifen.
	.regex(/^[A-Za-z0-9-]+$/, { message: "O codigo da comanda aceita apenas letras, numeros e hifen." })
	.transform((value) => value.toUpperCase());

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

const GetServiceCardsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo nao valido para ID da comanda." }).optional().nullable(),
	// Consulta pelo numero digitado ou pelo token lido do QR do cartao (abertura de conta / leitor).
	codigo: z.string({ invalid_type_error: "Tipo nao valido para codigo da comanda." }).optional().nullable(),
	token: z.string({ invalid_type_error: "Tipo nao valido para token da comanda." }).optional().nullable(),
	activeOnly: z
		.string({ invalid_type_error: "Tipo nao valido para filtro de ativas." })
		.optional()
		.nullable()
		.transform((v) => v === "true"),
});
export type TGetServiceCardsInput = z.infer<typeof GetServiceCardsInputSchema>;

const CreateServiceCardsInputSchema = z.object({
	codes: z
		.array(ServiceCardCodeSchema, { required_error: "Codigos das comandas nao informados.", invalid_type_error: "Tipo nao valido para codigos." })
		.min(1, { message: "Informe ao menos uma comanda." })
		.max(SERVICE_CARD_MAX_BATCH_SIZE, { message: `Gere no maximo ${SERVICE_CARD_MAX_BATCH_SIZE} comandas por vez.` }),
});
export type TCreateServiceCardsInput = z.infer<typeof CreateServiceCardsInputSchema>;

const UpdateServiceCardInputSchema = z.object({
	id: z.string({ required_error: "ID da comanda nao informado." }),
	codigo: ServiceCardCodeSchema.optional(),
	ativo: z.boolean({ invalid_type_error: "Tipo nao valido para ativo." }).optional(),
	regenerarToken: z.boolean({ invalid_type_error: "Tipo nao valido para regeneracao de token." }).optional(),
});
export type TUpdateServiceCardInput = z.infer<typeof UpdateServiceCardInputSchema>;

const DeleteServiceCardInputSchema = z.object({
	id: z.string({ required_error: "ID da comanda nao informado." }),
});
export type TDeleteServiceCardInput = z.infer<typeof DeleteServiceCardInputSchema>;

// ============================================================================
// SERVICES
// ============================================================================

async function getOpenTabByCard({ orgId, serviceCardId }: { orgId: string; serviceCardId?: string }) {
	const openTabs = await db
		.select({ id: tabs.id, serviceCardId: tabs.serviceCardId })
		.from(tabs)
		.where(
			and(
				eq(tabs.organizacaoId, orgId),
				eq(tabs.status, "ABERTA"),
				serviceCardId ? eq(tabs.serviceCardId, serviceCardId) : isNotNull(tabs.serviceCardId),
			),
		);
	return new Map(openTabs.map((tab) => [tab.serviceCardId as string, tab.id]));
}

async function getServiceCards({ input, orgId }: { input: TGetServiceCardsInput; orgId: string }) {
	if (input.id) {
		const card = await db.query.serviceCards.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.id as string), eq(fields.organizacaoId, orgId)),
		});
		if (!card) throw new createHttpError.NotFound("Comanda nao encontrada.");
		const openTabByCard = await getOpenTabByCard({ orgId, serviceCardId: card.id });
		return {
			data: { byId: { ...card, tabAbertaId: openTabByCard.get(card.id) ?? null }, byLookup: null, default: null },
			message: "Comanda encontrada.",
		};
	}

	if (input.codigo || input.token) {
		// Nao encontrar nao e erro: a tela mostra "nao cadastrada" enquanto o operador digita.
		const card = await findServiceCard({ orgId, input: { codigo: input.codigo, token: input.token } });
		const tabAberta = card ? await findOpenTabByServiceCard(db, { orgId, serviceCardId: card.id }) : null;
		return {
			data: {
				byId: null,
				byLookup: { card: card ? { id: card.id, codigo: card.codigo, ativo: card.ativo } : null, tabAberta },
				default: null,
			},
			message: card ? "Comanda encontrada." : "Comanda nao cadastrada.",
		};
	}

	const [cards, openTabByCard] = await Promise.all([
		db.query.serviceCards.findMany({
			where: (fields, { and, eq }) =>
				input.activeOnly ? and(eq(fields.organizacaoId, orgId), eq(fields.ativo, true)) : eq(fields.organizacaoId, orgId),
		}),
		getOpenTabByCard({ orgId }),
	]);

	return {
		data: {
			byId: null,
			byLookup: null,
			default: cards
				.map((card) => ({ ...card, tabAbertaId: openTabByCard.get(card.id) ?? null }))
				.sort((a, b) => compareServiceCardCodes(a.codigo, b.codigo)),
		},
		message: "Comandas carregadas com sucesso.",
	};
}
export type TGetServiceCardsOutput = Awaited<ReturnType<typeof getServiceCards>>;

/**
 * Cria o lote ignorando codigos ja cadastrados: gerar "1–200" quando "1–50" ja existem
 * cria apenas os novos, sem erro. Duplicatas dentro do proprio lote ("7" e "007") contam uma vez.
 */
async function createServiceCards({ input, orgId }: { input: TCreateServiceCardsInput; orgId: string }) {
	const byNormalized = new Map<string, string>();
	for (const codigo of input.codes) {
		const normalized = normalizeServiceCardCode(codigo);
		if (!byNormalized.has(normalized)) byNormalized.set(normalized, codigo);
	}

	const values = [...byNormalized].map(([codigoNormalizado, codigo]) => {
		const tokenPublico = generatePublicToken();
		return { organizacaoId: orgId, codigo, codigoNormalizado, tokenPublico, tokenPublicoHash: hashPublicToken(tokenPublico) };
	});

	const created = await db
		.insert(serviceCards)
		.values(values)
		.onConflictDoNothing({ target: [serviceCards.organizacaoId, serviceCards.codigoNormalizado] })
		.returning();

	const createdNormalized = new Set(created.map((card) => card.codigoNormalizado));
	const skipped = values.filter((value) => !createdNormalized.has(value.codigoNormalizado)).map((value) => value.codigo);

	const message =
		created.length === 0
			? "Todas as comandas informadas ja estavam cadastradas."
			: skipped.length > 0
				? `${created.length} comanda(s) criada(s); ${skipped.length} ja estava(m) cadastrada(s).`
				: `${created.length} comanda(s) criada(s) com sucesso.`;

	return {
		data: { created: created.sort((a, b) => compareServiceCardCodes(a.codigo, b.codigo)), skipped },
		message,
	};
}
export type TCreateServiceCardsOutput = Awaited<ReturnType<typeof createServiceCards>>;

async function updateServiceCard({ input, orgId }: { input: TUpdateServiceCardInput; orgId: string }) {
	const existing = await db.query.serviceCards.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.id), eq(fields.organizacaoId, orgId)),
		columns: { id: true, codigoNormalizado: true },
	});
	if (!existing) throw new createHttpError.NotFound("Comanda nao encontrada.");

	const codigoNormalizado = input.codigo ? normalizeServiceCardCode(input.codigo) : null;
	if (codigoNormalizado && codigoNormalizado !== existing.codigoNormalizado) {
		// A conta aberta guarda o numero impresso como snapshot: trocar o numero no meio do uso desalinharia os dois.
		const openTabByCard = await getOpenTabByCard({ orgId, serviceCardId: existing.id });
		if (openTabByCard.size > 0) throw new createHttpError.BadRequest("Nao e possivel alterar o numero de uma comanda em uso.");
	}

	const tokenPublico = input.regenerarToken ? generatePublicToken() : null;

	try {
		const [updated] = await db
			.update(serviceCards)
			.set({
				...(input.codigo && codigoNormalizado ? { codigo: input.codigo, codigoNormalizado } : {}),
				ativo: input.ativo,
				// Regenerar invalida o cartao impresso: o hash antigo deixa de resolver.
				...(tokenPublico ? { tokenPublico, tokenPublicoHash: hashPublicToken(tokenPublico) } : {}),
			})
			.where(and(eq(serviceCards.id, input.id), eq(serviceCards.organizacaoId, orgId)))
			.returning();

		return {
			data: { serviceCard: updated },
			message: "Comanda atualizada com sucesso.",
		};
	} catch (error) {
		if (error instanceof Error && "code" in error && (error as { code?: string }).code === "23505") {
			throw new createHttpError.Conflict(`Ja existe uma comanda com o codigo "${input.codigo}".`);
		}
		throw error;
	}
}
export type TUpdateServiceCardOutput = Awaited<ReturnType<typeof updateServiceCard>>;

async function deleteServiceCard({ input, orgId }: { input: TDeleteServiceCardInput; orgId: string }) {
	const existing = await db.query.serviceCards.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.id), eq(fields.organizacaoId, orgId)),
		columns: { id: true },
	});
	if (!existing) throw new createHttpError.NotFound("Comanda nao encontrada.");

	const openTabByCard = await getOpenTabByCard({ orgId, serviceCardId: existing.id });
	if (openTabByCard.size > 0) throw new createHttpError.BadRequest("Nao e possivel excluir uma comanda em uso. Feche ou transfira a conta antes.");

	// Contas antigas mantem o numero no snapshot `tabs.codigo` (FK vira null).
	await db.delete(serviceCards).where(and(eq(serviceCards.id, input.id), eq(serviceCards.organizacaoId, orgId)));

	return {
		data: { id: input.id },
		message: "Comanda excluida com sucesso.",
	};
}
export type TDeleteServiceCardOutput = Awaited<ReturnType<typeof deleteServiceCard>>;

// ============================================================================
// HANDLERS
// ============================================================================

async function getServiceCardsRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const { searchParams } = new URL(request.url);
	const input = GetServiceCardsInputSchema.parse({
		id: searchParams.get("id"),
		codigo: searchParams.get("codigo"),
		token: searchParams.get("token"),
		activeOnly: searchParams.get("activeOnly"),
	});
	const result = await getServiceCards({ input, orgId: session.membership!.organizacao.id });
	return NextResponse.json(result);
}

async function createServiceCardsRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const body = await request.json();
	const input = CreateServiceCardsInputSchema.parse(body);
	const result = await createServiceCards({ input, orgId: session.membership!.organizacao.id });
	return NextResponse.json(result);
}

async function updateServiceCardRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const { searchParams } = new URL(request.url);
	const body = await request.json();
	const input = UpdateServiceCardInputSchema.parse({ ...body, id: searchParams.get("id") ?? body.id });
	const result = await updateServiceCard({ input, orgId: session.membership!.organizacao.id });
	return NextResponse.json(result);
}

async function deleteServiceCardRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const { searchParams } = new URL(request.url);
	const input = DeleteServiceCardInputSchema.parse({ id: searchParams.get("id") });
	const result = await deleteServiceCard({ input, orgId: session.membership!.organizacao.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getServiceCardsRoute });
export const POST = appApiHandler({ POST: createServiceCardsRoute });
export const PUT = appApiHandler({ PUT: updateServiceCardRoute });
export const DELETE = appApiHandler({ DELETE: deleteServiceCardRoute });
