import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { CommunityAssetSchema, CommunityMaterialSchema } from "@/schemas/community-pipeline";
import { db } from "@/services/drizzle";
import { communityAssets, communityMaterials } from "@/services/drizzle/schema";
import { and, asc, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetCommunityMaterialsInputSchema = z.object({
	id: z
		.string({
			required_error: "ID do material não informado.",
			invalid_type_error: "Tipo não válido para ID do material.",
		})
		.optional(),
	page: z.coerce.number({
		required_error: "Página não informada.",
		invalid_type_error: "Tipo não válido para página.",
	}),
	search: z
		.string({
			required_error: "Busca não informada.",
			invalid_type_error: "Tipo não válido para busca.",
		})
		.optional(),
	status: z
		.string({
			invalid_type_error: "Tipo não válido para status.",
		})
		.optional()
		.transform((v) => (v ? v.split(",") : [])),
	tipo: z
		.string({
			invalid_type_error: "Tipo não válido para tipo de material.",
		})
		.optional()
		.transform((v) => (v ? v.split(",") : [])),
	periodFilter: z.enum(["dataPublicacao", "dataInsercao"]).optional().nullable(),
	periodAfter: z
		.string({
			required_error: "Período depois não informado.",
			invalid_type_error: "Tipo não válido para período depois.",
		})
		.datetime({ message: "Tipo não válido para período depois." })
		.optional()
		.nullable()
		.transform((v) => (v ? new Date(v) : null)),
	periodBefore: z
		.string({
			required_error: "Período antes não informado.",
			invalid_type_error: "Tipo não válido para período antes.",
		})
		.datetime({ message: "Tipo não válido para período antes." })
		.optional()
		.nullable()
		.transform((v) => (v ? new Date(v) : null)),
});
export type TGetCommunityMaterialsInput = z.infer<typeof GetCommunityMaterialsInputSchema>;

async function getCommunityMaterials({ input }: { input: TGetCommunityMaterialsInput }) {
	if (input.id) {
		const communityMaterial = await db.query.communityMaterials.findFirst({
			where: eq(communityMaterials.id, input.id),
			with: {
				asset: true,
				autor: {
					columns: { id: true, nome: true, avatarUrl: true },
				},
			},
		});
		if (!communityMaterial) throw new createHttpError.NotFound("Material não encontrado.");
		return { data: { byId: communityMaterial, default: null }, message: "Material obtido com sucesso." };
	}

	const PAGE_SIZE = 25;
	const { page, search, status, tipo, periodFilter, periodAfter, periodBefore } = input;

	const conditions = [];
	if (search && search.trim().length > 0) {
		conditions.push(createSimplifiedSearchCondition(communityMaterials.titulo, search));
	}
	if (status && status.length > 0) {
		conditions.push(inArray(communityMaterials.status, status as ("RASCUNHO" | "PUBLICADO" | "ARQUIVADO")[]));
	}
	if (tipo && tipo.length > 0) {
		conditions.push(
			inArray(communityMaterials.tipo, tipo as ("EBOOK" | "PLAYBOOK" | "PLANILHA" | "TEMPLATE" | "GUIA" | "CHECKLIST" | "INFOGRAFICO" | "DOCUMENTO")[]),
		);
	}
	if (periodFilter && periodAfter && periodBefore) {
		if (periodFilter === "dataPublicacao") {
			conditions.push(and(gte(communityMaterials.dataPublicacao, periodAfter), lte(communityMaterials.dataPublicacao, periodBefore)));
		}
		if (periodFilter === "dataInsercao") {
			conditions.push(and(gte(communityMaterials.dataInsercao, periodAfter), lte(communityMaterials.dataInsercao, periodBefore)));
		}
	}

	const [{ communityMaterialsMatched }] = await db
		.select({ communityMaterialsMatched: count() })
		.from(communityMaterials)
		.where(and(...conditions));

	if (communityMaterialsMatched === 0) {
		return {
			data: {
				default: { communityMaterials: [], communityMaterialsMatched: 0, totalPages: 0 },
				byId: null,
			},
			message: "Nenhum material encontrado.",
		};
	}

	const totalPages = Math.ceil(communityMaterialsMatched / PAGE_SIZE);

	const communityMaterialsResult = await db.query.communityMaterials.findMany({
		where: and(...conditions),
		orderBy: [asc(communityMaterials.ordem), asc(communityMaterials.dataInsercao)],
		with: {
			asset: true,
			autor: {
				columns: { id: true, nome: true, avatarUrl: true },
			},
		},
		offset: PAGE_SIZE * (page - 1),
		limit: PAGE_SIZE,
	});

	return {
		data: { default: { communityMaterials: communityMaterialsResult, communityMaterialsMatched, totalPages }, byId: null },
		message: "Materiais obtidos com sucesso.",
	};
}
export type TGetCommunityMaterialsOutput = Awaited<ReturnType<typeof getCommunityMaterials>>;
export type TGetCommunityMaterialsOutputDefault = NonNullable<TGetCommunityMaterialsOutput["data"]["default"]>;
export type TGetCommunityMaterialsOutputById = NonNullable<TGetCommunityMaterialsOutput["data"]["byId"]>;

async function getCommunityMaterialsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetCommunityMaterialsInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		page: searchParams.get("page") ?? 1,
		search: searchParams.get("search") ?? undefined,
		status: searchParams.get("status") ?? undefined,
		tipo: searchParams.get("tipo") ?? undefined,
		periodFilter: searchParams.get("periodFilter") ?? undefined,
		periodAfter: searchParams.get("periodAfter") ?? undefined,
		periodBefore: searchParams.get("periodBefore") ?? undefined,
	});
	const result = await getCommunityMaterials({ input });
	return NextResponse.json(result);
}

