import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { uploadFile } from "@/lib/files-storage";
import { OrganizationSchema } from "@/schemas/organizations";
import { NewUserSchema } from "@/schemas/users";
import { db } from "@/services/drizzle";
import { organizationMembers, organizations, products, users } from "@/services/drizzle/schema";
import { sql } from "drizzle-orm";
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
async function getOrganizations() {
	const orgsWithUserCount = await db
		.select({
			id: organizations.id,
			nome: organizations.nome,
			cnpj: organizations.cnpj,
			logoUrl: organizations.logoUrl,
			telefone: organizations.telefone,
			email: organizations.email,
			dataInsercao: organizations.dataInsercao,
			userCount: sql<number>`count(${organizationMembers.id})::int`,
		})
		.from(organizations)
		.leftJoin(organizationMembers, sql`${organizationMembers.organizacaoId} = ${organizations.id}`)
		.groupBy(organizations.id)
		.orderBy(sql`${organizations.dataInsercao} DESC`);

	return {
		data: orgsWithUserCount,
		message: "Organizações obtidas com sucesso.",
	};
}
export type TGetOrganizationsOutput = Awaited<ReturnType<typeof getOrganizations>>;

async function getOrganizationsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const result = await getOrganizations();

	return NextResponse.json(result);
}

// Create Organization
const CreateOrganizationInputSchema = z.object({
	organization: OrganizationSchema.omit({ dataInsercao: true }),
	mainUser: NewUserSchema.omit({ dataInsercao: true, organizacaoId: true }),
	logoFile: z
		.object({
			name: z.string(),
			base64: z.string(),
			type: z.string(),
		})
		.optional()
		.nullable(),
	productsData: z.array(ProductExcelSchema).optional().nullable(),
});
export type TCreateOrganizationInput = z.infer<typeof CreateOrganizationInputSchema>;

async function createOrganization({ input }: { input: TCreateOrganizationInput }) {
	let logoUrl: string | null = null;

	// Upload logo if provided
	if (input.logoFile) {
		const buffer = Buffer.from(input.logoFile.base64, "base64");
		const file = new File([buffer], input.logoFile.name, { type: input.logoFile.type });
		const { url } = await uploadFile({ file, fileName: input.organization.nome, prefix: "organizations" });
		logoUrl = url;
	}

	// Create organization
	const insertedOrganization = await db
		.insert(organizations)
		.values({
			...input.organization,
			logoUrl: logoUrl || input.organization.logoUrl,
		})
		.returning({ id: organizations.id });

	const organizationId = insertedOrganization[0]?.id;
	if (!organizationId) throw new createHttpError.InternalServerError("Erro ao criar organização.");

	// Create main user
	const userAvatarUrl: string | null = null;
	const insertedUser = await db
		.insert(users)
		.values({
			...input.mainUser,
			avatarUrl: userAvatarUrl,
			organizacaoId: organizationId,
		})
		.returning({ id: users.id });

	const userId = insertedUser[0]?.id;
	if (!userId) throw new createHttpError.InternalServerError("Erro ao criar usuário principal.");

	// Import products if provided
	let insertedProductsCount = 0;
	if (input.productsData && input.productsData.length > 0) {
		const productsToInsert = input.productsData.map((product) => ({
			organizacaoId: organizationId,
			codigo: product.CÓDIGO,
			descricao: product.DESCRIÇÃO,
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

export const GET = appApiHandler({
	GET: getOrganizationsRoute,
});

export const POST = appApiHandler({
	POST: createOrganizationRoute,
});
