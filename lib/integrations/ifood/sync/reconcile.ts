import { getIfoodCatalogs, getIfoodItemFlat, listIfoodCategories } from "@/lib/integrations/ifood/catalog";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { collectEffectiveOptionPrices } from "@/lib/integrations/ifood/item-document";
import type { TIfoodItemDTO, TIfoodItemFlatDTO } from "@/lib/integrations/ifood/catalog-types";
import { loadChannelState } from "@/lib/products/sales-channels-store";
import { type TCatalogLinkDivergence, type TCatalogLinkOptionGroupAssociation, syncsComplementos } from "@/schemas/catalog-links";
import { db } from "@/services/drizzle";
import { catalogLinks, productAddOnOptions, productChannelSettings, type TCatalogLinkEntity } from "@/services/drizzle/schema";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import {
	type TAddOnGroupNode,
	allGroupLinks,
	allOptionLinks,
	associationSnapshot,
	listAllIfoodOptionGroups,
	loadAddOnLinks,
	resolveAddOnGroupNode,
	resolveProductAddOnNodes,
} from "./add-ons";
import { resolvePublishNodes, type TPublishNode } from "./publish";

/** Tolerância de centavos: serialização de float não pode virar divergência falsa. */
const PRICE_TOLERANCE = 0.01;

/**
 * O catálogo do iFood é eventualmente consistente: medido ao vivo, um `PATCH /items` bem-sucedido
 * ainda devolvia o preço ANTIGO numa leitura imediata, e o novo alguns segundos depois. Sem esta
 * janela, uma reconciliação logo após um push marcaria DIVERGENTE por atraso de propagação —
 * e a UI ofereceria "adotar o preço do iFood", que gravaria de volta o valor velho.
 */
const PROPAGATION_GRACE_MS = 2 * 60 * 1000;

function priceDiverges(a: number | null | undefined, b: number | null | undefined) {
	if (a == null || b == null) return a !== b;
	return Math.abs(a - b) > PRICE_TOLERANCE + 1e-9;
}

/**
 * O iFood NORMALIZA texto ao salvar: enviamos "Lasanha bolonhesa GN 2,5kg" e ele devolve
 * "Lasanha bolonhesa Gn 2,5kg" (title case por palavra). Comparar byte a byte marcaria esses
 * vínculos como DIVERGENTE para sempre, e a UI ofereceria "aplicar o nosso" num loop infinito
 * que nunca converge. A comparação ignora caixa e espaços de borda — diferença real de conteúdo
 * continua sendo detectada.
 */
function textDiverges(a: string | null | undefined, b: string | null | undefined) {
	const normalize = (value: string | null | undefined) => (value ?? "").trim().toLocaleLowerCase("pt-BR");
	return normalize(a) !== normalize(b);
}

/**
 * Compara o estado desejado (interno) com o observado no iFood.
 *
 * Campos SINCRONIZADOS divergentes viram ação (re-push); campos NÃO sincronizados divergentes são
 * apenas registrados — é assim que "preço gerido no Portal" fica visível sem ser sobrescrito.
 */
export function computeDivergences({
	link,
	node,
	remote,
	association,
}: {
	link: TCatalogLinkEntity;
	node: TPublishNode;
	remote: TIfoodItemDTO;
	/** Associação item → grupos: a desejada (vínculos conhecidos) e a observada no `flat`. */
	association?: { desejada: TCatalogLinkOptionGroupAssociation[]; observada: TCatalogLinkOptionGroupAssociation[] } | null;
}): TCatalogLinkDivergence[] {
	const divergences: TCatalogLinkDivergence[] = [];

	if (association) {
		// Ordem fora da comparação de propósito: o iFood reindexa grupos por conta própria e um
		// `index` diferente não muda o que o cliente pode escolher.
		const describe = (list: TCatalogLinkOptionGroupAssociation[]) =>
			list
				.map((entry) => `${entry.externoOptionGroupId}:${entry.min}-${entry.max}`)
				.toSorted()
				.join("|");
		if (describe(association.desejada) !== describe(association.observada)) {
			divergences.push({
				campo: "complementos",
				valorInterno: `${association.desejada.length} grupo(s)`,
				valorExterno: `${association.observada.length} grupo(s)`,
				sincronizado: syncsComplementos(link.sincronizar),
			});
		}
	}

	if (textDiverges(remote.nome, node.nome)) {
		divergences.push({ campo: "nome", valorInterno: node.nome, valorExterno: remote.nome, sincronizado: link.sincronizar.nome });
	}
	if (textDiverges(remote.descricao, node.descricao)) {
		divergences.push({ campo: "descricao", valorInterno: node.descricao, valorExterno: remote.descricao, sincronizado: link.sincronizar.descricao });
	}
	if (priceDiverges(remote.preco, node.preco)) {
		divergences.push({ campo: "preco", valorInterno: node.preco, valorExterno: remote.preco, sincronizado: link.sincronizar.preco });
	}
	const remoteDisponivel = remote.status === "AVAILABLE";
	if (remoteDisponivel !== node.disponivel) {
		divergences.push({
			campo: "disponibilidade",
			valorInterno: node.disponivel,
			valorExterno: remoteDisponivel,
			sincronizado: link.sincronizar.disponibilidade,
		});
	}
	return divergences;
}

