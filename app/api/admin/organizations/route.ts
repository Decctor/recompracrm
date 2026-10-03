import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { deleteAllOrganizationData, organizationHasBlockingSubscription, removeOrganizationStoredObjects } from "@/lib/organizations/deletion";
import { isValidOrganizationSlug, ORGANIZATION_SLUG_INVALID_MESSAGE } from "@/lib/organizations/slug";
import { getUniqueOrganizationSlug, isOrganizationSlugTaken } from "@/lib/organizations/slug-server";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { deleteSession as deleteGatewaySession } from "@/lib/whatsapp/internal-gateway";
import { OrganizationSchema, OrganizationSlugCreateInputSchema } from "@/schemas/organizations";
import { NewUserSchema } from "@/schemas/users";
import { db } from "@/services/drizzle";
import { organizationMembers, organizations, products, users } from "@/services/drizzle/schema";
import { count, and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Schema for Excel product import
const ProductExcelSchema = z.object({
	CÓDIGO: z.string(),
	DESCRIÇÃO: z.string(),
	UNIDADE: z.string(),
	NCM: z.string(),
	TIPO: z.string(),
	GRUPO: z.string(),
	QUANTIDADE: z.number().optional().nullable(),
	"PREÇO VENDA": z.number().optional().nullable(),
	"PREÇO CUSTO": z.number().optional().nullable(),
});

// Get Organizations

async function getOrganizations({ input }: { input: TGetOrganizationInput }) {
	if ("id" in input && input.id) {
		const inputId = input.id;
		if (typeof inputId !== "string") throw new createHttpError.BadRequest("ID inválido.");
		const org = await db.query.organizations.findFirst({
			where: (fields, { eq }) => eq(fields.id, inputId),
		});
		if (!org) throw new createHttpError.NotFound("Organização não encontrada.");
		return {
			data: {
				byId: org,
				default: null,
			},
			message: "Organização encontrada com sucesso.",
		};
	}

	const conditions = [];
	if (input.search) {
		conditions.push(createSimplifiedSearchCondition(organizations.nome, input.search));
	}

	const PAGE_SIZE = 25;
	const skip = PAGE_SIZE * (input.page - 1);
	const limit = PAGE_SIZE;

	const orgsMatchedResult = await db
		.select({ count: count(organizations.id) })
		.from(organizations)
		.where(and(...conditions));

	const orgsMatchedCount = orgsMatchedResult[0]?.count || 0;

	const totalPages = Math.ceil(orgsMatchedCount / PAGE_SIZE);

	const orgs = await db.query.organizations.findMany({
		where: and(...conditions),
		columns: {
			id: true,
			nome: true,
			cnpj: true,
			logoUrl: true,
			telefone: true,
			email: true,
			stripeCustomerId: true,
			stripeSubscriptionId: true,
			stripeSubscriptionStatus: true,
			assinaturaPlano: true,
			dealId: true,
			periodoTesteInicio: true,
			periodoTesteFim: true,
			consultoriaAtiva: true,
			dataOnboardingConclusao: true,
			dataInsercao: true,
		},
		with: {
			membros: {
				with: {
					usuario: {
						columns: {
							id: true,
							nome: true,
							avatarUrl: true,
						},
					},
				},
			},
		},
		orderBy: (fields, { desc }) => desc(fields.dataInsercao),
		offset: skip,
		limit: limit,
	});

	return {
		data: {
			byId: null,
			default: {
				organizations: orgs,
				organizationsMatched: orgsMatchedCount,
				totalPages: totalPages,
			},
		},
		message: "Organizações obtidas com sucesso.",
	};
}
export type TGetOrganizationsAdminOutput = Awaited<ReturnType<typeof getOrganizations>>;
export type TGetOrganizationsAdminOutputDefault = Exclude<TGetOrganizationsAdminOutput["data"]["default"], undefined | null>;
export type TGetOrganizationsAdminOutputById = Exclude<TGetOrganizationsAdminOutput["data"]["byId"], undefined | null>;
const GetOrganizationInputSchema = z.object({
	id: z
		.string({
			invalid_type_error: "Tipo inválido para ID da organização.",
		})
		.optional()
		.nullable(),

	page: z
		.string()
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
	search: z
		.string({
			invalid_type_error: "Tipo inválido para busca.",
		})
		.optional()
		.nullable(),
});
export type TGetOrganizationInput = z.infer<typeof GetOrganizationInputSchema>;

async function getOrganizationsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetOrganizationInputSchema.parse({
		id: searchParams.get("id"),
		page: searchParams.get("page"),
		search: searchParams.get("search"),
	});
	const result = await getOrganizations({ input });

	return NextResponse.json(result);
}

