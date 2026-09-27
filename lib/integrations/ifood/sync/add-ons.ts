import { getIfoodOptionGroup, listIfoodOptionGroups, updateIfoodProduct } from "@/lib/integrations/ifood/catalog";
import {
	type TIfoodItemOptionGroupPayload,
	addIfoodOptions,
	patchIfoodOptionGroupStatus,
	patchIfoodOptionsPrice,
	patchIfoodOptionsStatus,
	updateIfoodOptionGroup,
} from "@/lib/integrations/ifood/catalog-items";
import type { TIfoodItemFlatDTO, TIfoodOptionGroupDTO } from "@/lib/integrations/ifood/catalog-types";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { resolveAddOnReferencesRules } from "@/lib/products/add-on-rules";
import { channelAddOnReferences } from "@/lib/products/sales-channels";
import type { TCatalogLinkOptionGroupAssociation, TCatalogLinkSnapshot } from "@/schemas/catalog-links";
import type { TIfoodOptionGroupTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { catalogLinks, productAddOnReferences, productAddOns, type TCatalogLinkEntity } from "@/services/drizzle/schema";
import type { AxiosInstance } from "axios";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { markCatalogLinkError, upsertCatalogLink } from "./links";

/**
 * Adicionais ↔ complementos do iFood (docs/catalog-channels-matrix-design.md §10).
 *
 * Três coisas se casam aqui: o GRUPO interno com o optionGroup (vínculo ADD_ON), a OPÇÃO com a
 * option e o produto que carrega o nome dela (vínculo ADD_ON_OPCAO), e a ASSOCIAÇÃO item → grupos,
 * que não tem identidade remota e por isso vive no snapshot do vínculo do item.
 */

export type TAddOnOptionNode = {
	opcaoId: string;
	nome: string;
	codigo: string | null;
	precoDelta: number;
	disponivel: boolean;
	indice: number;
};

export type TAddOnGroupNode = {
	grupoId: string;
	nome: string;
	disponivel: boolean;
	minOpcoes: number;
	maxOpcoes: number;
	indice: number;
	opcoes: TAddOnOptionNode[];
};

/** Tipo de grupo para os que nascem daqui; grupos já existentes no iFood preservam o que têm. */
const DEFAULT_OPTION_GROUP_TYPE: TIfoodOptionGroupTypeEnum = "SPECIFICATION";

export function normalizeName(value: string | null | undefined) {
	return (value ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.trim()
		.toLocaleLowerCase("pt-BR")
		.replace(/\s+/g, " ");
}

/**
 * Os grupos que o produto leva ao iFood, com as regras já resolvidas: override min/max do vínculo
 * produto↔grupo primeiro, política do canal IFOOD depois (`exigirAdicionaisMinimos`). Só referências
 * nível produto — o fluxo por variante ainda não carrega regras próprias — e só grupos com ao menos
 * uma opção viva: o iFood rejeita grupo vazio.
 */
export async function resolveProductAddOnNodes({
	orgId,
	produtoId,
	channel,
}: {
	orgId: string;
	produtoId: string;
	channel: { exigirAdicionaisMinimos: boolean } | null;
}) {
	const references = await db.query.productAddOnReferences.findMany({
		where: and(eq(productAddOnReferences.produtoId, produtoId), isNull(productAddOnReferences.produtoVarianteId)),
		with: {
			grupo: {
				with: { opcoes: { where: (fields, { isNull: isNullOp }) => isNullOp(fields.dataExclusao), orderBy: (fields, { asc }) => asc(fields.nome) } },
			},
		},
		orderBy: (fields, { asc }) => asc(fields.ordem),
	});

	const scoped = references.filter((reference) => reference.grupo.organizacaoId === orgId);
	const resolved = channelAddOnReferences(channel, resolveAddOnReferencesRules(scoped));

	const nodes: TAddOnGroupNode[] = [];
	resolved.forEach((reference, indice) => {
		if (reference.grupo.opcoes.length === 0) return;
		nodes.push({
			grupoId: reference.grupo.id,
			nome: reference.grupo.nome,
			disponivel: reference.grupo.ativo !== false,
			minOpcoes: reference.grupo.minOpcoes,
			maxOpcoes: Math.max(reference.grupo.maxOpcoes, 1),
			indice,
			opcoes: reference.grupo.opcoes.map((opcao, indiceOpcao) => ({
				opcaoId: opcao.id,
				nome: opcao.nome,
				codigo: opcao.codigo,
				precoDelta: opcao.precoDelta,
				disponivel: opcao.ativo !== false,
				indice: indiceOpcao,
			})),
		});
	});
	return nodes;
}

/** Um grupo da org visto sem produto: regras do próprio grupo, sem canal. Para o push do grupo. */
export async function resolveAddOnGroupNode({ orgId, produtoAddOnId }: { orgId: string; produtoAddOnId: string }): Promise<TAddOnGroupNode | null> {
	const group = await db.query.productAddOns.findFirst({
		where: and(eq(productAddOns.id, produtoAddOnId), eq(productAddOns.organizacaoId, orgId)),
		with: { opcoes: { where: (fields, { isNull: isNullOp }) => isNullOp(fields.dataExclusao), orderBy: (fields, { asc }) => asc(fields.nome) } },
	});
	if (!group) return null;
	return {
		grupoId: group.id,
		nome: group.nome,
		disponivel: group.ativo !== false,
		minOpcoes: group.minOpcoes,
		maxOpcoes: Math.max(group.maxOpcoes, 1),
		indice: 0,
		opcoes: group.opcoes.map((opcao, indice) => ({
			opcaoId: opcao.id,
			nome: opcao.nome,
			codigo: opcao.codigo,
			precoDelta: opcao.precoDelta,
			disponivel: opcao.ativo !== false,
			indice,
		})),
	};
}

export type TAddOnLinks = {
	groups: Map<string, TCatalogLinkEntity>; // produtoAddOnId → vínculo ADD_ON
	options: Map<string, TCatalogLinkEntity>; // produtoAddOnOpcaoId → vínculo ADD_ON_OPCAO
};

/** Vínculos ativos de grupos/opções de uma loja, indexados pelo id interno. */
export async function loadAddOnLinks({ orgId, merchantId }: { orgId: string; merchantId: string }): Promise<TAddOnLinks> {
	const rows = await db.query.catalogLinks.findMany({
		where: and(
			eq(catalogLinks.organizacaoId, orgId),
			eq(catalogLinks.provider, "IFOOD"),
			eq(catalogLinks.merchantId, merchantId),
			inArray(catalogLinks.tipo, ["ADD_ON", "ADD_ON_OPCAO"]),
			ne(catalogLinks.status, "DESVINCULADO"),
		),
	});
	const groups = new Map<string, TCatalogLinkEntity>();
	const options = new Map<string, TCatalogLinkEntity>();
	for (const row of rows) {
		if (row.tipo === "ADD_ON" && row.produtoAddOnId) groups.set(row.produtoAddOnId, row);
		if (row.tipo === "ADD_ON_OPCAO" && row.produtoAddOnOpcaoId) options.set(row.produtoAddOnOpcaoId, row);
	}
	return { groups, options };
}

/**
 * O bloco `gruposComplementos` do `PUT /items`. Grupos/opções já vinculados vão com os ids remotos
 * (o iFood atualiza em vez de duplicar); os demais vão sem id e nascem na mesma chamada. O tipo de um
 * grupo existente vem do `flat` (preservado); grupo novo nasce SPECIFICATION.
 */
export function buildItemOptionGroupsPayload({
	nodes,
	links,
	remote,
}: {
	nodes: TAddOnGroupNode[];
	links: TAddOnLinks;
	remote: TIfoodItemFlatDTO | null;
}): TIfoodItemOptionGroupPayload[] {
	return nodes.map((node) => {
		const groupLink = links.groups.get(node.grupoId);
		const remoteGroup = groupLink?.externoOptionGroupId
			? remote?.gruposComplementos.find((grupo) => grupo.id === groupLink.externoOptionGroupId)
			: undefined;
		return {
			id: groupLink?.externoOptionGroupId ?? undefined,
			nome: node.nome,
			tipo: (remoteGroup?.tipo as TIfoodOptionGroupTypeEnum | null) ?? DEFAULT_OPTION_GROUP_TYPE,
			min: node.minOpcoes,
			max: node.maxOpcoes,
			status: node.disponivel ? "AVAILABLE" : "UNAVAILABLE",
			indice: node.indice,
			opcoes: node.opcoes.map((opcao) => {
				const optionLink = links.options.get(opcao.opcaoId);
				return {
					id: optionLink?.externoOptionId ?? undefined,
					produtoId: optionLink?.externoProdutoId ?? undefined,
					nome: opcao.nome,
					preco: opcao.precoDelta,
					codigoExterno: opcao.codigo,
					status: opcao.disponivel ? "AVAILABLE" : "UNAVAILABLE",
					indice: opcao.indice,
				};
			}),
		};
	});
}

/** A associação item → grupos como o snapshot do item guarda. Só grupos já vinculados têm chave. */
export function associationSnapshot({ nodes, links }: { nodes: TAddOnGroupNode[]; links: TAddOnLinks }): TCatalogLinkOptionGroupAssociation[] {
	return nodes.flatMap((node) => {
		const externoOptionGroupId = links.groups.get(node.grupoId)?.externoOptionGroupId;
		if (!externoOptionGroupId) return [];
		return [{ externoOptionGroupId, min: node.minOpcoes, max: node.maxOpcoes, indice: node.indice }];
	});
}

export function associationsDiffer(
	a: TCatalogLinkOptionGroupAssociation[] | null | undefined,
	b: TCatalogLinkOptionGroupAssociation[] | null | undefined,
) {
	const key = (list: TCatalogLinkOptionGroupAssociation[] | null | undefined) =>
		(list ?? [])
			.map((entry) => `${entry.externoOptionGroupId}:${entry.min}:${entry.max}:${entry.indice}`)
			.toSorted()
			.join("|");
	return key(a) !== key(b);
}

/** Há grupo do produto ainda sem vínculo nesta loja? Então o push precisa do PUT composto para criá-lo. */
export function hasUnlinkedGroups({ nodes, links }: { nodes: TAddOnGroupNode[]; links: TAddOnLinks }) {
	return nodes.some((node) => !links.groups.has(node.grupoId) || node.opcoes.some((opcao) => !links.options.has(opcao.opcaoId)));
}

function groupSnapshot(node: TAddOnGroupNode): TCatalogLinkSnapshot {
	return { nome: node.nome, disponivel: node.disponivel };
}

function optionSnapshot(opcao: TAddOnOptionNode): TCatalogLinkSnapshot {
	return { nome: opcao.nome, preco: opcao.precoDelta, disponivel: opcao.disponivel };
}

async function markSynchronized({ orgId, linkId, snapshot }: { orgId: string; linkId: string; snapshot: TCatalogLinkSnapshot }) {
	await db
		.update(catalogLinks)
		.set({ status: "SINCRONIZADO", ultimoSnapshot: snapshot, dataUltimaSincronizacao: new Date(), ultimoErro: null, divergencias: null })
		.where(and(eq(catalogLinks.id, linkId), eq(catalogLinks.organizacaoId, orgId)));
}

/**
 * Depois de um `PUT /items` que carregou complementos, relê o item e grava os vínculos de grupo e
 * opção. Os ids que enviamos não são garantidos (mesmo motivo do `productId`), então o casamento é
 * pelo id quando já havia vínculo e por NOME normalizado quando o grupo/opção acabou de nascer.
 */
export async function recordAddOnLinksFromFlatItem({
	orgId,
	merchantId,
	nodes,
	links,
	flat,
	autorId,
}: {
	orgId: string;
	merchantId: string;
	nodes: TAddOnGroupNode[];
	links: TAddOnLinks;
	flat: TIfoodItemFlatDTO;
	autorId?: string | null;
}): Promise<TAddOnLinks> {
	const next: TAddOnLinks = { groups: new Map(links.groups), options: new Map(links.options) };
	const usedGroupIds = new Set<string>();

	for (const node of nodes) {
		const existing = links.groups.get(node.grupoId);
		const remoteGroup =
			(existing?.externoOptionGroupId ? flat.gruposComplementos.find((grupo) => grupo.id === existing.externoOptionGroupId) : undefined) ??
			flat.gruposComplementos.find((grupo) => grupo.id && !usedGroupIds.has(grupo.id) && normalizeName(grupo.nome) === normalizeName(node.nome));
		if (!remoteGroup?.id) continue;
		usedGroupIds.add(remoteGroup.id);

		const groupLink = await upsertCatalogLink({
			orgId,
			merchantId,
			node: { tipo: "ADD_ON", produtoAddOnId: node.grupoId },
			externalRefs: { externoOptionGroupId: remoteGroup.id },
			sincronizar: existing?.sincronizar,
			autorId,
		});
		await markSynchronized({ orgId, linkId: groupLink.id, snapshot: groupSnapshot(node) });
		next.groups.set(node.grupoId, { ...groupLink, status: "SINCRONIZADO" });

		const usedOptionIds = new Set<string>();
		for (const opcao of node.opcoes) {
			const existingOption = links.options.get(opcao.opcaoId);
			const remoteOption =
				(existingOption?.externoOptionId ? remoteGroup.opcoes.find((option) => option.id === existingOption.externoOptionId) : undefined) ??
				remoteGroup.opcoes.find((option) => option.id && !usedOptionIds.has(option.id) && normalizeName(option.nome) === normalizeName(opcao.nome));
			if (!remoteOption?.id) continue;
			usedOptionIds.add(remoteOption.id);

			const optionLink = await upsertCatalogLink({
				orgId,
				merchantId,
				node: { tipo: "ADD_ON_OPCAO", produtoAddOnId: node.grupoId, produtoAddOnOpcaoId: opcao.opcaoId },
				externalRefs: { externoOptionGroupId: remoteGroup.id, externoOptionId: remoteOption.id, externoProdutoId: remoteOption.produtoId ?? null },
				sincronizar: existingOption?.sincronizar,
				autorId,
			});
			await markSynchronized({ orgId, linkId: optionLink.id, snapshot: optionSnapshot(opcao) });
			next.options.set(opcao.opcaoId, { ...optionLink, status: "SINCRONIZADO" });
		}
	}
	return next;
}

/**
 * Vincula um grupo interno a um optionGroup que JÁ existe no iFood e casa as opções: código ↔
 * externalCode (forte), senão nome normalizado (fraco). Opções internas sem par ganham vínculo no
 * primeiro push (`addIfoodOptions`); opções remotas sem par ficam como estão.
 */
export async function linkAddOnGroup({
	client,
	orgId,
	merchantId,
	produtoAddOnId,
	externoOptionGroupId,
	autorId,
}: {
	client: AxiosInstance;
	orgId: string;
	merchantId: string;
	produtoAddOnId: string;
	externoOptionGroupId: string;
	autorId?: string | null;
}) {
	const node = await resolveAddOnGroupNode({ orgId, produtoAddOnId });
	if (!node) throw new Error("Grupo de adicionais não encontrado.");
	const remote = await getIfoodOptionGroup(client, merchantId, externoOptionGroupId);

	const groupLink = await upsertCatalogLink({
		orgId,
		merchantId,
		node: { tipo: "ADD_ON", produtoAddOnId },
		externalRefs: { externoOptionGroupId },
		autorId,
	});

	let matched = 0;
	const used = new Set<string>();
	for (const opcao of node.opcoes) {
		const byCode = opcao.codigo
			? remote.opcoes.find((option) => option.id && !used.has(option.id) && option.codigoExterno === opcao.codigo)
			: undefined;
		const byName =
			byCode ?? remote.opcoes.find((option) => option.id && !used.has(option.id) && normalizeName(option.nome) === normalizeName(opcao.nome));
		if (!byName?.id) continue;
		used.add(byName.id);
		const optionLink = await upsertCatalogLink({
			orgId,
			merchantId,
			node: { tipo: "ADD_ON_OPCAO", produtoAddOnId, produtoAddOnOpcaoId: opcao.opcaoId },
			externalRefs: { externoOptionGroupId, externoOptionId: byName.id, externoProdutoId: byName.produtoId ?? null },
			autorId,
		});
		// PENDENTE de propósito: o preço/status remoto pode divergir do interno; a reconciliação diz.
		void optionLink;
		matched += 1;
	}

	return { link: groupLink, opcoesCasadas: matched, opcoesInternas: node.opcoes.length, opcoesRemotas: remote.opcoes.length };
}

/**
 * Empurra o conteúdo de um grupo (nome, status, opções) para todas as lojas onde ele está
 * vinculado. Pelos endpoints de patch, não pelo `PUT /items`: o grupo é da loja, não de um item.
 * Best-effort por vínculo, nunca lança — o chamador é o save do grupo.
 */
export async function pushAddOnGroupToLinkedMerchants({ orgId, produtoAddOnId }: { orgId: string; produtoAddOnId: string }) {
	const groupLinks = await db.query.catalogLinks.findMany({
		where: and(
			eq(catalogLinks.organizacaoId, orgId),
			eq(catalogLinks.provider, "IFOOD"),
			eq(catalogLinks.tipo, "ADD_ON"),
			eq(catalogLinks.produtoAddOnId, produtoAddOnId),
			ne(catalogLinks.status, "DESVINCULADO"),
		),
	});
	if (groupLinks.length === 0) return { enviados: 0, erros: 0 };

	const node = await resolveAddOnGroupNode({ orgId, produtoAddOnId });
	let enviados = 0;
	let erros = 0;

	for (const groupLink of groupLinks) {
		if (!node || !groupLink.externoOptionGroupId) {
			await markCatalogLinkError({ linkId: groupLink.id, erro: "O grupo interno deste vínculo não existe mais." });
			erros += 1;
			continue;
		}
		try {
			const context = await resolveIfoodManagementContext({ organizacaoId: orgId, merchantId: groupLink.merchantId });
			const links = await loadAddOnLinks({ orgId, merchantId: groupLink.merchantId });
			const previous = groupLink.ultimoSnapshot ?? {};

			if (groupLink.sincronizar.nome && previous.nome !== node.nome) {
				await updateIfoodOptionGroup(context.client, groupLink.merchantId, groupLink.externoOptionGroupId, { nome: node.nome });
			}
			if (groupLink.sincronizar.disponibilidade && previous.disponivel !== node.disponivel) {
				await patchIfoodOptionGroupStatus(
					context.client,
					groupLink.merchantId,
					groupLink.externoOptionGroupId,
					node.disponivel ? "AVAILABLE" : "UNAVAILABLE",
				);
			}

			// Opções já vinculadas: cada campo pelo seu endpoint.
			const priceUpdates: { optionId: string; preco: number }[] = [];
			const statusUpdates: { optionId: string; status: "AVAILABLE" | "UNAVAILABLE" }[] = [];
			const newOptions: TAddOnOptionNode[] = [];
			for (const opcao of node.opcoes) {
				const optionLink = links.options.get(opcao.opcaoId);
				if (!optionLink?.externoOptionId) {
					newOptions.push(opcao);
					continue;
				}
				const before = optionLink.ultimoSnapshot ?? {};
				if (optionLink.sincronizar.nome && before.nome !== opcao.nome && optionLink.externoProdutoId) {
					await updateIfoodProduct(context.client, groupLink.merchantId, optionLink.externoProdutoId, { nome: opcao.nome, codigoExterno: opcao.codigo });
				}
				if (optionLink.sincronizar.preco && before.preco !== opcao.precoDelta)
					priceUpdates.push({ optionId: optionLink.externoOptionId, preco: opcao.precoDelta });
				if (optionLink.sincronizar.disponibilidade && before.disponivel !== opcao.disponivel) {
					statusUpdates.push({ optionId: optionLink.externoOptionId, status: opcao.disponivel ? "AVAILABLE" : "UNAVAILABLE" });
				}
				await markSynchronized({ orgId, linkId: optionLink.id, snapshot: optionSnapshot(opcao) });
			}
			// Opção removida/tombstone: pausa no iFood, nunca apaga (D3).
			const nodeOptionIds = new Set(node.opcoes.map((opcao) => opcao.opcaoId));
			for (const [opcaoId, optionLink] of links.options) {
				if (optionLink.produtoAddOnId !== produtoAddOnId || nodeOptionIds.has(opcaoId) || !optionLink.externoOptionId) continue;
				if (optionLink.ultimoSnapshot?.disponivel !== false) {
					statusUpdates.push({ optionId: optionLink.externoOptionId, status: "UNAVAILABLE" });
					await markSynchronized({ orgId, linkId: optionLink.id, snapshot: { ...optionLink.ultimoSnapshot, disponivel: false } });
				}
			}
			if (priceUpdates.length) await patchIfoodOptionsPrice(context.client, groupLink.merchantId, priceUpdates);
			if (statusUpdates.length) await patchIfoodOptionsStatus(context.client, groupLink.merchantId, statusUpdates);

			if (newOptions.length) {
				await addIfoodOptions(
					context.client,
					groupLink.merchantId,
					groupLink.externoOptionGroupId,
					newOptions.map((opcao) => ({
						nome: opcao.nome,
						preco: opcao.precoDelta,
						codigoExterno: opcao.codigo,
						status: opcao.disponivel ? "AVAILABLE" : "UNAVAILABLE",
					})),
				);
				// Releitura para gravar os ids que o iFood atribuiu às opções novas.
				const remote = await getIfoodOptionGroup(context.client, groupLink.merchantId, groupLink.externoOptionGroupId);
				const used = new Set([...links.options.values()].map((link) => link.externoOptionId).filter(Boolean) as string[]);
				for (const opcao of newOptions) {
					const remoteOption = remote.opcoes.find(
						(option) => option.id && !used.has(option.id) && normalizeName(option.nome) === normalizeName(opcao.nome),
					);
					if (!remoteOption?.id) continue;
					used.add(remoteOption.id);
					const optionLink = await upsertCatalogLink({
						orgId,
						merchantId: groupLink.merchantId,
						node: { tipo: "ADD_ON_OPCAO", produtoAddOnId, produtoAddOnOpcaoId: opcao.opcaoId },
						externalRefs: {
							externoOptionGroupId: groupLink.externoOptionGroupId,
							externoOptionId: remoteOption.id,
							externoProdutoId: remoteOption.produtoId ?? null,
						},
					});
					await markSynchronized({ orgId, linkId: optionLink.id, snapshot: optionSnapshot(opcao) });
				}
			}

			await markSynchronized({ orgId, linkId: groupLink.id, snapshot: groupSnapshot(node) });
			enviados += 1;
		} catch (error) {
			await markCatalogLinkError({ linkId: groupLink.id, erro: error instanceof Error ? error.message : "Falha desconhecida ao sincronizar o grupo." });
			erros += 1;
		}
	}
	return { enviados, erros };
}

export function scheduleAddOnGroupPush({ orgId, produtoAddOnId }: { orgId: string; produtoAddOnId: string }) {
	void pushAddOnGroupToLinkedMerchants({ orgId, produtoAddOnId }).catch((error) => {
		console.error("[IFOOD_PUSH] Falha inesperada no push assíncrono do grupo de adicionais.", { orgId, produtoAddOnId, error });
	});
}

/** Todos os optionGroups da loja, paginados até acabar — uma passada por reconciliação. */
export async function listAllIfoodOptionGroups(client: AxiosInstance, merchantId: string): Promise<TIfoodOptionGroupDTO[]> {
	const limit = 100;
	const all: TIfoodOptionGroupDTO[] = [];
	for (let page = 1; page <= 50; page += 1) {
		const batch = await listIfoodOptionGroups(client, merchantId, { page, limit });
		all.push(...batch);
		if (batch.length < limit) break;
	}
	return all;
}