/**
 * Reconcilia uma loja: lê o catálogo remoto UMA vez (a listagem por categoria já traz os itens) e
 * confronta com o estado desejado de cada vínculo.
 *
 * Não re-empurra automaticamente: marca DIVERGENTE e deixa a decisão para a UI ("aplicar o nosso"
 * ou "adotar o do iFood"). Push automático aqui transformaria uma edição legítima no Portal numa
 * briga silenciosa entre os dois sistemas.
 */
export async function reconcileMerchantCatalog({ orgId, merchantId }: { orgId: string; merchantId: string }) {
	// Só vínculos de ITEM neste loop: grupos e opções de complemento têm reconciliação própria
	// abaixo — antes, um vínculo ADD_ON aqui cairia em "o item não existe mais".
	const links = await db.query.catalogLinks.findMany({
		where: and(
			eq(catalogLinks.organizacaoId, orgId),
			eq(catalogLinks.provider, "IFOOD"),
			eq(catalogLinks.merchantId, merchantId),
			inArray(catalogLinks.tipo, ["PRODUTO", "VARIANTE"]),
			ne(catalogLinks.status, "DESVINCULADO"),
		),
	});
	const addOnLinks = await loadAddOnLinks({ orgId, merchantId });
	if (links.length === 0 && addOnLinks.groups.size === 0 && addOnLinks.options.size === 0)
		return { verificados: 0, sincronizados: 0, divergentes: 0, ausentes: 0, propagando: 0 };

	const context = await resolveIfoodManagementContext({ organizacaoId: orgId, merchantId });
	const channelState = await loadChannelState({ orgId, canal: "IFOOD", refExterno: merchantId });
	const catalogs = await getIfoodCatalogs(context.client, merchantId);
	const remoteItems = new Map<string, TIfoodItemDTO>();
	for (const catalog of catalogs) {
		const categorias = await listIfoodCategories(context.client, merchantId, { catalogId: catalog.id });
		for (const categoria of categorias) {
			for (const item of categoria.itens) if (item.id) remoteItems.set(item.id, item);
		}
	}

	// Um resolve por produto, reaproveitado pelos vínculos de suas variantes.
	const addOnNodesByProduct = new Map<string, TAddOnGroupNode[]>();
	async function addOnNodesFor(produtoId: string) {
		const cached = addOnNodesByProduct.get(produtoId);
		if (cached) return cached;
		const nodes = await resolveProductAddOnNodes({ orgId, produtoId, channelState }).catch(() => [] as TAddOnGroupNode[]);
		addOnNodesByProduct.set(produtoId, nodes);
		return nodes;
	}
	const nodesByProduct = new Map<string, TPublishNode[]>();
	async function nodesFor(produtoId: string) {
		const cached = nodesByProduct.get(produtoId);
		if (cached) return cached;
		const nodes = await resolvePublishNodes({ orgId, merchantId, produtoId }).catch(() => [] as TPublishNode[]);
		nodesByProduct.set(produtoId, nodes);
		return nodes;
	}

	let sincronizados = 0;
	let divergentes = 0;
	let ausentes = 0;
	let propagando = 0;

	for (const link of links) {
		const remote = link.externoItemId ? remoteItems.get(link.externoItemId) : undefined;
		if (!remote) {
			// Item apagado no Portal: o vínculo aponta para o nada. ERRO (e não DESVINCULADO) porque
			// exige decisão — republicar ou desvincular.
			await db
				.update(catalogLinks)
				.set({ status: "ERRO", ultimoErro: "O item não existe mais no catálogo do iFood.", dataAtualizacao: new Date() })
				.where(eq(catalogLinks.id, link.id));
			ausentes += 1;
			continue;
		}

		const nodes = link.produtoId ? await nodesFor(link.produtoId) : [];
		const node = nodes.find((candidate) => candidate.produtoVarianteId === (link.produtoVarianteId ?? null));
		if (!node) {
			await db
				.update(catalogLinks)
				.set({ status: "ERRO", ultimoErro: "O nó interno deste vínculo não existe mais ou está sem preço.", dataAtualizacao: new Date() })
				.where(eq(catalogLinks.id, link.id));
			ausentes += 1;
			continue;
		}

		// A associação com os grupos só existe no `flat` (uma leitura por item). Só quando a
		// política pede e o produto tem grupos vinculados nesta loja — senão a comparação seria
		// entre listas vazias.
		let association: { desejada: TCatalogLinkOptionGroupAssociation[]; observada: TCatalogLinkOptionGroupAssociation[] } | null = null;
		if (syncsComplementos(link.sincronizar) && link.produtoId && link.externoItemId) {
			const desejada = associationSnapshot({ nodes: await addOnNodesFor(link.produtoId), links: addOnLinks });
			if (desejada.length > 0 || (link.ultimoSnapshot?.gruposComplementos?.length ?? 0) > 0) {
				const flat: TIfoodItemFlatDTO | null = await getIfoodItemFlat(context.client, merchantId, link.externoItemId).catch(() => null);
				if (flat) {
					const knownGroupIds = new Set(
						allGroupLinks(addOnLinks)
							.map((groupLink) => groupLink.externoOptionGroupId)
							.filter(Boolean),
					);
					const flatGroupIds = new Set(flat.gruposComplementos.map((grupo) => grupo.id).filter((id): id is string => !!id));
					association = {
						// Com cópias por item, o desejado é a cópia que ESTE item usa (ids do flat).
						desejada: associationSnapshot({ nodes: await addOnNodesFor(link.produtoId), links: addOnLinks, remoteGroupIds: flatGroupIds }),
						// Grupos que o iFood associou ao item sem vínculo aqui não contam: podem ter sido
						// montados no Portal de propósito (política desligada, gestão local).
						observada: flat.gruposComplementos
							.filter((grupo): grupo is typeof grupo & { id: string } => !!grupo.id && knownGroupIds.has(grupo.id))
							.map((grupo, indice) => ({ externoOptionGroupId: grupo.id, min: grupo.min ?? 0, max: grupo.max ?? 1, indice })),
					};
				}
			}
		}

		const divergences = computeDivergences({ link, node, remote, association });
		// Push recente: o remoto pode simplesmente ainda não ter propagado. Não marca divergência
		// (nem limpa a anterior) — a próxima passada decide com dado estável.
		const pushRecente = link.dataUltimaSincronizacao != null && Date.now() - link.dataUltimaSincronizacao.getTime() < PROPAGATION_GRACE_MS;
		if (pushRecente && divergences.some((divergence) => divergence.sincronizado)) {
			propagando += 1;
			continue;
		}
		const acionaveis = divergences.filter((divergence) => divergence.sincronizado);
		if (acionaveis.length === 0) {
			await db
				.update(catalogLinks)
				.set({ status: "SINCRONIZADO", divergencias: divergences.length ? divergences : null, dataAtualizacao: new Date() })
				.where(eq(catalogLinks.id, link.id));
			sincronizados += 1;
		} else {
			await db
				.update(catalogLinks)
				.set({ status: "DIVERGENTE", divergencias: divergences, dataAtualizacao: new Date() })
				.where(eq(catalogLinks.id, link.id));
			divergentes += 1;
		}
	}

	// Grupos e opções: UMA leitura de `GET /optionGroups` por loja cobre todos os vínculos.
	if (addOnLinks.groups.size > 0 || addOnLinks.options.size > 0) {
		const remoteGroups = await listAllIfoodOptionGroups(context.client, merchantId).catch(() => null);
		if (remoteGroups) {
			const remoteById = new Map(remoteGroups.map((grupo) => [grupo.id, grupo]));
			const groupNodes = new Map<string, TAddOnGroupNode | null>();
			async function groupNodeFor(produtoAddOnId: string) {
				if (groupNodes.has(produtoAddOnId)) return groupNodes.get(produtoAddOnId) ?? null;
				const node = await resolveAddOnGroupNode({ orgId, produtoAddOnId, channelState }).catch(() => null);
				groupNodes.set(produtoAddOnId, node);
				return node;
			}

			const markMissing = async (linkId: string, erro: string) => {
				await db.update(catalogLinks).set({ status: "ERRO", ultimoErro: erro, dataAtualizacao: new Date() }).where(eq(catalogLinks.id, linkId));
				ausentes += 1;
			};
			const settle = async (link: TCatalogLinkEntity, divergences: TCatalogLinkDivergence[]) => {
				const pushRecente = link.dataUltimaSincronizacao != null && Date.now() - link.dataUltimaSincronizacao.getTime() < PROPAGATION_GRACE_MS;
				if (pushRecente && divergences.some((divergence) => divergence.sincronizado)) {
					propagando += 1;
					return;
				}
				const acionaveis = divergences.filter((divergence) => divergence.sincronizado);
				await db
					.update(catalogLinks)
					.set({
						status: acionaveis.length ? "DIVERGENTE" : "SINCRONIZADO",
						divergencias: divergences.length ? divergences : null,
						dataAtualizacao: new Date(),
					})
					.where(eq(catalogLinks.id, link.id));
				if (acionaveis.length) divergentes += 1;
				else sincronizados += 1;
			};

			for (const groupLink of allGroupLinks(addOnLinks)) {
				const produtoAddOnId = groupLink.produtoAddOnId as string;
				const remote = groupLink.externoOptionGroupId ? remoteById.get(groupLink.externoOptionGroupId) : undefined;
				if (!remote) {
					await markMissing(groupLink.id, "O grupo de complementos não existe mais no iFood.");
					continue;
				}
				const node = await groupNodeFor(produtoAddOnId);
				if (!node) {
					await markMissing(groupLink.id, "O grupo de adicionais interno não existe mais.");
					continue;
				}
				const divergences: TCatalogLinkDivergence[] = [];
				if (textDiverges(remote.nome, node.nome)) {
					divergences.push({ campo: "nome", valorInterno: node.nome, valorExterno: remote.nome, sincronizado: groupLink.sincronizar.nome });
				}
				const remoteDisponivel = remote.status?.toUpperCase() !== "UNAVAILABLE";
				if (remoteDisponivel !== node.disponivel) {
					divergences.push({
						campo: "disponibilidade",
						valorInterno: node.disponivel,
						valorExterno: remoteDisponivel,
						sincronizado: groupLink.sincronizar.disponibilidade,
					});
				}
				await settle(groupLink, divergences);
			}

			// Preço efetivo das opções vem dos itens (canal DEFAULT), não da listagem, que só traz o raiz.
			const effectivePrices = allOptionLinks(addOnLinks).length
				? await collectEffectiveOptionPrices(
						context.client,
						merchantId,
						links.map((link) => link.externoItemId).filter((id): id is string => !!id),
					)
				: new Map<string, number | null>();

			// Opções locais excluídas que ainda têm vínculo: o nó do grupo não as carrega (filtra tombstones).
			const linkedOptionIds = allOptionLinks(addOnLinks)
				.map((link) => link.produtoAddOnOpcaoId)
				.filter((id): id is string => !!id);
			const tombstonedOptionIds = new Set(
				linkedOptionIds.length
					? (
							await db.query.productAddOnOptions.findMany({
								where: and(
									eq(productAddOnOptions.organizacaoId, orgId),
									inArray(productAddOnOptions.id, linkedOptionIds),
									isNotNull(productAddOnOptions.dataExclusao),
								),
								columns: { id: true },
							})
						).map((option) => option.id)
					: [],
			);

			for (const optionLink of allOptionLinks(addOnLinks)) {
				const opcaoId = optionLink.produtoAddOnOpcaoId as string;
				const remoteGroup = optionLink.externoOptionGroupId ? remoteById.get(optionLink.externoOptionGroupId) : undefined;
				const remote = remoteGroup?.opcoes.find((opcao) => opcao.id === optionLink.externoOptionId);
				if (!remote) {
					await markMissing(optionLink.id, "A opção não existe mais no grupo de complementos do iFood.");
					continue;
				}
				const node = optionLink.produtoAddOnId ? await groupNodeFor(optionLink.produtoAddOnId) : null;
				const opcao = node?.opcoes.find((candidate) => candidate.opcaoId === opcaoId);
				if (!opcao) {
					// Opção excluída (tombstone) fica fora do nó, mas o vínculo segue válido: o push a pausa
					// no iFood (D3, nunca apaga). O estado desejado é "indisponível" — só é divergência se o
					// iFood a mostrar à venda; não é erro.
					if (tombstonedOptionIds.has(opcaoId)) {
						const remoteDisponivel = remote.status?.toUpperCase() !== "UNAVAILABLE";
						await settle(
							optionLink,
							remoteDisponivel
								? [{ campo: "disponibilidade", valorInterno: false, valorExterno: true, sincronizado: optionLink.sincronizar.disponibilidade }]
								: [],
						);
						continue;
					}
					await markMissing(optionLink.id, "A opção de adicional interna não existe mais.");
					continue;
				}
				const divergences: TCatalogLinkDivergence[] = [];
				if (textDiverges(remote.nome, opcao.nome)) {
					divergences.push({ campo: "nome", valorInterno: opcao.nome, valorExterno: remote.nome, sincronizado: optionLink.sincronizar.nome });
				}
				const remotePrice = (remote.id ? effectivePrices.get(remote.id) : undefined) ?? remote.preco;
				if (priceDiverges(remotePrice, opcao.precoDelta)) {
					divergences.push({ campo: "preco", valorInterno: opcao.precoDelta, valorExterno: remotePrice, sincronizado: optionLink.sincronizar.preco });
				}
				const remoteDisponivel = remote.status?.toUpperCase() !== "UNAVAILABLE";
				if (remoteDisponivel !== opcao.disponivel) {
					divergences.push({
						campo: "disponibilidade",
						valorInterno: opcao.disponivel,
						valorExterno: remoteDisponivel,
						sincronizado: optionLink.sincronizar.disponibilidade,
					});
				}
				await settle(optionLink, divergences);
			}
		}
	}

	return {
		verificados: links.length + allGroupLinks(addOnLinks).length + allOptionLinks(addOnLinks).length,
		sincronizados,
		divergentes,
		ausentes,
		propagando,
	};
}