// Create Organization
const CreateOrganizationInputSchema = z.object({
	organization: OrganizationSchema.omit({ dataInsercao: true }).extend({
		// O endereço da loja é opcional no cadastro: sem um válido, o servidor gera a partir do nome.
		slug: OrganizationSlugCreateInputSchema,
	}),
	mainUser: NewUserSchema.omit({ dataInsercao: true, organizacaoId: true }),
	productsData: z.array(ProductExcelSchema).optional().nullable(),
});
export type TCreateOrganizationInput = z.infer<typeof CreateOrganizationInputSchema>;

async function createOrganization({ input }: { input: TCreateOrganizationInput }) {
	let logoUrl: string | null = null;

	// Endereço público da loja: gerado a partir do informado (ou do nome), com sufixo em colisão.
	const organizationSlug = await getUniqueOrganizationSlug({ base: input.organization.slug || input.organization.nome });

	// Create organization
	const insertedOrganization = await db
		.insert(organizations)
		.values({
			...input.organization,
			slug: organizationSlug,
			logoUrl: logoUrl || input.organization.logoUrl,
		})
		.returning({ id: organizations.id });

	const organizationId = insertedOrganization[0]?.id;
	if (!organizationId) throw new createHttpError.InternalServerError("Erro ao criar organização.");

	// Create main user and link to organization via membership
	const { permissoes, ...mainUserData } = input.mainUser;
	const userAvatarUrl: string | null = mainUserData.avatarUrl ?? null;
	const insertedUser = await db
		.insert(users)
		.values({
			...mainUserData,
			avatarUrl: userAvatarUrl,
			admin: false,
		})
		.returning({ id: users.id });

	const userId = insertedUser[0]?.id;
	if (!userId) throw new createHttpError.InternalServerError("Erro ao criar usuário principal.");

	await db.insert(organizationMembers).values({
		usuarioId: userId,
		organizacaoId: organizationId,
		permissoes,
	});

	// Import products if provided
	let insertedProductsCount = 0;
	if (input.productsData && input.productsData.length > 0) {
		const productsToInsert = input.productsData.map((product) => ({
			organizacaoId: organizationId,
			codigo: product.CÓDIGO,
			nome: product.DESCRIÇÃO,
			unidade: product.UNIDADE,
			ncm: product.NCM,
			tipo: product.TIPO,
			grupo: product.GRUPO,
			quantidade: product.QUANTIDADE,
			precoVenda: product["PREÇO VENDA"],
			precoCusto: product["PREÇO CUSTO"],
		}));

		const insertedProducts = await db.insert(products).values(productsToInsert).returning({ id: products.id });
		insertedProductsCount = insertedProducts.length;
	}

	return {
		data: {
			organizationId,
			userId,
			productsImported: insertedProductsCount,
		},
		message: "Organização criada com sucesso.",
	};
}
export type TCreateOrganizationOutput = Awaited<ReturnType<typeof createOrganization>>;

async function createOrganizationRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateOrganizationInputSchema.parse(payload);

	const result = await createOrganization({ input });

	return NextResponse.json(result);
}

const UpdateOrganizationInputSchema = z.object({
	organizationId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo inválido para ID da organização.",
	}),
	organization: OrganizationSchema.omit({ dataInsercao: true }),
});
export type TUpdateOrganizationInput = z.infer<typeof UpdateOrganizationInputSchema>;

