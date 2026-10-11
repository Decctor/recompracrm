"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces } from "@/lib/formatting";
import { updateProductMainSupplier } from "@/lib/mutations/products";
import { MAIN_SUPPLIER_SUGGESTION_WINDOW_MONTHS } from "@/lib/products/main-supplier-shared";
import { useProductMainSupplierSuggestions } from "@/lib/queries/products";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type TMainSupplierAssignment = { productId: string; fornecedorId: string };

// Uma chamada por fornecedor sugerido; `onlyIfEmpty` garante que nada já atribuído seja trocado,
// mesmo que outro usuário tenha escolhido um fornecedor depois que a lista foi carregada.
async function applyMainSupplierSuggestions(assignments: TMainSupplierAssignment[]) {
	const productIdsBySupplier = new Map<string, string[]>();
	for (const assignment of assignments) {
		productIdsBySupplier.set(assignment.fornecedorId, [...(productIdsBySupplier.get(assignment.fornecedorId) ?? []), assignment.productId]);
	}
	const results = await Promise.all(
		[...productIdsBySupplier.entries()].map(([fornecedorId, productIds]) => updateProductMainSupplier({ productIds, fornecedorId, onlyIfEmpty: true })),
	);
	const updatedCount = results.reduce((total, result) => total + result.data.updatedIds.length, 0);
	const skippedCount = results.reduce((total, result) => total + result.data.skippedCount, 0);
	return { updatedCount, skippedCount };
}