/**
 * "Adotar o preço do iFood": grava o valor observado como override do canal daquela loja.
 *
 * É o que faz a matriz de canais refletir a realidade independentemente de onde o preço foi
 * editado — e, de quebra, torna o relatório de margem por canal honesto. O preço base nunca é
 * tocado: ele pertence aos canais internos.
 */
export async function adoptRemotePrice({ orgId, linkId }: { orgId: string; linkId: string }) {
	const link = await db.query.catalogLinks.findFirst({ where: and(eq(catalogLinks.id, linkId), eq(catalogLinks.organizacaoId, orgId)) });
	if (!link) throw new Error("Vínculo não encontrado.");

	const divergence = link.divergencias?.find((candidate) => candidate.campo === "preco");
	if (!divergence || typeof divergence.valorExterno !== "number") throw new Error("Não há divergência de preço registrada neste vínculo.");

	const channel = await db.query.salesChannels.findFirst({
		where: (fields, { and: andOp, eq: eqOp }) =>
			andOp(eqOp(fields.organizacaoId, orgId), eqOp(fields.canal, "IFOOD"), eqOp(fields.refExterno, link.merchantId)),
	});
	if (!channel || !link.produtoId) throw new Error("Canal do iFood não encontrado para esta loja.");

	await db
		.insert(productChannelSettings)
		.values({
			organizacaoId: orgId,
			canalVendaId: channel.id,
			produtoId: link.produtoId,
			produtoVarianteId: link.produtoVarianteId,
			precoVenda: divergence.valorExterno,
		})
		.onConflictDoUpdate({
			target: [productChannelSettings.canalVendaId, productChannelSettings.produtoId, productChannelSettings.produtoVarianteId],
			set: { precoVenda: divergence.valorExterno, dataAtualizacao: new Date() },
		});

	// O snapshot passa a refletir o novo desejado, senão o próximo push tentaria "corrigir" o
	// preço que acabamos de adotar.
	await db
		.update(catalogLinks)
		.set({
			status: "SINCRONIZADO",
			ultimoSnapshot: { ...link.ultimoSnapshot, preco: divergence.valorExterno },
			divergencias: null,
			dataUltimaSincronizacao: new Date(),
		})
		.where(eq(catalogLinks.id, link.id));

	return { precoAdotado: divergence.valorExterno };
}
