import { updateIfoodProduct } from "@/lib/integrations/ifood/catalog";
import { patchIfoodItem } from "@/lib/integrations/ifood/catalog-items";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { readIfoodItemDocument, writeIfoodItemDocument } from "@/lib/integrations/ifood/item-document";
import { loadChannelState } from "@/lib/products/sales-channels-store";
import { type TCatalogLinkSnapshot, syncsComplementos } from "@/schemas/catalog-links";
import { db } from "@/services/drizzle";
import { catalogLinks, type TCatalogLinkEntity } from "@/services/drizzle/schema";
import type { AxiosInstance } from "axios";
import { and, eq, inArray, ne } from "drizzle-orm";
import {
	type TAddOnGroupNode,
	type TAddOnLinks,
	associationSnapshot,
	applyAddOnAssociationToDocument,
	associationsDiffer,
	groupLinkForItem,
	hasUnlinkedGroups,
	loadAddOnLinks,
	readFlatWithGroups,
	recordAddOnLinksFromFlatItem,
	resolveProductAddOnNodes,
} from "./add-ons";
import { markCatalogLinkError } from "./links";
import { resolvePublishNodes, type TPublishNode, uploadIfoodImageFromUrl } from "./publish";

export type TPushFieldChange = { campo: keyof TCatalogLinkSnapshot; de: unknown; para: unknown };

/**
 * Campos que mudaram desde o último push, filtrados pela política do vínculo. Um campo com
 * política desligada nunca entra: é assim que "preço gerido no Portal" continua possível.
 */
export function diffAgainstSnapshot(link: TCatalogLinkEntity, node: TPublishNode): TPushFieldChange[] {
	const snapshot = link.ultimoSnapshot ?? {};
	const changes: TPushFieldChange[] = [];
	const check = (campo: keyof TCatalogLinkSnapshot, atual: unknown, habilitado: boolean) => {
		if (!habilitado) return;
		if (snapshot[campo] !== atual) changes.push({ campo, de: snapshot[campo] ?? null, para: atual ?? null });
	};

	check("nome", node.nome, link.sincronizar.nome);
	check("descricao", node.descricao, link.sincronizar.descricao);
	check("imagemUrl", node.imagemCapaUrl, link.sincronizar.imagem);
	check("preco", node.preco, link.sincronizar.preco);
	check("disponivel", node.disponivel, link.sincronizar.disponibilidade);
	return changes;
}

function snapshotOf(link: TCatalogLinkEntity, node: TPublishNode, association: TCatalogLinkSnapshot["gruposComplementos"]): TCatalogLinkSnapshot {
	// O snapshot guarda só o que este vínculo sincroniza: um campo com política desligada não
	// pode "congelar" um valor e depois parecer divergente quando a política for religada.
	const previous = link.ultimoSnapshot ?? {};
	return {
		nome: link.sincronizar.nome ? node.nome : previous.nome,
		descricao: link.sincronizar.descricao ? node.descricao : previous.descricao,
		imagemUrl: link.sincronizar.imagem ? node.imagemCapaUrl : previous.imagemUrl,
		preco: link.sincronizar.preco ? node.preco : previous.preco,
		disponivel: link.sincronizar.disponibilidade ? node.disponivel : previous.disponivel,
		gruposComplementos: syncsComplementos(link.sincronizar) ? association : previous.gruposComplementos,
	};
}

/** Os complementos do produto como este merchant os vê: nós resolvidos + vínculos ativos. */
export type TMerchantAddOnContext = { nodes: TAddOnGroupNode[]; links: TAddOnLinks };

async function loadMerchantAddOnContext({
	orgId,
	merchantId,
	produtoId,
}: {
	orgId: string;
	merchantId: string;
	produtoId: string;
}): Promise<TMerchantAddOnContext> {
	const channelState = await loadChannelState({ orgId, canal: "IFOOD", refExterno: merchantId });
	const [nodes, links] = await Promise.all([resolveProductAddOnNodes({ orgId, produtoId, channelState }), loadAddOnLinks({ orgId, merchantId })]);
	return { nodes, links };
}

