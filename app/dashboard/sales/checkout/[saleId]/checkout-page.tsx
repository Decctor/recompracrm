"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { ConfirmSaleChange } from "@/components/Modals/Sales/ConfirmSaleChange";
import { DiscountApproval } from "@/components/Modals/Sales/DiscountApproval";
import { Button } from "@/components/ui/button";
import CashSessionBar from "@/components/CashSessions/CashSessionBar";
import MobileCheckoutBar from "../../_components/mobile-checkout-bar";
import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import type { TAutoEmissionExceptions } from "@/lib/fiscal/auto-emission-policy";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { confirmSale, updateSaleDraft } from "@/lib/mutations/pos";
import { appRoutes } from "@/lib/navigation/routes";
import { evaluateDiscount } from "@/lib/permissions/discounts";
import { useSaleDiscountContext } from "@/lib/queries/action-approvals";
import { usePOSGroups, usePOSProducts, useSaleDraft } from "@/lib/queries/pos";
import { useActiveSalesSession } from "@/lib/queries/sales-sessions";
import { mapSaleDraftToSaleState } from "@/lib/sales/map-sale-draft-to-sale-state";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TCashbackProgramEntity } from "@/services/drizzle/schema";
import { type TSaleFinancialAccountOption, type TUseSaleState, useSaleState } from "@/state-hooks/use-sale-state";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import CheckoutPanel from "../../new/components/CheckoutPanel";
import ProductBuilderModal from "../../new/components/ProductBuilderModal";
import SaleSuccessPanel from "../../new/components/SaleSuccessPanel";
import CategoriesBar from "../../new/components/composition/CategoriesBar";
import PaginationBlock from "../../new/components/composition/PaginationBlock";
import ProductsGridBlock from "../../new/components/composition/ProductsGridBlock";
import SearchBlock from "../../new/components/composition/SearchBlock";
import ViewModeToggle, { type ProductViewMode } from "../../new/components/composition/ViewModeToggle";
import PricingDriftBanner from "./components/PricingDriftBanner";

/**
 * Postura de abertura do catálogo, derivada de como o rascunho chegou.
 *
 * Um rascunho retomado do PDV é uma composição em andamento e abre com o catálogo à mão. Orçamento,
 * loja digital e hub chegam prontos: a tarefa ali é conferir e confirmar, não montar, e um catálogo
 * ocupando metade da tela é ruído para quem está num desk convertendo cotações.
 */
function resolveInitialCatalogState(rascunhoMetadados: unknown): boolean {
	if (!rascunhoMetadados || typeof rascunhoMetadados !== "object") return false;
	const origem = (rascunhoMetadados as { origem?: { tipo?: string } }).origem;
	return origem?.tipo === "POS";
}

