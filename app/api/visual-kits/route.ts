import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { sortVisualKitFormats, VISUAL_KIT_FORMATS } from "@/lib/visual-kits/formats";
import { deleteStoredFile } from "@/lib/files/service";
import { countVisualKitPriceChanges } from "@/lib/visual-kits/price-changes";
import { visualKitItemKey } from "@/lib/visual-kits/types";
import { VisualKitItemSchema, VisualKitPieceSchema, VisualKitSchema } from "@/schemas/visual-kits";
import { db, type DBTransaction } from "@/services/drizzle";
import {
	files,
	products,
	productVariants,
	salesChannels,
	visualKitItems,
	visualKitPieceFiles,
	visualKitPieces,
	visualKits,
} from "@/services/drizzle/schema";
import { and, count, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const VISUAL_KIT_MAX_ITEMS = 200;

function requireOrganizationId(session: TAuthUserSession) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	return organizationId;
}

// -----------------------------------------------------------------------------
// GET — byId (kit + peças + itens) ou listagem (Meus kits)
// -----------------------------------------------------------------------------
const GetVisualKitsInputSchema = z.object({
	id: z
		.string({
			invalid_type_error: "Tipo inválido para ID do kit.",
		})
		.optional()
		.nullable(),
});
export type TGetVisualKitsInput = z.infer<typeof GetVisualKitsInputSchema>;

async function getVisualKits({ input, session }: { input: TGetVisualKitsInput; session: TAuthUserSession }) {
	const organizationId = requireOrganizationId(session);

	if (input.id) {
		const kit = await db.query.visualKits.findFirst({
			where: and(eq(visualKits.id, input.id), eq(visualKits.organizacaoId, organizationId)),
			with: {
				pecas: {
					with: {
						arquivos: {
							columns: { id: true, nome: true, ordem: true, produtoId: true, produtoVarianteId: true },
							orderBy: (file, { asc: ascending }) => ascending(file.ordem),
							with: { arquivo: { columns: { id: true, mimeType: true, tamanhoBytes: true } } },
						},
					},
				},
				itens: {
					columns: { id: true, produtoId: true, produtoVarianteId: true, ordem: true, precoGerado: true, precoDeGerado: true },
					orderBy: (item, { asc: ascending }) => ascending(item.ordem),
				},
			},
		});
		if (!kit) throw new createHttpError.NotFound("Kit não encontrado.");
		return {
			data: {
				byId: { ...kit, pecas: sortVisualKitFormats(kit.pecas), itens: kit.itens.map((item) => ({ ...item, chave: visualKitItemKey(item) })) },
				default: null,
			},
			message: "Kit encontrado com sucesso.",
		};
	}

	const kits = await db.query.visualKits.findMany({
		where: eq(visualKits.organizacaoId, organizationId),
		orderBy: [desc(sql`coalesce(${visualKits.dataAtualizacao}, ${visualKits.dataInsercao})`)],
		columns: {
			id: true,
			nome: true,
			chamada: true,
			status: true,
			canalVendaId: true,
			validadeFim: true,
			dataInsercao: true,
			dataAtualizacao: true,
			dataUltimaGeracao: true,
		},
		with: {
			pecas: { columns: { formato: true } },
			autor: { columns: { id: true, nome: true, avatarUrl: true } },
		},
	});
	const itemCounts = kits.length
		? await db
				.select({ kitId: visualKitItems.kitId, total: count(visualKitItems.id) })
				.from(visualKitItems)
				.where(
					inArray(
						visualKitItems.kitId,
						kits.map((kit) => kit.id),
					),
				)
				.groupBy(visualKitItems.kitId)
		: [];
	const itemCountByKit = new Map(itemCounts.map((row) => [row.kitId, Number(row.total)]));

	// "Preço mudou": só kits já gerados, comparando o impresso com o preço atual do canal do kit.
	const generatedKits = kits.filter((kit) => kit.status === "GERADO");
	const generatedItems = generatedKits.length
		? await db
				.select({
					kitId: visualKitItems.kitId,
					produtoId: visualKitItems.produtoId,
					produtoVarianteId: visualKitItems.produtoVarianteId,
					precoGerado: visualKitItems.precoGerado,
					precoDeGerado: visualKitItems.precoDeGerado,
				})
				.from(visualKitItems)
				.where(
					inArray(
						visualKitItems.kitId,
						generatedKits.map((kit) => kit.id),
					),
				)
		: [];
	const priceChanges = await countVisualKitPriceChanges({
		orgId: organizationId,
		kits: generatedKits.map((kit) => ({ id: kit.id, canalVendaId: kit.canalVendaId, itens: generatedItems.filter((item) => item.kitId === kit.id) })),
	});

	return {
		data: {
			byId: null,
			default: kits.map((kit) => ({
				...kit,
				formatos: sortVisualKitFormats(kit.pecas).map((piece) => piece.formato),
				quantidadeItens: itemCountByKit.get(kit.id) ?? 0,
				produtosComPrecoAlterado: priceChanges.get(kit.id) ?? 0,
			})),
		},
		message: "Kits encontrados com sucesso.",
	};
}
export type TGetVisualKitsOutput = Awaited<ReturnType<typeof getVisualKits>>;
export type TGetVisualKitsOutputById = Exclude<TGetVisualKitsOutput["data"]["byId"], null>;
export type TGetVisualKitsOutputDefault = Exclude<TGetVisualKitsOutput["data"]["default"], null>;

