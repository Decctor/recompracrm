"use client";

import { Sparkles, CalendarRange, Layers, ListChecks } from "lucide-react";
import { BUILDER_CATEGORIES, type TBuilderCategoryId } from "../helpers/categories";
import { useBuilderUi } from "./builder-provider";
import CategoryCard from "./category-card";

const CATEGORY_ICONS: Record<TBuilderCategoryId, typeof Sparkles> = {
	EVENT: Sparkles,
	SCHEDULE: CalendarRange,
	RFM: Layers,
	SURVEY: ListChecks,
};

export default function CategoryPicker() {
	const { selectedCategory, setSelectedCategory } = useBuilderUi();

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex flex-col">
				<h3 className="text-sm font-semibold tracking-tight">Como sua campanha será disparada?</h3>
				<p className="text-xs text-muted-foreground">
					Cada categoria tem um fluxo otimizado. Você poderá voltar e mudar a qualquer momento.
				</p>
			</div>
			<div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
				{BUILDER_CATEGORIES.map((category) => (
					<CategoryCard
						key={category.id}
						id={category.id}
						icon={CATEGORY_ICONS[category.id]}
						label={category.label}
						tagline={category.tagline}
						description={category.description}
						triggerCount={category.triggers.length}
						selected={selectedCategory === category.id}
						onClick={() => setSelectedCategory(category.id)}
					/>
				))}
			</div>
		</div>
	);
}
