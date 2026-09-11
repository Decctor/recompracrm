"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import CashSessionBar from "@/components/CashSessions/CashSessionBar";
import MobileCheckoutBar from "../../_components/mobile-checkout-bar";
import { DiscountApproval } from "@/components/Modals/Sales/DiscountApproval";
import { getErrorMessage } from "@/lib/errors";
import type { TAutoEmissionExceptions } from "@/lib/fiscal/auto-emission-policy";
import { formatToMoney } from "@/lib/formatting";
import { editConfirmedSale } from "@/lib/mutations/pos";
import { evaluateDiscount } from "@/lib/permissions/discounts";
import { appRoutes } from "@/lib/navigation/routes";
import { mapSaleForEditToSaleState } from "@/lib/sales/map-sale-to-sale-state";
import { useSaleDiscountContext } from "@/lib/queries/action-approvals";
import { usePOSGroups, usePOSProducts, useSaleForEdit } from "@/lib/queries/pos";
import { useActiveSalesSession } from "@/lib/queries/sales-sessions";
import { SALES_FULFILLMENT_QUERY_KEY } from "@/lib/queries/sales-fulfillment";
import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import type { TPOSProductOrderingEnum } from "@/schemas/enums";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TCashbackProgramEntity } from "@/services/drizzle/schema";
import { type TSaleFinancialAccountOption, type TUseSaleState, useSaleState } from "@/state-hooks/use-sale-state";
import { isAxiosError } from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { toast } from "sonner";
import CheckoutPanel from "../../new/components/CheckoutPanel";
import ProductBuilderModal from "../../new/components/ProductBuilderModal";
import CategoriesBar from "../../new/components/composition/CategoriesBar";
import PaginationBlock from "../../new/components/composition/PaginationBlock";
import ProductOrderingSelect from "../../new/components/composition/ProductOrderingSelect";
import ProductsGridBlock from "../../new/components/composition/ProductsGridBlock";
import SearchBlock from "../../new/components/composition/SearchBlock";
import ViewModeToggle, { type ProductViewMode } from "../../new/components/composition/ViewModeToggle";

function mapItemsToApi(saleState: TUseSaleState, deletedItemIds: string[]) {
	const activeItems = saleState.state.itens.map((item) => ({
		id: item.itemId ?? null,
		produtoId: item.produtoId,
		produtoVarianteId: item.produtoVarianteId,
		nome: item.nome,
		codigo: item.codigo,
		imagemUrl: item.imagemUrl,
		quantidade: item.quantidade,
		valorUnitarioBase: item.valorUnitarioBase,
		valorModificadores: item.valorModificadores,
		valorUnitarioFinal: item.valorUnitarioFinal,
		valorTotalBruto: item.valorTotalBruto,
		valorDesconto: item.valorDesconto,
		valorTotalLiquido: item.valorTotalLiquido,
		modificadores: item.modificadores,
		observacoes: item.observacoes?.trim() || null,
	}));
	// Itens hidratados que saíram do carrinho viram linhas `deletar` (soft-delete no payload).
	const deletedItems = deletedItemIds.map((id) => ({
		id,
		deletar: true,
		produtoId: "-",
		produtoVarianteId: null,
		nome: "-",
		codigo: "-",
		imagemUrl: null,
		quantidade: 1,
		valorUnitarioBase: 0,
		valorModificadores: 0,
		valorUnitarioFinal: 0,
		valorTotalBruto: 0,
		valorDesconto: 0,
		valorTotalLiquido: 0,
		modificadores: [],
	}));
	return [...activeItems, ...deletedItems];
}

type EditSalePageProps = {
	organizationId: string;
	saleId: string;
	organizationCashbackProgram: TCashbackProgramEntity | null;
	organizationConfiguration: TOrganizationConfiguration;
	organizationFinancialAccounts: TSaleFinancialAccountOption[];
	organizationAutoFiscalEmission: boolean;
	organizationAutoFiscalCapable: boolean;
	autoEmissionExceptions: TAutoEmissionExceptions;
	canEmitFiscal: boolean;
};

