"use client";

import { BookOpenText } from "lucide-react";
import dynamic from "next/dynamic";
import { parseNumberedSteps, type TProductionById } from "../helpers/production-detail";
import { PanelEmptyState } from "./panel-empty-state";

// Mesmo renderizador do `ProductionRecipePreparationMethodViewer`: react-markdown fica fora do bundle
// até o modo de preparo aparecer.
const MarkdownViewer = dynamic(() => import("@/components/Inputs/MarkdownViewer").then((mod) => mod.MarkdownViewer), {
	ssr: false,
	loading: () => <div className="h-5 w-full animate-pulse rounded bg-muted/40" aria-hidden="true" />,
});

/**
 * Modo de preparo da receita. Uma lista numerada simples vira cartões de passo (leitura à distância,
 * no tablet da bancada); qualquer outro markdown é renderizado como está.
 */
export default function PreparationMethod({ production }: { production: TProductionById }) {
	const recipe = production.receita;
	const markdown = recipe?.modoPreparo?.trim();

	if (!recipe) return <PanelEmptyState icon={BookOpenText} text="Produção manual, sem receita. Não há modo de preparo para mostrar." />;
	if (!markdown) return <PanelEmptyState icon={BookOpenText} text="Nenhum modo de preparo cadastrado para esta receita." />;

	const steps = parseNumberedSteps(markdown);

	return (
		<>
			<div className="flex flex-col gap-1 px-1 py-0.5">
				<span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Modo de preparo</span>
				<span className="text-base font-bold">{recipe.titulo}</span>
			</div>
			{steps ? (
				<ol className="flex flex-col gap-1.5">
					{steps.map((step, index) => (
						<li key={`${index}-${step}`} className="flex gap-3 rounded-lg bg-muted/60 p-2.5">
							<span className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-bold">
								{index + 1}
							</span>
							<MarkdownViewer value={step} className="[--typeset-leading:1.45] [--typeset-size:15px]" />
						</li>
					))}
				</ol>
			) : (
				<div className="px-1">
					<MarkdownViewer value={markdown} />
				</div>
			)}
		</>
	);
}
