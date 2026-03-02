"use client";

import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { getErrorMessage } from "@/lib/errors";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { createAndConfirmSale, createSaleDraft, updateSaleDraft } from "@/lib/mutations/pos";
import { usePOSGroups, usePOSProducts } from "@/lib/queries/pos";
import type { TGetPOSProductsOutput } from "@/pages/api/pos/products";
import type { TCashbackProgramEntity } from "@/services/drizzle/schema";
import { type TUseSaleState, getDefaultSaleState, useSaleState } from "@/state-hooks/use-sale-state";
import { useMutation } from "@tanstack/react-query";
import { Check, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import CheckoutPanel from "./components/CheckoutPanel";
import CompositionPanel from "./components/CompositionPanel";
import ProductBuilderModal from "./components/ProductBuilderModal";
import PaginationBlock from "./components/composition/PaginationBlock";
import ProductsGridBlock from "./components/composition/ProductsGridBlock";

function mapItemsToApi(saleState: TUseSaleState) {
	return saleState.state.itens.map((item) => ({
		produtoId: item.produtoId,
		produtoVarianteId: item.produtoVarianteId,
		nome: item.nome,
		quantidade: item.quantidade,
		valorUnitarioBase: item.valorUnitarioBase,
		valorModificadores: item.valorModificadores,
		valorUnitarioFinal: item.valorUnitarioFinal,
		valorTotalBruto: item.valorTotalBruto,
		valorDesconto: item.valorDesconto,
		valorTotalLiquido: item.valorTotalLiquido,
		modificadores: item.modificadores,
	}));
}

type NewSalePageProps = {
	organizationCashbackProgram: TCashbackProgramEntity | null;
};
export default function NewSalePage({ organizationCashbackProgram }: NewSalePageProps) {
	const isMobile = useIsMobile();
	const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
	const [searchValue, setSearchValue] = useState("");
	const [builderProduct, setBuilderProduct] = useState<TGetPOSProductsOutput["data"]["products"][number] | null>(null);
	const [isCheckoutDrawerOpen, setIsCheckoutDrawerOpen] = useState(false);
	const saleState = useSaleState();

	const { mutate: createDraft, isPending: isCreatingDraft } = useMutation({
		mutationKey: ["create-sale-draft"],
		mutationFn: createSaleDraft,
		onSuccess: async (data) => {
			try {
				await updateSaleDraft({
					id: data.data.saleId,
					vendedorId: saleState.state.vendedorId,
					vendedorNome: saleState.state.vendedorNome,
					entregaModalidade: saleState.state.entregaModalidade,
					entregaLocalizacaoId: saleState.state.entregaLocalizacaoId,
					comandaNumero: saleState.state.comandaNumero,
					observacoes: saleState.state.observacoes || null,
					descontosTotal: saleState.state.descontoGeral,
					acrescimosTotal: saleState.state.acrescimoGeral,
					rascunhoMetadados: saleState.getDraftMetadata(),
				});
				saleState.setSuccess({
					mode: "ORCAMENTO",
					title: "Orçamento criado com sucesso",
					description: "Você pode iniciar uma nova venda agora.",
				});
			} catch (error) {
				toast.error(getErrorMessage(error));
			}
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	const { mutate: finalizeSale, isPending: isFinalizingSale } = useMutation({
		mutationKey: ["create-and-confirm-sale"],
		mutationFn: createAndConfirmSale,
		onSuccess: () => {
			saleState.setSuccess({
				mode: "FINALIZADA",
				title: "Venda finalizada com sucesso",
				description: "Pagamento confirmado e venda concluída.",
			});
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	const { data: groupsData, isLoading: groupsLoading } = usePOSGroups();
	const {
		data: productsData,
		isLoading: productsLoading,
		isError: productsError,
		error: productsErrorData,
		filters,
		updateFilters,
	} = usePOSProducts({
		initialFilters: { page: 1, search: searchValue, group: selectedGroup },
	});

	const handleGroupSelect = (group: string | null) => {
		setSelectedGroup(group);
		updateFilters({ group, page: 1 });
	};

	const handleSearchChange = (value: string) => {
		setSearchValue(value);
		updateFilters({ search: value, page: 1 });
	};

	const handleProductClick = (product: TGetPOSProductsOutput["data"]["products"][number]) => {
		const hasVariants = product.variantes.length > 0;
		const hasAddOns = product.addOnsReferencias.length > 0;
		const isComplex = hasVariants || hasAddOns;
		if (isComplex) {
			setBuilderProduct(product);
			return;
		}

		saleState.addItem({
			tempId: crypto.randomUUID(),
			produtoId: product.id,
			produtoVarianteId: null,
			nome: product.descricao,
			codigo: product.codigo,
			imagemUrl: product.imagemCapaUrl,
			quantidade: 1,
			valorUnitarioBase: product.precoVenda ?? 0,
			valorModificadores: 0,
			valorUnitarioFinal: product.precoVenda ?? 0,
			valorTotalBruto: product.precoVenda ?? 0,
			valorDesconto: 0,
			valorTotalLiquido: product.precoVenda ?? 0,
			modificadores: [],
		});
		toast.success(`${product.descricao} adicionado ao carrinho.`);
	};

	const handleCreateDraft = () => {
		if (!saleState.isReadyForDraft) {
			toast.error("Preencha o carrinho para criar o orçamento.");
			return;
		}

		createDraft({
			clienteId: saleState.state.cliente?.id ?? null,
			vendedorId: saleState.state.vendedorId,
			vendedorNome: saleState.state.vendedorNome,
			entregaModalidade: saleState.state.entregaModalidade,
			entregaLocalizacaoId: saleState.state.entregaLocalizacaoId,
			comandaNumero: saleState.state.comandaNumero,
			observacoes: saleState.state.observacoes || null,
			descontosTotal: saleState.state.descontoGeral,
			acrescimosTotal: saleState.state.acrescimoGeral,
			rascunhoMetadados: saleState.getDraftMetadata(),
			itens: mapItemsToApi(saleState),
		});
	};

	const handleFinalizeSale = () => {
		if (!saleState.isReadyForFinalize) {
			toast.error("Complete entrega e pagamento para finalizar a venda.");
			return;
		}

		finalizeSale({
			clienteId: saleState.state.cliente?.id ?? null,
			vendedorId: saleState.state.vendedorId,
			vendedorNome: saleState.state.vendedorNome,
			entregaModalidade: saleState.state.entregaModalidade,
			entregaLocalizacaoId: saleState.state.entregaLocalizacaoId,
			comandaNumero: saleState.state.comandaNumero,
			observacoes: saleState.state.observacoes || null,
			descontosTotal: saleState.state.descontoGeral,
			acrescimosTotal: saleState.state.acrescimoGeral,
			rascunhoMetadados: saleState.getDraftMetadata(),
			pagamentos: saleState.state.pagamentos.map((payment) => ({
				metodo: payment.metodo,
				valor: payment.valor,
				parcela: payment.parcela,
				totalParcelas: payment.totalParcelas,
			})),
			cashbackResgate: saleState.state.cashbackResgate,
			itens: mapItemsToApi(saleState),
		});
	};

	if (saleState.state.success) {
		return (
			<div className="w-full h-[calc(100vh-8rem)] flex items-center justify-center p-4">
				<div className="w-full max-w-lg rounded-2xl border bg-card p-6 flex flex-col gap-4 items-center text-center">
					<div className="h-12 w-12 rounded-full bg-green-500/15 flex items-center justify-center">
						<Check className="h-6 w-6 text-green-600" />
					</div>
					<h2 className="text-xl font-black">{saleState.state.success.title}</h2>
					<p className="text-sm text-muted-foreground">{saleState.state.success.description}</p>
					<Button
						onClick={() => {
							saleState.clearSuccess();
							saleState.resetState(getDefaultSaleState());
						}}
					>
						NOVA VENDA
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full h-[calc(100vh-8rem)] flex gap-4 p-4">
			<div className="hidden lg:block w-64 shrink-0">
				{groupsLoading ? (
					<LoadingComponent />
				) : (
					<CompositionPanel
						groups={groupsData?.groups ?? []}
						selectedGroup={selectedGroup}
						onGroupSelect={handleGroupSelect}
						searchValue={searchValue}
						onSearchChange={handleSearchChange}
						isLoading={productsLoading}
					/>
				)}
			</div>

			<div className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto pr-1 pb-20 lg:pb-0">
				<div className="lg:hidden shrink-0">
					<CompositionPanel
						groups={groupsData?.groups ?? []}
						selectedGroup={selectedGroup}
						onGroupSelect={handleGroupSelect}
						searchValue={searchValue}
						onSearchChange={handleSearchChange}
						isLoading={productsLoading}
					/>
				</div>

				<ProductsGridBlock
					productsData={productsData}
					isLoading={productsLoading}
					isError={productsError}
					error={productsErrorData}
					onProductClick={handleProductClick}
				/>

				{productsData ? (
					<PaginationBlock
						currentPage={productsData.currentPage}
						totalPages={productsData.totalPages}
						isLoading={productsLoading}
						onPrevious={() => updateFilters({ page: Math.max(1, filters.page - 1) })}
						onNext={() => updateFilters({ page: Math.min(productsData.totalPages, filters.page + 1) })}
					/>
				) : null}
			</div>

			<div className="hidden lg:block w-[420px] shrink-0 overflow-y-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
				<CheckoutPanel
					organizationCashbackProgram={organizationCashbackProgram}
					saleState={saleState}
					onCreateDraft={handleCreateDraft}
					onFinalizeSale={handleFinalizeSale}
					isCreatingDraft={isCreatingDraft}
					isFinalizingSale={isFinalizingSale}
				/>
			</div>

			{isMobile ? (
				<div className="fixed bottom-4 right-4 z-50 lg:hidden">
					<Drawer open={isCheckoutDrawerOpen} onOpenChange={setIsCheckoutDrawerOpen}>
						<DrawerTrigger asChild>
							<Button className="rounded-full shadow-lg px-4">
								<ShoppingCart className="w-4 h-4 mr-2" /> CHECKOUT ({saleState.itemCount})
							</Button>
						</DrawerTrigger>
						<DrawerContent className="h-[90vh]">
							<DrawerHeader>
								<DrawerTitle>Checkout</DrawerTitle>
								<DrawerDescription>Finalize ou salve como orçamento.</DrawerDescription>
							</DrawerHeader>
							<div className="overflow-y-auto pb-4">
								<CheckoutPanel
									organizationCashbackProgram={organizationCashbackProgram}
									saleState={saleState}
									onCreateDraft={handleCreateDraft}
									onFinalizeSale={handleFinalizeSale}
									isCreatingDraft={isCreatingDraft}
									isFinalizingSale={isFinalizingSale}
								/>
							</div>
						</DrawerContent>
					</Drawer>
				</div>
			) : null}

			{builderProduct ? <ProductBuilderModal product={builderProduct} onAddToCart={saleState.addItem} onClose={() => setBuilderProduct(null)} /> : null}
		</div>
	);
}
