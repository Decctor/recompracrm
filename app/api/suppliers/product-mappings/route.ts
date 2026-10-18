import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { TAuthUserSession } from "@/lib/authentication/types";
import { upsertSupplierProductMappings } from "@/lib/purchase/supplier-product-mappings";
import { SupplierProductMappingSchema } from "@/schemas/suppliers";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { NextResponse, type NextRequest } from "next/server";
import z from "zod";

const CreateSupplierProductMappingsInputSchema = z.object({
	fornecedorId: z.string({
		required_error: "ID do fornecedor não informado.",
		invalid_type_error: "Tipo não válido para o ID do fornecedor.",
	}),
	mappings: z
		.array(SupplierProductMappingSchema.omit({ organizacaoId: true, fornecedorId: true, dataInsercao: true }))
		.min(1, "Nenhum mapeamento informado."),
});
export type TCreateSupplierProductMappingsInput = z.infer<typeof CreateSupplierProductMappingsInputSchema>;

async function createSupplierProductMappings({ input, session }: { input: TCreateSupplierProductMappingsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (!session.membership?.permissoes.compras.criar && !session.membership?.permissoes.compras.editar)
		throw new createHttpError.Unauthorized("Você não possui permissão para acessar esse recurso.");

	const supplier = await db.query.suppliers.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.fornecedorId), eq(fields.organizacaoId, userOrgId)),
		columns: { id: true },
	});
	if (!supplier) throw new createHttpError.NotFound("Fornecedor não encontrado.");

	const { insertedCount, updatedCount, unchangedCount } = await db.transaction((trx) =>
		upsertSupplierProductMappings({ trx, organizationId: userOrgId, supplierId: input.fornecedorId, mappings: input.mappings }),
	);
	if (insertedCount + updatedCount + unchangedCount === 0)
		return { data: { insertedCount, updatedCount, unchangedCount }, message: "Nenhum mapeamento com código ou EAN para registrar." };

	const touchedCount = insertedCount + updatedCount;
	return {
		data: { insertedCount, updatedCount, unchangedCount },
		message:
			touchedCount > 0
				? `${touchedCount} ${touchedCount === 1 ? "vínculo de produto registrado" : "vínculos de produto registrados"} para este fornecedor.`
				: "Os vínculos já estavam registrados para este fornecedor.",
	};
}
export type TCreateSupplierProductMappingsOutput = Awaited<ReturnType<typeof createSupplierProductMappings>>;

async function createSupplierProductMappingsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const body = await request.json();
	const input = CreateSupplierProductMappingsInputSchema.parse(body);
	const result = await createSupplierProductMappings({ input, session });
	return NextResponse.json(result, { status: 201 });
}
export const POST = appApiHandler({
	POST: createSupplierProductMappingsRoute,
});
