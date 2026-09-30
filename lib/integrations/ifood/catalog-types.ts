import z from "zod";

/**
 * Schemas das respostas da Catalog API v2.0 do iFood (tolerantes, `.passthrough()`) e os DTOs em
 * PT consumidos pela UI, com seus mappers. A UI nunca vê o shape cru do iFood.
 */

export const IFOOD_CATALOG_BASE_URL = "https://merchant-api.ifood.com.br/catalog/v2.0";

/**
 * Restrições de imagem da Catalog API: apenas PNG/JPG e corpo de requisição de no máximo 5MB.
 * Como a imagem viaja em base64 (inflando ~33%), o arquivo cru precisa caber em 3/4 desse teto.
 */
export const IFOOD_IMAGE_ALLOWED_TYPES = ["image/png", "image/jpeg"];
export const IFOOD_IMAGE_MAX_BODY_BYTES = 5 * 1024 * 1024;
export const IFOOD_IMAGE_MAX_SIZE_BYTES = Math.floor((IFOOD_IMAGE_MAX_BODY_BYTES * 3) / 4);
export const IFOOD_IMAGE_MAX_SIZE_LABEL = "3,7MB";

/** CDN pública de imagens de catálogo do iFood. */
export function buildIfoodCatalogImageUrl(imagePath: string | null) {
	if (!imagePath) return null;
	if (imagePath.startsWith("http")) return imagePath;
	return `https://static-images.ifood.com.br/image/upload/t_medium/pratos/${imagePath}`;
}

const NullableString = z
	.union([z.string(), z.number()])
	.optional()
	.nullable()
	.transform((value) => (value === null || value === undefined ? null : String(value)));

const NullableNumber = z
	.union([z.string(), z.number()])
	.optional()
	.nullable()
	.transform((value) => {
		if (value === null || value === undefined || value === "") return null;
		const numberValue = Number(value);
		return Number.isFinite(numberValue) ? numberValue : null;
	});

// ---------------------------------------------------------------------------
// Catálogos + versão
// ---------------------------------------------------------------------------

const IfoodCatalogResponseSchema = z
	.object({
		catalogId: NullableString,
		id: NullableString,
		status: NullableString,
		context: z
			.union([z.array(z.string()), z.string()])
			.optional()
			.nullable(),
		modifiedAt: NullableString,
	})
	.passthrough();

export const IfoodCatalogsListResponseSchema = z.array(IfoodCatalogResponseSchema);

// O endpoint /catalog/version responde ora com objeto ({ version }), ora com a string/número puro.
export const IfoodCatalogVersionResponseSchema = z.union([
	z.string(),
	z.number(),
	z
		.object({
			version: z.union([z.string(), z.number()]).optional().nullable(),
		})
		.passthrough(),
]);

export type TIfoodCatalogDTO = {
	id: string;
	status: string | null;
	contextos: string[];
	modificadoEm: string | null;
};

export function mapIfoodCatalog(catalog: z.infer<typeof IfoodCatalogResponseSchema>): TIfoodCatalogDTO | null {
	const id = catalog.catalogId ?? catalog.id;
	if (!id) return null;
	return {
		id,
		status: catalog.status,
		contextos: Array.isArray(catalog.context) ? catalog.context : catalog.context ? [catalog.context] : [],
		modificadoEm: catalog.modifiedAt,
	};
}

export type TIfoodCatalogVersion = "V1" | "V2" | null;

export function mapIfoodCatalogVersion(payload: z.infer<typeof IfoodCatalogVersionResponseSchema>): TIfoodCatalogVersion {
	const rawVersion = typeof payload === "object" && payload !== null ? payload.version : payload;
	const version = rawVersion === null || rawVersion === undefined ? null : String(rawVersion);
	if (!version) return null;
	if (version.includes("2")) return "V2";
	if (version.includes("1")) return "V1";
	return null;
}

// ---------------------------------------------------------------------------
// Itens (produto vendável dentro de uma categoria)
// ---------------------------------------------------------------------------

const IfoodItemPriceResponseSchema = z
	.object({
		value: NullableNumber,
		originalValue: NullableNumber,
	})
	.passthrough();

/**
 * Janela de disponibilidade do item por dia da semana — o "agendamento de disponibilidade" que a
 * página de guias do iFood não documenta, mas que a API devolve e a homologação cobra. Item novo
 * nasce com um turno 00:00–23:59 em todos os dias.
 */
