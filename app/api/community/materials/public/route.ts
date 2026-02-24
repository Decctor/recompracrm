import { appApiHandler } from "@/lib/app-api";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { db } from "@/services/drizzle";
import { communityMaterials } from "@/services/drizzle/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetPublicCommunityMaterialsInputSchema = z.object({
	id: z
		.string({
			required_error: "ID do material não informado.",
			invalid_type_error: "Tipo não válido para o ID do material.",
		})
		.optional(),
	search: z
		.string({
			required_error: "Busca não informada.",
			invalid_type_error: "Tipo não válido para busca.",
		})
		.optional(),
	tipo: z
		.string({
			invalid_type_error: "Tipo não válido para tipo de material.",
		})
		.optional()
		.transform((v) => (v ? v.split(",") : [])),
});
export type TGetPublicCommunityMaterialsInput = z.infer<typeof GetPublicCommunityMaterialsInputSchema>;

async function getPublicCommunityMaterials({ input }: { input: TGetPublicCommunityMaterialsInput }) {
	if (input.id) {
		const communityMaterial = await db.query.communityMaterials.findFirst({
			where: and(eq(communityMaterials.id, input.id), eq(communityMaterials.status, "PUBLICADO")),
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

	const conditions = [eq(communityMaterials.status, "PUBLICADO")];
	if (input.search && input.search.trim().length > 0) {
		conditions.push(createSimplifiedSearchCondition(communityMaterials.titulo, input.search));
	}
	if (input.tipo && input.tipo.length > 0) {
		conditions.push(
			inArray(communityMaterials.tipo, input.tipo as ("EBOOK" | "PLAYBOOK" | "PLANILHA" | "TEMPLATE" | "GUIA" | "CHECKLIST" | "INFOGRAFICO" | "DOCUMENTO")[]),
		);
	}

	const communityMaterialsList = await db.query.communityMaterials.findMany({
		where: and(...conditions),
		orderBy: [asc(communityMaterials.ordem), asc(communityMaterials.dataInsercao)],
		with: {
			asset: true,
			autor: {
				columns: { id: true, nome: true, avatarUrl: true },
			},
		},
	});

	return {
		data: {
			byId: null,
			default: communityMaterialsList,
		},
		message: "Materiais obtidos com sucesso.",
	};
}
export type TGetPublicCommunityMaterialsOutput = Awaited<ReturnType<typeof getPublicCommunityMaterials>>;
export type TGetPublicCommunityMaterialsOutputById = NonNullable<TGetPublicCommunityMaterialsOutput["data"]["byId"]>;
export type TGetPublicCommunityMaterialsOutputDefault = NonNullable<TGetPublicCommunityMaterialsOutput["data"]["default"]>;

async function getPublicCommunityMaterialsRoute(request: NextRequest) {
	const input = GetPublicCommunityMaterialsInputSchema.parse({
		id: request.nextUrl.searchParams.get("id") ?? undefined,
		search: request.nextUrl.searchParams.get("search") ?? undefined,
		tipo: request.nextUrl.searchParams.get("tipo") ?? undefined,
	});
	const result = await getPublicCommunityMaterials({ input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getPublicCommunityMaterialsRoute });
