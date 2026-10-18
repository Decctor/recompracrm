import type { DBTransaction } from "@/services/drizzle";
import { products, supplierProductMappings } from "@/services/drizzle/schema";
import type { TSupplierProductMapping } from "@/schemas/suppliers";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";

export type TSupplierProductMappingInput = Pick<
	TSupplierProductMapping,
	"codigoFornecedor" | "ean" | "produtoId" | "produtoVarianteId" | "unidadeExterna" | "fatorConversao"
>;

/**
 * Upserts a supplier's de-paras (supplier code/EAN → product). Upsert, not "skip if it exists": a
 * wrong de-para must be correctable by the review itself. If a code already pointed at the wrong
 * product, ignoring the new link would make Stage A of the matching return the wrong product with
 * confidence 1.0 forever.
 *
 * Runs inside the caller's transaction, so products created earlier in the same transaction count
 * as belonging to the organization.
 */
export async function upsertSupplierProductMappings({
	trx,
	organizationId,
	supplierId,
	mappings,
}: {
	trx: DBTransaction;
	organizationId: string;
	supplierId: string;
	mappings: TSupplierProductMappingInput[];
}) {
	// Only mappings that carry an external key are useful for future matching. Within one batch, the
	// last mapping for a key wins, so two lines never fight over the same unique index.
	const mappingByKey = new Map<string, TSupplierProductMappingInput>();
	for (const mapping of mappings) {
		const codigoFornecedor = mapping.codigoFornecedor?.trim() || null;
		const ean = mapping.ean?.trim() || null;
		if (!codigoFornecedor && !ean) continue;
		mappingByKey.set(codigoFornecedor ? `COD:${codigoFornecedor}` : `EAN:${ean}`, { ...mapping, codigoFornecedor, ean });
	}
	const usefulMappings = [...mappingByKey.values()];
	if (usefulMappings.length === 0) return { insertedCount: 0, updatedCount: 0, unchangedCount: 0 };

	const productIds = [...new Set(usefulMappings.map((mapping) => mapping.produtoId))];
	const orgProducts = await trx
		.select({ id: products.id })
		.from(products)
		.where(and(inArray(products.id, productIds), eq(products.organizacaoId, organizationId)));
	const orgProductIds = new Set(orgProducts.map((product) => product.id));
	if (usefulMappings.some((mapping) => !orgProductIds.has(mapping.produtoId)))
		throw new createHttpError.BadRequest("Um ou mais produtos informados não pertencem à sua organização.");

	const existingMappings = await trx
		.select({
			id: supplierProductMappings.id,
			codigoFornecedor: supplierProductMappings.codigoFornecedor,
			ean: supplierProductMappings.ean,
			produtoId: supplierProductMappings.produtoId,
			produtoVarianteId: supplierProductMappings.produtoVarianteId,
		})
		.from(supplierProductMappings)
		.where(and(eq(supplierProductMappings.fornecedorId, supplierId), eq(supplierProductMappings.organizacaoId, organizationId)));
	const existingByCodigo = new Map(
		existingMappings.filter((mapping) => mapping.codigoFornecedor).map((mapping) => [mapping.codigoFornecedor as string, mapping]),
	);
	const existingByEan = new Map(existingMappings.filter((mapping) => mapping.ean).map((mapping) => [mapping.ean as string, mapping]));

	let insertedCount = 0;
	let updatedCount = 0;
	let unchangedCount = 0;
	for (const mapping of usefulMappings) {
		const { codigoFornecedor, ean } = mapping;
		const existing = (codigoFornecedor && existingByCodigo.get(codigoFornecedor)) || (ean && existingByEan.get(ean)) || null;

		if (!existing) {
			await trx.insert(supplierProductMappings).values({
				organizacaoId: organizationId,
				fornecedorId: supplierId,
				codigoFornecedor,
				ean,
				produtoId: mapping.produtoId,
				produtoVarianteId: mapping.produtoVarianteId ?? null,
				unidadeExterna: mapping.unidadeExterna ?? null,
				fatorConversao: mapping.fatorConversao ?? null,
			});
			insertedCount++;
			continue;
		}

		const pointsElsewhere = existing.produtoId !== mapping.produtoId || (existing.produtoVarianteId ?? null) !== (mapping.produtoVarianteId ?? null);
		await trx
			.update(supplierProductMappings)
			.set({
				codigoFornecedor,
				ean,
				produtoId: mapping.produtoId,
				produtoVarianteId: mapping.produtoVarianteId ?? null,
				unidadeExterna: mapping.unidadeExterna ?? null,
				fatorConversao: mapping.fatorConversao ?? null,
				dataAtualizacao: new Date(),
			})
			.where(and(eq(supplierProductMappings.id, existing.id), eq(supplierProductMappings.organizacaoId, organizationId)));

		if (pointsElsewhere) updatedCount++;
		else unchangedCount++;
	}

	return { insertedCount, updatedCount, unchangedCount };
}
