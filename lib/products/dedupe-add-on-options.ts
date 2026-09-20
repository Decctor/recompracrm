import type { DB } from "@/services/drizzle";
import { catalogLinks, productAddOnOptions, saleItemModifiers } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";

// Unifica opções duplicadas DENTRO de um mesmo grupo de adicionais.
//
// De onde vêm as duplicatas: a mesclagem de grupos (merge-add-on-groups) move para o sobrevivente
// toda opção do perdedor que não casa por assinatura (nome + preço + máx/item + vínculo de
// estoque), marcando-a inativa; como cópias manuais e cópias de conector diferem em máx/item e em
// vínculo de estoque, cada mesclagem deixa mais uma "Açaí" inativa no grupo. As opções removidas
// pela tela viram tombstones (data_exclusao) e seguem apontadas pelo histórico de vendas.
//
// Regras por cluster (mesmo nome normalizado, acentos/caixa/espaços ignorados, mais os aliases
// informados pelo operador para grafias divergentes):
//   - Sobrevivente: viva > ativa > com vínculo de estoque > com código > mais vendas > menor id.
//   - O sobrevivente HERDA o que lhe falta: código, vínculo de estoque, id externo. Máx/item vira
//     o maior entre as opções vivas (nunca restringe uma escolha que hoje é permitida).
//   - Preço divergente entre opções vivas é reportado, e o do sobrevivente é mantido.
//   - sale_item_modifiers e catalog_links dos perdedores são re-apontados ANTES do delete
//     (o FK de modificadores é set-null; sem re-apontar o histórico perderia o vínculo).
//   - Perdedores (inclusive tombstones) são deletados: depois do re-apontamento nada os referencia.

export type TDedupeOptionRow = Pick<
	typeof productAddOnOptions.$inferSelect,
	| "id"
	| "produtoAddOnId"
	| "idExterno"
	| "nome"
	| "codigo"
	| "precoDelta"
	| "maxQtdePorItem"
	| "produtoId"
	| "produtoVarianteId"
	| "quantidadeConsumo"
	| "ativo"
	| "dataExclusao"
>;

export type TAddOnOptionDedupeCluster = {
	key: string;
	survivor: TDedupeOptionRow;
	losers: { option: TDedupeOptionRow; modifierCount: number; catalogLinkCount: number }[];
	survivorUpdates: Partial<
		Pick<TDedupeOptionRow, "codigo" | "idExterno" | "produtoId" | "produtoVarianteId" | "quantidadeConsumo" | "maxQtdePorItem">
	>;
	conflicts: string[];
};

export type TAddOnOptionDedupePlan = {
	groupId: string;
	clusters: TAddOnOptionDedupeCluster[];
	untouchedOptionIds: string[];
};

export function normalizeAddOnOptionName(value: string | null | undefined) {
	return (value ?? "")
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/\s*\(\s*/g, " (")
		.replace(/\s*\)\s*/g, ") ")
		.replace(/\s+/g, " ")
		.trim();
}

function isLive(option: TDedupeOptionRow) {
	return option.dataExclusao == null;
}

function hasStockLink(option: TDedupeOptionRow) {
	return Boolean(option.produtoId || option.produtoVarianteId);
}

function rankOptions(options: TDedupeOptionRow[], modifierCountByOptionId: Map<string, number>) {
	const score = (option: TDedupeOptionRow) => [
		isLive(option) ? 1 : 0,
		option.ativo ? 1 : 0,
		hasStockLink(option) ? 1 : 0,
		option.codigo ? 1 : 0,
		modifierCountByOptionId.get(option.id) ?? 0,
	];
	return [...options].sort((a, b) => {
		const sa = score(a);
		const sb = score(b);
		for (let index = 0; index < sa.length; index += 1) {
			if (sa[index] !== sb[index]) return sb[index] - sa[index];
		}
		return a.id.localeCompare(b.id);
	});
}