export default function EditSalePage({
	organizationId,
	saleId,
	organizationCashbackProgram,
	organizationConfiguration,
	organizationFinancialAccounts,
	organizationAutoFiscalEmission,
	organizationAutoFiscalCapable,
	autoEmissionExceptions,
	canEmitFiscal,
}: EditSalePageProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
	const [searchValue, setSearchValue] = useState("");
	const [viewMode, setViewMode] = useState<ProductViewMode>("list");
	const [builderProduct, setBuilderProduct] = useState<TGetPOSProductsOutput["data"]["products"][number] | null>(null);
	const [isCheckoutSheetOpen, setIsCheckoutSheetOpen] = useState(false);
	const saleState = useSaleState({ organizationConfig: organizationConfiguration, contasFinanceiras: organizationFinancialAccounts });

	const { data: saleForEdit, isLoading, isError, error, queryKey: saleForEditQueryKey } = useSaleForEdit({ saleId });

	// Hidratação única por venda: o operador não perde o carrinho editado em refetches (ex.: após 409).
	const hydratedSaleIdRef = useRef<string | null>(null);
	const resetState = saleState.resetState;
	const methodsConfig = saleState.organizationPaymentMethodsConfig;
	useEffect(() => {
		if (!saleForEdit) return;
		if (hydratedSaleIdRef.current === saleForEdit.venda.id) return;
		if (saleForEdit.editabilidade.nivel !== "TOTAL") return;
		hydratedSaleIdRef.current = saleForEdit.venda.id;
		resetState(mapSaleForEditToSaleState(saleForEdit, { methodsConfig }));
	}, [saleForEdit, resetState, methodsConfig]);

	// IDs hidratados que saíram do carrinho → linhas `deletar` no submit.
	const deletedItemIds = useMemo(() => {
		if (!saleForEdit) return [];
		const currentIds = new Set(saleState.state.itens.map((item) => item.itemId).filter((id): id is string => !!id));
		return saleForEdit.venda.itens.map((item) => item.id).filter((id) => !currentIds.has(id));
	}, [saleForEdit, saleState.state.itens]);

	// Sessão de venda: NÃO bloqueia a edição (diferente da criação); se houver caixa aberto, os
	// splits IMEDIATA regenerados caem nele.
	const salesSessionsConfig = organizationConfiguration.preferencias.sessoesVenda;
	const cashEnabled = !!salesSessionsConfig?.habilitado;
	const {
		session: activeSession,
		sessions: openSessions,
		activeSessionId,
		setActiveSessionId,
		isLoading: cashLoading,
	} = useActiveSalesSession({
		organizationId,
		enabled: cashEnabled,
	});

	// Teto de desconto: mesma fiação da criação (feedback imediato; enforcement na rota).
	const { data: discountContext } = useSaleDiscountContext({ vendedorId: saleState.state.vendedorId ?? null });
	const discountAuthority = discountContext?.authority ?? null;
	// Mesmo recorte do servidor (`/api/pos/sales/edit`): itens de recompensa ficam fora da base e
	// do desconto avaliados contra o teto — o resgate tem regras próprias, como o cashback.
	const descontoAgregado = useMemo(
		() => ({
			valorBase: saleState.subtotalAvaliavel,
			descontoTotal: saleState.state.descontoGeral + saleState.totalDescontoItensAvaliavel,
		}),
		[saleState.subtotalAvaliavel, saleState.state.descontoGeral, saleState.totalDescontoItensAvaliavel],
	);
	const discountRequiresApproval = discountAuthority
		? evaluateDiscount({ authority: discountAuthority, ...descontoAgregado }) === "REQUER_APROVACAO"
		: false;
	const [isDiscountApprovalOpen, setIsDiscountApprovalOpen] = useState(false);
	const [discountApproval, setDiscountApproval] = useState<{ id: string; valorBase: number; descontoTotal: number } | null>(null);
	useEffect(() => {
		if (!discountApproval) return;
		if (discountApproval.valorBase !== descontoAgregado.valorBase || discountApproval.descontoTotal !== descontoAgregado.descontoTotal) {
			setDiscountApproval(null);
		}
	}, [discountApproval, descontoAgregado]);

	const invalidateSaleQueries = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: ["sales"] });
		void queryClient.invalidateQueries({ queryKey: ["sales-by-id", saleId] });
		void queryClient.invalidateQueries({ queryKey: SALES_FULFILLMENT_QUERY_KEY });
		void queryClient.invalidateQueries({ queryKey: ["sales-fulfillment-by-id", saleId] });
		void queryClient.invalidateQueries({ queryKey: saleForEditQueryKey });
	}, [queryClient, saleId, saleForEditQueryKey]);

	const { mutate: saveEdit, isPending: isSavingEdit } = useMutation({
		mutationKey: ["edit-confirmed-sale", saleId],
		mutationFn: editConfirmedSale,
		onSuccess: (data) => {
			invalidateSaleQueries();
			toast.success(data.message);
			if (data.data.fiscal?.status === "ERRO") {
				toast.warning(`Venda atualizada, mas a emissão fiscal falhou: ${data.data.fiscal.error}`);
			}
			router.push(appRoutes.sales.root());
		},
		onError: (mutationError, variables) => {
			// Conflito de concorrência: a venda mudou entre o carregamento e o salvar. Recarrega os
			// dados de referência (o carrinho editado permanece intacto) para o operador revisar.
			if (isAxiosError(mutationError) && mutationError.response?.status === 409) {
				void queryClient.invalidateQueries({ queryKey: saleForEditQueryKey });
				toast.error(getErrorMessage(mutationError), {
					description: "Os dados da venda foram recarregados. Revise as alterações e salve novamente.",
				});
				return;
			}
			const message = getErrorMessage(mutationError);
			// Cupom invalidado pelo carrinho editado: oferece o retry com consentimento explícito.
			if (message.includes("Remova o cupom")) {
				toast.error(message, {
					action: {
						label: "REMOVER CUPOM E SALVAR",
						onClick: () => saveEdit({ ...variables, removerCupom: true }),
					},
				});
				return;
			}
			toast.error(message);
		},
	});

	const submitEdit = (descontoAprovacaoId: string | null) => {
		if (!saleForEdit) return;
		saveEdit({
			saleId,
			valorTotalEsperado: saleForEdit.venda.valorTotal,
			descontoAprovacaoId,
			vendedorId: saleState.state.vendedorId,
			vendedorNome: saleState.state.vendedorNome,
			entregaModalidade: saleState.state.entregaModalidade,
			entregaLocalizacaoId: saleState.state.entregaLocalizacaoId,
			comandaNumero: saleState.state.comandaNumero,
			observacoes: saleState.state.observacoes || null,
			descontosTotal: saleState.state.descontoGeral,
			acrescimosTotal: saleState.acrescimosTotal,
			taxaEntrega: saleState.state.taxaEntrega,
			sessaoVendaId: activeSession?.id ?? null,
			pagamentos: saleState.state.pagamentos.map((payment) => ({
				metodo: payment.metodo,
				valor: payment.valor,
				totalParcelas: payment.totalParcelas,
				efetivacaoTipo: payment.efetivacaoTipo,
				dataPrevisao: payment.dataPrevisao,
				observacoes: payment.observacoes,
			})),
			emissaoFiscalAutomatica: saleState.state.emissaoFiscalAutomatica,
			itens: mapItemsToApi(saleState, deletedItemIds),
		});
	};

	const handleSaveEdit = () => {
		if (!saleState.isReadyForFinalize) {
			toast.error("Complete entrega e pagamento do restante para salvar as alterações.");
			return;
		}
		if (discountRequiresApproval && !discountApproval) {
			setIsDiscountApprovalOpen(true);
			return;
		}
		submitEdit(discountApproval?.id ?? null);
	};

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

	const handleOrderingChange = (ordering: TPOSProductOrderingEnum) => {
		updateFilters({ ordering, page: 1 });
	};

	const addItem = saleState.addItem;
	const handleProductClick = useCallback(
		(product: TGetPOSProductsOutput["data"]["products"][number]) => {
			const hasVariants = product.variantes.length > 0;
			const hasAddOns = product.addOnsReferencias.length > 0;
			if (hasVariants || hasAddOns) {
				setBuilderProduct(product);
				return;
			}

			addItem({
				tempId: crypto.randomUUID(),
				produtoId: product.id,
				produtoVarianteId: null,
				nome: product.nome,
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
			toast.success(`${product.nome} adicionado ao carrinho.`);
		},
		[addItem],
	);

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!saleForEdit) return <ErrorComponent msg="Venda não encontrada." />;

	// Política do servidor manda: rascunhos vão para o checkout; os demais tetos explicam o porquê.
	if (saleForEdit.editabilidade.nivel !== "TOTAL") {
		return (
			<div className="flex h-[calc(100dvh-7rem)] w-full items-center justify-center p-4 lg:h-[calc(100dvh-8rem)]">
				<div className="w-full max-w-lg rounded-2xl border bg-card p-6 flex flex-col gap-4 items-center text-center">
					<div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
						<PencilLine className="h-6 w-6 text-muted-foreground" />
					</div>
					<h2 className="text-xl font-black">Esta venda não pode ser editada</h2>
					<p className="text-sm text-muted-foreground">
						{saleForEdit.editabilidade.motivos[0] ?? "A edição não está disponível para o estado atual da venda."}
					</p>
					<div className="flex items-center gap-2">
						{saleForEdit.editabilidade.rascunho ? (
							<Button asChild>
								<Link href={appRoutes.sales.checkout(saleId)}>ABRIR CHECKOUT DO RASCUNHO</Link>
							</Button>
						) : null}
						<Button variant="outline" asChild>
							<Link href={appRoutes.sales.details(saleId)}>VER DETALHES DA VENDA</Link>
						</Button>
					</div>
				</div>
			</div>
		);
	}

	const editContext = {
		idExterno: saleForEdit.venda.idExterno,
		pagamentosEfetivados: saleForEdit.pagamentos.efetivadas.map((payment) => ({
			id: payment.id,
			metodo: payment.metodo,
			valor: payment.valor,
			parcela: payment.parcela,
			totalParcelas: payment.totalParcelas,
		})),
	};

	// Card do caixa dentro do checkout (coluna e Sheet), não numa barra no topo — ver new-sale-page.
	const cashSessionCard = cashEnabled ? (
		<CashSessionBar
			compact
			session={activeSession}
			sessions={openSessions}
			activeSessionId={activeSessionId}
			onSessionChange={setActiveSessionId}
			isLoading={cashLoading}
			requireOpeningFloat={!!salesSessionsConfig?.exigirFundoTroco}
			blindCount={!!salesSessionsConfig?.conferenciaCega}
		/>
	) : null;

	return (
		<div className="flex h-[calc(100dvh-7rem)] w-full flex-col gap-3 p-4 lg:h-[calc(100dvh-8rem)]">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Voltar">
						<ArrowLeft className="w-5 h-5" />
					</Button>
					<div>
						<h1 className="text-xl font-black">EDITAR VENDA</h1>
						<p className="text-sm text-muted-foreground">
							Pedido #{saleForEdit.venda.idExterno} · Total atual: {formatToMoney(saleForEdit.venda.valorTotal)}
						</p>
					</div>
				</div>
			</div>
			<div className="flex flex-1 min-h-0 gap-3">
				<div className="flex min-w-0 flex-1 flex-col gap-4 rounded-xl bg-background">
					<div className="shrink-0 flex flex-col gap-3">
						{/* Em telas estreitas a busca ocupa a linha inteira e os controles quebram para a linha
						    de baixo: dividir a mesma linha espremia o campo a poucos caracteres visíveis. */}
						<div className="flex flex-wrap items-center gap-2">
							<div className="w-full sm:w-auto sm:flex-1">
								<SearchBlock searchValue={searchValue} onSearchChange={handleSearchChange} isLoading={productsLoading} />
							</div>
							<ProductOrderingSelect value={filters.ordering} onChange={handleOrderingChange} disabled={productsLoading} />
							<ViewModeToggle value={viewMode} onChange={setViewMode} />
						</div>
						{/* A barra se encarrega do próprio skeleton: montá-la só depois do load a inseria na
						    árvore com a grade já pintada e empurrava tudo para baixo. */}
						<CategoriesBar
							groups={groupsData?.groups ?? []}
							selectedGroup={selectedGroup}
							onGroupSelect={handleGroupSelect}
							isLoadingGroups={groupsLoading}
							isFilteringProducts={productsLoading}
						/>
					</div>

					<div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 pr-1">
						<ProductsGridBlock
							productsData={productsData}
							isLoading={productsLoading}
							isError={productsError}
							error={productsErrorData}
							viewMode={viewMode}
							orgTracksStock={organizationConfiguration.preferencias.rastreamentoEstoque}
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
				</div>

				<div className="hidden w-[420px] shrink-0 overflow-hidden rounded-xl border border-border/70 bg-muted/45 lg:block">
					<div className="h-full overflow-y-auto p-3 scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
						<CheckoutPanel
							organizationCashbackProgram={organizationCashbackProgram}
							saleState={saleState}
							sellerEditable={activeSession?.politica !== "VENDEDOR_UNICO"}
							organizationAutoFiscalEmission={organizationAutoFiscalEmission}
							organizationAutoFiscalCapable={organizationAutoFiscalCapable}
							autoEmissionExceptions={autoEmissionExceptions}
							canEmitFiscal={canEmitFiscal}
							discountAuthority={discountAuthority}
							onCreateDraft={() => {}}
							onFinalizeSale={handleSaveEdit}
							isFinalizingSale={isSavingEdit}
							edit={editContext}
							cashSession={cashSessionCard}
						/>
					</div>
				</div>

				{builderProduct ? <ProductBuilderModal product={builderProduct} onAddToCart={saleState.addItem} onClose={() => setBuilderProduct(null)} /> : null}

				{isDiscountApprovalOpen ? (
					<DiscountApproval
						vendedorId={saleState.state.vendedorId ?? null}
						valorBase={descontoAgregado.valorBase}
						descontoTotal={descontoAgregado.descontoTotal}
						limiteSolicitante={
							discountAuthority && discountAuthority.limiteTipo
								? { tipo: discountAuthority.limiteTipo, valor: discountAuthority.limiteValor }
								: discountAuthority && !discountAuthority.aplicar
									? { tipo: null, valor: 0 }
									: null
						}
						closeModal={() => setIsDiscountApprovalOpen(false)}
						onApproved={(approvalRequestId) => {
							setDiscountApproval({ id: approvalRequestId, ...descontoAgregado });
							setIsDiscountApprovalOpen(false);
							submitEdit(approvalRequestId);
						}}
					/>
				) : null}
			</div>
			<MobileCheckoutBar
				open={isCheckoutSheetOpen}
				onOpenChange={setIsCheckoutSheetOpen}
				itemCount={saleState.itemCount}
				total={saleState.valorFinal}
				icon={<PencilLine className="h-4 w-4" />}
				title="EDITAR VENDA"
				description="Revise itens e pagamentos e salve as alterações."
				ariaLabel={`Abrir edição da venda: ${saleState.itemCount} ${saleState.itemCount === 1 ? "item" : "itens"}, total ${formatToMoney(saleState.valorFinal)}`}
			>
				<CheckoutPanel
					organizationCashbackProgram={organizationCashbackProgram}
					saleState={saleState}
					sellerEditable={activeSession?.politica !== "VENDEDOR_UNICO"}
					organizationAutoFiscalEmission={organizationAutoFiscalEmission}
					organizationAutoFiscalCapable={organizationAutoFiscalCapable}
					autoEmissionExceptions={autoEmissionExceptions}
					canEmitFiscal={canEmitFiscal}
					discountAuthority={discountAuthority}
					onCreateDraft={() => {}}
					onFinalizeSale={handleSaveEdit}
					isFinalizingSale={isSavingEdit}
					edit={editContext}
					cashSession={cashSessionCard}
				/>
			</MobileCheckoutBar>
		</div>
	);
}
