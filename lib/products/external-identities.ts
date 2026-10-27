import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { DBTransaction } from "@/services/drizzle";
import { integrations, catalogLinks, products, productVariants, type TNewCatalogLinkEntity } from "@/services/drizzle/schema";
import type { TCatalogExternalIdentityKind } from "@/schemas/enums";

export type TExternalIdentityKey = { tipo: TCatalogExternalIdentityKind; valor: string };
export type TExternalIdentityTarget = {
	produtoId: string;
	produtoVarianteId: string | null;
	protegido: boolean;
	opcoes: Array<{ eixo: string; valor: string }>;
};
export const externalIdentityKey = ({ tipo, valor }: TExternalIdentityKey) => JSON.stringify([tipo, valor]);

export function resolveExternalIdentity(index: Map<string, TExternalIdentityTarget>, keys: TExternalIdentityKey[]) {
	const matches = keys.map((key) => index.get(externalIdentityKey(key))).filter((v): v is TExternalIdentityTarget => Boolean(v));
	const variant = matches.find((v) => v.produtoVarianteId);
	const target = variant ?? matches[0] ?? null;
	if (target && matches.some((v) => v.produtoId !== target.produtoId || (v.produtoVarianteId && v.produtoVarianteId !== target.produtoVarianteId)))
		throw new Error("Identificadores externos apontam para destinos diferentes. Revise o de-para.");
	return target;
}

export async function loadExternalIdentities(tx: DBTransaction, organizationId: string, integrationId: string) {
	const aliases = await tx
		.select()
		.from(catalogLinks)
		.where(
			and(
				eq(catalogLinks.organizacaoId, organizationId),
				eq(catalogLinks.integracaoId, integrationId),
				isNotNull(catalogLinks.identidadeTipo),
				ne(catalogLinks.status, "DESVINCULADO"),
			),
		);
	const index = new Map<string, TExternalIdentityTarget>();
	if (!aliases.length) return index;
	const productIds = aliases.flatMap((a) => (a.produtoId ? [a.produtoId] : []));
	const variantIds = aliases.flatMap((a) => (a.produtoVarianteId ? [a.produtoVarianteId] : []));
	const parents = productIds.length
		? await tx
				.select({ id: products.id })
				.from(products)
				.where(and(eq(products.organizacaoId, organizationId), inArray(products.id, productIds)))
		: [];
	const variants = variantIds.length
		? await tx.query.productVariants.findMany({
				where: and(eq(productVariants.organizacaoId, organizationId), inArray(productVariants.id, variantIds)),
				with: { produto: { columns: { organizacaoId: true } }, valoresOpcoes: { with: { opcao: true, valor: true } } },
			})
		: [];
	const byId = new Map(variants.map((v) => [v.id, v]));
	for (const alias of aliases) {
		const variant = alias.produtoVarianteId ? byId.get(alias.produtoVarianteId) : null;
		if (
			variant &&
			(variant.produto.organizacaoId !== organizationId ||
				variant.valoresOpcoes.some((a) => a.opcao.organizacaoId !== organizationId || a.valor.organizacaoId !== organizationId))
		)
			throw new Error("Destino da identidade externa contém referências de outra organização.");
		if (alias.produtoVarianteId ? !variant : !parents.some((p) => p.id === alias.produtoId))
			throw new Error(`Destino da identidade externa não encontrado: ${alias.identidadeTipo}/${alias.identidadeValor}.`);
		index.set(externalIdentityKey({ tipo: alias.identidadeTipo!, valor: alias.identidadeValor! }), {
			produtoId: variant?.produtoId ?? alias.produtoId!,
			produtoVarianteId: variant?.id ?? null,
			protegido: alias.protegido,
			opcoes: variant?.valoresOpcoes.map((a) => ({ eixo: a.opcao.nome, valor: a.valor.nome })) ?? [],
		});
	}
	return index;
}

