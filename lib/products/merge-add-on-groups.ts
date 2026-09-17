import type { DB, DBTransaction } from "@/services/drizzle";
import { catalogLinks, productAddOnOptions, productAddOnReferences, productAddOns, saleItemModifiers } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";

export type TAddOnGroupRow = typeof productAddOns.$inferSelect & {
	opcoes: (typeof productAddOnOptions.$inferSelect)[];
	produtos: (typeof productAddOnReferences.$inferSelect)[];
};

export type TAddOnMergePlan = {
	organizacaoId: string;
	signaturePreview: string;
	survivor: TAddOnGroupRow;
	losers: TAddOnGroupRow[];
	skippedReason: string | null;
	referencesToRepoint: { referenceId: string; loserId: string; produtoId: string; produtoVarianteId: string | null }[];
	referencesToDelete: { referenceId: string; loserId: string; produtoId: string; produtoVarianteId: string | null }[];
	optionsToRepointModifiers: { loserOptionId: string; survivorOptionId: string; modifierCount: number }[];
	optionsToMove: { loserOptionId: string; loserId: string }[];
	survivorUpdates?: Partial<Pick<typeof productAddOns.$inferInsert, "minOpcoes" | "maxOpcoes" | "ativo" | "internoNome">>;
};

function normalizeText(value: string | null | undefined) {
	return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function optionSignature(option: typeof productAddOnOptions.$inferSelect) {
	return [
		normalizeText(option.nome),
		option.precoDelta ?? 0,
		option.maxQtdePorItem ?? 1,
		option.produtoId ?? "",
		option.produtoVarianteId ?? "",
		option.quantidadeConsumo ?? 1,
	].join("|");
}

function hasExternalIdentity(group: TAddOnGroupRow, externallyLinkedGroupIds: Set<string>, externallyLinkedOptionIds: Set<string>) {
	if (group.idExterno) return true;
	if (externallyLinkedGroupIds.has(group.id)) return true;
	return group.opcoes.some((option) => option.idExterno || externallyLinkedOptionIds.has(option.id));
}

export function planAddOnGroupMerge({
	members,
	forcedSurvivorId,
	allowMultipleExternalMembers = false,
	dedupeProductReferences = true,
	externallyLinkedGroupIds,
	externallyLinkedOptionIds,
	modifierCountByOptionId,
	survivorUpdates,
}: {
	members: TAddOnGroupRow[];
	forcedSurvivorId?: string;
	allowMultipleExternalMembers?: boolean;
	/** Quando false, mantém várias referências do mesmo produto (ex.: combo 4 sabores). */
	dedupeProductReferences?: boolean;
	externallyLinkedGroupIds: Set<string>;
	externallyLinkedOptionIds: Set<string>;
	modifierCountByOptionId: Map<string, number>;
	survivorUpdates?: TAddOnMergePlan["survivorUpdates"];
}): TAddOnMergePlan {
	const [first] = members;
	const base: Omit<TAddOnMergePlan, "survivor" | "losers"> = {
		organizacaoId: first.organizacaoId,
		signaturePreview: `${first.nome}${first.internoNome ? ` (${first.internoNome})` : ""}`,
		skippedReason: null,
		referencesToRepoint: [],
		referencesToDelete: [],
		optionsToRepointModifiers: [],
		optionsToMove: [],
		survivorUpdates,
	};

	const externalMembers = members.filter((group) => hasExternalIdentity(group, externallyLinkedGroupIds, externallyLinkedOptionIds));
	if (!allowMultipleExternalMembers && externalMembers.length > 1) {
		return {
			...base,
			survivor: first,
			losers: [],
			skippedReason: `${externalMembers.length} membros com identidade externa (id_externo/catalog_links) — mesclar quebraria o mapeamento dos conectores`,
		};
	}

	const survivor =
		(forcedSurvivorId ? members.find((group) => group.id === forcedSurvivorId) : undefined) ??
		externalMembers[0] ??
		[...members].sort((a, b) => b.produtos.length - a.produtos.length || a.id.localeCompare(b.id))[0];
	if (!survivor) {
		return { ...base, survivor: first, losers: [], skippedReason: "Nenhum sobrevivente encontrado." };
	}

	const losers = members.filter((group) => group.id !== survivor.id);
	const plan: TAddOnMergePlan = { ...base, survivor, losers };

	const survivorOptionQueues = new Map<string, string[]>();
	for (const option of survivor.opcoes.filter((item) => item.ativo)) {
		const signature = optionSignature(option);
		survivorOptionQueues.set(signature, [...(survivorOptionQueues.get(signature) ?? []), option.id]);
	}

	const survivorScopes = new Set(survivor.produtos.map((reference) => `${reference.produtoId}|${reference.produtoVarianteId ?? ""}`));

	for (const loser of losers) {
		for (const reference of loser.produtos) {
			const scope = `${reference.produtoId}|${reference.produtoVarianteId ?? ""}`;
			const target = {
				referenceId: reference.id,
				loserId: loser.id,
				produtoId: reference.produtoId,
				produtoVarianteId: reference.produtoVarianteId,
			};
			if (dedupeProductReferences && survivorScopes.has(scope)) {
				plan.referencesToDelete.push(target);
			} else {
				if (dedupeProductReferences) survivorScopes.add(scope);
				plan.referencesToRepoint.push(target);
			}
		}

		const queues = new Map([...survivorOptionQueues.entries()].map(([signature, ids]) => [signature, [...ids]]));
		for (const option of loser.opcoes) {
			const survivorOptionId = option.ativo ? queues.get(optionSignature(option))?.shift() : undefined;
			if (survivorOptionId) {
				const modifierCount = modifierCountByOptionId.get(option.id) ?? 0;
				if (modifierCount > 0) {
					plan.optionsToRepointModifiers.push({ loserOptionId: option.id, survivorOptionId, modifierCount });
				}
			} else {
				plan.optionsToMove.push({ loserOptionId: option.id, loserId: loser.id });
			}
		}
	}

	return plan;
}

function catalogLinkGroupIdentityKey(link: {
	organizacaoId: string;
	provider: string;
	merchantId: string;
	tipo: string;
	produtoId: string | null;
	produtoVarianteId: string | null;
	produtoAddOnId: string | null;
	produtoAddOnOpcaoId: string | null;
}) {
	return [
		link.organizacaoId,
		link.provider,
		link.merchantId,
		link.tipo,
		link.produtoId ?? "",
		link.produtoVarianteId ?? "",
		link.produtoAddOnId ?? "",
		link.produtoAddOnOpcaoId ?? "",
	].join("|");
}

async function repointCatalogLinksForMergedAddOnGroups({
	tx,
	organizacaoId,
	survivorId,
	loserIds,
}: {
	tx: DBTransaction;
	organizacaoId: string;
	survivorId: string;
	loserIds: string[];
}) {
	if (loserIds.length === 0) return;

	const survivorLinks = await tx
		.select()
		.from(catalogLinks)
		.where(and(eq(catalogLinks.organizacaoId, organizacaoId), eq(catalogLinks.produtoAddOnId, survivorId)));
	const survivorKeys = new Set(survivorLinks.map((link) => catalogLinkGroupIdentityKey(link)));

	const loserLinks = await tx
		.select()
		.from(catalogLinks)
		.where(and(eq(catalogLinks.organizacaoId, organizacaoId), inArray(catalogLinks.produtoAddOnId, loserIds)));

	for (const link of loserLinks) {
		const keyAfterRepoint = catalogLinkGroupIdentityKey({ ...link, produtoAddOnId: survivorId });
		if (survivorKeys.has(keyAfterRepoint)) {
			await tx.delete(catalogLinks).where(eq(catalogLinks.id, link.id));
			continue;
		}
		await tx.update(catalogLinks).set({ produtoAddOnId: survivorId }).where(eq(catalogLinks.id, link.id));
		survivorKeys.add(keyAfterRepoint);
	}
}

export async function applyAddOnGroupMerge({ db, plan }: { db: DB; plan: TAddOnMergePlan }) {
	if (plan.skippedReason) throw new Error(plan.skippedReason);

	await db.transaction(async (tx) => {
		if (plan.survivorUpdates && Object.keys(plan.survivorUpdates).length > 0) {
			await tx.update(productAddOns).set(plan.survivorUpdates).where(eq(productAddOns.id, plan.survivor.id));
		}

		for (const repoint of plan.optionsToRepointModifiers) {
			await tx.update(saleItemModifiers).set({ opcaoId: repoint.survivorOptionId }).where(eq(saleItemModifiers.opcaoId, repoint.loserOptionId));
		}

		for (const move of plan.optionsToMove) {
			await tx.update(productAddOnOptions).set({ produtoAddOnId: plan.survivor.id, ativo: false }).where(eq(productAddOnOptions.id, move.loserOptionId));
		}

		for (const reference of plan.referencesToDelete) {
			await tx.delete(productAddOnReferences).where(eq(productAddOnReferences.id, reference.referenceId));
		}

		for (const reference of plan.referencesToRepoint) {
			await tx.update(productAddOnReferences).set({ produtoAddOnId: plan.survivor.id }).where(eq(productAddOnReferences.id, reference.referenceId));
		}

		const loserIds = plan.losers.map((loser) => loser.id);
		if (loserIds.length > 0) {
			await repointCatalogLinksForMergedAddOnGroups({
				tx,
				organizacaoId: plan.organizacaoId,
				survivorId: plan.survivor.id,
				loserIds,
			});
			await tx.delete(productAddOns).where(inArray(productAddOns.id, loserIds));
		}
	});
}

export async function detachAddOnGroupFromProducts({ db, groupId }: { db: DB; groupId: string }) {
	await db.delete(productAddOnReferences).where(eq(productAddOnReferences.produtoAddOnId, groupId));
}

export async function deactivateAddOnGroup({ db, groupId }: { db: DB; groupId: string }) {
	await db.update(productAddOns).set({ ativo: false }).where(eq(productAddOns.id, groupId));
}

export async function deleteAddOnGroupIfOrphan({ db, groupId }: { db: DB; groupId: string }) {
	const refs = await db.query.productAddOnReferences.findMany({
		where: eq(productAddOnReferences.produtoAddOnId, groupId),
		columns: { id: true },
	});
	if (refs.length > 0) throw new Error(`Grupo ${groupId} ainda tem ${refs.length} vínculo(s) com produtos.`);

	await db.delete(productAddOns).where(eq(productAddOns.id, groupId));
}
