import { getIfoodItemFlat, updateIfoodProduct } from "@/lib/integrations/ifood/catalog";
import { patchIfoodItem, upsertIfoodItem } from "@/lib/integrations/ifood/catalog-items";
import type { TIfoodItemFlatDTO } from "@/lib/integrations/ifood/catalog-types";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { loadChannelState } from "@/lib/products/sales-channels-store";
import { type TCatalogLinkSnapshot, syncsComplementos } from "@/schemas/catalog-links";
import type { TIfoodCatalogContextEnum, TIfoodCatalogStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { catalogLinks, type TCatalogLinkEntity } from "@/services/drizzle/schema";
import type { AxiosInstance } from "axios";
import { and, eq, inArray, ne } from "drizzle-orm";
import {
	type TAddOnGroupNode,
	type TAddOnLinks,
	associationSnapshot,
	associationsDiffer,
	buildItemOptionGroupsPayload,
	hasAmbiguousGroups,
	hasUnlinkedGroups,
	loadAddOnLinks,
	recordAddOnLinksFromFlatItem,
	resolveProductAddOnNodes,
} from "./add-ons";
import { markCatalogLinkError } from "./links";
import { resolvePublishNodes, type TPublishNode } from "./publish";

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

/**
 * Re-`PUT /items` composto: o único caminho para mudar a associação item → grupos ou criar grupos
 * que ainda não existem na loja. O PUT reescreve o item inteiro, então `horarios` e
 * `contextModifiers` lidos do `flat` são ecoados — omiti-los apagaria a agenda e os preços por
 * canal que o lojista configurou no Portal.
 */
async function rewriteItemWithAddOns({
	client,
	link,
	node,
	flat,
	addOns,
}: {
	client: AxiosInstance;
	link: TCatalogLinkEntity;
	node: TPublishNode;
	flat: TIfoodItemFlatDTO;
	addOns: TMerchantAddOnContext;
}) {
	if (!link.externoItemId) throw new Error("Vínculo sem item remoto.");
	await upsertIfoodItem(client, link.merchantId, {
		itemId: link.externoItemId,
		produtoId: link.externoProdutoId ?? flat.produtoId ?? undefined,
		categoriaId: link.externoCategoriaId ?? flat.categoriaId ?? undefined,
		status: link.sincronizar.disponibilidade
			? node.disponivel
				? "AVAILABLE"
				: "UNAVAILABLE"
			: ((flat.status?.toUpperCase() as TIfoodCatalogStatusEnum | undefined) ?? "AVAILABLE"),
		preco: link.sincronizar.preco ? node.preco : (flat.preco ?? node.preco),
		precoOriginal: flat.precoOriginal,
		codigoExterno: node.codigo,
		produto: {
			nome: link.sincronizar.nome ? node.nome : (flat.nome ?? node.nome),
			descricao: link.sincronizar.descricao ? node.descricao : flat.descricao,
			imagemPath: flat.imagemPath,
		},
		gruposComplementos: buildItemOptionGroupsPayload({ nodes: addOns.nodes, links: addOns.links, remote: flat }),
		contextModifiers: flat.canais
			.filter((canal) => !!canal.contexto)
			.map((canal) => ({
				contexto: canal.contexto as TIfoodCatalogContextEnum,
				preco: canal.preco,
				status: (canal.status?.toUpperCase() as TIfoodCatalogStatusEnum | undefined) ?? null,
				codigoExterno: canal.codigoExterno,
			})),
		horarios: flat.horarios
			.filter((horario) => !!horario.inicio && !!horario.fim)
			.map((horario) => ({
				inicio: horario.inicio as string,
				fim: horario.fim as string,
				segunda: horario.segunda,
				terca: horario.terca,
				quarta: horario.quarta,
				quinta: horario.quinta,
				sexta: horario.sexta,
				sabado: horario.sabado,
				domingo: horario.domingo,
			})),
	});
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
	// produto ainda sem vínculo nesta loja só disparam o PUT composto (que os cria) enquanto o item
	// nunca teve a associação gravada: se a releitura não reconhecer um grupo criado, repetir a
	// criação a cada push duplicaria optionGroups na loja. O que ficou sem vínculo aparece como
	// "sem vínculo" nos detalhes do item, e a aba Adicionais vincula à mão.
	const desiredAssociation = associationSnapshot({ nodes: addOns.nodes, links: addOns.links });
	const neverAssociated = link.ultimoSnapshot?.gruposComplementos == null;
	// Catálogo com cópias do grupo por item (um grupo interno ↔ N optionGroups): o composto não sabe,
	// sem o flat, qual cópia é a deste item — reescrever poderia trocar a cópia ou criar outra. Nesses
	// catálogos a associação é gerida no Portal e só a disponibilidade das opções vem daqui.
	const associationChanged =
		syncsComplementos(link.sincronizar) &&
		!!link.externoItemId &&
		!hasAmbiguousGroups({ nodes: addOns.nodes, links: addOns.links }) &&
		(associationsDiffer(link.ultimoSnapshot?.gruposComplementos, desiredAssociation) ||
			(neverAssociated && hasUnlinkedGroups({ nodes: addOns.nodes, links: addOns.links })));
	if (associationChanged) changes.push({ campo: "gruposComplementos", de: link.ultimoSnapshot?.gruposComplementos ?? null, para: desiredAssociation });

	if (changes.length === 0) return { linkId: link.id, mudancas: [], enviado: false, addOns };

	let nextAddOns = addOns;
	if (associationChanged && link.externoItemId) {
		// O composto já leva preço/status/nome: não há por que repetir os patches abaixo.
		const before = await getIfoodItemFlat(client, link.merchantId, link.externoItemId);
		await rewriteItemWithAddOns({ client, link, node, flat: before, addOns });
		const after = await getIfoodItemFlat(client, link.merchantId, link.externoItemId);
		nextAddOns = {
			nodes: addOns.nodes,
			links: await recordAddOnLinksFromFlatItem({ orgId, merchantId: link.merchantId, nodes: addOns.nodes, links: addOns.links, flat: after }),
		};
	} else {
		const touched = new Set(changes.map((change) => change.campo));

		// Preço e status vivem no ITEM; nome/descrição/imagem vivem no PRODUTO base. São dois
		// endpoints distintos — daí a separação abaixo.
		if ((touched.has("preco") || touched.has("disponivel")) && link.externoItemId) {
			await patchIfoodItem(client, link.merchantId, link.externoItemId, {
				preco: touched.has("preco") ? node.preco : undefined,
				status: touched.has("disponivel") ? (node.disponivel ? "AVAILABLE" : "UNAVAILABLE") : undefined,
			});
		}
		if ((touched.has("nome") || touched.has("descricao")) && link.externoProdutoId) {
			// A imagem não é reenviada aqui: exigiria novo upload a cada push, e o `imagePath` do
			// iFood não é derivável da URL interna. Trocar a foto é uma ação explícita (republicar).
			await updateIfoodProduct(client, link.merchantId, link.externoProdutoId, {
				nome: node.nome,
				descricao: node.descricao,
				codigoExterno: node.codigo,
			});
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
 * Best-effort por vínculo: uma loja que falha é marcada com ERRO e não impede as outras — o
 * cron de reconciliação é a rede de segurança. Nunca lança, porque o chamador é o save do
 * produto (ou dos canais) e o cadastro não pode falhar por causa do iFood.
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

/**
 * Dispara o push sem bloquear o chamador. O save do produto/canais responde na hora; a
 * sincronização acontece depois e, se falhar, fica registrada no vínculo (status ERRO) e é
 * recuperada pelo cron diário. Sem isto, uma indisponibilidade do iFood derrubaria o cadastro.
 */
export function schedulePushForProduct({ orgId, produtoId }: { orgId: string; produtoId: string }) {
	void pushProductToLinkedMerchants({ orgId, produtoId }).catch((error) => {
		console.error("[IFOOD_PUSH] Falha inesperada no push assíncrono.", { orgId, produtoId, error });
	});
}