async function getVisualKitsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetVisualKitsInputSchema.parse({ id: request.nextUrl.searchParams.get("id") ?? undefined });
	const result = await getVisualKits({ input, session });
	return NextResponse.json(result, { status: 200 });
}

// -----------------------------------------------------------------------------
// Payload compartilhado por POST e PUT: kit + peças + itens, sempre o conjunto completo.
// -----------------------------------------------------------------------------
const VisualKitPayloadSchema = z.object({
	kit: VisualKitSchema.omit({ organizacaoId: true, status: true, autorId: true }),
	pecas: z
		.array(VisualKitPieceSchema, {
			required_error: "Peças do kit não informadas.",
			invalid_type_error: "Tipo não válido para peças do kit.",
		})
		.superRefine((pieces, ctx) => {
			const seen = new Set<string>();
			for (const piece of pieces) {
				if (seen.has(piece.formato)) {
					ctx.addIssue({ code: z.ZodIssueCode.custom, message: `A peça "${VISUAL_KIT_FORMATS[piece.formato].nome}" aparece mais de uma vez no kit.` });
				}
				seen.add(piece.formato);
				if (!VISUAL_KIT_FORMATS[piece.formato].saidas.some((output) => output.id === piece.saida)) {
					ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Saída inválida para a peça "${VISUAL_KIT_FORMATS[piece.formato].nome}".` });
				}
			}
		}),
	itens: z
		.array(VisualKitItemSchema, {
			required_error: "Produtos do kit não informados.",
			invalid_type_error: "Tipo não válido para produtos do kit.",
		})
		.max(VISUAL_KIT_MAX_ITEMS, { message: `Um kit pode ter até ${VISUAL_KIT_MAX_ITEMS} produtos.` })
		.superRefine((items, ctx) => {
			const seen = new Set<string>();
			for (const item of items) {
				const key = visualKitItemKey(item);
				if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Um produto aparece mais de uma vez no kit." });
				seen.add(key);
			}
		}),
});
type TVisualKitPayload = z.infer<typeof VisualKitPayloadSchema>;

/** Canal e produtos/variantes do payload precisam ser da organização (e a variante, do produto). */
async function validateVisualKitReferences(tx: DBTransaction, organizationId: string, payload: TVisualKitPayload) {
	if (payload.kit.canalVendaId) {
		const channel = await tx.query.salesChannels.findFirst({
			where: and(eq(salesChannels.id, payload.kit.canalVendaId), eq(salesChannels.organizacaoId, organizationId)),
			columns: { id: true },
		});
		if (!channel) throw new createHttpError.BadRequest("Canal de venda não encontrado.");
	}

	const productIds = [...new Set(payload.itens.map((item) => item.produtoId))];
	if (productIds.length) {
		const found = await tx
			.select({ id: products.id })
			.from(products)
			.where(and(eq(products.organizacaoId, organizationId), inArray(products.id, productIds)));
		if (found.length !== productIds.length) throw new createHttpError.BadRequest("Algum produto do kit não foi encontrado.");
	}

	const variantIds = [...new Set(payload.itens.flatMap((item) => (item.produtoVarianteId ? [item.produtoVarianteId] : [])))];
	if (variantIds.length) {
		const found = await tx
			.select({ id: productVariants.id, produtoId: productVariants.produtoId })
			.from(productVariants)
			.where(and(eq(productVariants.organizacaoId, organizationId), inArray(productVariants.id, variantIds)));
		const productByVariant = new Map(found.map((variant) => [variant.id, variant.produtoId]));
		for (const item of payload.itens) {
			if (item.produtoVarianteId && productByVariant.get(item.produtoVarianteId) !== item.produtoId) {
				throw new createHttpError.BadRequest("Alguma variante do kit não foi encontrada.");
			}
		}
	}
}

/**
 * Sincroniza peças e itens com o payload: remove o que saiu, atualiza o que ficou (ordem, saída,
 * sobrescritas) e insere o que entrou. Itens existentes mantêm `precoGerado` — base do aviso de
 * "Preço mudou" depois da geração.
 */
async function syncVisualKitChildren(tx: DBTransaction, organizationId: string, kitId: string, payload: TVisualKitPayload) {
	const formats = payload.pecas.map((piece) => piece.formato);
	// Arquivos gerados de peças que saem do kit: lidos antes do delete (a ligação cai em cascata).
	const orphanFileIds = (
		await tx
			.select({ arquivoId: visualKitPieceFiles.arquivoId })
			.from(visualKitPieceFiles)
			.innerJoin(visualKitPieces, eq(visualKitPieces.id, visualKitPieceFiles.pecaId))
			.where(and(eq(visualKitPieces.kitId, kitId), formats.length ? notInArray(visualKitPieces.formato, formats) : undefined))
	).map((row) => row.arquivoId);
	await tx
		.delete(visualKitPieces)
		.where(and(eq(visualKitPieces.kitId, kitId), formats.length ? notInArray(visualKitPieces.formato, formats) : undefined));
	for (const piece of payload.pecas) {
		await tx
			.insert(visualKitPieces)
			.values({ organizacaoId: organizationId, kitId, formato: piece.formato, saida: piece.saida, ordem: piece.ordem, configuracao: piece.configuracao })
			.onConflictDoUpdate({
				target: [visualKitPieces.kitId, visualKitPieces.formato],
				set: { saida: piece.saida, ordem: piece.ordem, configuracao: piece.configuracao },
			});
	}

	const existingItems = await tx
		.select({ id: visualKitItems.id, produtoId: visualKitItems.produtoId, produtoVarianteId: visualKitItems.produtoVarianteId })
		.from(visualKitItems)
		.where(eq(visualKitItems.kitId, kitId));
	const existingByKey = new Map(existingItems.map((item) => [visualKitItemKey(item), item.id]));
	const incomingKeys = new Set(payload.itens.map(visualKitItemKey));

	const removedIds = existingItems.filter((item) => !incomingKeys.has(visualKitItemKey(item))).map((item) => item.id);
	if (removedIds.length) await tx.delete(visualKitItems).where(inArray(visualKitItems.id, removedIds));

	const newItems: (typeof visualKitItems.$inferInsert)[] = [];
	for (const item of payload.itens) {
		const existingId = existingByKey.get(visualKitItemKey(item));
		if (existingId) {
			await tx.update(visualKitItems).set({ ordem: item.ordem }).where(eq(visualKitItems.id, existingId));
		} else {
			newItems.push({ organizacaoId: organizationId, kitId, produtoId: item.produtoId, produtoVarianteId: item.produtoVarianteId, ordem: item.ordem });
		}
	}
	if (newItems.length) await tx.insert(visualKitItems).values(newItems);

	return { orphanFileIds };
}

/** Arquivos que perderam a peça (peça removida ou kit excluído): fora do catálogo e do armazenamento. */
async function deleteVisualKitFiles(fileIds: string[]) {
	if (fileIds.length === 0) return;
	const storedFiles = await db.query.files.findMany({ where: inArray(files.id, fileIds) });
	await Promise.all(storedFiles.map(deleteStoredFile));
}

// -----------------------------------------------------------------------------
// POST — cria o rascunho
// -----------------------------------------------------------------------------
const CreateVisualKitInputSchema = VisualKitPayloadSchema;
export type TCreateVisualKitInput = z.input<typeof CreateVisualKitInputSchema>;

async function createVisualKit({ input, session }: { input: z.infer<typeof CreateVisualKitInputSchema>; session: TAuthUserSession }) {
	const organizationId = requireOrganizationId(session);

	const kitId = await db.transaction(async (tx) => {
		await validateVisualKitReferences(tx, organizationId, input);
		const [created] = await tx
			.insert(visualKits)
			.values({ ...input.kit, organizacaoId: organizationId, status: "RASCUNHO", autorId: session.user.id })
			.returning({ id: visualKits.id });
		if (!created?.id) throw new createHttpError.InternalServerError("Erro ao criar o kit.");
		await syncVisualKitChildren(tx, organizationId, created.id, input);
		return created.id;
	});

	return { data: { insertedId: kitId }, message: "Kit criado com sucesso." };
}
export type TCreateVisualKitOutput = Awaited<ReturnType<typeof createVisualKit>>;

async function createVisualKitRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = CreateVisualKitInputSchema.parse(await request.json());
	const result = await createVisualKit({ input, session });
	return NextResponse.json(result, { status: 201 });
}

// -----------------------------------------------------------------------------
// PUT — salvamento automático do construtor
// -----------------------------------------------------------------------------
const UpdateVisualKitInputSchema = VisualKitPayloadSchema.extend({
	id: z.string({
		required_error: "ID do kit não informado.",
		invalid_type_error: "Tipo inválido para ID do kit.",
	}),
});
export type TUpdateVisualKitInput = z.input<typeof UpdateVisualKitInputSchema>;

async function updateVisualKit({ input, session }: { input: z.infer<typeof UpdateVisualKitInputSchema>; session: TAuthUserSession }) {
	const organizationId = requireOrganizationId(session);

	const { orphanFileIds } = await db.transaction(async (tx) => {
		// Trava o kit: dois salvamentos automáticos em voo não podem intercalar a sincronização dos filhos.
		const [kit] = await tx
			.select({ id: visualKits.id })
			.from(visualKits)
			.where(and(eq(visualKits.id, input.id), eq(visualKits.organizacaoId, organizationId)))
			.for("update");
		if (!kit) throw new createHttpError.NotFound("Kit não encontrado.");

		await validateVisualKitReferences(tx, organizationId, input);
		await tx
			.update(visualKits)
			.set({ ...input.kit, dataAtualizacao: new Date() })
			.where(eq(visualKits.id, kit.id));
		return syncVisualKitChildren(tx, organizationId, kit.id, input);
	});
	await deleteVisualKitFiles(orphanFileIds);

	return { data: { updatedId: input.id }, message: "Kit salvo com sucesso." };
}
export type TUpdateVisualKitOutput = Awaited<ReturnType<typeof updateVisualKit>>;

async function updateVisualKitRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = UpdateVisualKitInputSchema.parse(await request.json());
	const result = await updateVisualKit({ input, session });
	return NextResponse.json(result, { status: 200 });
}

// -----------------------------------------------------------------------------
// DELETE
// -----------------------------------------------------------------------------
const DeleteVisualKitInputSchema = z.object({
	id: z.string({
		required_error: "ID do kit não informado.",
		invalid_type_error: "Tipo inválido para ID do kit.",
	}),
});
export type TDeleteVisualKitInput = z.infer<typeof DeleteVisualKitInputSchema>;

async function deleteVisualKit({ input, session }: { input: TDeleteVisualKitInput; session: TAuthUserSession }) {
	const organizationId = requireOrganizationId(session);
	const kitFileIds = (
		await db
			.select({ arquivoId: visualKitPieceFiles.arquivoId })
			.from(visualKitPieceFiles)
			.innerJoin(visualKitPieces, eq(visualKitPieces.id, visualKitPieceFiles.pecaId))
			.innerJoin(visualKits, eq(visualKits.id, visualKitPieces.kitId))
			.where(and(eq(visualKits.id, input.id), eq(visualKits.organizacaoId, organizationId)))
	).map((row) => row.arquivoId);
	const deleted = await db
		.delete(visualKits)
		.where(and(eq(visualKits.id, input.id), eq(visualKits.organizacaoId, organizationId)))
		.returning({ id: visualKits.id });
	if (!deleted[0]?.id) throw new createHttpError.NotFound("Kit não encontrado.");
	await deleteVisualKitFiles(kitFileIds);
	return { data: { deletedId: deleted[0].id }, message: "Kit excluído com sucesso." };
}
export type TDeleteVisualKitOutput = Awaited<ReturnType<typeof deleteVisualKit>>;

async function deleteVisualKitRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = DeleteVisualKitInputSchema.parse({ id: request.nextUrl.searchParams.get("id") ?? undefined });
	const result = await deleteVisualKit({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getVisualKitsRoute });
export const POST = appApiHandler({ POST: createVisualKitRoute });
export const PUT = appApiHandler({ PUT: updateVisualKitRoute });
export const DELETE = appApiHandler({ DELETE: deleteVisualKitRoute });
