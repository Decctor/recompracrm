"use client";

import CashSessionBar from "@/components/CashSessions/CashSessionBar";
import CashSessionGate from "@/components/CashSessions/CashSessionGate";
import ControlClient from "@/components/Modals/Clients/ControlClient";
import { ConfirmSaleChange } from "@/components/Modals/Sales/ConfirmSaleChange";
import { DiscountApproval } from "@/components/Modals/Sales/DiscountApproval";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TQuotePermissions } from "@/components/Chats/Quotes/config";
import type { TAutoEmissionExceptions } from "@/lib/fiscal/auto-emission-policy";
import { createAndConfirmSale, createSaleDraft, updateSaleDraft } from "@/lib/mutations/pos";
import { evaluateDiscount } from "@/lib/permissions/discounts";
import { useSaleDiscountContext } from "@/lib/queries/action-approvals";
import { usePOSGroups, usePOSProducts } from "@/lib/queries/pos";
import { fetchClientContext } from "@/lib/queries/clients/context";
import { getOrganizationOpenQuotesQueryKey } from "@/lib/queries/sales";
import { useActiveSalesSession } from "@/lib/queries/sales-sessions";
import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import type { TPOSProductOrderingEnum } from "@/schemas/enums";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TCashbackProgramEntity } from "@/services/drizzle/schema";
import { type TSaleFinancialAccountOption, type TUseSaleState, getDefaultSaleState, useSaleState } from "@/state-hooks/use-sale-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import CheckoutPanel from "./components/CheckoutPanel";
import OpenQuotesPill from "./components/OpenQuotesPill";
import ProductBuilderModal from "./components/ProductBuilderModal";
import SaleSuccessPanel from "./components/SaleSuccessPanel";
import CategoriesBar from "./components/composition/CategoriesBar";
import PaginationBlock from "./components/composition/PaginationBlock";
import ProductOrderingSelect from "./components/composition/ProductOrderingSelect";
import ProductsGridBlock from "./components/composition/ProductsGridBlock";
import SearchBlock from "./components/composition/SearchBlock";
import ViewModeToggle, { type ProductViewMode } from "./components/composition/ViewModeToggle";
import MobileCheckoutBar from "../_components/mobile-checkout-bar";
import ClientContextPanel from "./components/context/ClientContextPanel";
import ClientContextSheet from "./components/context/ClientContextSheet";

