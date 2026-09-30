import type { TIfoodCatalogContextEnum, TIfoodCatalogStatusEnum, TIfoodItemTypeEnum, TIfoodOptionGroupTypeEnum } from "@/schemas/enums";
import type { AxiosInstance } from "axios";
import { mapIfoodError } from "./errors";
import { setIfoodOptionGroupStatus } from "./item-document";
import { IFOOD_CATALOG_BASE_URL, mapIfoodOptionGroup, IfoodOptionGroupDetailResponseSchema } from "./catalog-types";

/**
 * Escritas de ITENS (produto vendável em categoria) e COMPLEMENTOS (option groups/options) da
 * Catalog API v2.0. Os payloads seguem os nomes de campos documentados pelo iFood; as validações
 * de negócio ficam do lado do iFood e as mensagens de erro voltam mapeadas por `mapIfoodError`.
 */

function catalogUrl(merchantId: string, path: string) {
	return `${IFOOD_CATALOG_BASE_URL}/merchants/${merchantId}${path}`;
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

/**
 * Uma opção de complemento. O NOME mora no produto da opção, não na opção: o iFood modela toda
 * opção como um produto vendável referenciado por `productId`. Por isso cada opção gera duas
 * entradas no payload — uma em `products` (nome/descrição) e outra em `options` (preço/status).
 */
export type TIfoodItemOptionPayload = {
	id?: string | null;
	produtoId?: string | null;
	nome: string;
	descricao?: string | null;
	preco?: number | null;
	codigoExterno?: string | null;
	status?: TIfoodCatalogStatusEnum | null;
	/** Ordem de exibição dentro do grupo. */
	indice?: number | null;
	/** Pizza (SIZE): número de fatias do tamanho. Vai no PRODUTO da opção, não na opção. */
	fatias?: number | null;
	/** Pizza (SIZE): em quantas partes a pizza pode ser dividida — `[1,2]` = inteira ou meia. */
	fracoes?: number[] | null;
	/** Pizza (TOPPING): amarra este preço de sabor a um tamanho específico. */
	opcaoPaiId?: string | null;
	/** Combo: grupos de 3º nível que pendem desta opção (só SPECIFICATION e INGREDIENTS). */
	gruposComplementos?: TIfoodItemOptionGroupPayload[] | null;
};

/**
 * Grupo de complementos. `min`/`max` definem a obrigatoriedade: `min: 1, max: 1` é "escolha
 * obrigatória de 1"; `min: 0` torna o grupo opcional.
 */
export type TIfoodItemOptionGroupPayload = {
	id?: string | null;
	nome: string;
	tipo: TIfoodOptionGroupTypeEnum;
	min: number;
	max: number;
	status?: TIfoodCatalogStatusEnum | null;
	/** Ordem de exibição dos grupos no item. */
	indice?: number | null;
	/** Combo: marca o grupo principal (`associationType: "MAIN"`). Exatamente um por combo. */
	principal?: boolean;
	opcoes: TIfoodItemOptionPayload[];
};

/**
 * Sobrescrita de preço/status/código por canal de venda. Campo em branco herda o valor da raiz do
 * item — é o que evita duplicar o mesmo produto só porque o preço no salão é outro.
 */
export type TIfoodItemContextModifierPayload = {
	contexto: TIfoodCatalogContextEnum;
	preco?: number | null;
	status?: TIfoodCatalogStatusEnum | null;
	codigoExterno?: string | null;
};

export type TIfoodItemUpsertPayload = {
	/** Presente ao atualizar um item existente. */
	itemId?: string | null;
	produtoId?: string | null;
	/** `DEFAULT` quando omitido. `PIZZA` dispensa `categoriaId` — o iFood cria a categoria. */
	tipo?: TIfoodItemTypeEnum | null;
	categoriaId?: string | null;
	status: TIfoodCatalogStatusEnum;
	preco: number;
	precoOriginal?: number | null;
	codigoExterno?: string | null;
	indice?: number | null;
	/** Dados do produto base (criação em uma chamada só, quando não há produtoId). */
	produto?: {
		nome: string;
		descricao?: string | null;
		imagemPath?: string | null;
	} | null;
	/** Grupos de complementos do item. Ausente = não mexe; `[]` = remove todos. */
	gruposComplementos?: TIfoodItemOptionGroupPayload[] | null;
	/** Preço/status por canal. Ausente = não mexe; `[]` = todos os canais herdam a raiz. */
	contextModifiers?: TIfoodItemContextModifierPayload[] | null;
	/**
	 * Janelas de disponibilidade por dia da semana. Precisa ser REENVIADO em toda atualização: o
	 * `PUT /items` reescreve o item inteiro, e omitir isto apaga a agenda que o lojista configurou.
	 */
	horarios?: TIfoodItemShiftPayload[] | null;
};

export type TIfoodItemShiftPayload = {
	inicio: string;
	fim: string;
	segunda: boolean;
	terca: boolean;
	quarta: boolean;
	quinta: boolean;
	sexta: boolean;
	sabado: boolean;
	domingo: boolean;
};

/**
 * PUT /items — cria/atualiza item + produto base + complementos numa chamada só ("FullItemDto").
 *
 * O iFood exige que `item.id` e `item.productId` venham SEMPRE preenchidos (UUIDs v4 gerados pelo
 * cliente na criação — se já existirem na base, vira update). Omiti-los responde
 * 400 "FullItemDto is not valid"; um id fora do padrão UUID v4 responde 404. A imagem do produto
 * vai no campo `imagePath` (retorno do upload de imagem), não `image`.
 *
 * Este é o ÚNICO caminho documentado para criar ou editar grupos de complementos: a Catalog v2.0
 * não publica `POST /optionGroups`. O payload é montado em três listas que se referenciam por id —
 * `optionGroups[].optionIds` aponta para `options[].id`, e `options[].productId` aponta para
 * `products[].id`, que é onde mora o nome da opção.
 */
export async function upsertIfoodItem(
	client: AxiosInstance,
	merchantId: string,
	payload: TIfoodItemUpsertPayload,
): Promise<{ itemId: string; productId: string }> {
	try {
		const itemId = payload.itemId ?? crypto.randomUUID();
		const productId = payload.produtoId ?? crypto.randomUUID();
		const tipoItem = payload.tipo ?? "DEFAULT";

		// O `FullItemDto` é PLANO: três listas que se referenciam por id. A árvore (item → grupos →
		// opções → grupos de 3º nível, no combo) é expressa por `products[].optionGroups`, que carrega
		// min/max/index/associationType do vínculo. Achatamos a árvore aqui.
		const gruposAchatados: (TIfoodItemOptionGroupPayload & { id: string; opcoes: (TIfoodItemOptionPayload & { id: string; produtoId: string })[] })[] =
			[];
		/** Vínculos produto → grupos, na forma de objeto que o iFood exige. */
		const vinculosPorProduto = new Map<string, { id: string; min: number; max: number; index?: number; associationType?: "MAIN" }[]>();

		function achatar(grupos: TIfoodItemOptionGroupPayload[], produtoDonoId: string) {
			grupos.forEach((grupo, indiceGrupo) => {
				const grupoId = grupo.id ?? crypto.randomUUID();
				const opcoesResolvidas = grupo.opcoes.map((opcao) => ({
					...opcao,
					id: opcao.id ?? crypto.randomUUID(),
					produtoId: opcao.produtoId ?? crypto.randomUUID(),
				}));

				gruposAchatados.push({ ...grupo, id: grupoId, opcoes: opcoesResolvidas });

				const vinculos = vinculosPorProduto.get(produtoDonoId) ?? [];
				vinculos.push({
					id: grupoId,
					min: grupo.min,
					max: grupo.max,
					index: grupo.indice ?? indiceGrupo,
					...(grupo.principal ? { associationType: "MAIN" as const } : {}),
				});
				vinculosPorProduto.set(produtoDonoId, vinculos);

				// 3º nível do combo: grupos que pendem do PRODUTO da opção.
				for (const opcao of opcoesResolvidas) {
					if (opcao.gruposComplementos?.length) achatar(opcao.gruposComplementos, opcao.produtoId);
				}
			});
		}
		achatar(payload.gruposComplementos ?? [], productId);
		const opcoes = gruposAchatados.flatMap((grupo) => grupo.opcoes);

		const produtosBase = payload.produto
			? [
					{
						id: productId,
						name: payload.produto.nome,
						description: payload.produto.descricao ?? undefined,
						imagePath: payload.produto.imagemPath ?? undefined,
						externalCode: payload.codigoExterno ? `${payload.codigoExterno}_PROD` : undefined,
						// O vínculo com os grupos sai DAQUI, do produto — não do item. Apontar do item
						// (`item.optionGroupIds`) responde 400 "resources are not linked correctly".
						optionGroups: vinculosPorProduto.get(productId),
					},
				]
			: [];

		await client.put(catalogUrl(merchantId, "/items"), {
			item: {
				id: itemId,
				type: tipoItem,
				productId,
				// Pizza sem categoria informada faz o iFood criar a categoria PIZZA sozinho (a loja
				// aceita no máximo uma).
				categoryId: payload.categoriaId ?? undefined,
				status: payload.status,
				externalCode: payload.codigoExterno || undefined,
				index: payload.indice ?? undefined,
				price: {
					value: payload.preco,
					originalValue: payload.precoOriginal ?? undefined,
				},
				// Só entram os canais que de fato sobrescrevem algo: mandar um modifier vazio faria o
				// canal herdar `undefined` em vez de herdar a raiz.
				//
				// `status` é OBRIGATÓRIO em cada modifier (400 "ItemContextModifierDto[0] status must
				// be one of..." sem ele), então um canal que só muda o preço repete o status do item —
				// que é exatamente o que "herdar" significa aqui.
				shifts: payload.horarios
					? payload.horarios.map((horario) => ({
							startTime: horario.inicio,
							endTime: horario.fim,
							monday: horario.segunda,
							tuesday: horario.terca,
							wednesday: horario.quarta,
							thursday: horario.quinta,
							friday: horario.sexta,
							saturday: horario.sabado,
							sunday: horario.domingo,
						}))
					: undefined,
				contextModifiers: payload.contextModifiers
					? payload.contextModifiers
							.filter((modifier) => modifier.preco != null || modifier.status != null || modifier.codigoExterno)
							.map((modifier) => ({
								catalogContext: modifier.contexto,
								price: modifier.preco != null ? { value: modifier.preco } : undefined,
								status: modifier.status ?? payload.status,
								externalCode: modifier.codigoExterno || undefined,
							}))
					: undefined,
			},
			products: [
				...produtosBase,
				...opcoes.map((opcao) => ({
					id: opcao.produtoId,
					name: opcao.nome,
					description: opcao.descricao ?? undefined,
					// Pizza: o número de fatias do tamanho mora no PRODUTO da opção.
					quantity: opcao.fatias ?? undefined,
					// Combo: uma opção que tem grupos de 3º nível os declara pelo seu produto.
					optionGroups: vinculosPorProduto.get(opcao.produtoId),
				})),
			],
			// min/max NÃO vão aqui — eles pertencem ao vínculo em `products[].optionGroups`.
			optionGroups: gruposAchatados.map((grupo) => ({
				id: grupo.id,
				name: grupo.nome,
				optionGroupType: grupo.tipo,
				// Obrigatório, apesar de ausente no exemplo da documentação: sem ele a API responde
				// 400 "FullItemDto is not valid" com `OptionGroupDto[0] status must be one of...`.
				status: grupo.status ?? "AVAILABLE",
				optionIds: grupo.opcoes.map((opcao) => opcao.id),
			})),
			options: opcoes.map((opcao, indiceOpcao) => ({
				id: opcao.id,
				productId: opcao.produtoId,
				status: opcao.status ?? "AVAILABLE",
				// Código vazio NÃO vai: o iFood trata "" como código e reaproveita o produto que já o tem.
				externalCode: opcao.codigoExterno || undefined,
				index: opcao.indice ?? indiceOpcao,
				price: { value: opcao.preco ?? 0 },
				// Pizza: divisões permitidas do tamanho e preço de sabor amarrado a um tamanho.
				fractions: opcao.fracoes ?? undefined,
				parentCustomizationOptionId: opcao.opcaoPaiId ?? undefined,
			})),
		});
		return { itemId, productId };
	} catch (error) {
		mapIfoodError("upsertIfoodItem", error);
	}
}

export type TIfoodItemPatchPayload = {
	preco?: number | null;
	precoOriginal?: number | null;
	status?: TIfoodCatalogStatusEnum | null;
	codigoExterno?: string | null;
};

/** PATCH /items/{itemId} — JSON Merge Patch: envia apenas os campos informados. */
export async function patchIfoodItem(client: AxiosInstance, merchantId: string, itemId: string, patch: TIfoodItemPatchPayload): Promise<void> {
	try {
		const body: Record<string, unknown> = {};
		if (patch.preco !== undefined && patch.preco !== null) {
			body.price = { value: patch.preco, originalValue: patch.precoOriginal ?? undefined };
		}
		if (patch.status !== undefined && patch.status !== null) body.status = patch.status;
		if (patch.codigoExterno) body.externalCode = patch.codigoExterno;
		await client.patch(catalogUrl(merchantId, `/items/${itemId}`), body);
	} catch (error) {
		mapIfoodError("patchIfoodItem", error);
	}
}

export async function deleteIfoodItemFromCategory(client: AxiosInstance, merchantId: string, categoryId: string, productId: string): Promise<void> {
	try {
		await client.delete(catalogUrl(merchantId, `/categories/${categoryId}/products/${productId}`));
	} catch (error) {
		mapIfoodError("deleteIfoodItemFromCategory", error);
	}
}

// ---------------------------------------------------------------------------
// Grupos de complementos
// ---------------------------------------------------------------------------

export async function updateIfoodOptionGroup(client: AxiosInstance, merchantId: string, optionGroupId: string, { nome }: { nome: string }) {
	try {
		const response = await client.patch<unknown>(catalogUrl(merchantId, `/optionGroups/${optionGroupId}`), { name: nome });
		return mapIfoodOptionGroup(IfoodOptionGroupDetailResponseSchema.parse(response.data));
	} catch (error) {
		mapIfoodError("updateIfoodOptionGroup", error);
	}
}

/**
 * Pausa/reativa um grupo inteiro. `PATCH /optionGroups/status` NÃO existe (404, medido em
 * 2026-09-30); o status só muda pela ida-e-volta de um item que carrega o grupo — ver
 * `setIfoodOptionGroupStatus`. `preferredItemIds` evita varrer o cardápio quando o chamador já sabe
 * onde o grupo está.
 *
 * Prefira pausar opções individuais quando o grupo ainda deve aparecer com as demais disponíveis.
 */
export async function patchIfoodOptionGroupStatus(
	client: AxiosInstance,
	merchantId: string,
	optionGroupId: string,
	status: TIfoodCatalogStatusEnum,
	preferredItemIds?: string[],
): Promise<void> {
	await setIfoodOptionGroupStatus(client, merchantId, { optionGroupId, status, preferredItemIds });
}

export async function deleteIfoodOptionGroup(client: AxiosInstance, merchantId: string, optionGroupId: string): Promise<void> {
	try {
		await client.delete(catalogUrl(merchantId, `/optionGroups/${optionGroupId}`));
	} catch (error) {
		mapIfoodError("deleteIfoodOptionGroup", error);
	}
}

// ---------------------------------------------------------------------------
// Opções (complementos individuais)
// ---------------------------------------------------------------------------

export type TIfoodOptionCreatePayload = {
	nome: string;
	preco?: number | null;
	codigoExterno?: string | null;
	status?: TIfoodCatalogStatusEnum | null;
};

export async function addIfoodOptions(
	client: AxiosInstance,
	merchantId: string,
	optionGroupId: string,
	opcoes: TIfoodOptionCreatePayload[],
): Promise<{ nome: string; optionId: string | null; productId: string | null }[]> {
	// Validado ao vivo (2026-09-27 e 2026-09-30): UM objeto por chamada — o array é lido como o
	// próprio DTO e recusado —, `price` obrigatório, e o nome mora no PRODUTO da opção: sem
	// `product`/`productId` a API responde "Either product or productId must be provided". A resposta
	// (201) já traz `{ id, productId }` — é dela que saem os ids, porque `GET /optionGroups/{id}` não
	// existe para reler o grupo.
	//
	// `externalCode` vazio NÃO pode ir: o iFood trata "" como um código válido e liga a opção nova ao
	// produto que já tem esse código — medido em 2026-09-30, "Bala Baiana" nasceu como "Crumble de
	// Casquinha" (o primeiro produto criado com código vazio) e outras opções nem entraram no grupo.
	const created: { nome: string; optionId: string | null; productId: string | null }[] = [];
	try {
		for (const opcao of opcoes) {
			const response = await client.post<{ id?: string | null; productId?: string | null }>(
				catalogUrl(merchantId, `/optionGroups/${optionGroupId}/options`),
				{
					status: opcao.status ?? "AVAILABLE",
					price: { value: opcao.preco ?? 0 },
					product: { name: opcao.nome, externalCode: opcao.codigoExterno || undefined },
				},
			);
			created.push({ nome: opcao.nome, optionId: response.data?.id ?? null, productId: response.data?.productId ?? null });
		}
		return created;
	} catch (error) {
		mapIfoodError("addIfoodOptions", error);
	}
}

/**
 * `PATCH /options/price` recebe UM objeto `{ optionId, price: { value } }` por chamada — validado ao
 * vivo (2026-09-30): o array é recusado com 400 `PatchOptionPriceDto.optionId must be a UUID`. Grava
 * o preço raiz E o do canal DEFAULT (onde o Portal guarda o preço efetivo).
 */
export async function patchIfoodOptionsPrice(
	client: AxiosInstance,
	merchantId: string,
	opcoes: { optionId: string; preco: number }[],
): Promise<void> {
	try {
		for (const opcao of opcoes) {
			await client.patch(catalogUrl(merchantId, "/options/price"), { optionId: opcao.optionId, price: { value: opcao.preco } });
		}
	} catch (error) {
		mapIfoodError("patchIfoodOptionsPrice", error);
	}
}

/**
 * `PATCH /options/status` recebe UM objeto `{ optionId, status }` por chamada — validado ao vivo
 * (2026-09-27). Um array é recusado com 400 `PatchOptionStatusDto.optionId must be a UUID` (o iFood
 * lê o array como o próprio DTO). Por isso uma chamada por opção, em série.
 */
export async function patchIfoodOptionsStatus(
	client: AxiosInstance,
	merchantId: string,
	opcoes: { optionId: string; status: TIfoodCatalogStatusEnum }[],
): Promise<void> {
	try {
		for (const opcao of opcoes) {
			await client.patch(catalogUrl(merchantId, "/options/status"), { optionId: opcao.optionId, status: opcao.status });
		}
	} catch (error) {
		mapIfoodError("patchIfoodOptionsStatus", error);
	}
}
