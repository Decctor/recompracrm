"use client";

import type { TGetProductsOutputById } from "@/app/api/products/route";
import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import ProductStateGeneralBlock from "@/components/Modals/Products/Blocks/General";
import RecountProduct from "@/components/Modals/Internal/StockRecount/RecountProduct";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { DataList } from "@/components/ui/data-list";
import { formatDecimalPlaces } from "@/lib/formatting";
import { useProductCoreSectionEditor } from "@/state-hooks/use-product-section-editor";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardList, LayoutGrid, Package } from "lucide-react";
import { useState } from "react";

type ProductGeneralInformationProps = {
	product: TGetProductsOutputById;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/**
 * Dados cadastrais do produto, editáveis no lugar — o rascunho é da seção inteira e só vai ao
 * servidor pela barra de aplicar.
 *
 * O estoque é a exceção: com rastreamento ativo o saldo tem livro-razão e lotes atrás dele, então
 * ele aparece em leitura com o atalho de RECONTAR (que passa pela rota de recontagem, consumindo
 * lotes por FEFO) em vez de virar um campo qualquer do formulário.
 */
export default function ProductGeneralInformation({ product, callbacks }: ProductGeneralInformationProps) {
	const queryClient = useQueryClient();
	const [recountModalIsOpen, setRecountModalIsOpen] = useState(false);
	const editor = useProductCoreSectionEditor({ product, callbacks });

	const draftTracksStock = editor.state.rastreamentoEstoqueAtivo;
	// O produto só tem saldo rastreável depois que o flag existe no servidor — recontar um
	// rascunho ainda não aplicado não teria o que ajustar.
	const serverTracksStock = !!product.rastreamentoEstoqueAtivo;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<LayoutGrid className="h-4 w-4 min-h-4 min-w-4" />
				</Section.Icon>
				<Section.Title>INFORMAÇÕES GERAIS DO PRODUTO</Section.Title>
			</Section.Header>
			<Section.Body>
				<ProductStateGeneralBlock
					embedded
					showPricing={false}
					productId={product.id}
					product={editor.state}
					updateProduct={editor.updateProduct}
					updateProductImageHolder={editor.updateProductImageHolder}
				/>

				<div className="flex w-full flex-col gap-3">
					<h2 className="text-xs leading-none tracking-tight">ESTOQUE</h2>
					<div className="flex w-full items-center justify-center">
						<CheckboxInput
							checked={draftTracksStock}
							labelTrue="RASTREAR ESTOQUE"
							labelFalse="RASTREAR ESTOQUE"
							handleChange={(value) => editor.updateProduct({ rastreamentoEstoqueAtivo: value })}
						/>
					</div>
					{draftTracksStock ? (
						serverTracksStock ? (
							<div className="flex w-full flex-col gap-1.5">
								<div className="flex w-full items-center justify-between gap-2">
									<DataList.Line
										icon={<Package className="h-4 w-4" />}
										label="QUANTIDADE"
										value={product.quantidade != null ? formatDecimalPlaces(product.quantidade) : "NÃO INFORMADO"}
									/>
									<Button variant="ghost" size="xs" className="flex items-center gap-1" onClick={() => setRecountModalIsOpen(true)}>
										<ClipboardList className="h-4 w-4 min-h-4 min-w-4" />
										RECONTAR
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									O saldo muda apenas por movimentações e recontagens, para o histórico de estoque continuar fechando.
								</p>
							</div>
						) : (
							<p className="text-xs text-muted-foreground">Aplique as alterações para habilitar a recontagem de estoque deste produto.</p>
						)
					) : (
						<NumberInput
							label="QUANTIDADE EM ESTOQUE"
							value={editor.state.quantidade ?? null}
							placeholder="Preencha aqui a quantidade em estoque do produto."
							handleChange={(value) => editor.updateProduct({ quantidade: value })}
						/>
					)}
				</div>

				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />

				{recountModalIsOpen ? (
					<RecountProduct
						productId={product.id}
						closeModal={() => setRecountModalIsOpen(false)}
						callbacks={{
							onSuccess: () => {
								callbacks?.onSettled?.();
								queryClient.invalidateQueries({ queryKey: ["products-stock"] });
								queryClient.invalidateQueries({ queryKey: ["product-stock-transactions"] });
								queryClient.invalidateQueries({ queryKey: ["stock-recount-rows"] });
							},
						}}
					/>
				) : null}
			</Section.Body>
		</Section.Root>
	);
}