type SuggestMainSuppliersProps = {
	closeModal: () => void;
	callbacks?: {
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/**
 * Atribuição em lote do fornecedor principal a partir do histórico de compras. Lista só produtos
 * SEM fornecedor principal; o usuário revisa, desmarca o que não quer e aplica — nada é gravado sozinho.
 */
export default function SuggestMainSuppliers({ closeModal, callbacks }: SuggestMainSuppliersProps) {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, error, page, updatePage } = useProductMainSupplierSuggestions();
	// Desmarcados (e não marcados): a sugestão vem marcada por padrão e o usuário tira o que discordar.
	const [deselectedProductIds, setDeselectedProductIds] = useState<Set<string>>(new Set());

	const suggestions = data?.suggestions ?? [];
	const selectedAssignments = suggestions
		.filter((suggestion) => !deselectedProductIds.has(suggestion.produto.id))
		.map((suggestion) => ({ productId: suggestion.produto.id, fornecedorId: suggestion.sugestao.fornecedor.id }));

	const { mutate, isPending } = useMutation({
		mutationKey: ["apply-main-supplier-suggestions"],
		mutationFn: applyMainSupplierSuggestions,
		onSuccess: ({ updatedCount, skippedCount }) => {
			callbacks?.onSuccess?.();
			toast.success(
				`Fornecedor principal definido em ${updatedCount} produto(s).${skippedCount > 0 ? ` ${skippedCount} ignorado(s) por já terem fornecedor principal.` : ""}`,
			);
		},
		onError: (err) => {
			callbacks?.onError?.(err);
			toast.error(getErrorMessage(err));
		},
		onSettled: async () => {
			callbacks?.onSettled?.();
			setDeselectedProductIds(new Set());
			// Os aplicados saem da lista: volta ao início para não cair numa página que deixou de existir.
			updatePage(1);
			await queryClient.invalidateQueries({ queryKey: ["product-main-supplier-suggestions"] });
			await queryClient.invalidateQueries({ queryKey: ["product-main-supplier-candidates"] });
			await queryClient.invalidateQueries({ queryKey: ["products"] });
		},
	});

	function toggleProduct(productId: string, checked: boolean) {
		setDeselectedProductIds((prev) => {
			const next = new Set(prev);
			if (checked) next.delete(productId);
			else next.add(productId);
			return next;
		});
	}

	const allSelected = suggestions.length > 0 && selectedAssignments.length === suggestions.length;

	return (
		<ResponsiveMenu
			menuTitle="SUGERIR FORNECEDORES PRINCIPAIS"
			menuDescription={`Produtos sem fornecedor principal, com o fornecedor que mais os vendeu para você nos últimos ${MAIN_SUPPLIER_SUGGESTION_WINDOW_MONTHS} meses. Revise e aplique: produtos que já têm fornecedor principal nunca são alterados.`}
			menuActionButtonText={`APLICAR SELECIONADOS (${selectedAssignments.length})`}
			menuActionButtonDisabled={selectedAssignments.length === 0}
			menuCancelButtonText="FECHAR"
			actionFunction={() => mutate(selectedAssignments)}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="lg"
		>
			{data && data.total === 0 ? (
				<p className="w-full py-6 text-center text-sm italic text-muted-foreground">
					Nenhuma sugestão: todos os produtos com compras efetivadas já têm fornecedor principal, ou as compras não têm fornecedor vinculado.
				</p>
			) : null}
			{suggestions.length > 0 ? (
				<div className="flex w-full flex-col gap-3">
					<GeneralPaginationComponent
						activePage={page}
						queryLoading={isLoading}
						selectPage={(nextPage) => {
							setDeselectedProductIds(new Set());
							updatePage(nextPage);
						}}
						totalPages={data?.totalPages ?? 0}
						itemsMatchedText={`${data?.total ?? 0} produto(s) com sugestão.`}
						itemsShowingText={`Mostrando ${suggestions.length} produto(s).`}
					/>
					<label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-medium">
						<Checkbox
							checked={allSelected}
							onCheckedChange={(checked) =>
								setDeselectedProductIds(checked === true ? new Set() : new Set(suggestions.map((suggestion) => suggestion.produto.id)))
							}
						/>
						SELECIONAR TODOS DA PÁGINA
					</label>
					<div className="flex flex-col divide-y divide-border rounded-lg border border-border">
						{suggestions.map(({ produto, sugestao, fornecedoresCandidatos }) => {
							const checked = !deselectedProductIds.has(produto.id);
							return (
								<label key={produto.id} className="flex w-full cursor-pointer items-start gap-3 px-3 py-2.5">
									<Checkbox className="mt-0.5" checked={checked} onCheckedChange={(value) => toggleProduct(produto.id, value === true)} />
									<div className="flex min-w-0 grow flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-3">
										<div className="flex min-w-0 flex-col">
											<span className="truncate text-sm font-medium">{produto.nome}</span>
											<span className="text-xs text-muted-foreground">
												{produto.codigo}
												{produto.grupo ? ` · ${produto.grupo}` : ""}
											</span>
										</div>
										<div className="flex min-w-0 items-start gap-1.5 md:max-w-[55%]">
											<ArrowRight className="mt-0.5 hidden h-3.5 w-3.5 shrink-0 text-muted-foreground md:block" />
											<div className="flex min-w-0 flex-col">
												<div className="flex flex-wrap items-center gap-1.5">
													<Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
													<span className="truncate text-sm font-medium">{sugestao.fornecedor.nome}</span>
													{fornecedoresCandidatos > 1 ? (
														<Chip.Root size="xs" variant="warning">
															<Chip.Label caps weight="semibold">
																{fornecedoresCandidatos} fornecedores
															</Chip.Label>
														</Chip.Root>
													) : null}
													{!sugestao.fornecedor.ativo ? (
														<Chip.Root size="xs" variant="muted">
															<Chip.Label caps weight="semibold">
																Inativo
															</Chip.Label>
														</Chip.Root>
													) : null}
												</div>
												<span className="text-xs text-muted-foreground">
													{sugestao.comprasRecentes} compra(s) em {MAIN_SUPPLIER_SUGGESTION_WINDOW_MONTHS} meses ·{" "}
													{formatDecimalPlaces(sugestao.participacao * 100, 0, 0)}% das compras
													{sugestao.dataUltimaCompra ? ` · última em ${formatDateAsLocale(sugestao.dataUltimaCompra)}` : ""}
												</span>
											</div>
										</div>
									</div>
								</label>
							);
						})}
					</div>
				</div>
			) : null}
		</ResponsiveMenu>
	);
}