async function updateOrganization({ input }: { input: TUpdateOrganizationInput }) {
	const { organizationId, organization } = input;

	// O PUT admin substitui o objeto inteiro; o slug hidratado no modal passa por aqui inalterado,
	// mas se vier editado precisa das mesmas garantias do fluxo self-service.
	const organizationSlug = organization.slug.trim().toLowerCase();
	if (!isValidOrganizationSlug(organizationSlug)) throw new createHttpError.BadRequest(ORGANIZATION_SLUG_INVALID_MESSAGE);
	if (await isOrganizationSlugTaken({ slug: organizationSlug, excludeOrgId: organizationId })) {
		throw new createHttpError.Conflict("Este endereço já está em uso por outra organização.");
	}

	const updatedOrganization = await db
		.update(organizations)
		.set({ ...organization, slug: organizationSlug })
		.where(eq(organizations.id, organizationId))
		.returning({ id: organizations.id });

	const updatedOrganizationId = updatedOrganization[0]?.id;
	if (!updatedOrganizationId) throw new createHttpError.InternalServerError("Erro ao atualizar organização.");

	return {
		data: { updatedId: updatedOrganizationId },
		message: "Organização atualizada com sucesso.",
	};
}
export type TUpdateOrganizationOutput = Awaited<ReturnType<typeof updateOrganization>>;

async function updateOrganizationRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateOrganizationInputSchema.parse(payload);
	const result = await updateOrganization({ input });
	return NextResponse.json(result);
}

// Delete Organization
const DeleteOrganizationInputSchema = z.object({
	organizationId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo inválido para ID da organização.",
	}),
});
export type TDeleteOrganizationInput = z.infer<typeof DeleteOrganizationInputSchema>;

async function deleteOrganization({ input }: { input: TDeleteOrganizationInput }) {
	const { organizationId } = input;

	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, organizationId),
		columns: {
			id: true,
			nome: true,
			stripeSubscriptionStatus: true,
		},
	});
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");
	if (organizationHasBlockingSubscription(organization.stripeSubscriptionStatus))
		throw new createHttpError.BadRequest("Organização possui assinatura ativa no Stripe. Cancele a assinatura antes de excluir.");

	// Desconexão das sessões WhatsApp no gateway interno (best-effort: falha não bloqueia a exclusão)
	const gatewayConnections = await db.query.whatsappConnections.findMany({
		where: (fields, { and, eq, isNotNull }) =>
			and(eq(fields.organizacaoId, organizationId), eq(fields.tipoConexao, "INTERNAL_GATEWAY"), isNotNull(fields.gatewaySessaoId)),
		columns: { id: true, gatewaySessaoId: true },
	});
	for (const connection of gatewayConnections) {
		if (!connection.gatewaySessaoId) continue;
		try {
			await deleteGatewaySession(connection.gatewaySessaoId);
		} catch (error) {
			console.error("[DELETE ORGANIZATION] Falha ao desconectar sessão do gateway WhatsApp:", connection.gatewaySessaoId, error);
		}
	}

	const { storedObjects } = await db.transaction(async (tx) => {
		return await deleteAllOrganizationData({ trx: tx, organizationId, organizationName: organization.nome });
	});
	// Bytes dos arquivos só depois do commit (best-effort; falhas são logadas e viram órfãos varríveis).
	await removeOrganizationStoredObjects(storedObjects);

	return {
		data: { deletedId: organizationId },
		message: "Organização excluída com sucesso.",
	};
}
export type TDeleteOrganizationOutput = Awaited<ReturnType<typeof deleteOrganization>>;

async function deleteOrganizationRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const searchParams = request.nextUrl.searchParams;
	const input = DeleteOrganizationInputSchema.parse({
		organizationId: searchParams.get("id"),
	});
	const result = await deleteOrganization({ input });
	return NextResponse.json(result);
}

export const DELETE = appApiHandler({
	DELETE: deleteOrganizationRoute,
});

export const PUT = appApiHandler({
	PUT: updateOrganizationRoute,
});

export const GET = appApiHandler({
	GET: getOrganizationsRoute,
});

export const POST = appApiHandler({
	POST: createOrganizationRoute,
});