async function pushLink({
	client,
	orgId,
	link,
	node,
	addOns,
}: {
	client: AxiosInstance;
	orgId: string;
	link: TCatalogLinkEntity;
	node: TPublishNode;
	addOns: TMerchantAddOnContext;
}): Promise<{ linkId: string; mudancas: TPushFieldChange[]; enviado: boolean; addOns: TMerchantAddOnContext }> {
	const changes = diffAgainstSnapshot(link, node);

	// A associação com os grupos muda quando um grupo entra/sai ou min/max/ordem mudam. Grupos do
	// produto ainda sem vínculo nesta loja só nascem no iFood enquanto o item nunca teve a associação
	// gravada: se a releitura não reconhecer um grupo criado, repetir a criação a cada push duplicaria
	// optionGroups na loja. O que ficou sem vínculo aparece como "sem vínculo" nos detalhes do item, e
	// a aba Adicionais vincula à mão. Catálogos com uma cópia do grupo por item deixaram de ser
	// ambíguos: a ida-e-volta lê o item e usa a cópia que ele já tem.
	const desiredAssociation = associationSnapshot({ nodes: addOns.nodes, links: addOns.links });
	const neverAssociated = link.ultimoSnapshot?.gruposComplementos == null;
	const associationChanged =
		syncsComplementos(link.sincronizar) &&
		!!link.externoItemId &&
		(associationsDiffer(link.ultimoSnapshot?.gruposComplementos, desiredAssociation) ||
			(neverAssociated && hasUnlinkedGroups({ nodes: addOns.nodes, links: addOns.links })));
	if (associationChanged) changes.push({ campo: "gruposComplementos", de: link.ultimoSnapshot?.gruposComplementos ?? null, para: desiredAssociation });

	if (changes.length === 0) return { linkId: link.id, mudancas: [], enviado: false, addOns };

	const touched = new Set(changes.map((change) => change.campo));
	let nextAddOns = addOns;

	// Preço e status vivem no ITEM.
	if ((touched.has("preco") || touched.has("disponivel")) && link.externoItemId) {
		await patchIfoodItem(client, link.merchantId, link.externoItemId, {
			preco: touched.has("preco") ? node.preco : undefined,
			status: touched.has("disponivel") ? (node.disponivel ? "AVAILABLE" : "UNAVAILABLE") : undefined,
		});
	}

	// Nome, descrição e foto vivem no PRODUTO base, por PATCH (merge: só o que mudou). Campo vazio no
	// cadastro não apaga o do iFood — o PATCH não envia o que está vazio.
	if ((touched.has("nome") || touched.has("descricao") || touched.has("imagemUrl")) && link.externoProdutoId) {
		const imagemPath =
			touched.has("imagemUrl") && node.imagemCapaUrl
				? await uploadIfoodImageFromUrl({ client, merchantId: link.merchantId, imagemUrl: node.imagemCapaUrl })
				: null;
		await updateIfoodProduct(client, link.merchantId, link.externoProdutoId, {
			nome: touched.has("nome") ? node.nome : null,
			descricao: touched.has("descricao") ? node.descricao : null,
			imagemPath,
		});
	}

	// Associação item → grupos: ida-e-volta do documento do item — o PUT reescreve o item inteiro,
	// então só o que o documento lido traz (agenda, preços por canal, peso) sobrevive.
	if (associationChanged && link.externoItemId) {
		const doc = await readIfoodItemDocument(client, link.merchantId, link.externoItemId);
		const { created } = applyAddOnAssociationToDocument({ doc, nodes: addOns.nodes, links: addOns.links, createUnlinked: neverAssociated });
		await writeIfoodItemDocument(client, link.merchantId, doc);
		if (created > 0) {
			const unlinkedNames = addOns.nodes.filter((addOnNode) => !groupLinkForItem(addOns.links, addOnNode.grupoId)).map((addOnNode) => addOnNode.nome);
			const after = await readFlatWithGroups({ client, merchantId: link.merchantId, itemId: link.externoItemId, groupNames: unlinkedNames });
			nextAddOns = {
				nodes: addOns.nodes,
				links: await recordAddOnLinksFromFlatItem({ orgId, merchantId: link.merchantId, nodes: addOns.nodes, links: addOns.links, flat: after }),
			};
		}
	}

	await db
		.update(catalogLinks)
		.set({
			status: "SINCRONIZADO",
			ultimoSnapshot: snapshotOf(link, node, associationSnapshot({ nodes: nextAddOns.nodes, links: nextAddOns.links })),
			dataUltimaSincronizacao: new Date(),
			ultimoErro: null,
			divergencias: null,
		})
		.where(eq(catalogLinks.id, link.id));

	return { linkId: link.id, mudancas: changes, enviado: true, addOns: nextAddOns };
}