const CreateCommunityMaterialInputSchema = z.object({
	communityMaterial: CommunityMaterialSchema.omit({ assetId: true, dataInsercao: true, dataAtualizacao: true, autorId: true }),
	communityAsset: CommunityAssetSchema.omit({ dataInsercao: true, dataAtualizacao: true, autorId: true }).partial().optional(),
});
export type TCreateCommunityMaterialInput = z.infer<typeof CreateCommunityMaterialInputSchema>;

async function createCommunityMaterial({ input, autorId }: { input: TCreateCommunityMaterialInput; autorId: string }) {
	return await db.transaction(async (tx) => {
		let communityAssetId: string | null = null;

		if (input.communityAsset) {
			const insertedAsset = await tx
				.insert(communityAssets)
				.values({
					titulo: input.communityAsset.titulo ?? input.communityMaterial.titulo,
					tipo: input.communityAsset.tipo ?? "DOCUMENT",
					statusPipeline: input.communityAsset.statusPipeline ?? "PENDENTE",
					muxMetadata: input.communityAsset.muxMetadata ?? {},
					...input.communityAsset,
					autorId,
				})
				.returning({ id: communityAssets.id });

			communityAssetId = insertedAsset[0]?.id ?? null;
			if (!communityAssetId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar asset.");
		}

		const maxOrdem = await tx.select({ max: sql<number>`COALESCE(MAX(${communityMaterials.ordem}), -1)` }).from(communityMaterials);
		const inserted = await tx
			.insert(communityMaterials)
			.values({
				...input.communityMaterial,
				assetId: communityAssetId,
				ordem: input.communityMaterial.ordem || (maxOrdem[0]?.max ?? -1) + 1,
				autorId,
			})
			.returning({ id: communityMaterials.id });

		const insertedMaterialId = inserted[0]?.id;
		if (!insertedMaterialId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar material.");

		return { data: { insertedMaterialId, insertedAssetId: communityAssetId }, message: "Material criado com sucesso." };
	});
}
export type TCreateCommunityMaterialOutput = Awaited<ReturnType<typeof createCommunityMaterial>>;

async function createCommunityMaterialRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateCommunityMaterialInputSchema.parse(payload);
	const result = await createCommunityMaterial({ input, autorId: session.user.id });
	return NextResponse.json(result);
}

const UpdateCommunityMaterialInputSchema = z.object({
	communityMaterialId: z.string({
		required_error: "ID do material não informado.",
		invalid_type_error: "Tipo não válido para ID do material.",
	}),
	communityMaterial: CommunityMaterialSchema.omit({ assetId: true, dataInsercao: true, dataAtualizacao: true, autorId: true }).partial(),
	communityAsset: CommunityAssetSchema.omit({ dataInsercao: true, dataAtualizacao: true, autorId: true }).partial().optional(),
});
export type TUpdateCommunityMaterialInput = z.infer<typeof UpdateCommunityMaterialInputSchema>;

async function updateCommunityMaterial({ input, autorId }: { input: TUpdateCommunityMaterialInput; autorId: string }) {
	return await db.transaction(async (tx) => {
		const existingMaterial = await tx.query.communityMaterials.findFirst({
			where: eq(communityMaterials.id, input.communityMaterialId),
			columns: { id: true, assetId: true },
		});
		if (!existingMaterial) throw new createHttpError.NotFound("Material não encontrado.");

		let communityAssetId = existingMaterial.assetId;
		if (input.communityAsset) {
			if (existingMaterial.assetId) {
				const updatedAsset = await tx
					.update(communityAssets)
					.set({
						...input.communityAsset,
						dataAtualizacao: new Date(),
					})
					.where(eq(communityAssets.id, existingMaterial.assetId))
					.returning({ id: communityAssets.id });
				communityAssetId = updatedAsset[0]?.id ?? null;
				if (!communityAssetId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar asset.");
			} else {
				const insertedAsset = await tx
					.insert(communityAssets)
					.values({
						titulo: input.communityAsset.titulo ?? input.communityMaterial.titulo ?? "",
						tipo: input.communityAsset.tipo ?? "DOCUMENT",
						statusPipeline: input.communityAsset.statusPipeline ?? "PENDENTE",
						muxMetadata: input.communityAsset.muxMetadata ?? {},
						...input.communityAsset,
						autorId,
					})
					.returning({ id: communityAssets.id });
				communityAssetId = insertedAsset[0]?.id ?? null;
				if (!communityAssetId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar asset.");
			}
		}

		const updated = await tx
			.update(communityMaterials)
			.set({
				...input.communityMaterial,
				assetId: communityAssetId,
				dataAtualizacao: new Date(),
			})
			.where(eq(communityMaterials.id, input.communityMaterialId))
			.returning({ id: communityMaterials.id });

		const updatedMaterialId = updated[0]?.id;
		if (!updatedMaterialId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar material.");
		return { data: { updatedMaterialId, updatedAssetId: communityAssetId }, message: "Material atualizado com sucesso." };
	});
}
export type TUpdateCommunityMaterialOutput = Awaited<ReturnType<typeof updateCommunityMaterial>>;

async function updateCommunityMaterialRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateCommunityMaterialInputSchema.parse(payload);
	const result = await updateCommunityMaterial({ input, autorId: session.user.id });
	return NextResponse.json(result);
}

const DeleteCommunityMaterialInputSchema = z.object({
	id: z.string({
		required_error: "ID do material não informado.",
		invalid_type_error: "Tipo não válido para ID do material.",
	}),
});
export type TDeleteCommunityMaterialInput = z.infer<typeof DeleteCommunityMaterialInputSchema>;

async function deleteCommunityMaterial({ input }: { input: TDeleteCommunityMaterialInput }) {
	const deleted = await db.delete(communityMaterials).where(eq(communityMaterials.id, input.id)).returning({ id: communityMaterials.id });
	const deletedMaterialId = deleted[0]?.id;
	if (!deletedMaterialId) throw new createHttpError.NotFound("Material não encontrado.");
	return { data: { deletedMaterialId }, message: "Material excluído com sucesso." };
}
export type TDeleteCommunityMaterialOutput = Awaited<ReturnType<typeof deleteCommunityMaterial>>;

async function deleteCommunityMaterialRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID do material não informado.");

	const input = DeleteCommunityMaterialInputSchema.parse({ id });
	const result = await deleteCommunityMaterial({ input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCommunityMaterialsRoute });
export const POST = appApiHandler({ POST: createCommunityMaterialRoute });
export const PUT = appApiHandler({ PUT: updateCommunityMaterialRoute });
export const DELETE = appApiHandler({ DELETE: deleteCommunityMaterialRoute });
