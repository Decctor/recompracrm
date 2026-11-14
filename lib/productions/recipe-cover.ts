/**
 * Capa da receita: foto (`imagemCapaUrl`) quando houver; senão um ícone curado (`capaIcone`) sobre um
 * fundo tingido pela matiz `capaCor` (0–359). Receitas antigas não têm nada disso — a capa cai num
 * ícone padrão e numa matiz derivada do id, estável entre renders e telas.
 *
 * As chaves de ícone são nomes do lucide e viajam como dado; o mapa para componente fica em
 * `app/dashboard/production/_components/recipe-cover.tsx`. Uma chave desconhecida (ícone removido
 * da lista) cai no padrão em vez de quebrar a validação de receitas já salvas.
 */

export const RECIPE_COVER_ICONS = [
	"cooking-pot",
	"chef-hat",
	"ice-cream-cone",
	"ice-cream-bowl",
	"popsicle",
	"cake",
	"cake-slice",
	"cookie",
	"croissant",
	"donut",
	"dessert",
	"candy",
	"lollipop",
	"milk",
	"cup-soda",
	"coffee",
	"wine",
	"beer",
	"cherry",
	"citrus",
	"grape",
	"apple",
	"banana",
	"carrot",
	"salad",
	"soup",
	"pizza",
	"sandwich",
	"wheat",
	"egg",
	"beef",
	"drumstick",
	"ham",
	"fish",
	"nut",
	"bean",
	"vegan",
	"popcorn",
	"utensils",
] as const;
export type TRecipeCoverIcon = (typeof RECIPE_COVER_ICONS)[number];

export const DEFAULT_RECIPE_COVER_ICON: TRecipeCoverIcon = "cooking-pot";

/** Matizes oferecidas no seletor — espaçadas para não haver duas cores quase iguais lado a lado. */
export const RECIPE_COVER_HUES = [15, 40, 65, 100, 140, 180, 210, 240, 280, 315, 345] as const;

export function isRecipeCoverIcon(value: string | null | undefined): value is TRecipeCoverIcon {
	return !!value && (RECIPE_COVER_ICONS as readonly string[]).includes(value);
}

function hashToHue(seed: string) {
	let hash = 0;
	for (let index = 0; index < seed.length; index++) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
	return RECIPE_COVER_HUES[Math.abs(hash) % RECIPE_COVER_HUES.length];
}

export type TResolvedRecipeCover = {
	imagemCapaUrl: string | null;
	icone: TRecipeCoverIcon;
	matiz: number;
};

export function resolveRecipeCover(recipe: {
	id?: string | null;
	titulo?: string | null;
	imagemCapaUrl?: string | null;
	capaIcone?: string | null;
	capaCor?: number | null;
}): TResolvedRecipeCover {
	return {
		imagemCapaUrl: recipe.imagemCapaUrl ?? null,
		icone: isRecipeCoverIcon(recipe.capaIcone) ? recipe.capaIcone : DEFAULT_RECIPE_COVER_ICON,
		matiz: recipe.capaCor ?? hashToHue(recipe.id ?? recipe.titulo ?? ""),
	};
}
