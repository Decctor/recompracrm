import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatPhoneAsBase } from "@/lib/formatting";
import { linkPartnerToClient } from "@/lib/partners/link-partner-to-client";
import { PartnerSchema } from "@/schemas/partners";
import { db } from "@/services/drizzle";
import { partners, sales } from "@/services/drizzle/schema";
import { and, count, eq, gte, inArray, lte, max, min, ne, notInArray, or, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

function normalizeOptionalString(value?: string | null) {
	const normalized = value?.trim();
	return normalized ? normalized : null;
}

const CreatePartnerInputSchema = z.object({
	partner: PartnerSchema.omit({ dataInsercao: true }),
});
export type TCreatePartnerInput = z.infer<typeof CreatePartnerInputSchema>;

async function createPartner({ input, session }: { input: TCreatePartnerInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const insertedPartnerId = await db.transaction(async (tx) => {
		const existingPartner = await tx.query.partners.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.identificador, input.partner.identificador), eq(fields.organizacaoId, userOrgId)),
		});

		if (existingPartner) throw new createHttpError.Conflict("Já existe um parceiro com este identificador nesta organização.");

		const normalizedPartner = {
			...input.partner,
			identificador: input.partner.identificador.trim(),
			codigoAfiliacao: normalizeOptionalString(input.partner.codigoAfiliacao)?.toUpperCase() ?? null,
			cpfCnpj: normalizeOptionalString(input.partner.cpfCnpj),
			telefone: normalizeOptionalString(input.partner.telefone),
			telefoneBase: normalizeOptionalString(input.partner.telefoneBase) ?? formatPhoneAsBase(input.partner.telefone ?? ""),
			email: normalizeOptionalString(input.partner.email),
			clienteId: normalizeOptionalString(input.partner.clienteId),
		};

		if (normalizedPartner.codigoAfiliacao) {
			const partnerAffiliateCode = normalizedPartner.codigoAfiliacao;
			const codeAlreadyUsed = await tx.query.partners.findFirst({
				where: (fields, { and, eq }) =>
					and(eq(fields.organizacaoId, userOrgId), eq(fields.codigoAfiliacao, partnerAffiliateCode)),
				columns: { id: true },
			});
			if (codeAlreadyUsed) {
				throw new createHttpError.Conflict("Já existe um parceiro com este código de afiliação.");
			}
		}

		const linkage = await linkPartnerToClient({
			tx,
			orgId: userOrgId,
			partner: normalizedPartner,
			manualClientId: normalizedPartner.clienteId,
			createClientIfNotFound: true,
		});

		const insertedPartner = await tx
			.insert(partners)
			.values({
				...normalizedPartner,
				clienteId: linkage.clientId,
				organizacaoId: userOrgId,
			})
			.returning({ id: partners.id });
		const partnerId = insertedPartner[0]?.id;
		if (!partnerId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar parceiro.");

		return partnerId;
	});

	return {
		data: {
			insertedId: insertedPartnerId,
		},
		message: "Parceiro criado com sucesso.",
	};
}
export type TCreatePartnerOutput = Awaited<ReturnType<typeof createPartner>>;

const createPartnerRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	// if (!session.user.permissoes.parceiros.criar) throw new createHttpError.BadRequest("Você não possui permissão para acessar esse recurso.");
	const payload = await request.json();
	const input = CreatePartnerInputSchema.parse(payload);
	const result = await createPartner({ input, session });
	return NextResponse.json(result, { status: 201 });
};

export const POST = appApiHandler({
	POST: createPartnerRoute,
});