function mapItemsToApi(saleState: TUseSaleState) {
	return saleState.state.itens.map((item) => ({
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
}

type CheckoutPageProps = {
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

export default function CheckoutPage({
	organizationId,
	saleId,
	organizationCashbackProgram,
	organizationConfiguration,
	organizationFinancialAccounts,
	organizationAutoFiscalEmission,
	organizationAutoFiscalCapable,
	autoEmissionExceptions,
	canEmitFiscal,
}: CheckoutPageProps) {
	const router = useRouter();
	const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
	const [searchValue, setSearchValue] = useState("");
	const [viewMode, setViewMode] = useState<ProductViewMode>("list");
	const [builderProduct, setBuilderProduct] = useState<TGetPOSProductsOutput["data"]["products"][number] | null>(null);
	const [isCheckoutSheetOpen, setIsCheckoutSheetOpen] = useState(false);
	const [isCatalogOpen, setIsCatalogOpen] = useState(false);

	const { data: draftData, isLoading, isError, error } = useSaleDraft({ saleId });
	const draft = draftData?.sale;
	const pricing = draftData?.pricing;
	const saleState = useSaleState({ organizationConfig: organizationConfiguration, contasFinanceiras: organizationFinancialAccounts });

	const {
		data: productsData,
		isLoading: productsLoading,
		isError: productsError,
		error: productsErrorData,
		filters,
		updateFilters,
	} = usePOSProducts();
	const { data: groupsData, isLoading: groupsLoading } = usePOSGroups();

	// Hidratação única por rascunho: refetches não descartam o carrinho que o operador já editou.
	const hydratedSaleIdRef = useRef<string | null>(null);
	const resetState = saleState.resetState;
	useEffect(() => {
		if (!draft) return;
		if (hydratedSaleIdRef.current === draft.id) return;
		if (draft.statusVenda !== "ORCAMENTO") return;
		hydratedSaleIdRef.current = draft.id;
		resetState(mapSaleDraftToSaleState(draft));
		setIsCatalogOpen(resolveInitialCatalogState(draft.rascunhoMetadados));
	}, [draft, resetState]);

	/**
	 * Divergência viva: o servidor diz quanto cada item vale hoje, e comparamos contra o carrinho em
	 * mãos, não contra o rascunho carregado. Assim "atualizar preços" limpa o bloqueio na hora e
	 * remover um item fora de catálogo também resolve, sem esperar refetch.
	 *
	 * Itens adicionados aqui não entram: nasceram do catálogo atual.
	 */
	const pricingDrift = useMemo(() => {
		if (!pricing) return null;
		const driftPorItemId = new Map(pricing.itens.map((item) => [item.itemId, item]));

		const linhas = saleState.state.itens
			.map((cartItem) => {
				const drift = cartItem.itemId ? driftPorItemId.get(cartItem.itemId) : undefined;
				if (!drift) return null;
				if (drift.indisponivel) return drift;
				const aindaDivergente = Math.abs(cartItem.valorUnitarioFinal - (drift.valorUnitarioAtual ?? 0)) > 0.01;
				return aindaDivergente ? { ...drift, valorUnitarioSalvo: cartItem.valorUnitarioFinal } : null;
			})
			.filter((linha): linha is NonNullable<typeof linha> => linha !== null);

		if (linhas.length === 0) return null;
		const algumIndisponivel = linhas.some((linha) => linha.indisponivel);
		return {
			itens: linhas,
			algumDivergente: true,
			algumIndisponivel,
			totalBrutoSalvo: linhas.reduce((sum, linha) => sum + linha.valorUnitarioSalvo * linha.quantidade, 0),
			totalBrutoAtual: algumIndisponivel ? null : linhas.reduce((sum, linha) => sum + (linha.valorUnitarioAtual ?? 0) * linha.quantidade, 0),
		};
	}, [pricing, saleState.state.itens]);

	const handleReprice = useCallback(() => {
		if (!pricingDrift) return;
		saleState.repriceItems(
			pricingDrift.itens
				.filter((item) => !item.indisponivel)
				.map((item) => ({
					itemId: item.itemId,
					valorUnitarioBase: item.valorUnitarioBaseAtual ?? 0,
					valorModificadores: item.valorModificadoresAtual ?? 0,
				})),
		);
		toast.success("Preços atualizados com o catálogo.");
	}, [pricingDrift, saleState]);

	// Turno de caixa: mesma regra do PDV — a venda se liga ao caixa aberto do vendedor.
	const salesSessionsConfig = organizationConfiguration.preferencias.sessoesVenda;
	const cashEnabled = !!salesSessionsConfig?.habilitado;
	const cashRequired = !!salesSessionsConfig?.obrigatorio;
	const {
		session: activeSession,
		sessions: openSessions,
		activeSessionId,
		setActiveSessionId,
		isLoading: cashLoading,
	} = useActiveSalesSession({ organizationId, enabled: cashEnabled });
	const cashBlockingConfirm = cashEnabled && cashRequired && !activeSession;

	// Teto de desconto: feedback imediato aqui, enforcement autoritativo na rota.
	const { data: discountContext } = useSaleDiscountContext({ vendedorId: saleState.state.vendedorId ?? null });
	const discountAuthority = discountContext?.authority ?? null;
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
	const [isChangeConfirmOpen, setIsChangeConfirmOpen] = useState(false);
	const [discountApproval, setDiscountApproval] = useState<{ id: string; valorBase: number; descontoTotal: number } | null>(null);
	useEffect(() => {
		if (!discountApproval) return;
		if (discountApproval.valorBase !== descontoAgregado.valorBase || discountApproval.descontoTotal !== descontoAgregado.descontoTotal) {
			setDiscountApproval(null);
		}
	}, [discountApproval, descontoAgregado]);

	const { mutate: confirm, isPending: isConfirming } = useMutation({
		mutationKey: ["confirm-sale", saleId],
		mutationFn: async (descontoAprovacaoId: string | null) => {
			// Itens e metadados precisam estar persistidos antes de confirmar: a confirmação lê o
			// rascunho gravado, não o payload. Se o PUT falhar, a confirmação nem chega a acontecer.
			await updateSaleDraft({
				id: saleId,
				vendedorId: saleState.state.vendedorId,
				vendedorNome: saleState.state.vendedorNome,
				entregaModalidade: saleState.state.entregaModalidade,
				entregaLocalizacaoId: saleState.state.entregaLocalizacaoId,
				comandaNumero: saleState.state.comandaNumero,
				observacoes: saleState.state.observacoes || null,
				descontosTotal: saleState.state.descontoGeral > 0 ? saleState.state.descontoGeral : null,
				acrescimosTotal: saleState.acrescimosTotal > 0 ? saleState.acrescimosTotal : null,
				cashbackResgate: saleState.state.cashbackResgate,
				cupomResgate: saleState.state.cupomResgate,
				emissaoFiscalAutomatica: saleState.state.emissaoFiscalAutomatica,
				rascunhoMetadados: {
					...(draft?.rascunhoMetadados as Record<string, unknown> | null),
					...saleState.getDraftMetadata(),
				},
				itens: mapItemsToApi(saleState),
			});

			return confirmSale({
				id: saleId,
				clienteId: saleState.state.cliente?.id ?? null,
				pagamentos: saleState.state.pagamentos.map((payment) => ({
					metodo: payment.metodo,
					valor: payment.valor,
					totalParcelas: payment.totalParcelas,
					efetivacaoTipo: payment.efetivacaoTipo,
					dataPrevisao: payment.dataPrevisao,
					observacoes: payment.observacoes,
					contaFinanceiraId: payment.contaFinanceiraId,
				})),
				cashbackResgate: saleState.state.cashbackResgate,
				cashbackProgramaId: organizationCashbackProgram?.id ?? null,
				sessaoVendaId: activeSession?.id ?? null,
				descontoAprovacaoId,
			});
		},
		onSuccess: (data) => {
			if (data.data.fiscal.status === "ERRO") {
				toast.warning(`Venda confirmada, mas a emissão fiscal falhou: ${data.data.fiscal.error}`);
			} else {
				toast.success(data.message);
			}
			setDiscountApproval(null);
			saleState.setSuccess({
				mode: "FINALIZADA",
				saleId,
				title: "Venda confirmada com sucesso",
				description: "O orçamento virou venda: pagamento registrado e financeiro lançado.",
				valorFinal: saleState.valorFinal,
				itemCount: saleState.itemCount,
				clienteNome: saleState.state.cliente?.nome ?? null,
				vendedorNome: saleState.state.vendedorNome ?? null,
				entregaModalidade: saleState.state.entregaModalidade,
				pagamentos: saleState.state.pagamentos.map((payment) => ({ metodo: payment.metodo, valor: payment.valor })),
				troco: saleState.troco,
				fiscal: {
					status: data.data.fiscal.status,
					error: data.data.fiscal.status === "ERRO" ? data.data.fiscal.error : null,
				},
			});
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	// Um CTA desabilitado sem explicação manda o operador procurar o problema no lugar errado.
	const finalizeBlockedReason = pricingDrift?.algumIndisponivel
		? "Remova os itens fora do catálogo para confirmar."
		: pricingDrift
			? "Atualize os preços para confirmar."
			: cashBlockingConfirm
				? "Nenhum caixa aberto para o vendedor desta venda."
				: null;

	const proceedFinalizeSale = () => {
		if (discountRequiresApproval && !discountApproval) {
			setIsDiscountApprovalOpen(true);
			return;
		}
		confirm(discountApproval?.id ?? null);
	};

	const handleFinalizeSale = () => {
		if (finalizeBlockedReason) {
			toast.error(finalizeBlockedReason);
			return;
		}
		if (saleState.trocoBloqueio) {
			toast.error(saleState.trocoBloqueio);
			return;
		}
		// Troco sem dinheiro recebido (excesso no cartão/PIX) é quase sempre valor digitado errado: confirma antes.
		if (saleState.troco > 0 && !saleState.trocoCobertoPorDinheiro) {
			setIsChangeConfirmOpen(true);
			return;
		}
		proceedFinalizeSale();
	};

	const handleSearchChange = useCallback(
		(value: string) => {
			setSearchValue(value);
			updateFilters({ search: value, page: 1 });
		},
		[updateFilters],
	);

	const handleGroupSelect = useCallback(
		(group: string | null) => {
			setSelectedGroup(group);
			updateFilters({ group, page: 1 });
		},
		[updateFilters],
	);

	const handleProductClick = useCallback(
		(product: TGetPOSProductsOutput["data"]["products"][number]) => {
			if (product.variantes.length > 0 || product.addOnsReferencias.length > 0) {
				setBuilderProduct(product);
				return;
			}
			saleState.addItem({
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
		},
		[saleState],
	);

	if (saleState.state.success) {
		return <SaleSuccessPanel success={saleState.state.success} onStartNewSale={() => router.push(appRoutes.sales.new())} />;
	}

	// A casca aparece antes dos dados: o operador reconhece a tela em vez de encarar um spinner.
	if (isLoading) {
		return (
			<div className="flex h-[calc(100dvh-7rem)] w-full flex-col gap-3 p-4 lg:h-[calc(100dvh-8rem)]">
				<div className="flex items-center gap-3">
					<div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
					<div className="flex flex-col gap-1.5">
						<div className="h-5 w-32 animate-pulse rounded bg-muted" />
						<div className="h-3.5 w-48 animate-pulse rounded bg-muted" />
					</div>
				</div>
				<div className="flex min-h-0 flex-1 gap-3">
					<div className="mx-auto w-full max-w-3xl rounded-xl border border-border/70 bg-muted/45 p-3">
						<div className="flex flex-col gap-2">
							{Array.from({ length: 6 }).map((_, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: esqueleto estático, sem identidade
								<div key={index} className="h-14 animate-pulse rounded-lg bg-muted" />
							))}
						</div>
					</div>
				</div>
			</div>
		);
	}
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!draft) return <ErrorComponent msg="Venda não encontrada." />;

	if (draft.statusVenda !== "ORCAMENTO") {
		return (
			<div className="flex h-[calc(100dvh-7rem)] w-full flex-col items-center justify-center gap-4 p-4 text-center lg:h-[calc(100dvh-8rem)]">
				<h2 className="text-lg font-black">ESTA VENDA JÁ FOI FINALIZADA</h2>
				<p className="text-sm text-muted-foreground">O orçamento #{draft.idExterno} não está mais em rascunho, então não há checkout a fazer.</p>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={() => router.push(appRoutes.sales.root())}>
						VER VENDAS
					</Button>
					<Button onClick={() => router.push(appRoutes.sales.new())}>NOVA VENDA</Button>
				</div>
			</div>
		);
	}

	const checkoutPanel = (
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
			onFinalizeSale={handleFinalizeSale}
			isFinalizingSale={isConfirming}
			hideDraftAction
			finalizeBlockedReason={finalizeBlockedReason}
			beforeActions={pricingDrift ? <PricingDriftBanner pricing={pricingDrift} onReprice={handleReprice} /> : null}
			cashSession={
				// Card do caixa dentro do checkout (coluna e Sheet), não numa barra no topo — ver new-sale-page.
				cashEnabled ? (
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
				) : null
			}
		/>
	);

	return (
		<div className="flex h-[calc(100dvh-7rem)] w-full flex-col gap-3 p-4 lg:h-[calc(100dvh-8rem)]">
			<div className="flex items-center gap-3">
				<Button variant="ghost" size="icon" onClick={() => router.push(appRoutes.sales.root())} aria-label="Voltar">
					<ArrowLeft className="h-5 w-5" />
				</Button>
				<div className="min-w-0 flex-1">
					<h1 className="text-xl font-black">CHECKOUT</h1>
					<p className="truncate text-sm text-muted-foreground">
						Orçamento #{draft.idExterno} · {formatToMoney(saleState.valorFinal)}
					</p>
				</div>
				<Button variant="outline" size="sm" className="gap-1.5" onClick={() => setIsCatalogOpen((open) => !open)}>
					{isCatalogOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
					{isCatalogOpen ? "OCULTAR CATÁLOGO" : "ADICIONAR ITENS"}
				</Button>
			</div>
			<div className="flex min-h-0 flex-1 gap-3">
				{isCatalogOpen ? (
					<div className="flex min-w-0 flex-1 flex-col gap-4 rounded-xl bg-background">
						<div className="flex shrink-0 flex-col gap-3">
							{/* Em telas estreitas a busca ocupa a linha inteira e os controles quebram para a linha
							    de baixo: dividir a mesma linha espremia o campo a poucos caracteres visíveis. */}
							<div className="flex flex-wrap items-center gap-2">
								<div className="w-full sm:w-auto sm:flex-1">
									<SearchBlock searchValue={searchValue} onSearchChange={handleSearchChange} isLoading={productsLoading} />
								</div>
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

						<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
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
				) : null}

				<div
					className={`hidden shrink-0 overflow-hidden rounded-xl border border-border/70 bg-muted/45 lg:block ${isCatalogOpen ? "w-[420px]" : "mx-auto w-full max-w-3xl"}`}
				>
					<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 h-full overflow-y-auto p-3">{checkoutPanel}</div>
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
							confirm(approvalRequestId);
						}}
					/>
				) : null}

				{isChangeConfirmOpen ? (
					<ConfirmSaleChange
						troco={saleState.troco}
						closeModal={() => setIsChangeConfirmOpen(false)}
						onConfirm={() => {
							setIsChangeConfirmOpen(false);
							proceedFinalizeSale();
						}}
					/>
				) : null}
			</div>
			<MobileCheckoutBar
				open={isCheckoutSheetOpen}
				onOpenChange={setIsCheckoutSheetOpen}
				itemCount={saleState.itemCount}
				total={saleState.valorFinal}
				icon={<ShoppingCart className="h-4 w-4" />}
				title="CHECKOUT"
				description="Confira itens e pagamentos e confirme a venda."
				ariaLabel={`Abrir checkout: ${saleState.itemCount} ${saleState.itemCount === 1 ? "item" : "itens"}, total ${formatToMoney(saleState.valorFinal)}`}
			>
				{checkoutPanel}
			</MobileCheckoutBar>
		</div>
	);
}