export function resolveExternalSaleItem(
	index: Map<string, TExternalIdentityTarget> | undefined,
	item: { productExternalId: string | null; productCode: string; metadata?: Record<string, unknown> },
) {
	if (!index) return null;
	const variantId = item.metadata?.variantId;
	const phiboEan = item.metadata?.phiboEan;
	const specific = resolveExternalIdentity(index, [
		{ tipo: "CODIGO", valor: item.productCode },
		{ tipo: "EAN", valor: item.productCode },
		...(typeof phiboEan === "string" && phiboEan ? [{ tipo: "EAN" as const, valor: phiboEan }] : []),
		...(typeof variantId === "string" && variantId ? [{ tipo: "VARIANTE" as const, valor: variantId }] : []),
	]);
	const parent = item.productExternalId ? resolveExternalIdentity(index, [{ tipo: "PRODUTO", valor: item.productExternalId }]) : null;
	if (parent && specific && parent.produtoId !== specific.produtoId) throw new Error("Produto e variante externos têm destinos divergentes.");
	if (!specific && parent?.protegido && variantId) throw new Error(`Variante externa sem de-para no catálogo protegido: ${variantId}.`);
	return specific ?? parent;
}

export async function registerExternalIdentity(
	tx: DBTransaction,
	organizationId: string,
	integrationId: string,
	key: TExternalIdentityKey,
	target: { produtoId?: string | null; produtoVarianteId?: string | null; protegido?: boolean },
) {
	if (!key.valor.trim() || Boolean(target.produtoId) === Boolean(target.produtoVarianteId)) throw new Error("Identidade externa inválida.");
	const integration = await tx.query.integrations.findFirst({
		where: and(eq(integrations.id, integrationId), eq(integrations.organizacaoId, organizationId)),
		columns: { id: true, tipo: true },
	});
	if (!integration) throw new Error("Integração da identidade externa não pertence à organização.");
	await tx
		.insert(catalogLinks)
		.values(buildExternalIdentityLink(organizationId, integration, key, target))
		.onConflictDoNothing();
	const [current] = await tx
		.select()
		.from(catalogLinks)
		.where(
			and(
				eq(catalogLinks.organizacaoId, organizationId),
				eq(catalogLinks.integracaoId, integrationId),
				eq(catalogLinks.identidadeTipo, key.tipo),
				eq(catalogLinks.identidadeValor, key.valor),
			),
		);
	if (!current || current.status === "DESVINCULADO") throw new Error(`Identidade externa indisponível: ${key.tipo}/${key.valor}.`);
	if (current.produtoId !== (target.produtoId ?? null) || current.produtoVarianteId !== (target.produtoVarianteId ?? null))
		throw new Error(`Identidade externa já vinculada a outro destino: ${key.tipo}/${key.valor}.`);
	if (target.protegido && !current.protegido) await tx.update(catalogLinks).set({ protegido: true }).where(eq(catalogLinks.id, current.id));
}

export function buildExternalIdentityLink(
	organizationId: string,
	integration: { id: string; tipo: string },
	key: TExternalIdentityKey,
	target: { produtoId?: string | null; produtoVarianteId?: string | null; protegido?: boolean },
): TNewCatalogLinkEntity {
	if (integration.tipo !== "PHIBO" && integration.tipo !== "NUVEM-SHOP") throw new Error("Origem sem suporte a aliases de importação.");
	if (!key.valor.trim() || Boolean(target.produtoId) === Boolean(target.produtoVarianteId)) throw new Error("Identidade externa inválida.");
	return {
		// Only iFood uses merchantId as a store. Import aliases use a deterministic namespace
		// here so the legacy iFood uniqueness/upsert contract remains valid during rollout.
		organizacaoId: organizationId,
		integracaoId: integration.id,
		provider: integration.tipo,
		merchantId: `alias:${createHash("md5").update(`${integration.id}:${key.tipo}:${key.valor}`).digest("hex")}`,
		tipo: target.produtoVarianteId ? "VARIANTE" : "PRODUTO",
		identidadeTipo: key.tipo,
		identidadeValor: key.valor,
		...target,
		protegido: target.protegido ?? false,
		status: "SINCRONIZADO",
		sincronizar: { nome: false, descricao: false, imagem: false, preco: false, disponibilidade: false, complementos: false, criarOpcoes: false },
	};
}
