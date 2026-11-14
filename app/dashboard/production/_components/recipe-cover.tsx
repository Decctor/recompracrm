import { resolveRecipeCover, type TRecipeCoverIcon } from "@/lib/productions/recipe-cover";
import { cn } from "@/lib/utils";
import {
	Apple,
	Banana,
	Bean,
	Beef,
	Beer,
	Cake,
	CakeSlice,
	Candy,
	Carrot,
	ChefHat,
	Cherry,
	Citrus,
	Coffee,
	Cookie,
	CookingPot,
	Croissant,
	CupSoda,
	Dessert,
	Donut,
	Drumstick,
	Egg,
	FilePenLine,
	Fish,
	Grape,
	Ham,
	IceCreamBowl,
	IceCreamCone,
	Lollipop,
	type LucideIcon,
	Milk,
	Nut,
	Pizza,
	Popcorn,
	Popsicle,
	Salad,
	Sandwich,
	Soup,
	Utensils,
	Vegan,
	Wheat,
	Wine,
} from "lucide-react";
import type { CSSProperties } from "react";

export const RECIPE_COVER_ICON_COMPONENTS: Record<TRecipeCoverIcon, LucideIcon> = {
	"cooking-pot": CookingPot,
	"chef-hat": ChefHat,
	"ice-cream-cone": IceCreamCone,
	"ice-cream-bowl": IceCreamBowl,
	popsicle: Popsicle,
	cake: Cake,
	"cake-slice": CakeSlice,
	cookie: Cookie,
	croissant: Croissant,
	donut: Donut,
	dessert: Dessert,
	candy: Candy,
	lollipop: Lollipop,
	milk: Milk,
	"cup-soda": CupSoda,
	coffee: Coffee,
	wine: Wine,
	beer: Beer,
	cherry: Cherry,
	citrus: Citrus,
	grape: Grape,
	apple: Apple,
	banana: Banana,
	carrot: Carrot,
	salad: Salad,
	soup: Soup,
	pizza: Pizza,
	sandwich: Sandwich,
	wheat: Wheat,
	egg: Egg,
	beef: Beef,
	drumstick: Drumstick,
	ham: Ham,
	fish: Fish,
	nut: Nut,
	bean: Bean,
	vegan: Vegan,
	popcorn: Popcorn,
	utensils: Utensils,
};

type TRecipeCoverSource = {
	id?: string | null;
	titulo?: string | null;
	imagemCapaUrl?: string | null;
	capaIcone?: string | null;
	capaCor?: number | null;
};

/** Variáveis de cor da capa: fundo claro e traço escuro da mesma matiz (invertidos no tema escuro). */
export function recipeCoverStyle(matiz: number): CSSProperties {
	return { "--recipe-cover-hue": matiz } as CSSProperties;
}
export const RECIPE_COVER_TONE_CLASSES =
	"bg-[oklch(0.93_0.045_var(--recipe-cover-hue))] text-[oklch(0.42_0.09_var(--recipe-cover-hue))] dark:bg-[oklch(0.32_0.05_var(--recipe-cover-hue))] dark:text-[oklch(0.86_0.08_var(--recipe-cover-hue))]";

/**
 * Capa da receita: a foto quando existe; senão o ícone curado sobre a cor da receita. Sem receita
 * (produção manual), um ícone neutro. Preenche o contêiner — quem usa define tamanho e raio.
 */
export function RecipeCover({
	recipe,
	className,
	iconClassName,
}: {
	recipe: TRecipeCoverSource | null | undefined;
	className?: string;
	iconClassName?: string;
}) {
	if (!recipe) {
		return (
			<div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
				<FilePenLine className={cn("size-1/2 max-h-12 max-w-12", iconClassName)} strokeWidth={1.75} />
			</div>
		);
	}

	const cover = resolveRecipeCover(recipe);
	if (cover.imagemCapaUrl) {
		return (
			<div className={cn("overflow-hidden bg-muted", className)}>
				<img src={cover.imagemCapaUrl} alt={recipe.titulo ?? "Capa da receita"} className="h-full w-full object-cover" />
			</div>
		);
	}

	const Icon = RECIPE_COVER_ICON_COMPONENTS[cover.icone];
	return (
		<div className={cn("flex items-center justify-center", RECIPE_COVER_TONE_CLASSES, className)} style={recipeCoverStyle(cover.matiz)}>
			<Icon className={cn("size-1/2 max-h-14 max-w-14", iconClassName)} strokeWidth={1.75} />
		</div>
	);
}
