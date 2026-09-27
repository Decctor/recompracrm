"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { TSalesChannelMatrixLink, TSalesChannelMatrixProduct, TSalesChannelMatrixVariant } from "@/lib/queries/sales-channels";
import { Link2, Link2Off, MoreHorizontal, Upload } from "lucide-react";
import { useState } from "react";
import IfoodLinkDetails from "./IfoodLinkDetails";
import LinkIfoodItem from "./LinkIfoodItem";
import PublishIfoodProduct from "./PublishIfoodProduct";

type IfoodNodeMenuProps = {
	merchantId: string;
	merchantLabel: string;
	product: TSalesChannelMatrixProduct;
	variant: TSalesChannelMatrixVariant | null;
	link: TSalesChannelMatrixLink | null;
	linkedItemIds: Set<string>;
	/** Algum nó deste produto (ele ou uma variante) já está vinculado neste merchant. */
	productHasLink: boolean;
};

/**
 * Ações de um nó na coluna de um merchant iFood. Vincular é por nó (produto sem variantes ou
 * variante); publicar é por PRODUTO (cria um item por variante de uma vez), então aparece também
 * na linha-pai, que por si não é vinculável.
 */
export default function IfoodNodeMenu({ merchantId, merchantLabel, product, variant, link, linkedItemIds, productHasLink }: IfoodNodeMenuProps) {
	const [open, setOpen] = useState<"link" | "publish" | "details" | null>(null);
	const hasActiveVariants = variant === null && product.variantes.some((entry) => entry.ativo);
	const nodeLabel = variant ? `${product.nome} · ${variant.nome}` : product.nome;
	// Publicar cria itens novos: só faz sentido enquanto nenhum nó do produto está vinculado —
	// senão a loja ganharia um item duplicado ao lado do que já sincroniza.
	const canPublish = !productHasLink;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label={`Ações no iFood para ${nodeLabel}`}
					className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<MoreHorizontal className="size-3.5" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-64">
					{link ? (
						<DropdownMenuItem onClick={() => setOpen("details")}>
							<Link2 />
							Ver vínculo
						</DropdownMenuItem>
					) : null}
					{!link && !hasActiveVariants ? (
						<DropdownMenuItem onClick={() => setOpen("link")}>
							<Link2 />
							Vincular a item do iFood
						</DropdownMenuItem>
					) : null}
					{canPublish ? (
						<DropdownMenuItem onClick={() => setOpen("publish")}>
							<Upload />
							{hasActiveVariants ? "Publicar variantes no iFood" : "Publicar no iFood"}
						</DropdownMenuItem>
					) : null}
					{link ? (
						<DropdownMenuItem variant="destructive" onClick={() => setOpen("details")}>
							<Link2Off />
							Desvincular…
						</DropdownMenuItem>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>

			{open === "link" ? (
				<LinkIfoodItem
					merchantId={merchantId}
					merchantLabel={merchantLabel}
					node={{ produtoId: product.id, produtoVarianteId: variant?.id ?? null, nome: nodeLabel }}
					linkedItemIds={linkedItemIds}
					closeModal={() => setOpen(null)}
				/>
			) : null}
			{open === "publish" ? (
				<PublishIfoodProduct
					merchantId={merchantId}
					merchantLabel={merchantLabel}
					produtoId={product.id}
					produtoNome={product.nome}
					closeModal={() => setOpen(null)}
				/>
			) : null}
			{open === "details" && link ? (
				<IfoodLinkDetails
					merchantId={merchantId}
					merchantLabel={merchantLabel}
					nodeLabel={nodeLabel}
					link={link}
					product={product}
					closeModal={() => setOpen(null)}
				/>
			) : null}
		</>
	);
}
