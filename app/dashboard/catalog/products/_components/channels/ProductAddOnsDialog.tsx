"use client";

import type { TGetProductsOutputById } from "@/app/api/products/route";
import LinkProductAddOn from "@/components/Modals/Products/AddOns/LinkProductAddOn";
import ProductStateAddOnsBlock from "@/components/Modals/Products/Blocks/AddOns";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { useProductAddOns, useProductById } from "@/lib/queries/products";
import type { TSalesChannelMatrixProduct } from "@/lib/queries/sales-channels";
import { cn } from "@/lib/utils";
import { useProductAddOnsSectionEditor } from "@/state-hooks/use-product-section-editor";
import { useQueryClient } from "@tanstack/react-query";
import { Layers, LinkIcon } from "lucide-react";
import { useMemo, useState } from "react";

/**
 * Adicionais de um produto, editados a partir da grade de canais. É o MESMO bloco e o MESMO
 * editor da página do produto (`AddOnsInformation`), com save próprio: adicionais não são por
 * canal, então não entram no rascunho da matriz — misturar as duas mutations num apply bar criaria
 * estados parciais impossíveis de explicar. O diálogo carrega o produto completo por conta própria;
 * a grade só tinha o suficiente para o chip.
 */
export default function ProductAddOnsDialog({
	produtoId,
	produtoNome,
	closeModal,
}: {
	produtoId: string;
	produtoNome: string;
	closeModal: () => void;
}) {
	const { data: product, isLoading, error } = useProductById({ id: produtoId });

	if (!product) {
		return (
			<ResponsiveMenu
				mode="read-only"
				menuTitle="ADICIONAIS"
				menuDescription={produtoNome}
				menuCancelButtonText="FECHAR"
				stateIsLoading={isLoading}
				stateError={error ? getErrorMessage(error) : null}
				closeMenu={closeModal}
				dialogVariant="lg"
				drawerVariant="lg"
			>
				<div />
			</ResponsiveMenu>
		);
	}

	return <ProductAddOnsDialogEditor product={product} closeModal={closeModal} />;
}

// O editor é um componente à parte para que o hook de rascunho nasça com o produto já carregado.
function ProductAddOnsDialogEditor({ product, closeModal }: { product: TGetProductsOutputById; closeModal: () => void }) {
	const queryClient = useQueryClient();
	const callbacks = useMemo(
		() => ({
			onMutate: () => {
				queryClient.cancelQueries({ queryKey: ["product-by-id", product.id] });
			},
			onSettled: () => {
				queryClient.invalidateQueries({ queryKey: ["product-by-id", product.id] });
				// O chip da grade conta as referências: precisa refletir o que acabou de ser salvo.
				queryClient.invalidateQueries({ queryKey: ["sales-channel-matrix"] });
				queryClient.invalidateQueries({ queryKey: ["product-add-ons"] });
			},
		}),
		[product.id, queryClient],
	);
	const editor = useProductAddOnsSectionEditor({ product, callbacks: { ...callbacks, onSuccess: closeModal } });
	const [linkAddOnModalIsOpen, setLinkAddOnModalIsOpen] = useState(false);

	const { data: registryAddOns } = useProductAddOns();
	const usageByAddOnId = useMemo(() => {
		if (!registryAddOns) return {};
		return Object.fromEntries(registryAddOns.map((addOn) => [addOn.id, addOn.produtos.length]));
	}, [registryAddOns]);

	const linkedAddOnIds = editor.state.productAddOns.filter((addOn) => !addOn.deletar && addOn.id).map((addOn) => addOn.id as string);

	return (
		<ResponsiveMenu
			menuTitle="ADICIONAIS"
			menuDescription={`Grupos de adicionais de ${product.nome}. Valem em todos os canais; o mínimo obrigatório pode ser relaxado por canal em Configurações.`}
			menuActionButtonText="SALVAR ADICIONAIS"
			menuCancelButtonText="CANCELAR"
			menuActionButtonDisabled={!editor.isDirty}
			actionFunction={editor.apply}
			actionIsLoading={editor.isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="lg"
			drawerVariant="lg"
		>
			<div className="flex w-full flex-col gap-3 px-1 py-2">
				<div className="flex justify-end">
					<Button type="button" variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setLinkAddOnModalIsOpen(true)}>
						<LinkIcon className="h-3.5 w-3.5" />
						VINCULAR EXISTENTE
					</Button>
				</div>
				<ProductStateAddOnsBlock
					embedded
					addOns={editor.state.productAddOns}
					usageByAddOnId={usageByAddOnId}
					addProductAddOn={editor.addProductAddOn}
					updateProductAddOn={editor.updateProductAddOn}
					removeProductAddOn={editor.removeProductAddOn}
					moveProductAddOn={editor.moveProductAddOn}
					addProductAddOnOption={editor.addProductAddOnOption}
					updateProductAddOnOption={editor.updateProductAddOnOption}
					removeProductAddOnOption={editor.removeProductAddOnOption}
				/>
			</div>
			{linkAddOnModalIsOpen ? (
				// Vincular grava na hora (rota própria); o editor re-hidrata quando não há rascunho sujo.
				<LinkProductAddOn
					productId={product.id}
					linkedAddOnIds={linkedAddOnIds}
					closeModal={() => setLinkAddOnModalIsOpen(false)}
					callbacks={callbacks}
				/>
			) : null}
		</ResponsiveMenu>
	);
}

/** O chip da coluna "Adicionais": contagem, nomes no título, e abre o diálogo. */
export function ProductAddOnsChip({ product }: { product: TSalesChannelMatrixProduct }) {
	const [isOpen, setIsOpen] = useState(false);
	const groups = product.addOnsReferencias.map((reference) => reference.grupo);
	const activeGroups = groups.filter((group) => group.ativo !== false);
	const label = activeGroups.length === 0 ? "Nenhum" : activeGroups.length === 1 ? "1 grupo" : `${activeGroups.length} grupos`;
	const title = groups.length ? groups.map((group) => group.internoNome || group.nome).join(", ") : "Sem grupos de adicionais. Clique para adicionar.";

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				title={title}
				aria-label={`Adicionais de ${product.nome}: ${label}`}
				className={cn(
					"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-medium tracking-wide transition-colors hover:bg-muted",
					activeGroups.length > 0 ? "border-primary/30 bg-primary/5 text-foreground" : "border-dashed border-border text-muted-foreground",
				)}
			>
				<Layers className="size-3" />
				{label}
			</button>
			{isOpen ? <ProductAddOnsDialog produtoId={product.id} produtoNome={product.nome} closeModal={() => setIsOpen(false)} /> : null}
		</>
	);
}