const IfoodShiftResponseSchema = z
	.object({
		startTime: NullableString,
		endTime: NullableString,
		monday: z.boolean().optional().nullable(),
		tuesday: z.boolean().optional().nullable(),
		wednesday: z.boolean().optional().nullable(),
		thursday: z.boolean().optional().nullable(),
		friday: z.boolean().optional().nullable(),
		saturday: z.boolean().optional().nullable(),
		sunday: z.boolean().optional().nullable(),
	})
	.passthrough();

export type TIfoodItemShiftDTO = {
	inicio: string | null;
	fim: string | null;
	segunda: boolean;
	terca: boolean;
	quarta: boolean;
	quinta: boolean;
	sexta: boolean;
	sabado: boolean;
	domingo: boolean;
};

export function mapIfoodItemShift(shift: z.infer<typeof IfoodShiftResponseSchema>): TIfoodItemShiftDTO {
	return {
		inicio: shift.startTime,
		fim: shift.endTime,
		segunda: !!shift.monday,
		terca: !!shift.tuesday,
		quarta: !!shift.wednesday,
		quinta: !!shift.thursday,
		sexta: !!shift.friday,
		sabado: !!shift.saturday,
		domingo: !!shift.sunday,
	};
}

const IfoodContextModifierResponseSchema = z
	.object({
		catalogContext: NullableString,
		status: NullableString,
		externalCode: NullableString,
		price: IfoodItemPriceResponseSchema.optional().nullable(),
	})
	.passthrough();

const IfoodItemResponseSchema = z
	.object({
		id: NullableString,
		productId: NullableString,
		name: NullableString,
		description: NullableString,
		externalCode: NullableString,
		status: NullableString,
		index: NullableNumber,
		price: IfoodItemPriceResponseSchema.optional().nullable(),
		imagePath: NullableString,
		categoryId: NullableString,
		contextModifiers: z.array(IfoodContextModifierResponseSchema).optional().nullable(),
		shifts: z.array(IfoodShiftResponseSchema).optional().nullable(),
	})
	.passthrough();

export type TIfoodContextModifierDTO = {
	contexto: string | null;
	preco: number | null;
	status: string | null;
	codigoExterno: string | null;
};

export function mapIfoodContextModifier(modifier: z.infer<typeof IfoodContextModifierResponseSchema>): TIfoodContextModifierDTO {
	return {
		contexto: modifier.catalogContext,
		preco: modifier.price?.value ?? null,
		status: modifier.status,
		codigoExterno: modifier.externalCode,
	};
}

export type TIfoodItemDTO = {
	id: string | null;
	produtoId: string | null;
	nome: string | null;
	descricao: string | null;
	codigoExterno: string | null;
	status: string | null;
	indice: number | null;
	preco: number | null;
	precoOriginal: number | null;
	imagemUrl: string | null;
};

