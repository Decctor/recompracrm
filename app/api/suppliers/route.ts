import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { TAuthUserSession } from "@/lib/authentication/types";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { SupplierSchema } from "@/schemas/suppliers";
import { db } from "@/services/drizzle";
import { suppliers } from "@/services/drizzle/schema";
import { and, desc, eq, or } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextResponse, type NextRequest } from "next/server";
import z from "zod";

const GetSuppliersInputSchema = z.object({
	id: z
		.string({
			invalid_type_error: "Tipo não válido para ID do fornecedor.",
		})
		.optional()
		.nullable(),
	search: z
		.string({
			invalid_type_error: "Tipo não válido para busca.",
		})
		.optional()
		.nullable(),
	activeOnly: z
		.string({
			invalid_type_error: "Tipo não válido para ativo.",
		})
		.optional()
		.nullable()
		.transform((val) => val === "true"),
	// Padrão 25 (busca do seletor). Listas de opção (ex.: filtro de produtos por fornecedor) pedem mais.
	limit: z
		.string({
			invalid_type_error: "Tipo não válido para limite.",
		})
		.optional()
		.nullable()
		.transform((val) => Math.min(Math.max(Number(val) || 25, 1), 500)),
});
export type TGetSuppliersInput = z.infer<typeof GetSuppliersInputSchema>;

async function getSuppliers({ input, session }: { input: TGetSuppliersInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (!session.membership?.permissoes.compras.visualizar)
		throw new createHttpError.Unauthorized("Você não possui permissão para acessar esse recurso.");

	if (input.id) {
		const supplierId = input.id;
		const supplier = await db.query.suppliers.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, supplierId), eq(fields.organizacaoId, userOrgId)),
		});
		if (!supplier) throw new createHttpError.NotFound("Fornecedor não encontrado.");

		return {
			data: {
				default: null,
				byId: supplier,
			},
		};
	}

	const conditions = [eq(suppliers.organizacaoId, userOrgId)];
	if (input.search && input.search.trim().length > 0) {
		const searchCondition = or(
			createSimplifiedSearchCondition(suppliers.nome, input.search),
			createSimplifiedSearchCondition(suppliers.cpfCnpj, input.search),
		);
		if (searchCondition) conditions.push(searchCondition);
	}
	if (input.activeOnly) conditions.push(eq(suppliers.ativo, true));

	const suppliersResult = await db.query.suppliers.findMany({
		where: and(...conditions),
		orderBy: [desc(suppliers.dataInsercao)],
		limit: input.limit,
	});

	return {
		data: {
			default: { suppliers: suppliersResult },
			byId: null,
		},
	};
}
export type TGetSuppliersOutput = Awaited<ReturnType<typeof getSuppliers>>;
export type TGetSuppliersOutputDefault = Exclude<TGetSuppliersOutput["data"]["default"], null>;
export type TGetSuppliersOutputById = Exclude<TGetSuppliersOutput["data"]["byId"], null>;

async function getSuppliersRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const searchParams = request.nextUrl.searchParams;

	const input = GetSuppliersInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		search: searchParams.get("search") ?? undefined,
		activeOnly: searchParams.get("activeOnly") ?? undefined,
		limit: searchParams.get("limit") ?? undefined,
	});
	const result = await getSuppliers({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({
	GET: getSuppliersRoute,
});

const CreateSupplierInputSchema = z.object({
	supplier: SupplierSchema.omit({ organizacaoId: true, ativo: true, dataInsercao: true }),
});
export type TCreateSupplierInput = z.infer<typeof CreateSupplierInputSchema>;

export function normalizeCpfCnpj(cpfCnpj?: string | null) {
	const digits = (cpfCnpj ?? "").replace(/\D/g, "");
	return digits.length > 0 ? digits : null;
}

async function createSupplier({ input, session }: { input: TCreateSupplierInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (!session.membership?.permissoes.compras.criar && !session.membership?.permissoes.compras.editar)
		throw new createHttpError.Unauthorized("Você não possui permissão para acessar esse recurso.");

	const { supplier: payloadSupplier } = input;
	const cpfCnpj = normalizeCpfCnpj(payloadSupplier.cpfCnpj);

	// Idempotent by CNPJ within the org (same semantics as the fiscal inbound resolveOrCreateSupplier):
	// re-importing an invoice or re-submitting the inline form never duplicates the supplier.
	if (cpfCnpj) {
		const existing = await db.query.suppliers.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, userOrgId), eq(fields.cpfCnpj, cpfCnpj)),
		});
		if (existing) {
			return {
				data: { insertedId: existing.id, supplier: existing, alreadyExisted: true },
				message: "Fornecedor com este CNPJ já existia e foi vinculado.",
			};
		}
	}

	const [inserted] = await db
		.insert(suppliers)
		.values({
			...payloadSupplier,
			nome: payloadSupplier.nome.trim(),
			cpfCnpj,
			organizacaoId: userOrgId,
		})
		.returning();
	if (!inserted) throw new createHttpError.InternalServerError("Erro ao criar fornecedor.");

	return {
		data: { insertedId: inserted.id, supplier: inserted, alreadyExisted: false },
		message: "Fornecedor criado com sucesso.",
	};
}
export type TCreateSupplierOutput = Awaited<ReturnType<typeof createSupplier>>;

async function createSupplierRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const body = await request.json();
	const input = CreateSupplierInputSchema.parse(body);
	const result = await createSupplier({ input, session });
	return NextResponse.json(result, { status: 201 });
}
export const POST = appApiHandler({
	POST: createSupplierRoute,
});

const UpdateSupplierInputSchema = z.object({
	supplierId: z.string({
		required_error: "ID do fornecedor não informado.",
		invalid_type_error: "Tipo não válido para ID do fornecedor.",
	}),
	supplier: SupplierSchema.omit({ organizacaoId: true, dataInsercao: true }).partial(),
});
export type TUpdateSupplierInput = z.infer<typeof UpdateSupplierInputSchema>;

async function updateSupplier({ input, session }: { input: TUpdateSupplierInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (!session.membership?.permissoes.compras.editar) throw new createHttpError.Unauthorized("Você não possui permissão para acessar esse recurso.");

	const updates = { ...input.supplier };
	if ("cpfCnpj" in updates) updates.cpfCnpj = normalizeCpfCnpj(updates.cpfCnpj);
	if (updates.nome) updates.nome = updates.nome.trim();

	const [updated] = await db
		.update(suppliers)
		.set(updates)
		.where(and(eq(suppliers.id, input.supplierId), eq(suppliers.organizacaoId, userOrgId)))
		.returning({ id: suppliers.id });
	if (!updated) throw new createHttpError.NotFound("Fornecedor não encontrado.");

	return {
		data: { updatedId: updated.id },
		message: "Fornecedor atualizado com sucesso.",
	};
}
export type TUpdateSupplierOutput = Awaited<ReturnType<typeof updateSupplier>>;

async function updateSupplierRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const body = await request.json();
	const input = UpdateSupplierInputSchema.parse(body);
	const result = await updateSupplier({ input, session });
	return NextResponse.json(result);
}
export const PUT = appApiHandler({
	PUT: updateSupplierRoute,
});