export function planAddOnOptionDedupe({
	groupId,
	options,
	modifierCountByOptionId,
	catalogLinkCountByOptionId,
	aliases = new Map(),
}: {
	groupId: string;
	options: TDedupeOptionRow[];
	modifierCountByOptionId: Map<string, number>;
	catalogLinkCountByOptionId: Map<string, number>;
	/** nome normalizado de origem -> nome normalizado canônico (grafias divergentes decididas pelo operador). */
	aliases?: Map<string, string>;
}): TAddOnOptionDedupePlan {
	const resolveKey = (option: TDedupeOptionRow) => {
		const normalized = normalizeAddOnOptionName(option.nome);
		return aliases.get(normalized) ?? normalized;
	};

	const byKey = new Map<string, TDedupeOptionRow[]>();
	for (const option of options.filter((item) => item.produtoAddOnId === groupId)) {
		const key = resolveKey(option);
		byKey.set(key, [...(byKey.get(key) ?? []), option]);
	}

	const plan: TAddOnOptionDedupePlan = { groupId, clusters: [], untouchedOptionIds: [] };

	for (const [key, members] of byKey) {
		if (members.length < 2) {
			plan.untouchedOptionIds.push(...members.map((option) => option.id));
			continue;
		}

		const [survivor, ...ranked] = rankOptions(members, modifierCountByOptionId);
		const cluster: TAddOnOptionDedupeCluster = {
			key,
			survivor,
			losers: ranked.map((option) => ({
				option,
				modifierCount: modifierCountByOptionId.get(option.id) ?? 0,
				catalogLinkCount: catalogLinkCountByOptionId.get(option.id) ?? 0,
			})),
			survivorUpdates: {},
			conflicts: [],
		};

		// Herança de identidade: só preenche o que o sobrevivente não tem, na ordem do ranking.
		if (!survivor.codigo) {
			const donor = ranked.find((option) => option.codigo);
			if (donor) cluster.survivorUpdates.codigo = donor.codigo;
		}
		if (!survivor.idExterno) {
			// Formato sem ":" é o canônico dos conectores atuais; o legado "grupo:opcao" vem por último.
			const donor = ranked.find((option) => option.idExterno && !option.idExterno.includes(":")) ?? ranked.find((option) => option.idExterno);
			if (donor) cluster.survivorUpdates.idExterno = donor.idExterno;
		}
		if (!hasStockLink(survivor)) {
			const donor = ranked.find(hasStockLink);
			if (donor) {
				cluster.survivorUpdates.produtoId = donor.produtoId;
				cluster.survivorUpdates.produtoVarianteId = donor.produtoVarianteId;
				cluster.survivorUpdates.quantidadeConsumo = donor.quantidadeConsumo;
			}
		}

		const liveMembers = members.filter(isLive);
		const maxPerItem = Math.max(...liveMembers.map((option) => option.maxQtdePorItem ?? 1));
		if (liveMembers.length > 0 && maxPerItem !== (survivor.maxQtdePorItem ?? 1)) {
			cluster.survivorUpdates.maxQtdePorItem = maxPerItem;
		}

		const distinctPrices = new Set(liveMembers.map((option) => option.precoDelta ?? 0));
		if (distinctPrices.size > 1) {
			cluster.conflicts.push(
				`preços divergentes entre opções vivas (${[...distinctPrices].map((price) => `R$${price.toFixed(2)}`).join(", ")}) — mantém R$${(survivor.precoDelta ?? 0).toFixed(2)} do sobrevivente`,
			);
		}
		const distinctLinks = new Set(liveMembers.filter(hasStockLink).map((option) => `${option.produtoId ?? ""}|${option.produtoVarianteId ?? ""}`));
		if (distinctLinks.size > 1) {
			cluster.conflicts.push(`vínculos de estoque divergentes entre opções vivas (${distinctLinks.size}) — mantém o do sobrevivente`);
		}
		const distinctNames = new Set(members.map((option) => option.nome.trim()));
		if (distinctNames.size > 1) {
			cluster.conflicts.push(`grafias unificadas: ${[...distinctNames].map((name) => `"${name}"`).join(", ")} → "${survivor.nome}"`);
		}

		plan.clusters.push(cluster);
	}

	plan.clusters.sort((a, b) => a.key.localeCompare(b.key));
	return plan;
}

function catalogLinkOptionIdentityKey(link: typeof catalogLinks.$inferSelect, optionId: string) {
	return [
		link.organizacaoId,
		link.provider,
		link.merchantId,
		link.tipo,
		link.produtoId ?? "",
		link.produtoVarianteId ?? "",
		link.produtoAddOnId ?? "",
		optionId,
	].join("|");
}

export async function applyAddOnOptionDedupe({ db, organizationId, plan }: { db: DB; organizationId: string; plan: TAddOnOptionDedupePlan }) {
	if (plan.clusters.length === 0) return;

	await db.transaction(async (tx) => {
		for (const cluster of plan.clusters) {
			const loserIds = cluster.losers.map((loser) => loser.option.id);

			if (Object.keys(cluster.survivorUpdates).length > 0) {
				await tx
					.update(productAddOnOptions)
					.set(cluster.survivorUpdates)
					.where(and(eq(productAddOnOptions.id, cluster.survivor.id), eq(productAddOnOptions.organizacaoId, organizationId)));
			}

			await tx.update(saleItemModifiers).set({ opcaoId: cluster.survivor.id }).where(inArray(saleItemModifiers.opcaoId, loserIds));

			const survivorLinks = await tx
				.select()
				.from(catalogLinks)
				.where(and(eq(catalogLinks.organizacaoId, organizationId), eq(catalogLinks.produtoAddOnOpcaoId, cluster.survivor.id)));
			const survivorKeys = new Set(survivorLinks.map((link) => catalogLinkOptionIdentityKey(link, cluster.survivor.id)));
			const loserLinks = await tx
				.select()
				.from(catalogLinks)
				.where(and(eq(catalogLinks.organizacaoId, organizationId), inArray(catalogLinks.produtoAddOnOpcaoId, loserIds)));
			for (const link of loserLinks) {
				const key = catalogLinkOptionIdentityKey(link, cluster.survivor.id);
				if (survivorKeys.has(key)) {
					await tx.delete(catalogLinks).where(eq(catalogLinks.id, link.id));
					continue;
				}
				await tx.update(catalogLinks).set({ produtoAddOnOpcaoId: cluster.survivor.id }).where(eq(catalogLinks.id, link.id));
				survivorKeys.add(key);
			}

			await tx.delete(productAddOnOptions).where(and(inArray(productAddOnOptions.id, loserIds), eq(productAddOnOptions.organizacaoId, organizationId)));
		}
	});
}
