import type { TGetCardapioWebCatalogOutput } from "./types";

// -----------------------------------------------------------------------------
// TYPE DEFINITIONS FOR MAPPED CATALOG ENTITIES
// -----------------------------------------------------------------------------

export interface MappedCatalogProduct {
	idExterno: string;
	ativo: boolean;
	codigo: string;
	descricao: string;
	imagemCapaUrl: string | null;
	precoVenda: number;
	unidade: string;
	grupo: string; // Category name
	ncm: string;
	tipo: string; // "regular_item" or "combo"
	status: string;
	quantidade: number | null;
	controlaEstoque: boolean;
}

export interface MappedCatalogAddOn {
	idExterno: string;
	nome: string;
	minOpcoes: number;
	maxOpcoes: number | null;
	tipoEscolha: string;
	tipoCalculoPreco: string;
}

export interface MappedCatalogAddOnOption {
	idExterno: string;
	addOnIdExterno: string;
	nome: string;
	codigo: string | null;
	precoDelta: number;
	maxQtdePorItem: number | null;
	imagemCapaUrl: string | null;
	status: string;
}

export interface MappedCatalogProductAddOnReference {
	produtoIdExterno: string;
	addOnIdExterno: string;
	ordem: number;
}

// -----------------------------------------------------------------------------
// EXTRACTION FUNCTIONS
// -----------------------------------------------------------------------------

type CatalogCategory = TGetCardapioWebCatalogOutput["categories"][number];
type CatalogItem = CatalogCategory["items"][number];
type CatalogOptionGroup = CatalogItem["option_groups"][number];
type CatalogOption = CatalogOptionGroup["options"][number];

/**
 * Maps a catalog item to our internal product format.
 * Skips combo items - only regular items are synced.
 */
function mapCatalogProduct(item: CatalogItem, categoryName: string): MappedCatalogProduct {
	return {
		idExterno: item.id.toString(),
		ativo: item.status === "ACTIVE",
		codigo: item.id.toString(),
		descricao: item.name,
		imagemCapaUrl: item.image?.image_url ?? null,
		precoVenda: item.price,
		unidade: item.unit_type ?? "UN",
		grupo: categoryName,
		ncm: "", // Not provided by CardapioWeb
		tipo: item.kind,
		status: item.status,
		quantidade: item.stock,
		controlaEstoque: item.active_stock_control,
	};
}

/**
 * Extracts unique products from the catalog.
 * Filters out combo items - only regular_item types are included.
 */
export function extractCatalogProducts(catalog: TGetCardapioWebCatalogOutput): MappedCatalogProduct[] {
	const productsMap = new Map<string, MappedCatalogProduct>();

	for (const category of catalog.categories) {
		for (const item of category.items) {
			// Skip combo items as per requirements
			if (item.kind === "combo") continue;

			const key = item.id.toString();
			if (!productsMap.has(key)) {
				productsMap.set(key, mapCatalogProduct(item, category.name));
			}
		}
	}

	return Array.from(productsMap.values());
}

/**
 * Maps a catalog option group to our internal addOn format.
 */
function mapCatalogAddOn(optionGroup: CatalogOptionGroup): MappedCatalogAddOn {
	return {
		idExterno: optionGroup.id.toString(),
		nome: optionGroup.name,
		minOpcoes: optionGroup.minimum_quantity,
		maxOpcoes: optionGroup.maximum_quantity,
		tipoEscolha: optionGroup.choice_type, // SINGLE, MULTIPLE, SUMMABLE
		tipoCalculoPreco: optionGroup.price_calculation_type, // SUM, MEAN, MAX, MIN
	};
}

/**
 * Extracts unique addOns from the catalog.
 * Scans all items' option_groups and deduplicates by id.
 */
export function extractCatalogAddOns(catalog: TGetCardapioWebCatalogOutput): MappedCatalogAddOn[] {
	const addOnsMap = new Map<string, MappedCatalogAddOn>();

	for (const category of catalog.categories) {
		for (const item of category.items) {
			// Skip combo items
			if (item.kind === "combo") continue;

			for (const optionGroup of item.option_groups) {
				const key = optionGroup.id.toString();
				if (!addOnsMap.has(key)) {
					addOnsMap.set(key, mapCatalogAddOn(optionGroup));
				}
			}
		}
	}

	return Array.from(addOnsMap.values());
}

/**
 * Maps a catalog option to our internal addOn option format.
 */
function mapCatalogAddOnOption(option: CatalogOption, optionGroupId: number): MappedCatalogAddOnOption {
	return {
		idExterno: option.id.toString(),
		addOnIdExterno: optionGroupId.toString(),
		nome: option.name,
		codigo: option.id.toString(),
		precoDelta: option.price,
		maxQtdePorItem: null,
		imagemCapaUrl: option.image?.image_url ?? null,
		status: option.status,
	};
}

/**
 * Extracts unique addOn options from the catalog.
 * Scans all items' option_groups' options and deduplicates by id.
 */
export function extractCatalogAddOnOptions(catalog: TGetCardapioWebCatalogOutput): MappedCatalogAddOnOption[] {
	const optionsMap = new Map<string, MappedCatalogAddOnOption>();

	for (const category of catalog.categories) {
		for (const item of category.items) {
			// Skip combo items
			if (item.kind === "combo") continue;

			for (const optionGroup of item.option_groups) {
				for (const option of optionGroup.options) {
					const key = option.id.toString();
					if (!optionsMap.has(key)) {
						optionsMap.set(key, mapCatalogAddOnOption(option, optionGroup.id));
					}
				}
			}
		}
	}

	return Array.from(optionsMap.values());
}

/**
 * Extracts product-to-addOn references from the catalog.
 * Creates the many-to-many relationships between products and their option groups.
 */
export function extractCatalogProductAddOnReferences(catalog: TGetCardapioWebCatalogOutput): MappedCatalogProductAddOnReference[] {
	const referencesMap = new Map<string, MappedCatalogProductAddOnReference>();

	for (const category of catalog.categories) {
		for (const item of category.items) {
			// Skip combo items
			if (item.kind === "combo") continue;

			for (const optionGroup of item.option_groups) {
				// Create a unique key for this product-addOn pair
				const key = `${item.id}_${optionGroup.id}`;
				if (!referencesMap.has(key)) {
					referencesMap.set(key, {
						produtoIdExterno: item.id.toString(),
						addOnIdExterno: optionGroup.id.toString(),
						ordem: optionGroup.index ?? 0,
					});
				}
			}
		}
	}

	return Array.from(referencesMap.values());
}

// -----------------------------------------------------------------------------
// MAIN EXTRACTION HELPER
// -----------------------------------------------------------------------------

export interface ExtractedCatalogData {
	rawCatalog: TGetCardapioWebCatalogOutput;
	products: MappedCatalogProduct[];
	addOns: MappedCatalogAddOn[];
	addOnOptions: MappedCatalogAddOnOption[];
	productAddOnReferences: MappedCatalogProductAddOnReference[];
}

/**
 * Extracts all entities from a catalog response.
 * This is the main function used by the cron job to get all mapped data.
 */
export function extractAllCatalogData(catalog: TGetCardapioWebCatalogOutput): ExtractedCatalogData {
	return {
		rawCatalog: catalog,
		products: extractCatalogProducts(catalog),
		addOns: extractCatalogAddOns(catalog),
		addOnOptions: extractCatalogAddOnOptions(catalog),
		productAddOnReferences: extractCatalogProductAddOnReferences(catalog),
	};
}