export function mapIfoodItem(item: z.infer<typeof IfoodItemResponseSchema>): TIfoodItemDTO {
	return {
		id: item.id,
		produtoId: item.productId,
		nome: item.name,
		descricao: item.description,
		codigoExterno: item.externalCode,
		status: item.status,
		indice: item.index,
		preco: item.price?.value ?? null,
		precoOriginal: item.price?.originalValue ?? null,
		imagemUrl: buildIfoodCatalogImageUrl(item.imagePath),
	};
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

const IfoodCategoryResponseSchema = z
	.object({
		id: NullableString,
		name: NullableString,
		externalCode: NullableString,
		status: NullableString,
		index: NullableNumber,
		template: NullableString,
		items: z.array(IfoodItemResponseSchema).optional().nullable(),
	})
	.passthrough();

export const IfoodCategoriesListResponseSchema = z.array(IfoodCategoryResponseSchema);
export const IfoodCategoryDetailResponseSchema = IfoodCategoryResponseSchema;

export type TIfoodCategoryDTO = {
	id: string;
	nome: string | null;
	codigoExterno: string | null;
	status: string | null;
	indice: number | null;
	template: string | null;
	itens: TIfoodItemDTO[];
};

export function mapIfoodCategory(category: z.infer<typeof IfoodCategoryResponseSchema>): TIfoodCategoryDTO | null {
	if (!category.id) return null;
	return {
		id: category.id,
		nome: category.name,
		codigoExterno: category.externalCode,
		status: category.status,
		indice: category.index,
		template: category.template,
		itens: (category.items ?? []).map(mapIfoodItem),
	};
}

// ---------------------------------------------------------------------------
// Produtos (entidade base, sem contexto de venda)
// ---------------------------------------------------------------------------

const IfoodProductResponseSchema = z
	.object({
		id: NullableString,
		name: NullableString,
		description: NullableString,
		externalCode: NullableString,
		imagePath: NullableString,
		image: NullableString,
	})
	.passthrough();

export const IfoodProductsListResponseSchema = z.union([
	z.array(IfoodProductResponseSchema),
	z
		.object({
			elements: z.array(IfoodProductResponseSchema).optional().nullable(),
			page: NullableNumber,
			size: NullableNumber,
			total: NullableNumber,
		})
		.passthrough(),
]);

export const IfoodProductDetailResponseSchema = IfoodProductResponseSchema;

export type TIfoodProductDTO = {
	id: string;
	nome: string | null;
	descricao: string | null;
	codigoExterno: string | null;
	imagemUrl: string | null;
};

export function mapIfoodProduct(product: z.infer<typeof IfoodProductResponseSchema>): TIfoodProductDTO | null {
	if (!product.id) return null;
	return {
		id: product.id,
		nome: product.name,
		descricao: product.description,
		codigoExterno: product.externalCode,
		imagemUrl: buildIfoodCatalogImageUrl(product.imagePath ?? product.image),
	};
}

export type TIfoodProductsPageDTO = {
	produtos: TIfoodProductDTO[];
	paginacao: {
		pagina: number | null;
		total: number | null;
	};
};

export function mapIfoodProductsPage(payload: z.infer<typeof IfoodProductsListResponseSchema>): TIfoodProductsPageDTO {
	if (Array.isArray(payload)) {
		return {
			produtos: payload.map(mapIfoodProduct).filter((product): product is TIfoodProductDTO => !!product),
			paginacao: { pagina: null, total: null },
		};
	}
	return {
		produtos: (payload.elements ?? []).map(mapIfoodProduct).filter((product): product is TIfoodProductDTO => !!product),
		paginacao: { pagina: payload.page, total: payload.total },
	};
}

// ---------------------------------------------------------------------------
// Grupos de complementos (option groups) e opções
// ---------------------------------------------------------------------------

const IfoodOptionResponseSchema = z
	.object({
		id: NullableString,
		productId: NullableString,
		name: NullableString,
		externalCode: NullableString,
		status: NullableString,
		index: NullableNumber,
		price: IfoodItemPriceResponseSchema.optional().nullable(),
	})
	.passthrough();

const IfoodOptionGroupResponseSchema = z
	.object({
		id: NullableString,
		name: NullableString,
		externalCode: NullableString,
		status: NullableString,
		options: z.array(IfoodOptionResponseSchema).optional().nullable(),
	})
	.passthrough();

export const IfoodOptionGroupsListResponseSchema = z.union([
	z.array(IfoodOptionGroupResponseSchema),
	z
		.object({
			elements: z.array(IfoodOptionGroupResponseSchema).optional().nullable(),
			page: NullableNumber,
			size: NullableNumber,
			total: NullableNumber,
		})
		.passthrough(),
]);

export const IfoodOptionGroupDetailResponseSchema = IfoodOptionGroupResponseSchema;

export type TIfoodOptionDTO = {
	id: string | null;
	produtoId: string | null;
	nome: string | null;
	codigoExterno: string | null;
	status: string | null;
	indice: number | null;
	preco: number | null;
};

export type TIfoodOptionGroupDTO = {
	id: string;
	nome: string | null;
	codigoExterno: string | null;
	status: string | null;
	opcoes: TIfoodOptionDTO[];
};

export function mapIfoodOption(option: z.infer<typeof IfoodOptionResponseSchema>): TIfoodOptionDTO {
	return {
		id: option.id,
		produtoId: option.productId,
		nome: option.name,
		codigoExterno: option.externalCode,
		status: option.status,
		indice: option.index,
		preco: option.price?.value ?? null,
	};
}

export function mapIfoodOptionGroup(group: z.infer<typeof IfoodOptionGroupResponseSchema>): TIfoodOptionGroupDTO | null {
	if (!group.id) return null;
	return {
		id: group.id,
		nome: group.name,
		codigoExterno: group.externalCode,
		status: group.status,
		opcoes: (group.options ?? []).map(mapIfoodOption),
	};
}

export function mapIfoodOptionGroupsList(payload: z.infer<typeof IfoodOptionGroupsListResponseSchema>): TIfoodOptionGroupDTO[] {
	const groups = Array.isArray(payload) ? payload : (payload.elements ?? []);
	return groups.map(mapIfoodOptionGroup).filter((group): group is TIfoodOptionGroupDTO => !!group);
}

// ---------------------------------------------------------------------------
// Item "flat" — item com produto, grupos e opções resolvidos (GET /items/{id}/flat)
// ---------------------------------------------------------------------------

const IfoodFlatOptionResponseSchema = z
	.object({
		id: NullableString,
		productId: NullableString,
		name: NullableString,
		description: NullableString,
		externalCode: NullableString,
		status: NullableString,
		index: NullableNumber,
		price: IfoodItemPriceResponseSchema.optional().nullable(),
	})
	.passthrough();

const IfoodFlatOptionGroupResponseSchema = z
	.object({
		id: NullableString,
		name: NullableString,
		optionGroupType: NullableString,
		min: NullableNumber,
		max: NullableNumber,
		index: NullableNumber,
		optionIds: z.array(z.string()).optional().nullable(),
		options: z.array(IfoodFlatOptionResponseSchema).optional().nullable(),
	})
	.passthrough();

export const IfoodItemFlatResponseSchema = z
	.object({
		item: IfoodItemResponseSchema.optional().nullable(),
		id: NullableString,
		productId: NullableString,
		categoryId: NullableString,
		name: NullableString,
		description: NullableString,
		externalCode: NullableString,
		status: NullableString,
		price: IfoodItemPriceResponseSchema.optional().nullable(),
		imagePath: NullableString,
		// O `flat` devolve o item ora aninhado em `item`, ora na raiz — canais e horários seguem o item.
		contextModifiers: z.array(IfoodContextModifierResponseSchema).optional().nullable(),
		shifts: z.array(IfoodShiftResponseSchema).optional().nullable(),
		products: z.array(IfoodProductResponseSchema).optional().nullable(),
		optionGroups: z.array(IfoodFlatOptionGroupResponseSchema).optional().nullable(),
		options: z.array(IfoodFlatOptionResponseSchema).optional().nullable(),
	})
	.passthrough();

export type TIfoodFlatOptionDTO = {
	id: string | null;
	produtoId: string | null;
	nome: string | null;
	descricao: string | null;
	codigoExterno: string | null;
	status: string | null;
	preco: number | null;
};

export type TIfoodFlatOptionGroupDTO = {
	id: string | null;
	nome: string | null;
	tipo: string | null;
	min: number | null;
	max: number | null;
	opcoes: TIfoodFlatOptionDTO[];
};

export type TIfoodItemFlatDTO = {
	id: string | null;
	produtoId: string | null;
	categoriaId: string | null;
	nome: string | null;
	descricao: string | null;
	codigoExterno: string | null;
	status: string | null;
	preco: number | null;
	precoOriginal: number | null;
	imagemPath: string | null;
	imagemUrl: string | null;
	gruposComplementos: TIfoodFlatOptionGroupDTO[];
	canais: TIfoodContextModifierDTO[];
	/** Janelas de disponibilidade por dia da semana. Vazio = sem restrição declarada. */
	horarios: TIfoodItemShiftDTO[];
};

/**
 * O `flat` devolve o item ora na raiz, ora aninhado em `item`, e o nome do complemento pode vir na
 * própria opção ou só no produto dela — o iFood modela opção como produto. Resolvemos os dois
 * caminhos aqui para a UI receber sempre a mesma forma.
 */
export function mapIfoodItemFlat(payload: z.infer<typeof IfoodItemFlatResponseSchema>): TIfoodItemFlatDTO {
	const item = payload.item ?? payload;
	const produtos = payload.products ?? [];
	const produtoBase = produtos.find((produto) => produto.id && produto.id === item.productId) ?? produtos[0] ?? null;

	function resolveOptionName(option: z.infer<typeof IfoodFlatOptionResponseSchema>) {
		if (option.name) return option.name;
		const produto = produtos.find((candidato) => candidato.id && candidato.id === option.productId);
		return produto?.name ?? null;
	}

	// As opções podem chegar dentro do grupo ou numa lista irmã referenciada por `optionIds`.
	const opcoesSoltas = payload.options ?? [];
	const grupos = (payload.optionGroups ?? []).map((grupo) => {
		const opcoesDoGrupo = grupo.options?.length
			? grupo.options
			: opcoesSoltas.filter((opcao) => opcao.id && (grupo.optionIds ?? []).includes(opcao.id));
		return {
			id: grupo.id,
			nome: grupo.name,
			tipo: grupo.optionGroupType,
			min: grupo.min,
			max: grupo.max,
			opcoes: opcoesDoGrupo.map((opcao) => ({
				id: opcao.id,
				produtoId: opcao.productId,
				nome: resolveOptionName(opcao),
				descricao: opcao.description,
				codigoExterno: opcao.externalCode,
				status: opcao.status,
				preco: opcao.price?.value ?? null,
			})),
		};
	});

	// Os grupos DO ITEM são os associados ao produto base, com min/max/ordem da associação. O `flat`
	// também traz grupos aninhados em produtos de opção (3º nível — ex.: outra cópia de uma oferta
	// dentro de cada cookie da oferta); listá-los como grupos do item duplicava grupos na tela e fazia
	// a reconciliação comparar a associação contra cópias que o cliente não vê no nível do item.
	// Sem a lista de associações no payload, mantém todos (comportamento anterior).
	const associacoes = (produtoBase as { optionGroups?: unknown } | null)?.optionGroups;
	const gruposDoItem = Array.isArray(associacoes)
		? (associacoes as { id?: string | null; min?: number | null; max?: number | null; index?: number | null }[])
				.map((associacao, posicao) => {
					const grupo = grupos.find((candidato) => candidato.id && candidato.id === associacao.id);
					return grupo
						? { grupo: { ...grupo, min: associacao.min ?? grupo.min, max: associacao.max ?? grupo.max }, ordem: associacao.index ?? posicao }
						: null;
				})
				.filter((entrada): entrada is NonNullable<typeof entrada> => !!entrada)
				.sort((a, b) => a.ordem - b.ordem)
				.map((entrada) => entrada.grupo)
		: grupos;

	const imagePath = produtoBase?.imagePath ?? produtoBase?.image ?? payload.imagePath ?? item.imagePath ?? null;

	return {
		id: item.id ?? payload.id,
		produtoId: item.productId ?? produtoBase?.id ?? null,
		// O `/flat` devolve o `categoryId` DENTRO de `item`; ler só da raiz fazia a categoria chegar
		// vazia na página de detalhe enquanto a listagem (que conhece a categoria pela árvore) a mostrava.
		categoriaId: item.categoryId ?? payload.categoryId ?? null,
		nome: produtoBase?.name ?? item.name ?? payload.name,
		descricao: produtoBase?.description ?? item.description ?? payload.description,
		codigoExterno: item.externalCode ?? payload.externalCode,
		status: item.status ?? payload.status,
		preco: item.price?.value ?? payload.price?.value ?? null,
		precoOriginal: item.price?.originalValue ?? payload.price?.originalValue ?? null,
		imagemPath: imagePath,
		imagemUrl: buildIfoodCatalogImageUrl(imagePath),
		gruposComplementos: gruposDoItem,
		canais: (item.contextModifiers ?? []).map(mapIfoodContextModifier),
		horarios: (item.shifts ?? []).map(mapIfoodItemShift),
	};
}

// ---------------------------------------------------------------------------
// Batch (operações em lote de preço/status)
// ---------------------------------------------------------------------------

/**
 * O status terminal do lote vem em `batchStatus` (`COMPLETED`); `status` é aceito como fallback
 * porque respostas antigas usavam esse nome.
 */
const IfoodBatchResultSchema = z
	.object({
		resourceId: NullableString,
		result: NullableString,
		message: NullableString,
	})
	.passthrough();

export const IfoodBatchResponseSchema = z
	.object({
		batchId: NullableString,
		id: NullableString,
		batchStatus: NullableString,
		status: NullableString,
		url: NullableString,
		results: z.array(IfoodBatchResultSchema).optional().nullable(),
		error: z.unknown().optional().nullable(),
	})
	.passthrough();

export type TIfoodBatchResultDTO = {
	/** O `externalCode` que endereçou a linha — é por ele que a UI acha o item na tabela. */
	recurso: string | null;
	sucesso: boolean;
	mensagem: string | null;
};

export type TIfoodBatchDTO = {
	id: string | null;
	status: string | null;
	/** `true` quando o lote chegou ao fim — a UI para de fazer polling. */
	concluido: boolean;
	/** Resultado por linha. `COMPLETED` no lote não garante sucesso em cada item. */
	resultados: TIfoodBatchResultDTO[];
	falhas: TIfoodBatchResultDTO[];
};

const IFOOD_BATCH_TERMINAL_STATUSES = new Set(["COMPLETED", "ERROR", "FAILED", "CANCELLED"]);

export function mapIfoodBatch(batch: z.infer<typeof IfoodBatchResponseSchema>): TIfoodBatchDTO {
	const status = batch.batchStatus ?? batch.status;
	const resultados = (batch.results ?? []).map((resultado) => ({
		recurso: resultado.resourceId,
		sucesso: resultado.result?.toUpperCase() === "SUCCESS",
		mensagem: resultado.message,
	}));

	return {
		id: batch.batchId ?? batch.id,
		status,
		concluido: !!status && IFOOD_BATCH_TERMINAL_STATUSES.has(status.toUpperCase()),
		resultados,
		falhas: resultados.filter((resultado) => !resultado.sucesso),
	};
}