const GetPartnersInputSchema = z.object({
	// By ID params
	id: z.string({ invalid_type_error: "Tipo não válido para ID do parceiro." }).optional().nullable(),
	// General params
	page: z
		.string({ invalid_type_error: "Tipo não válido para páginação." })
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : 1)),
	search: z.string({ invalid_type_error: "Tipo não válido para busca." }).optional().nullable(),
	statsPeriodAfter: z
		.string({ invalid_type_error: "Tipo não válido para data de inserção do parceiro." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	statsPeriodBefore: z
		.string({ invalid_type_error: "Tipo não válido para data de inserção do parceiro." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	statsSaleNatures: z
		.string({
			invalid_type_error: "Tipo não válido para natureza de venda.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : [])),
	statsExcludedSalesIds: z
		.string({
			invalid_type_error: "Tipo não válido para ID da venda.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : [])),
	statsTotalMin: z
		.string({
			invalid_type_error: "Tipo não válido para valor mínimo da venda.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
	statsTotalMax: z
		.string({
			invalid_type_error: "Tipo não válido para valor máximo da venda.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
});

export type TGetPartnersInput = z.infer<typeof GetPartnersInputSchema>;

async function getPartners({ input, session }: { input: TGetPartnersInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if ("id" in input && input.id) {
		const sellerId = input.id;
		if (!sellerId) throw new createHttpError.BadRequest("ID do parceiro não informado.");
		const partner = await db.query.partners.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, sellerId), eq(fields.organizacaoId, userOrgId)),
		});
		if (!partner) throw new createHttpError.NotFound("Parceiro não encontrado.");
		return {
			data: {
				byId: partner,
				default: undefined,
			},
		};
	}

	const partnerConditions = [eq(partners.organizacaoId, userOrgId)];
	let applyRestrictiveSalesFilters = false;
	if (input.search) {
		const searchCondition = or(
			sql`(to_tsvector('portuguese', ${partners.nome}) @@ plainto_tsquery('portuguese', ${input.search}) OR ${partners.nome} ILIKE '%' || ${input.search} || '%')`,
			sql`(to_tsvector('portuguese', ${partners.identificador}) @@ plainto_tsquery('portuguese', ${input.search}) OR ${partners.identificador} ILIKE '%' || ${input.search} || '%')`,
			sql`(to_tsvector('portuguese', ${partners.codigoAfiliacao}) @@ plainto_tsquery('portuguese', ${input.search}) OR ${partners.codigoAfiliacao} ILIKE '%' || ${input.search} || '%')`,
			sql`(to_tsvector('portuguese', ${partners.cpfCnpj}) @@ plainto_tsquery('portuguese', ${input.search}) OR ${partners.cpfCnpj} ILIKE '%' || ${input.search} || '%')`,
			sql`(to_tsvector('portuguese', ${partners.telefone}) @@ plainto_tsquery('portuguese', ${input.search}) OR ${partners.telefone} ILIKE '%' || ${input.search} || '%')`,
			sql`(to_tsvector('portuguese', ${partners.email}) @@ plainto_tsquery('portuguese', ${input.search}) OR ${partners.email} ILIKE '%' || ${input.search} || '%')`,
		);
		if (searchCondition) partnerConditions.push(searchCondition);
	}

	const statsConditions = [];
	if (input.statsPeriodAfter) statsConditions.push(gte(sales.dataVenda, input.statsPeriodAfter));
	if (input.statsPeriodBefore) statsConditions.push(lte(sales.dataVenda, input.statsPeriodBefore));
	if (input.statsSaleNatures && input.statsSaleNatures.length > 0) statsConditions.push(inArray(sales.natureza, input.statsSaleNatures));
	if (input.statsExcludedSalesIds && input.statsExcludedSalesIds.length > 0) statsConditions.push(notInArray(sales.id, input.statsExcludedSalesIds));

	const havingConditions = [];
	if (input.statsTotalMin) {
		havingConditions.push(gte(sql<number>`sum(${sales.valorTotal})`, input.statsTotalMin));
		applyRestrictiveSalesFilters = true;
	}
	if (input.statsTotalMax) {
		havingConditions.push(lte(sql<number>`sum(${sales.valorTotal})`, input.statsTotalMax));
		applyRestrictiveSalesFilters = true;
	}

	const PAGE_SIZE = 25;
	const skip = PAGE_SIZE * (input.page - 1);

	const matchedSubquery = db
		.select({
			partnerId: partners.id,
		})
		.from(partners)
		.leftJoin(sales, eq(partners.id, sales.parceiroId))
		.where(and(eq(partners.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), ...partnerConditions, ...statsConditions))
		.groupBy(partners.id);

	if (havingConditions.length > 0) {
		matchedSubquery.having(and(...havingConditions));
	}
	const statsByPartnerMatchedCountResult = await db.select({ count: count() }).from(matchedSubquery.as("sq"));
	const statsByPartnerMatchedCount = statsByPartnerMatchedCountResult[0]?.count ?? 0;

	console.log("CONDITIONS:", {
		partnerConditions: partnerConditions.length,
		statsConditions: statsConditions.length,
		havingConditions: havingConditions.length,
	});
	const statsByPartnerResult = await db
		.select({
			partnerId: partners.id,
			totalSalesValue: sum(sales.valorTotal),
			totalSalesQty: count(sales.id),
			firstSaleDate: min(sales.dataVenda),
			lastSaleDate: max(sales.dataVenda),
		})
		.from(partners)
		.leftJoin(sales, eq(partners.id, sales.parceiroId))
		.where(and(eq(partners.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), ...partnerConditions, ...statsConditions))
		.having(and(...havingConditions))
		.groupBy(partners.id)
		.orderBy(sql`${partners.nome} asc`)
		.offset(skip)
		.limit(PAGE_SIZE);

	const partnerIds = statsByPartnerResult.map((partner) => partner.partnerId);
	const partnersResult = await db.query.partners.findMany({
		where: and(eq(partners.organizacaoId, userOrgId), applyRestrictiveSalesFilters ? inArray(partners.id, partnerIds) : undefined),
	});

	const partnersWithStats = partnersResult.map((partner) => {
		const stats = statsByPartnerResult.find((s) => s.partnerId === partner.id);

		return {
			...partner,
			estatisticas: {
				vendasValorTotal: stats?.totalSalesValue ? Number(stats.totalSalesValue) : 0,
				vendasQtdeTotal: stats?.totalSalesQty ? Number(stats.totalSalesQty) : 0,
				dataPrimeiraVenda: stats?.firstSaleDate ? stats.firstSaleDate : null,
				dataUltimaVenda: stats?.lastSaleDate ? stats.lastSaleDate : null,
			},
		};
	});
	return {
		data: {
			default: {
				partners: partnersWithStats,
				partnersMatched: statsByPartnerMatchedCount,
				totalPages: Math.ceil(statsByPartnerMatchedCount / PAGE_SIZE),
			},
			byId: undefined,
		},
	};
}
export type TGetPartnersOutput = Awaited<ReturnType<typeof getPartners>>;
export type TGetPartnersOutputDefault = Exclude<TGetPartnersOutput["data"]["default"], undefined>;
export type TGetPartnersOutputById = Exclude<TGetPartnersOutput["data"]["byId"], undefined>;

const getPartnersRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	// if (!session.user.permissoes.parceiros.criar) throw new createHttpError.BadRequest("Você não possui permissão para acessar esse recurso.");
	const searchParams = await request.nextUrl.searchParams;
	const input = GetPartnersInputSchema.parse({
		search: searchParams.get("search") ?? undefined,
		page: searchParams.get("page") ?? undefined,
		id: searchParams.get("id") ?? undefined,
		statsPeriodAfter: searchParams.get("statsPeriodAfter") ?? undefined,
		statsPeriodBefore: searchParams.get("statsPeriodBefore") ?? undefined,
		statsSaleNatures: searchParams.get("statsSaleNatures") ?? undefined,
		statsExcludedSalesIds: searchParams.get("statsExcludedSalesIds") ?? undefined,
		statsTotalMin: searchParams.get("statsTotalMin") ?? undefined,
		statsTotalMax: searchParams.get("statsTotalMax") ?? undefined,
	});
	const result = await getPartners({ input, session });
	return NextResponse.json(result);
};
export const GET = appApiHandler({
	GET: getPartnersRoute,
});

const UpdatePartnerInputSchema = z.object({
	partnerId: z.string({ invalid_type_error: "Tipo não válido para ID do parceiro." }),
	partner: PartnerSchema.partial(),
});
export type TUpdatePartnerInput = z.infer<typeof UpdatePartnerInputSchema>;

type UpdatePartnerParams = {
	input: TUpdatePartnerInput;
	session: TAuthUserSession;
};
async function updatePartner({ input, session }: UpdatePartnerParams) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const updatedPartnerId = await db.transaction(async (tx) => {
		const existingPartner = await tx.query.partners.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.partnerId), eq(fields.organizacaoId, userOrgId)),
		});
		if (!existingPartner) throw new createHttpError.NotFound("Parceiro não encontrado.");

		const mergedPartnerData = {
			...existingPartner,
			...input.partner,
			identificador: (input.partner.identificador ?? existingPartner.identificador).trim(),
			codigoAfiliacao:
				normalizeOptionalString(input.partner.codigoAfiliacao ?? existingPartner.codigoAfiliacao)?.toUpperCase() ?? null,
			cpfCnpj: normalizeOptionalString(input.partner.cpfCnpj ?? existingPartner.cpfCnpj),
			telefone: normalizeOptionalString(input.partner.telefone ?? existingPartner.telefone),
			telefoneBase:
				normalizeOptionalString(input.partner.telefoneBase ?? existingPartner.telefoneBase) ??
				formatPhoneAsBase(input.partner.telefone ?? existingPartner.telefone ?? ""),
			email: normalizeOptionalString(input.partner.email ?? existingPartner.email),
			clienteId: normalizeOptionalString(input.partner.clienteId ?? existingPartner.clienteId),
		};

		if (mergedPartnerData.codigoAfiliacao) {
			const partnerAffiliateCode = mergedPartnerData.codigoAfiliacao;
			const codeAlreadyUsed = await tx.query.partners.findFirst({
				where: (fields, { and, eq, ne }) =>
					and(
						eq(fields.organizacaoId, userOrgId),
						eq(fields.codigoAfiliacao, partnerAffiliateCode),
						ne(fields.id, input.partnerId),
					),
				columns: { id: true },
			});
			if (codeAlreadyUsed) throw new createHttpError.Conflict("Já existe um parceiro com este código de afiliação.");
		}

		const linkage = await linkPartnerToClient({
			tx,
			orgId: userOrgId,
			partner: mergedPartnerData,
			manualClientId: mergedPartnerData.clienteId,
			createClientIfNotFound: true,
		});

		const updatedPartner = await tx
			.update(partners)
			.set({
				...mergedPartnerData,
				clienteId: linkage.clientId,
				organizacaoId: userOrgId,
			})
			.where(and(eq(partners.id, input.partnerId), eq(partners.organizacaoId, userOrgId)))
			.returning({ id: partners.id });

		const partnerId = updatedPartner[0]?.id;
		if (!partnerId) throw new createHttpError.NotFound("Parceiro não encontrado.");
		return partnerId;
	});

	return {
		data: {
			updatedId: updatedPartnerId,
		},
		message: "Parceiro atualizado com sucesso.",
	};
}
export type TUpdatePartnerOutput = Awaited<ReturnType<typeof updatePartner>>;

const updatePartnerRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	// if (!session.user.permissoes.parceiros.criar) throw new createHttpError.BadRequest("Você não possui permissão para acessar esse recurso.");
	const payload = await request.json();
	const input = UpdatePartnerInputSchema.parse(payload);
	const result = await updatePartner({ input, session });
	return NextResponse.json(result);
};
export const PUT = appApiHandler({
	PUT: updatePartnerRoute,
});