/**
 * Empurra as mudanças de um produto para todas as lojas onde ele está vinculado.
 *
 * Best-effort por vínculo: uma loja que falha é marcada com ERRO e não impede as outras. O cron
 * diário só DETECTA (marca DIVERGENTE/ERRO); quem corrige é o próximo save que mude o campo ou o
 * "Reenviar o nosso" do vínculo. Nunca lança, porque o chamador é o save do produto (ou dos
 * canais) e o cadastro não pode falhar por causa do iFood.
 */
export async function pushProductToLinkedMerchants({
	orgId,
	produtoId,
}: {
	orgId: string;
	produtoId: string;
}): Promise<{ enviados: number; erros: number; semMudanca: number }> {
	const links = await db.query.catalogLinks.findMany({
		where: and(
			eq(catalogLinks.organizacaoId, orgId),
			eq(catalogLinks.provider, "IFOOD"),
			eq(catalogLinks.produtoId, produtoId),
			inArray(catalogLinks.tipo, ["PRODUTO", "VARIANTE"]),
			ne(catalogLinks.status, "DESVINCULADO"),
		),
	});
	if (links.length === 0) return { enviados: 0, erros: 0, semMudanca: 0 };

	let enviados = 0;
	let erros = 0;
	let semMudanca = 0;

	const merchantIds = [...new Set(links.map((link) => link.merchantId))];
	for (const merchantId of merchantIds) {
		const merchantLinks = links.filter((link) => link.merchantId === merchantId);
		try {
			const context = await resolveIfoodManagementContext({ organizacaoId: orgId, merchantId });
			const nodes = await resolvePublishNodes({ orgId, merchantId, produtoId });
			// Um contexto de complementos por loja: os vínculos de grupo criados pelo primeiro item
			// (variante) valem para os seguintes, que passam a mandar os ids em vez de criar de novo.
			let addOns = await loadMerchantAddOnContext({ orgId, merchantId, produtoId });

			for (const link of merchantLinks) {
				const node = nodes.find((candidate) => candidate.produtoVarianteId === (link.produtoVarianteId ?? null));
				if (!node) {
					// Variante removida/desativada: o item remoto continua lá, mas não temos mais o que
					// empurrar. Marcar ERRO deixa isso visível em vez de silenciar.
					await markCatalogLinkError({ linkId: link.id, erro: "O nó interno deste vínculo não existe mais (variante removida ou inativa)." });
					erros += 1;
					continue;
				}
				try {
					const result = await pushLink({ client: context.client, orgId, link, node, addOns });
					addOns = result.addOns;
					if (result.enviado) enviados += 1;
					else semMudanca += 1;
				} catch (error) {
					await markCatalogLinkError({ linkId: link.id, erro: error instanceof Error ? error.message : "Falha desconhecida ao sincronizar." });
					erros += 1;
				}
			}
		} catch (error) {
			// Falha de contexto (token, conexão removida): marca todos os vínculos da loja.
			const message = error instanceof Error ? error.message : "Falha ao resolver a conexão do iFood.";
			await db
				.update(catalogLinks)
				.set({ status: "ERRO", ultimoErro: message, dataAtualizacao: new Date() })
				.where(
					inArray(
						catalogLinks.id,
						merchantLinks.map((link) => link.id),
					),
				);
			erros += merchantLinks.length;
		}
	}

	return { enviados, erros, semMudanca };
}
