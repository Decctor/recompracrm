import createHttpError from "http-errors";
import type { DBTransaction } from "@/services/drizzle";
import { productAddOnOptions, productVariants, products } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";

// Shared by the add-on registry, product and variant routes — the three used to carry
// identical private copies of this logic, which had already started to drift.
export type TAddOnOptionUpsertInput = {
	id?: string | null;
	deletar?: boolean | null;
	nome: string;
	codigo?: string | null;
	precoDelta: number;
	maxQtdePorItem?: number | null;
	ativo: boolean;
	produtoConsumo?: string | null;
	produtoId?: string | null;
	produtoVarianteId?: string | null;
	quantidadeConsumo?: number | null;
};

function normalizeAddOnOptionLink<T extends TAddOnOptionUpsertInput>(option: T) {
	if (!option.produtoConsumo) {
		return {
			...option,
			produtoId: null,
			produtoVarianteId: null,
			quantidadeConsumo: 1,
		};
	}

	if (option.produtoVarianteId) {
		return {
			...option,
			produtoId: option.produtoId ?? null,
			produtoVarianteId: option.produtoVarianteId,
			quantidadeConsumo: option.quantidadeConsumo ?? 1,
		};
	}

	return {
		...option,
		produtoId: option.produtoId ?? null,
		produtoVarianteId: null,
		quantidadeConsumo: option.quantidadeConsumo ?? 1,
	};
}

export async function validateAndResolveAddOnOptionLink({
	tx,
	userOrgId,
	option,
}: {
	tx: DBTransaction;
	userOrgId: string;
	option: TAddOnOptionUpsertInput;
}) {
	const normalizedOption = normalizeAddOnOptionLink(option);

	if (!normalizedOption.produtoConsumo) {
		return normalizedOption;
	}

	if (normalizedOption.produtoVarianteId) {
		const variant = await tx.query.productVariants.findFirst({
			where: and(eq(productVariants.id, normalizedOption.produtoVarianteId), eq(productVariants.organizacaoId, userOrgId)),
			columns: {
				id: true,
				produtoId: true,
			},
		});

		if (!variant) {
			throw new createHttpError.BadRequest("A variante vinculada ao item de consumo não foi encontrada.");
		}

		if (normalizedOption.produtoId && normalizedOption.produtoId !== variant.produtoId) {
			throw new createHttpError.BadRequest("A variante vinculada ao item de consumo não pertence ao produto informado.");
		}

		return {
			...normalizedOption,
			produtoId: variant.produtoId,
			produtoVarianteId: variant.id,
		};
	}

	if (normalizedOption.produtoId) {
		const product = await tx.query.products.findFirst({
			where: and(eq(products.id, normalizedOption.produtoId), eq(products.organizacaoId, userOrgId)),
			columns: {
				id: true,
			},
		});

		if (!product) {
			throw new createHttpError.BadRequest("O produto vinculado ao item de consumo não foi encontrado.");
		}
	}

	return normalizedOption;
}

export async function upsertProductAddOnOptions({
	tx,
	userOrgId,
	addOnId,
	options,
}: {
	tx: DBTransaction;
	userOrgId: string;
	addOnId: string;
	options: TAddOnOptionUpsertInput[];
}) {
	for (const option of options) {
		if (option.id && option.deletar) {
			// Tombstone, never hard delete: sale item modifiers and catalog links point here.
			// "ativo: false" keeps every consumption read (POS, shop) correct without changes.
			await tx
				.update(productAddOnOptions)
				.set({ ativo: false, dataExclusao: new Date() })
				.where(
					and(eq(productAddOnOptions.id, option.id), eq(productAddOnOptions.produtoAddOnId, addOnId), eq(productAddOnOptions.organizacaoId, userOrgId)),
				);
			continue;
		}

		const normalizedOption = await validateAndResolveAddOnOptionLink({
			tx,
			userOrgId,
			option,
		});

		const optionValues = {
			nome: normalizedOption.nome,
			codigo: normalizedOption.codigo,
			precoDelta: normalizedOption.precoDelta,
			maxQtdePorItem: normalizedOption.maxQtdePorItem,
			ativo: normalizedOption.ativo,
			produtoId: normalizedOption.produtoId ?? null,
			produtoVarianteId: normalizedOption.produtoVarianteId ?? null,
			quantidadeConsumo: normalizedOption.quantidadeConsumo ?? 1,
		};

		if (normalizedOption.id) {
			await tx
				.update(productAddOnOptions)
				.set(optionValues)
				.where(
					and(
						eq(productAddOnOptions.id, normalizedOption.id),
						eq(productAddOnOptions.produtoAddOnId, addOnId),
						eq(productAddOnOptions.organizacaoId, userOrgId),
					),
				);
			continue;
		}

		await tx.insert(productAddOnOptions).values({
			organizacaoId: userOrgId,
			produtoAddOnId: addOnId,
			...optionValues,
		});
	}
}