function mapItemsToApi(saleState: TUseSaleState) {
	return saleState.state.itens.map((item) => ({
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

function getSaleSuccessSnapshot(saleState: TUseSaleState) {
	return {
		valorFinal: saleState.valorFinal,
		itemCount: saleState.itemCount,
		clienteNome: saleState.state.cliente?.nome ?? null,
		vendedorNome: saleState.state.vendedorNome ?? null,
		entregaModalidade: saleState.state.entregaModalidade,
		pagamentos: saleState.state.pagamentos.map((payment) => ({ metodo: payment.metodo, valor: payment.valor })),
		troco: saleState.troco,
	};
}

type NewSalePageProps = {
	organizationId: string;
	organizationCashbackProgram: TCashbackProgramEntity | null;
	organizationConfiguration: TOrganizationConfiguration;
	organizationFinancialAccounts: TSaleFinancialAccountOption[];
	organizationAutoFiscalEmission: boolean;
	organizationAutoFiscalCapable: boolean;
	autoEmissionExceptions: TAutoEmissionExceptions;
	canEmitFiscal: boolean;
	canConfigureFiscal?: boolean;
	/** `vendas.visualizar` — gate da fila de orçamentos em aberto da organização. */
	canViewSales: boolean;
	quotePermissions: TQuotePermissions;
};
export default function NewSalePage({
	organizationId,
	organizationCashbackProgram,
	organizationConfiguration,
	organizationFinancialAccounts,
	organizationAutoFiscalEmission,
	organizationAutoFiscalCapable,
	autoEmissionExceptions,
	canEmitFiscal,
	canConfigureFiscal,
	canViewSales,
	quotePermissions,
}: NewSalePageProps) {
	const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
	const [searchValue, setSearchValue] = useState("");
	const [viewMode, setViewMode] = useState<ProductViewMode>("list");
	const [builderProduct, setBuilderProduct] = useState<TGetPOSProductsOutput["data"]["products"][number] | null>(null);
	const [isCheckoutSheetOpen, setIsCheckoutSheetOpen] = useState(false);
	// Foco do checkout (desktop): clicar dentro da coluna a expande de 420px para 640px e esmaece o
	// catálogo; clicar no scrim do catálogo ou Esc devolve sem acionar um controle por baixo.
	const [isCheckoutFocused, setIsCheckoutFocused] = useState(false);
	const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
	const [isContextSheetOpen, setIsContextSheetOpen] = useState(false);
	const [isEditingClient, setIsEditingClient] = useState(false);
	// No mobile o contexto vive num Sheet: fecha antes de abrir o menu de edição e reabre ao sair.
	const [restoreContextSheet, setRestoreContextSheet] = useState(false);
	const saleState = useSaleState({ organizationConfig: organizationConfiguration, contasFinanceiras: organizationFinancialAccounts });

	// Sessões de venda (caixa): resolve a sessão aberta do vendedor selecionado (escopo OPERADOR).
	const salesSessionsConfig = organizationConfiguration.preferencias.sessoesVenda;
	const cashEnabled = !!salesSessionsConfig?.habilitado;
	const cashRequired = !!salesSessionsConfig?.obrigatorio;
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
	useEffect(() => {
		if (activeSession?.vendedorPadrao && (activeSession.politica === "VENDEDOR_UNICO" || !saleState.state.vendedorId)) {
			saleState.setVendedor(activeSession.vendedorPadrao.id, activeSession.vendedorPadrao.nome);
		}
	}, [activeSession?.id, activeSession?.vendedorPadrao, saleState.state.vendedorId, saleState.setVendedor]);

	const linkedClient = saleState.state.cliente;
	const linkedClientId = linkedClient?.id ?? null;

	// Controle de desconto: autoridade da identidade avaliada (vendedor selecionado) para feedback
	// imediato; o enforcement autoritativo acontece na rota de finalização.
	const { data: discountContext } = useSaleDiscountContext({ vendedorId: saleState.state.vendedorId ?? null });
	const discountAuthority = discountContext?.authority ?? null;
	const cupomManual = saleState.state.cupomResgate?.validacaoModo === "MANUAL" ? saleState.state.cupomResgate.valorDesconto : 0;
	const descontoAgregado = useMemo(
		() => ({
			valorBase: saleState.subtotalAvaliavel,
			descontoTotal: saleState.state.descontoGeral + saleState.totalDescontoItensAvaliavel + cupomManual,
		}),
		[saleState.subtotalAvaliavel, saleState.state.descontoGeral, saleState.totalDescontoItensAvaliavel, cupomManual],
	);
	const discountRequiresApproval = discountAuthority
		? evaluateDiscount({ authority: discountAuthority, ...descontoAgregado }) === "REQUER_APROVACAO"
		: false;
	const [isDiscountApprovalOpen, setIsDiscountApprovalOpen] = useState(false);
	const [isChangeConfirmOpen, setIsChangeConfirmOpen] = useState(false);
	// Aprovação concedida fica atrelada aos valores aprovados: mudou o carrinho/desconto, invalida.
	const [discountApproval, setDiscountApproval] = useState<{ id: string; valorBase: number; descontoTotal: number } | null>(null);
	useEffect(() => {
		if (!discountApproval) return;
		if (discountApproval.valorBase !== descontoAgregado.valorBase || discountApproval.descontoTotal !== descontoAgregado.descontoTotal) {
			setDiscountApproval(null);
		}
	}, [discountApproval, descontoAgregado]);

	// Unique product ids in the basket — drives cross-sell, stable against quantity changes.
	const basketProductIds = useMemo(() => [...new Set(saleState.state.itens.map((item) => item.produtoId))], [saleState.state.itens]);

	// O contexto do cliente nasce fechado e só abre pelo card de vínculo: abrir sozinho a cada
	// vínculo roubava largura do catálogo justamente no momento de bipar os itens. Desvincular
	// força o fechamento para o painel não reabrir mostrando o cliente errado no próximo vínculo.
	useEffect(() => {
		if (!linkedClientId) {
			setIsContextPanelOpen(false);
			setIsContextSheetOpen(false);
		}
	}, [linkedClientId]);

	// Esc desfaz o foco do checkout; ignora eventos já consumidos (modais Radix fecham com Esc).
	useEffect(() => {
		if (!isCheckoutFocused) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !event.defaultPrevented) setIsCheckoutFocused(false);
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isCheckoutFocused]);

	const queryClient = useQueryClient();

	// Edição do cliente vinculado sem sair do POS: reusa o mesmo menu do módulo de clientes.
	// No mobile o contexto é um Sheet, que precisa sair da frente antes do menu abrir.
	const handleOpenClientEdit = useCallback(() => {
		setRestoreContextSheet(isContextSheetOpen);
		setIsContextSheetOpen(false);
		setIsEditingClient(true);
	}, [isContextSheetOpen]);

	const handleCloseClientEdit = useCallback(() => {
		setIsEditingClient(false);
		setRestoreContextSheet(false);
		if (restoreContextSheet) setIsContextSheetOpen(true);
	}, [restoreContextSheet]);

	const setSaleClient = saleState.setCliente;
	const handleClientEdited = useCallback(async () => {
		if (!linkedClientId) return;
		void queryClient.invalidateQueries({ queryKey: ["client-by-id", linkedClientId] });
		try {
			// O carrinho carrega uma cópia de nome/telefone: recarrega o contexto e propaga.
			const context = await queryClient.fetchQuery({
				queryKey: ["client-context", linkedClientId],
				queryFn: () => fetchClientContext(linkedClientId),
				staleTime: 0,
			});
			if (context?.cliente) setSaleClient({ id: linkedClientId, nome: context.cliente.nome, telefone: context.cliente.telefone });
		} catch {
			// O cliente já foi atualizado no servidor; falhar o recarregamento não invalida a venda.
		}
	}, [linkedClientId, queryClient, setSaleClient]);

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
					acrescimosTotal: saleState.acrescimosTotal,
					cashbackResgate: saleState.state.cashbackResgate,
					cupomResgate: saleState.state.cupomResgate,
					recompensaResgate: saleState.state.recompensaResgate
						? { recompensaId: saleState.state.recompensaResgate.recompensaId, programaId: saleState.state.recompensaResgate.programaId }
						: null,
					rascunhoMetadados: saleState.getDraftMetadata(),
					emissaoFiscalAutomatica: saleState.state.emissaoFiscalAutomatica,
				});
				saleState.setSuccess({
					mode: "ORCAMENTO",
					saleId: data.data.saleId,
					title: "Orçamento criado com sucesso",
					description: "O pedido foi salvo e já pode ser acompanhado.",
					...getSaleSuccessSnapshot(saleState),
					cashbackAcumulado: null,
					fiscal: null,
				});
				// A fila da pill acabou de crescer: o próximo "NOVA VENDA" precisa já contar este.
				void queryClient.invalidateQueries({ queryKey: getOrganizationOpenQuotesQueryKey() });
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
		onSuccess: (data) => {
			if (data.data.confirmation.fiscal.status === "ERRO") {
				toast.warning(`Venda finalizada, mas a emissao fiscal falhou: ${data.data.confirmation.fiscal.error}`);
			}
			setDiscountApproval(null);
			saleState.setSuccess({
				mode: "FINALIZADA",
				saleId: data.data.saleId,
				title: "Venda finalizada com sucesso",
				description: "Pagamento confirmado e venda concluída.",
				...getSaleSuccessSnapshot(saleState),
				cashbackAcumulado: data.data.confirmation.cashbackAcumulo?.accumulatedValue ?? null,
				fiscal: {
					status: data.data.confirmation.fiscal.status,
					error: data.data.confirmation.fiscal.status === "ERRO" ? data.data.confirmation.fiscal.error : null,
				},
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

	const handleOrderingChange = (ordering: TPOSProductOrderingEnum) => {
		updateFilters({ ordering, page: 1 });
	};

	// Estável (só depende de addItem, que é estável) para não invalidar o memo da grade de produtos a cada edição do carrinho.
	const addItem = saleState.addItem;
	const handleProductClick = useCallback(
		(product: TGetPOSProductsOutput["data"]["products"][number]) => {
			const hasVariants = product.variantes.length > 0;
			const hasAddOns = product.addOnsReferencias.length > 0;
			const isComplex = hasVariants || hasAddOns;
			if (isComplex) {
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
			acrescimosTotal: saleState.acrescimosTotal,
			cashbackResgate: saleState.state.cashbackResgate,
			cupomResgate: saleState.state.cupomResgate,
			recompensaResgate: saleState.state.recompensaResgate
				? { recompensaId: saleState.state.recompensaResgate.recompensaId, programaId: saleState.state.recompensaResgate.programaId }
				: null,
			rascunhoMetadados: saleState.getDraftMetadata(),
			emissaoFiscalAutomatica: saleState.state.emissaoFiscalAutomatica,
			itens: mapItemsToApi(saleState),
		});
	};

	const submitFinalizeSale = (descontoAprovacaoId: string | null) => {
		finalizeSale({
			descontoAprovacaoId,
			clienteId: saleState.state.cliente?.id ?? null,
			vendedorId: saleState.state.vendedorId,
			vendedorNome: saleState.state.vendedorNome,
			entregaModalidade: saleState.state.entregaModalidade,
			entregaLocalizacaoId: saleState.state.entregaLocalizacaoId,
			comandaNumero: saleState.state.comandaNumero,
			observacoes: saleState.state.observacoes || null,
			descontosTotal: saleState.state.descontoGeral,
			acrescimosTotal: saleState.acrescimosTotal,
			rascunhoMetadados: saleState.getDraftMetadata(),
			sessaoVendaId: activeSession?.id ?? null,
			pagamentos: saleState.state.pagamentos.map((payment) => ({
				metodo: payment.metodo,
				valor: payment.valor,
				totalParcelas: payment.totalParcelas,
				efetivacaoTipo: payment.efetivacaoTipo,
				dataPrevisao: payment.dataPrevisao,
				observacoes: payment.observacoes,
			})),
			cashbackResgate: saleState.state.cashbackResgate,
			cupomResgate: saleState.state.cupomResgate,
			recompensaResgate: saleState.state.recompensaResgate
				? { recompensaId: saleState.state.recompensaResgate.recompensaId, programaId: saleState.state.recompensaResgate.programaId }
				: null,
			emissaoFiscalAutomatica: saleState.state.emissaoFiscalAutomatica,
			itens: mapItemsToApi(saleState),
		});
	};

	const proceedFinalizeSale = () => {
		// Desconto acima do teto do vendedor: abre o fluxo de aprovação (PIN ou remota) antes de finalizar.
		if (discountRequiresApproval && !discountApproval) {
			setIsDiscountApprovalOpen(true);
			return;
		}

		submitFinalizeSale(discountApproval?.id ?? null);
	};

	const handleFinalizeSale = () => {
		if (!saleState.isReadyForFinalize) {
			toast.error(saleState.trocoBloqueio ?? "Complete entrega e pagamento para finalizar a venda.");
			return;
		}

		// Troco sem dinheiro recebido (excesso no cartão/PIX) é quase sempre valor digitado errado: confirma antes.
		if (saleState.troco > 0 && !saleState.trocoCobertoPorDinheiro) {
			setIsChangeConfirmOpen(true);
			return;
		}

		proceedFinalizeSale();
	};

	if (saleState.state.success) {
		return (
			<SaleSuccessPanel
				success={saleState.state.success}
				onStartNewSale={() => {
					setIsCheckoutFocused(false);
					saleState.clearSuccess();
					saleState.resetState(
						getDefaultSaleState({ vendedorId: activeSession?.vendedorPadrao?.id ?? null, vendedorNome: activeSession?.vendedorPadrao?.nome ?? null }),
					);
				}}
			/>
		);
	}

	// Modo obrigatório sem caixa aberto: bloqueia a entrada do fluxo de venda (gate cedo).
	if (cashEnabled && cashRequired && !cashLoading && !activeSession) {
		return (
			<div className="flex h-[calc(100dvh-7rem)] w-full flex-col p-4 lg:h-[calc(100dvh-8rem)]">
				<CashSessionGate
					sessions={openSessions}
					activeSessionId={activeSessionId}
					onSessionChange={setActiveSessionId}
					requireOpeningFloat={!!salesSessionsConfig?.exigirFundoTroco}
				/>
			</div>
		);
	}

	// O caixa vive dentro do checkout (coluna no desktop, Sheet no mobile), não numa barra no topo
	// da página: no mobile a barra empurrava o catálogo para baixo e, no desktop, separava o
	// caixa da venda que vai cair nele. Um card por instância do painel, cada um com seus modais.
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
		// Altura em `dvh` e com o recuo do header do mobile (7rem; 8rem no desktop): a página é a
		// viewport inteira, e a última linha da coluna — a barra do checkout no mobile — fica no
		// rodapé visível sem depender de `position: fixed` (ver MobileCheckoutBar).
		<div className="flex h-[calc(100dvh-7rem)] w-full flex-col gap-3 p-4 lg:h-[calc(100dvh-8rem)]">
			<div className="flex flex-1 min-h-0 gap-3">
				{/* O clique nas colunas é atalho de conveniência (foco/desfoco), não a única via: toda
				    interação continua acessível pelos controles internos e o Esc desfaz o foco. */}
				<div
					className={cn(
						"relative flex min-w-0 flex-1 flex-col gap-4 rounded-xl bg-background transition-opacity duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
						isCheckoutFocused && "opacity-[0.32]",
					)}
				>
					{isCheckoutFocused ? (
						<button
							type="button"
							aria-label="Sair do foco do checkout"
							onClick={() => setIsCheckoutFocused(false)}
							className="absolute inset-0 z-20 cursor-default rounded-xl bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
						/>
					) : null}
					<div className="shrink-0 flex flex-col gap-3">
						{/* Em telas estreitas a busca ocupa a linha inteira e os controles quebram para a linha
						    de baixo: dividir a mesma linha espremia o campo a poucos caracteres visíveis. */}
						<div className="flex flex-wrap items-center gap-2">
							<div className="w-full sm:w-auto sm:flex-1">
								<SearchBlock searchValue={searchValue} onSearchChange={handleSearchChange} isLoading={productsLoading} />
							</div>
							<ProductOrderingSelect value={filters.ordering} onChange={handleOrderingChange} disabled={productsLoading} />
							<ViewModeToggle value={viewMode} onChange={setViewMode} />
							{/* Pendência comercial ao lado da busca: aparece sozinha quando existe e some quando
							    a fila zera, sem ocupar espaço fixo da grade de produtos. */}
							<OpenQuotesPill canViewQuotes={canViewSales} permissions={quotePermissions} cartItemCount={saleState.itemCount} />
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

				{linkedClient ? (
					<ClientContextPanel
						isOpen={isContextPanelOpen}
						onClose={() => setIsContextPanelOpen(false)}
						clientId={linkedClient.id}
						fallbackName={linkedClient.nome}
						fallbackPhone={linkedClient.telefone}
						basketProductIds={basketProductIds}
						organizationCashbackProgram={organizationCashbackProgram}
						onSelectProduct={handleProductClick}
						onEditClient={handleOpenClientEdit}
					/>
				) : null}

				{/* Coluna do checkout — "foco por escala": clicar dentro expande para 640px (limitado a
				    50vw para não engolir o catálogo em telas menores) e a superfície ganha contraste e
				    elevação; a largura recolhida continua sendo os 420px de sempre. */}
				<div
					onClick={() => setIsCheckoutFocused(true)}
					className={cn(
						"hidden shrink-0 overflow-hidden rounded-xl border transition-[width,border-color,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none lg:block",
						isCheckoutFocused
							? "w-[min(640px,50vw)] border-primary/55 bg-card shadow-[0_30px_60px_-24px_rgb(0_0_0/0.35)]"
							: "w-[420px] border-border/70 bg-muted/45",
					)}
				>
					<div className="h-full overflow-y-auto p-3 scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
						<CheckoutPanel
							organizationCashbackProgram={organizationCashbackProgram}
							saleState={saleState}
							sellerEditable={activeSession?.politica !== "VENDEDOR_UNICO"}
							organizationAutoFiscalEmission={organizationAutoFiscalEmission}
							organizationAutoFiscalCapable={organizationAutoFiscalCapable}
							autoEmissionExceptions={autoEmissionExceptions}
							canEmitFiscal={canEmitFiscal}
							canConfigureFiscal={canConfigureFiscal}
							discountAuthority={discountAuthority}
							onCreateDraft={handleCreateDraft}
							onFinalizeSale={handleFinalizeSale}
							isCreatingDraft={isCreatingDraft}
							isFinalizingSale={isFinalizingSale}
							onOpenContext={() => setIsContextPanelOpen(true)}
							cashSession={cashSessionCard}
							expanded={isCheckoutFocused}
						/>
					</div>
				</div>

				{linkedClient ? (
					<ClientContextSheet
						open={isContextSheetOpen}
						onOpenChange={setIsContextSheetOpen}
						clientId={linkedClient.id}
						fallbackName={linkedClient.nome}
						fallbackPhone={linkedClient.telefone}
						basketProductIds={basketProductIds}
						organizationCashbackProgram={organizationCashbackProgram}
						onSelectProduct={handleProductClick}
						onEditClient={handleOpenClientEdit}
					/>
				) : null}

				{linkedClientId && isEditingClient ? (
					<ControlClient clientId={linkedClientId} closeModal={handleCloseClientEdit} callbacks={{ onSuccess: () => void handleClientEdited() }} />
				) : null}

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
							submitFinalizeSale(approvalRequestId);
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
				description="Finalize ou salve como orçamento."
				ariaLabel={`Abrir checkout: ${saleState.itemCount} ${saleState.itemCount === 1 ? "item" : "itens"}, total ${formatToMoney(saleState.valorFinal)}`}
			>
				<CheckoutPanel
					organizationCashbackProgram={organizationCashbackProgram}
					saleState={saleState}
					sellerEditable={activeSession?.politica !== "VENDEDOR_UNICO"}
					organizationAutoFiscalEmission={organizationAutoFiscalEmission}
					organizationAutoFiscalCapable={organizationAutoFiscalCapable}
					autoEmissionExceptions={autoEmissionExceptions}
					canEmitFiscal={canEmitFiscal}
					canConfigureFiscal={canConfigureFiscal}
					discountAuthority={discountAuthority}
					onCreateDraft={handleCreateDraft}
					onFinalizeSale={handleFinalizeSale}
					isCreatingDraft={isCreatingDraft}
					isFinalizingSale={isFinalizingSale}
					onOpenContext={() => {
						setIsCheckoutSheetOpen(false);
						setIsContextSheetOpen(true);
					}}
					cashSession={cashSessionCard}
				/>
			</MobileCheckoutBar>
		</div>
	);
}
