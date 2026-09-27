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
import { createsMissingOptions, type TCatalogLinkOptionGroupAssociation, type TCatalogLinkSnapshot, type TCatalogLinkSyncPolicy } from "@/schemas/catalog-links";
import type { TIfoodOptionGroupTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { catalogLinks, productAddOnReferences, productAddOns, type TCatalogLinkEntity } from "@/services/drizzle/schema";
import type { AxiosInstance } from "axios";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { isHttpError } from "http-errors";
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

/**
 * Vínculos de complemento de uma loja. Muitos-para-um (drizzle/0116): um grupo interno pode estar
 * vinculado a N optionGroups (cópias por item) e uma opção interna a N options — por isso listas.
 * Em loja com grupos compartilhados (o que o publish daqui cria) cada lista tem um elemento.
 */
export type TAddOnLinks = {
	groups: Map<string, TCatalogLinkEntity[]>; // produtoAddOnId → vínculos ADD_ON
	options: Map<string, TCatalogLinkEntity[]>; // produtoAddOnOpcaoId → vínculos ADD_ON_OPCAO
};

function pushTo(map: Map<string, TCatalogLinkEntity[]>, key: string, link: TCatalogLinkEntity) {
	const list = map.get(key);
	if (list) list.push(link);
	else map.set(key, [link]);
}

/** Vínculos ativos de grupos/opções de uma loja, indexados pelo id interno (ordem de criação). */
export async function loadAddOnLinks({ orgId, merchantId }: { orgId: string; merchantId: string }): Promise<TAddOnLinks> {
	const rows = await db.query.catalogLinks.findMany({
		where: and(
			eq(catalogLinks.organizacaoId, orgId),
			eq(catalogLinks.provider, "IFOOD"),
			eq(catalogLinks.merchantId, merchantId),
			inArray(catalogLinks.tipo, ["ADD_ON", "ADD_ON_OPCAO"]),
			ne(catalogLinks.status, "DESVINCULADO"),
		),
		orderBy: [asc(catalogLinks.dataInsercao), asc(catalogLinks.id)],
	});
	const groups = new Map<string, TCatalogLinkEntity[]>();
	const options = new Map<string, TCatalogLinkEntity[]>();
	for (const row of rows) {
		if (row.tipo === "ADD_ON" && row.produtoAddOnId) pushTo(groups, row.produtoAddOnId, row);
		if (row.tipo === "ADD_ON_OPCAO" && row.produtoAddOnOpcaoId) pushTo(options, row.produtoAddOnOpcaoId, row);
	}
	return { groups, options };
}

export function allGroupLinks(links: TAddOnLinks) {
	return [...links.groups.values()].flat();
}

export function allOptionLinks(links: TAddOnLinks) {
	return [...links.options.values()].flat();
}

/**
 * O vínculo de grupo que vale para UM item: a cópia que o item já usa no iFood (ids do `flat`)
 * quando conhecida; senão o primeiro vínculo — o único, em loja com grupos compartilhados.
 */
export function groupLinkForItem(links: TAddOnLinks, grupoId: string, remoteGroupIds?: ReadonlySet<string> | null) {
	const candidates = links.groups.get(grupoId) ?? [];
	if (remoteGroupIds) {
		const inItem = candidates.find((link) => link.externoOptionGroupId && remoteGroupIds.has(link.externoOptionGroupId));
		if (inItem) return inItem;
	}
	return candidates[0];
}

/** O vínculo da opção DENTRO de um optionGroup específico (a opção pode ter um vínculo por cópia). */
export function optionLinkInGroup(links: TAddOnLinks, opcaoId: string, externoOptionGroupId: string | null | undefined) {
	if (!externoOptionGroupId) return undefined;
	return (links.options.get(opcaoId) ?? []).find((link) => link.externoOptionGroupId === externoOptionGroupId);
}

/**
 * Algum grupo do produto tem mais de um optionGroup vinculado nesta loja? Então o catálogo é de
 * cópias por item e o PUT composto do item não sabe, sem o `flat`, qual cópia é a dele — o push do
 * item não reescreve a associação nesse caso (a disponibilidade das opções vai pelo push do grupo).
 */
export function hasAmbiguousGroups({ nodes, links }: { nodes: TAddOnGroupNode[]; links: TAddOnLinks }) {
	return nodes.some((node) => (links.groups.get(node.grupoId)?.length ?? 0) > 1);
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
	const remoteGroupIds = remote ? new Set(remote.gruposComplementos.map((grupo) => grupo.id).filter((id): id is string => !!id)) : null;
	return nodes.map((node) => {
		const groupLink = groupLinkForItem(links, node.grupoId, remoteGroupIds);
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
				const optionLink = optionLinkInGroup(links, opcao.opcaoId, groupLink?.externoOptionGroupId);
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

/**
 * A associação item → grupos como o snapshot do item guarda. Só grupos já vinculados têm chave.
 * `remoteGroupIds` (grupos do `flat` do item) escolhe a cópia certa quando o grupo tem várias.
 */
export function associationSnapshot({
	nodes,
	links,
	remoteGroupIds,
}: {
	nodes: TAddOnGroupNode[];
	links: TAddOnLinks;
	remoteGroupIds?: ReadonlySet<string> | null;
}): TCatalogLinkOptionGroupAssociation[] {
	return nodes.flatMap((node) => {
		const externoOptionGroupId = groupLinkForItem(links, node.grupoId, remoteGroupIds)?.externoOptionGroupId;
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
	return nodes.some((node) => {
		const groupLink = groupLinkForItem(links, node.grupoId);
		return !groupLink || node.opcoes.some((opcao) => !optionLinkInGroup(links, opcao.opcaoId, groupLink.externoOptionGroupId));
	});
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
	const clone = (map: Map<string, TCatalogLinkEntity[]>) => new Map([...map].map(([key, list]) => [key, [...list]]));
	const next: TAddOnLinks = { groups: clone(links.groups), options: clone(links.options) };
	// Substitui o vínculo de mesma identidade remota na lista, ou acrescenta.
	const record = (map: Map<string, TCatalogLinkEntity[]>, key: string, link: TCatalogLinkEntity) => {
		const list = (map.get(key) ?? []).filter((candidate) => candidate.id !== link.id);
		map.set(key, [...list, link]);
	};
	const usedGroupIds = new Set<string>();
	const flatGroupIds = new Set(flat.gruposComplementos.map((grupo) => grupo.id).filter((id): id is string => !!id));

	for (const node of nodes) {
		const existing = groupLinkForItem(links, node.grupoId, flatGroupIds);
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
		record(next.groups, node.grupoId, { ...groupLink, status: "SINCRONIZADO" });

		const usedOptionIds = new Set<string>();
		for (const opcao of node.opcoes) {
			const existingOption = optionLinkInGroup(links, opcao.opcaoId, remoteGroup.id);
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
			record(next.options, opcao.opcaoId, { ...optionLink, status: "SINCRONIZADO" });
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
	sincronizar,
	sincronizarOpcoes,
	autorId,
}: {
	client: AxiosInstance;
	orgId: string;
	merchantId: string;
	produtoAddOnId: string;
	externoOptionGroupId: string;
	/** Política do vínculo de grupo. Cópia parcial de um grupo interno: `criarOpcoes: false`. */
	sincronizar?: Partial<TCatalogLinkSyncPolicy>;
	/** Política dos vínculos de opção casados. */
	sincronizarOpcoes?: Partial<TCatalogLinkSyncPolicy>;
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
		sincronizar,
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
		try {
			// PENDENTE de propósito: o preço/status remoto pode divergir do interno; a reconciliação diz.
			await upsertCatalogLink({
				orgId,
				merchantId,
				node: { tipo: "ADD_ON_OPCAO", produtoAddOnId, produtoAddOnOpcaoId: opcao.opcaoId },
				externalRefs: { externoOptionGroupId, externoOptionId: byName.id, externoProdutoId: byName.produtoId ?? null },
				sincronizar: sincronizarOpcoes,
				autorId,
			});
		} catch (error) {
			// A option já está vinculada a outra opção interna (curadoria manual): mantém a escolha
			// feita e segue com as demais em vez de abortar o grupo inteiro.
			if (isHttpError(error) && error.status === 409) continue;
			throw error;
		}
		matched += 1;
	}

	return { link: groupLink, opcoesCasadas: matched, opcoesInternas: node.opcoes.length, opcoesRemotas: remote.opcoes.length };
}

/** Tamanho de lote dos PATCH de opções — a doc não declara limite; 50 mantém o corpo pequeno. */
const OPTION_PATCH_CHUNK = 50;

function chunks<T>(list: T[], size: number) {
	const out: T[][] = [];
	for (let start = 0; start < list.length; start += size) out.push(list.slice(start, start + size));
	return out;
}

/**
 * Empurra o conteúdo de um grupo (nome, status, opções) para todas as lojas onde ele está
 * vinculado. Pelos endpoints de patch, não pelo `PUT /items`: o grupo é da loja, não de um item.
 * Best-effort por vínculo, nunca lança — o chamador é o save do grupo.
 *
 * Muitos-para-um (drizzle/0116): o trabalho de OPÇÃO é conduzido pelos vínculos de opção, não pelo
 * vínculo do grupo — cada opção interna pode ter um vínculo por cópia do grupo no iFood, e pode até
 * estar vinculada dentro de um optionGroup que corresponde a OUTRO grupo interno (o sabor "Pistache"
 * de "Escolha o sabor:" dentro das cópias de "Escolha seu gelato:"). Pausar a opção aqui pausa
 * todas as cópias. O trabalho de GRUPO (nome, status, criar opções sem par) segue por vínculo de
 * grupo, e criar opções respeita `criarOpcoes` — cópias parciais não são completadas.
 */
export async function pushAddOnGroupToLinkedMerchants({ orgId, produtoAddOnId }: { orgId: string; produtoAddOnId: string }) {
	const rows = await db.query.catalogLinks.findMany({
		where: and(
			eq(catalogLinks.organizacaoId, orgId),
			eq(catalogLinks.provider, "IFOOD"),
			inArray(catalogLinks.tipo, ["ADD_ON", "ADD_ON_OPCAO"]),
			eq(catalogLinks.produtoAddOnId, produtoAddOnId),
			ne(catalogLinks.status, "DESVINCULADO"),
		),
		orderBy: [asc(catalogLinks.dataInsercao), asc(catalogLinks.id)],
	});
	if (rows.length === 0) return { enviados: 0, erros: 0 };

	const node = await resolveAddOnGroupNode({ orgId, produtoAddOnId });
	const optionById = new Map((node?.opcoes ?? []).map((opcao) => [opcao.opcaoId, opcao]));
	let enviados = 0;
	let erros = 0;

	const merchantIds = [...new Set(rows.map((row) => row.merchantId))];
	for (const merchantId of merchantIds) {
		const groupLinks = rows.filter((row) => row.merchantId === merchantId && row.tipo === "ADD_ON");
		const optionLinks = rows.filter((row) => row.merchantId === merchantId && row.tipo === "ADD_ON_OPCAO" && row.externoOptionId);

		if (!node) {
			for (const link of [...groupLinks, ...optionLinks]) await markCatalogLinkError({ linkId: link.id, erro: "O grupo interno deste vínculo não existe mais." });
			erros += groupLinks.length + optionLinks.length;
			continue;
		}

		let client: AxiosInstance;
		try {
			client = (await resolveIfoodManagementContext({ organizacaoId: orgId, merchantId })).client;
		} catch (error) {
			const erro = error instanceof Error ? error.message : "Falha ao resolver a conexão do iFood.";
			for (const link of [...groupLinks, ...optionLinks]) await markCatalogLinkError({ linkId: link.id, erro });
			erros += groupLinks.length + optionLinks.length;
			continue;
		}

		// 1. Grupo: nome e status, por cópia vinculada.
		for (const groupLink of groupLinks) {
			if (!groupLink.externoOptionGroupId) continue;
			try {
				const previous = groupLink.ultimoSnapshot ?? {};
				if (groupLink.sincronizar.nome && previous.nome !== node.nome) {
					await updateIfoodOptionGroup(client, merchantId, groupLink.externoOptionGroupId, { nome: node.nome });
				}
				if (groupLink.sincronizar.disponibilidade && previous.disponivel !== node.disponivel) {
					await patchIfoodOptionGroupStatus(client, merchantId, groupLink.externoOptionGroupId, node.disponivel ? "AVAILABLE" : "UNAVAILABLE");
				}
				await markSynchronized({ orgId, linkId: groupLink.id, snapshot: groupSnapshot(node) });
				enviados += 1;
			} catch (error) {
				await markCatalogLinkError({ linkId: groupLink.id, erro: error instanceof Error ? error.message : "Falha desconhecida ao sincronizar o grupo." });
				erros += 1;
			}
		}

		// 2. Opções vinculadas — todas as cópias, cada campo pelo seu endpoint, em lote. Opção
		// removida/tombstone pausa no iFood, nunca apaga (D3).
		const priceUpdates: { link: TCatalogLinkEntity; optionId: string; preco: number }[] = [];
		const statusUpdates: { link: TCatalogLinkEntity; optionId: string; status: "AVAILABLE" | "UNAVAILABLE" }[] = [];
		const settled = new Map<string, TCatalogLinkSnapshot>();
		for (const optionLink of optionLinks) {
			const externoOptionId = optionLink.externoOptionId as string;
			const opcao = optionLink.produtoAddOnOpcaoId ? optionById.get(optionLink.produtoAddOnOpcaoId) : undefined;
			const before = optionLink.ultimoSnapshot ?? {};
			if (!opcao) {
				if (before.disponivel !== false) {
					statusUpdates.push({ link: optionLink, optionId: externoOptionId, status: "UNAVAILABLE" });
					settled.set(optionLink.id, { ...before, disponivel: false });
				}
				continue;
			}
			try {
				if (optionLink.sincronizar.nome && before.nome !== opcao.nome && optionLink.externoProdutoId) {
					await updateIfoodProduct(client, merchantId, optionLink.externoProdutoId, { nome: opcao.nome, codigoExterno: opcao.codigo });
				}
			} catch (error) {
				await markCatalogLinkError({ linkId: optionLink.id, erro: error instanceof Error ? error.message : "Falha ao renomear a opção." });
				erros += 1;
				continue;
			}
			if (optionLink.sincronizar.preco && before.preco !== opcao.precoDelta) {
				priceUpdates.push({ link: optionLink, optionId: externoOptionId, preco: opcao.precoDelta });
			}
			if (optionLink.sincronizar.disponibilidade && before.disponivel !== opcao.disponivel) {
				statusUpdates.push({ link: optionLink, optionId: externoOptionId, status: opcao.disponivel ? "AVAILABLE" : "UNAVAILABLE" });
			}
			settled.set(optionLink.id, optionSnapshot(opcao));
		}

		const failed = new Set<string>();
		for (const batch of chunks(priceUpdates, OPTION_PATCH_CHUNK)) {
			try {
				await patchIfoodOptionsPrice(client, merchantId, batch.map(({ optionId, preco }) => ({ optionId, preco })));
			} catch (error) {
				for (const entry of batch) failed.add(entry.link.id);
				for (const entry of batch) await markCatalogLinkError({ linkId: entry.link.id, erro: error instanceof Error ? error.message : "Falha ao enviar preço." });
			}
		}
		for (const batch of chunks(statusUpdates, OPTION_PATCH_CHUNK)) {
			try {
				await patchIfoodOptionsStatus(client, merchantId, batch.map(({ optionId, status }) => ({ optionId, status })));
			} catch (error) {
				for (const entry of batch) failed.add(entry.link.id);
				for (const entry of batch) await markCatalogLinkError({ linkId: entry.link.id, erro: error instanceof Error ? error.message : "Falha ao enviar status." });
			}
		}
		for (const [linkId, snapshot] of settled) {
			if (failed.has(linkId)) {
				erros += 1;
				continue;
			}
			await markSynchronized({ orgId, linkId, snapshot });
			enviados += 1;
		}

		// 3. Opções internas sem par numa cópia: criadas nela — só onde a política do grupo permite.
		for (const groupLink of groupLinks) {
			if (!groupLink.externoOptionGroupId || !createsMissingOptions(groupLink.sincronizar)) continue;
			const linkedHere = new Set(
				optionLinks.filter((link) => link.externoOptionGroupId === groupLink.externoOptionGroupId).map((link) => link.produtoAddOnOpcaoId),
			);
			const newOptions = node.opcoes.filter((opcao) => !linkedHere.has(opcao.opcaoId));
			if (!newOptions.length) continue;
			try {
				await addIfoodOptions(
					client,
					merchantId,
					groupLink.externoOptionGroupId,
					newOptions.map((opcao) => ({
						nome: opcao.nome,
						preco: opcao.precoDelta,
						codigoExterno: opcao.codigo,
						status: opcao.disponivel ? "AVAILABLE" : "UNAVAILABLE",
					})),
				);
				// Releitura para gravar os ids que o iFood atribuiu às opções novas.
				const remote = await getIfoodOptionGroup(client, merchantId, groupLink.externoOptionGroupId);
				const used = new Set(optionLinks.map((link) => link.externoOptionId).filter(Boolean) as string[]);
				for (const opcao of newOptions) {
					const remoteOption = remote.opcoes.find(
						(option) => option.id && !used.has(option.id) && normalizeName(option.nome) === normalizeName(opcao.nome),
					);
					if (!remoteOption?.id) continue;
					used.add(remoteOption.id);
					const optionLink = await upsertCatalogLink({
						orgId,
						merchantId,
						node: { tipo: "ADD_ON_OPCAO", produtoAddOnId, produtoAddOnOpcaoId: opcao.opcaoId },
						externalRefs: {
							externoOptionGroupId: groupLink.externoOptionGroupId,
							externoOptionId: remoteOption.id,
							externoProdutoId: remoteOption.produtoId ?? null,
						},
					});
					await markSynchronized({ orgId, linkId: optionLink.id, snapshot: optionSnapshot(opcao) });
				}
			} catch (error) {
				await markCatalogLinkError({ linkId: groupLink.id, erro: error instanceof Error ? error.message : "Falha ao criar opções no grupo." });
				erros += 1;
			}
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
