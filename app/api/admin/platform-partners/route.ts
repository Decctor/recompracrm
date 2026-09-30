import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { PlatformPartnerRegistrationSchema } from "@/schemas/platform-partnerships";
import { db } from "@/services/drizzle";
import { platformPartners } from "@/services/drizzle/schema";
import { and, count, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetAdminPlatformPartnersInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo invalido para ID do parceiro." }).optional().nullable(),
	search: z.string({ invalid_type_error: "Tipo invalido para busca." }).optional().nullable(),
	status: z.string({ invalid_type_error: "Tipo invalido para status." }).optional().nullable(),
	page: z
		.string({ invalid_type_error: "Tipo invalido para pagina." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
});
export type TGetAdminPlatformPartnersInput = z.infer<typeof GetAdminPlatformPartnersInputSchema>;

async function getAdminPlatformPartners({ input }: { input: TGetAdminPlatformPartnersInput }) {
	if (input.id) {
		const partner = await db.query.platformPartners.findFirst({
			where: eq(platformPartners.id, input.id),
			with: {
				referrals: {
					with: {
						organizacao: {
							columns: {
								id: true,
								nome: true,
								assinaturaPlano: true,
								stripeSubscriptionStatus: true,
								dataInsercao: true,
							},
						},
						commissions: true,
					},
				},
				payouts: true,
				commissions: true,
			},
		});
		if (!partner) throw new createHttpError.NotFound("Parceiro nao encontrado.");

		return {
			data: {
				byId: partner,
				default: null,
			},
			message: "Parceiro encontrado com sucesso.",
		};
	}

	const conditions = [];
	if (input.search) conditions.push(createSimplifiedSearchCondition(platformPartners.nome, input.search));
	if (input.status) conditions.push(eq(platformPartners.status, input.status as typeof platformPartners.$inferSelect.status));

	const PAGE_SIZE = 25;
	const skip = PAGE_SIZE * (input.page - 1);
	const partnersMatchedResult = await db
		.select({ count: count(platformPartners.id) })
		.from(platformPartners)
		.where(and(...conditions));
	const partnersMatched = partnersMatchedResult[0]?.count ?? 0;

	const partners = await db.query.platformPartners.findMany({
		where: and(...conditions),
		with: {
			referrals: true,
			commissions: true,
			payouts: true,
		},
		orderBy: (fields, { desc }) => desc(fields.dataInsercao),
		offset: skip,
		limit: PAGE_SIZE,
	});

	return {
		data: {
			byId: null,
			default: {
				partners,
				partnersMatched,
				totalPages: Math.ceil(partnersMatched / PAGE_SIZE),
			},
		},
		message: "Parceiros obtidos com sucesso.",
	};
}
export type TGetAdminPlatformPartnersOutput = Awaited<ReturnType<typeof getAdminPlatformPartners>>;
export type TGetAdminPlatformPartnersOutputDefault = Exclude<TGetAdminPlatformPartnersOutput["data"]["default"], null | undefined>;
export type TGetAdminPlatformPartnersOutputById = Exclude<TGetAdminPlatformPartnersOutput["data"]["byId"], null | undefined>;

const CreateAdminPlatformPartnerInputSchema = z.object({
	partner: PlatformPartnerRegistrationSchema.extend({
		codigo: z.string({ required_error: "Codigo do parceiro nao informado.", invalid_type_error: "Tipo invalido para codigo do parceiro." }),
	}),
});
export type TCreateAdminPlatformPartnerInput = z.infer<typeof CreateAdminPlatformPartnerInputSchema>;

async function createAdminPlatformPartner({ input }: { input: TCreateAdminPlatformPartnerInput }) {
	const [createdPartner] = await db
		.insert(platformPartners)
		.values({
			...input.partner,
			codigo: input.partner.codigo.trim().toUpperCase(),
			status: "PENDENTE_APROVACAO",
			dataAceiteTermos: input.partner.aceiteTermos ? new Date() : null,
		})
		.returning({ id: platformPartners.id });
	if (!createdPartner) throw new createHttpError.InternalServerError("Erro ao criar parceiro.");

	return {
		data: {
			partnerId: createdPartner.id,
		},
		message: "Parceiro criado com sucesso.",
	};
}
export type TCreateAdminPlatformPartnerOutput = Awaited<ReturnType<typeof createAdminPlatformPartner>>;

const UpdateAdminPlatformPartnerInputSchema = z.object({
	partnerId: z.string({ required_error: "ID do parceiro nao informado.", invalid_type_error: "Tipo invalido para ID do parceiro." }),
	partner: PlatformPartnerRegistrationSchema.partial()
		.extend({
			codigo: z.string({ invalid_type_error: "Tipo invalido para codigo do parceiro." }).optional(),
			status: z.enum(["PENDENTE_APROVACAO", "ATIVO", "SUSPENSO", "REJEITADO"]).optional(),
			observacoesInternas: z.string({ invalid_type_error: "Tipo invalido para observacoes internas." }).optional().nullable(),
			motivoRejeicao: z.string({ invalid_type_error: "Tipo inválido para o motivo da rejeição." }).trim().max(1000).optional().nullable(),
		})
		.optional(),
});
export type TUpdateAdminPlatformPartnerInput = z.infer<typeof UpdateAdminPlatformPartnerInputSchema>;

async function updateAdminPlatformPartner({ input, adminUserId }: { input: TUpdateAdminPlatformPartnerInput; adminUserId: string }) {
	const existingPartner = await db.query.platformPartners.findFirst({
		where: eq(platformPartners.id, input.partnerId),
	});
	if (!existingPartner) throw new createHttpError.NotFound("Parceiro nao encontrado.");

	const status = input.partner?.status;
	// O parceiro lê o motivo na tela de cadastro não aprovado: rejeitar sem dizer o que corrigir trava o reenvio.
	if (status === "REJEITADO" && !input.partner?.motivoRejeicao) throw new createHttpError.BadRequest("Informe o motivo da rejeição para o parceiro.");
	const [updatedPartner] = await db
		.update(platformPartners)
		.set({
			...input.partner,
			codigo: input.partner?.codigo ? input.partner.codigo.trim().toUpperCase() : undefined,
			dataAprovacao: status === "ATIVO" && existingPartner.status !== "ATIVO" ? new Date() : existingPartner.dataAprovacao,
			aprovadoPorId: status === "ATIVO" && existingPartner.status !== "ATIVO" ? adminUserId : existingPartner.aprovadoPorId,
			motivoRejeicao: status === "REJEITADO" ? input.partner?.motivoRejeicao : status ? null : undefined,
			dataAtualizacao: new Date(),
		})
		.where(eq(platformPartners.id, input.partnerId))
		.returning({ id: platformPartners.id });
	if (!updatedPartner) throw new createHttpError.InternalServerError("Erro ao atualizar parceiro.");

	return {
		data: {
			partnerId: updatedPartner.id,
		},
		message: "Parceiro atualizado com sucesso.",
	};
}
export type TUpdateAdminPlatformPartnerOutput = Awaited<ReturnType<typeof updateAdminPlatformPartner>>;

async function getAdminPlatformPartnersRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetAdminPlatformPartnersInputSchema.parse({
		id: searchParams.get("id"),
		search: searchParams.get("search"),
		status: searchParams.get("status"),
		page: searchParams.get("page"),
	});
	const result = await getAdminPlatformPartners({ input });
	return NextResponse.json(result);
}

async function createAdminPlatformPartnerRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateAdminPlatformPartnerInputSchema.parse(payload);
	const result = await createAdminPlatformPartner({ input });
	return NextResponse.json(result, { status: 201 });
}

async function updateAdminPlatformPartnerRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateAdminPlatformPartnerInputSchema.parse(payload);
	const result = await updateAdminPlatformPartner({ input, adminUserId: session.user.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getAdminPlatformPartnersRoute });
export const POST = appApiHandler({ POST: createAdminPlatformPartnerRoute });
export const PUT = appApiHandler({ PUT: updateAdminPlatformPartnerRoute });
