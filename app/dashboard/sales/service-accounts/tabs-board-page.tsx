"use client";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { ControlServicePoint } from "@/components/Modals/Internal/ServicePoints/ControlServicePoint";
import { NewServicePoint } from "@/components/Modals/Internal/ServicePoints/NewServicePoint";
import { ControlServiceCard } from "@/components/Modals/ServiceCards/ControlServiceCard";
import { NewServiceCards } from "@/components/Modals/ServiceCards/NewServiceCards";
import { ExportServiceCards } from "@/components/Modals/ServiceCards/ExportServiceCards";
import { NewTab } from "@/components/Modals/Internal/Tabs/NewTab";
import { ServiceSettings } from "@/components/Modals/Internal/Tabs/ServiceSettings";
import { ActionToolbar } from "@/components/ui/action-toolbar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, tabsPageToolbarActionsClassName, tabsPageToolbarClassName } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { useBarcodeScanner } from "@/lib/hooks/use-barcode-scanner";
import { fetchServiceCardLookup, useServiceCards, useServicePoints, useServiceSettings, useTabs } from "@/lib/queries/tabs";
import { extractServiceCardToken, normalizeServiceCardCode, SERVICE_CARD_SCAN_MAX_LENGTH } from "@/lib/tabs/service-card-codes";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	AlarmClock,
	FileDown,
	Hourglass,
	IdCard,
	Info,
	Layers,
	LayoutGrid,
	type LucideIcon,
	Plus,
	ReceiptText,
	Search,
	SearchX,
	Settings2,
	Ticket,
	UtensilsCrossed,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FreeCardTile, FreePointTile, OccupiedTile, TabCard, type TServiceCard, type TServicePoint } from "./_components/BoardCards";
import OrderRequestsButton from "./_components/OrderRequestsButton";
import { AccountPanel, type TAccountPanelTab, type TTransferTarget } from "./_components/account-panel/AccountPanel";
import { type TBoardTab, compareBoardTabs, toBoardTab, useTickingNow } from "./_components/board-meta";

// ============================================================================
// Board operacional de contas (tabs). Duas leituras do mesmo estado: "Por conta"
// (o que esta consumindo, com filtros de urgencia) e "Por mesa" (mapa de salao,
// livres inclusive). Clicar numa conta abre o painel lateral ao lado do board —
// a conta selecionada vive em ?conta=<id>, entao o link e compartilhavel e o
// voltar do celular fecha o painel. O consumo em aberto e metrica derivada da
// venda rascunho — nao ha recebiveis antes do fechamento.
// ============================================================================

const SELECTED_PARAM = "conta";

type TActiveModal =
	| { type: "nova-conta"; servicePointId?: string | null; codigo?: string | null }
	| { type: "novo-ponto" }
	| { type: "editar-ponto"; pointId: string }
	| { type: "configuracoes" }
	| { type: "exportar-comandas" }
	| { type: "nova-comanda" }
	| { type: "editar-comanda"; cardId: string }
	| null;

type TBoardFilter = "todas" | "atrasadas" | "atencao" | "mesas" | "comandas";
type TCardFilter = "todas" | "livres" | "em-uso" | "desativadas";

function matchesCardFilter(card: TServiceCard, filter: TCardFilter, inUse: boolean) {
	if (filter === "livres") return card.ativo && !inUse;
	if (filter === "em-uso") return inUse;
	if (filter === "desativadas") return !card.ativo;
	return true;
}

export default function TabsBoardPage({ organizationLogoUrl }: { organizationLogoUrl: string | null }) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const queryClient = useQueryClient();
	const now = useTickingNow();
	const { data: settings } = useServiceSettings();
	const { data: servicePoints, isLoading: pointsLoading, queryKey: pointsQueryKey } = useServicePoints();
	const { data: tabs, isLoading: tabsLoading, isError, error, queryKey: tabsQueryKey } = useTabs();
	const [activeModal, setActiveModal] = useState<TActiveModal>(null);
	const [mode, setMode] = useState<"por-conta" | "por-mesa" | "por-comanda">("por-conta");
	const [filter, setFilter] = useState<TBoardFilter>("todas");
	const [cardFilter, setCardFilter] = useState<TCardFilter>("todas");
	const [query, setQuery] = useState("");
	const [sheetTab, setSheetTab] = useState<TAccountPanelTab>("pedidos");
	const searchRef = useRef<HTMLInputElement>(null);

	const selectedId = searchParams.get(SELECTED_PARAM);

	const pontosHabilitados = settings?.pontos.habilitados ?? false;
	const contasHabilitadas = settings?.contas.habilitadas ?? false;
	// Sem pontos habilitados o modo por mesa nem existe — o board colapsa em "por conta".
	const effectiveMode = mode === "por-mesa" && !pontosHabilitados ? "por-conta" : mode;
	const activePoints = useMemo(() => (servicePoints ?? []).filter((point) => point.ativo), [servicePoints]);
	const editingPoint = activeModal?.type === "editar-ponto" ? activePoints.find((point) => point.id === activeModal.pointId) : undefined;
	// Comandas fixas so fazem sentido quando a conta e identificada por codigo (nao no "Somente mesas").
	// Visivel em qualquer modo: os cartoes sao cadastrados e impressos antes de a operacao passar a usa-los.
	const comandasDisponiveis = contasHabilitadas;
	// So abre conta pelo cartao quando a operacao usa comandas cadastradas.
	const cardsInUse = settings?.contas.identificacao === "COMANDA_CADASTRADA";
	const { data: serviceCards, queryKey: serviceCardsQueryKey } = useServiceCards({ enabled: comandasDisponiveis });
	const editingCard = activeModal?.type === "editar-comanda" ? serviceCards?.find((card) => card.id === activeModal.cardId) : undefined;

	const boardTabs = useMemo(() => (tabs ?? []).map((tab) => toBoardTab(tab, now)), [tabs, now]);
	const tabsByPoint = useMemo(() => {
		const map = new Map<string, TBoardTab[]>();
		for (const tab of boardTabs) {
			if (!tab.servicePointId) continue;
			map.set(tab.servicePointId, [...(map.get(tab.servicePointId) ?? []), tab]);
		}
		return map;
	}, [boardTabs]);
	const tabByCard = useMemo(() => new Map(boardTabs.filter((tab) => tab.serviceCardId).map((tab) => [tab.serviceCardId as string, tab])), [boardTabs]);
	const allCards = useMemo(() => serviceCards ?? [], [serviceCards]);
	const activeCardCount = allCards.filter((card) => card.ativo).length;
	const cardCounts: Record<TCardFilter, number> = {
		todas: allCards.length,
		livres: allCards.filter((card) => matchesCardFilter(card, "livres", tabByCard.has(card.id))).length,
		"em-uso": allCards.filter((card) => matchesCardFilter(card, "em-uso", tabByCard.has(card.id))).length,
		desativadas: allCards.filter((card) => matchesCardFilter(card, "desativadas", tabByCard.has(card.id))).length,
	};
	const visibleCards = useMemo(() => {
		const needle = query.trim();
		const codeNeedle = needle ? normalizeServiceCardCode(needle) : "";
		const textNeedle = needle.toLocaleLowerCase("pt-BR");
		return allCards
			.filter((card) => matchesCardFilter(card, cardFilter, tabByCard.has(card.id)))
			.filter((card) => {
				if (!needle) return true;
				const tab = tabByCard.get(card.id);
				// Numero da comanda ou quem esta nela (cliente/vendedor da conta aberta).
				return (
					card.codigoNormalizado.includes(codeNeedle) ||
					[tab?.cliente?.nome, tab?.responsavelVendedor?.nome].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(textNeedle)
				);
			});
	}, [allCards, cardFilter, query, tabByCard]);

	const counts: Record<TBoardFilter, number> = {
		todas: boardTabs.length,
		atrasadas: boardTabs.filter((tab) => tab.urgencia === "atrasado").length,
		atencao: boardTabs.filter((tab) => tab.urgencia === "atencao").length,
		mesas: boardTabs.filter((tab) => !!tab.servicePointId).length,
		comandas: boardTabs.filter((tab) => !!tab.codigo).length,
	};

	const visibleTabs = useMemo(() => {
		const needle = query.trim().toLocaleLowerCase("pt-BR");
		return boardTabs
			.filter((tab) => {
				if (filter === "atrasadas") return tab.urgencia === "atrasado";
				if (filter === "atencao") return tab.urgencia === "atencao";
				if (filter === "mesas") return !!tab.servicePointId;
				if (filter === "comandas") return !!tab.codigo;
				return true;
			})
			.filter((tab) => {
				if (!needle) return true;
				return [tab.label, tab.codigo, tab.cliente?.nome, tab.responsavelVendedor?.nome]
					.filter(Boolean)
					.join(" ")
					.toLocaleLowerCase("pt-BR")
					.includes(needle);
			})
			.sort(compareBoardTabs);
	}, [boardTabs, filter, query]);

	// Ordem de navegacao do painel (↑↓): a mesma que o operador esta vendo.
	const navigationOrder = effectiveMode === "por-conta" ? visibleTabs : [...boardTabs].sort(compareBoardTabs);

	// Pontos com vaga para mais uma conta — o mesmo limite que a transferencia valida no servidor.
	const transferTargets: TTransferTarget[] | null = useMemo(() => {
		if (!pontosHabilitados) return null;
		const limit = settings?.contas.maxAbertasPorPonto ?? null;
		return activePoints
			.filter((point) => limit === null || (tabsByPoint.get(point.id)?.length ?? 0) < limit)
			.map((point) => ({ id: point.id, rotulo: point.rotulo }));
	}, [pontosHabilitados, settings, activePoints, tabsByPoint]);

	// ---------------------------------------------------------------- Selecao

	// true quando a abertura do painel entrou no historico (celular): fechar volta em vez de substituir.
	const pushedRef = useRef(false);

	const writeSelection = useCallback(
		(tabId: string | null, how: "push" | "replace") => {
			const params = new URLSearchParams(searchParams.toString());
			if (tabId) params.set(SELECTED_PARAM, tabId);
			else params.delete(SELECTED_PARAM);
			const qs = params.toString();
			const url = qs ? `${pathname}?${qs}` : pathname;
			if (how === "push") router.push(url, { scroll: false });
			else router.replace(url, { scroll: false });
		},
		[pathname, router, searchParams],
	);

	const selectTab = useCallback(
		(tabId: string) => {
			if (tabId === selectedId) return;
			// No celular o painel cobre a tela: abrir entra no historico para o voltar fechar.
			const isMobile = typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches;
			if (!selectedId && isMobile) {
				pushedRef.current = true;
				writeSelection(tabId, "push");
			} else {
				writeSelection(tabId, "replace");
			}
		},
		[selectedId, writeSelection],
	);

	const closePanel = useCallback(() => {
		if (!selectedId) return;
		if (pushedRef.current) {
			pushedRef.current = false;
			router.back();
		} else {
			writeSelection(null, "replace");
		}
	}, [router, selectedId, writeSelection]);

	// Voltar do navegador removeu ?conta: o painel ja fechou, a entrada empilhada nao existe mais.
	useEffect(() => {
		if (!selectedId) pushedRef.current = false;
	}, [selectedId]);

	const step = useCallback(
		(direction: 1 | -1) => {
			if (navigationOrder.length === 0) return;
			const index = navigationOrder.findIndex((tab) => tab.id === selectedId);
			const nextIndex = index === -1 ? 0 : (index + direction + navigationOrder.length) % navigationOrder.length;
			selectTab(navigationOrder[nextIndex].id);
		},
		[navigationOrder, selectTab, selectedId],
	);

	// Leitura do QR de uma comanda cadastrada: abre a conta dela ou a abertura ja preenchida.
	// So reage a leituras com token de cartao — codigos de barras de produto sao do composer.
	// Com qualquer dialog aberto a leitura e descartada pelo hook (o NewTab tem o proprio leitor).
	useBarcodeScanner({
		enabled: contasHabilitadas && settings?.contas.identificacao === "COMANDA_CADASTRADA" && activeModal === null,
		maxLength: SERVICE_CARD_SCAN_MAX_LENGTH,
		onScan: async (code) => {
			const token = extractServiceCardToken(code);
			if (!token) return;
			try {
				const { card, tabAberta } = await fetchServiceCardLookup({ token });
				if (!card) {
					toast.error("QR de comanda não reconhecido nesta organização.");
					return;
				}
				if (!card.ativo) {
					toast.error(`Comanda ${card.codigo} desativada.`);
					return;
				}
				if (tabAberta) {
					selectTab(tabAberta.id);
					return;
				}
				setActiveModal({ type: "nova-conta", codigo: card.codigo });
			} catch (scanError) {
				toast.error(getErrorMessage(scanError));
			}
		},
	});

	// Atalhos: / busca, ↑↓ (ou j/k) troca de conta, Esc fecha o painel.
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
			// Dialogs/menus abertos (Radix/Base UI) tratam as proprias teclas.
			if (document.querySelector("[role=dialog], [role=menu]")) return;
			if (typing) {
				if (event.key === "Escape") target?.blur();
				return;
			}
			if (event.key === "/") {
				event.preventDefault();
				searchRef.current?.focus();
				return;
			}
			if (!selectedId) return;
			if (event.key === "Escape") {
				closePanel();
				return;
			}
			if (event.key === "ArrowDown" || event.key === "j") {
				event.preventDefault();
				step(1);
			} else if (event.key === "ArrowUp" || event.key === "k") {
				event.preventDefault();
				step(-1);
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [closePanel, selectedId, step]);

	function refresh() {
		queryClient.invalidateQueries({ queryKey: tabsQueryKey });
		queryClient.invalidateQueries({ queryKey: pointsQueryKey });
		queryClient.invalidateQueries({ queryKey: serviceCardsQueryKey });
	}

	const panelOpen = !!selectedId;
	const totalOpen = boardTabs.reduce((sum, tab) => sum + (tab.consumoParcial ?? 0), 0);

	if (!contasHabilitadas) {
		return (
			<div className="flex w-full flex-col gap-3">
				<div className="flex justify-end">
					<ModuleActions contasHabilitadas={false} onOpenSettings={() => setActiveModal({ type: "configuracoes" })} onCreateTab={() => {}} />
				</div>
				{settings ? (
					<div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
						<UtensilsCrossed className="size-8 text-muted-foreground" />
						<p className="text-sm font-medium">Contas de atendimento estão desabilitadas.</p>
						<p className="max-w-md text-xs text-muted-foreground">
							Configure o modo de atendimento (mesas, comandas ou ambos) para começar a abrir contas e acumular pedidos até o fechamento.
						</p>
						<Button size="sm" variant="secondary" className="mt-1" onClick={() => setActiveModal({ type: "configuracoes" })}>
							CONFIGURAR
						</Button>
					</div>
				) : (
					<Skeleton className="h-40 w-full rounded-xl" />
				)}
				{activeModal?.type === "configuracoes" ? <ServiceSettings closeModal={() => setActiveModal(null)} /> : null}
			</div>
		);
	}

	return (
		<div className="flex h-[calc(100dvh-7rem)] min-h-[520px] w-full flex-col gap-3 lg:h-[calc(100dvh-8rem)]">
			{/* Titulo e icone vem do AppHeader (config/AppRoutes) — a pagina so traz as abas e as acoes. */}
			<Tabs value={effectiveMode} onValueChange={(value) => setMode(value as typeof mode)} className="w-full">
				<div className={tabsPageToolbarClassName}>
					<TabsList variant="page">
						<TabsTrigger value="por-conta">
							<ReceiptText className="size-4" />
							Por conta
							<span className="font-bold text-muted-foreground">{boardTabs.length}</span>
						</TabsTrigger>
						{pontosHabilitados ? (
							<TabsTrigger value="por-mesa">
								<LayoutGrid className="size-4" />
								Por mesa
								<span className="font-bold text-muted-foreground">{activePoints.length}</span>
							</TabsTrigger>
						) : null}
						{comandasDisponiveis ? (
							<TabsTrigger value="por-comanda">
								<IdCard className="size-4" />
								Por comanda
								<span className="font-bold text-muted-foreground">{activeCardCount}</span>
							</TabsTrigger>
						) : null}
					</TabsList>
					<div className={cn(tabsPageToolbarActionsClassName, "flex flex-wrap items-center justify-end gap-2")}>
						<OrderRequestsButton />
						<ModuleActions
							contasHabilitadas={contasHabilitadas}
							onOpenSettings={() => setActiveModal({ type: "configuracoes" })}
							onCreateTab={() => setActiveModal({ type: "nova-conta" })}
						/>
					</div>
				</div>
			</Tabs>

			<div
				className={cn(
					"grid min-h-0 flex-1 overflow-hidden rounded-xl border border-border",
					panelOpen ? "lg:grid-cols-[minmax(0,1fr)_minmax(440px,520px)]" : "grid-cols-1",
				)}
			>
				{/* ---------------------------------------------------------------- Board */}
				<section className="flex min-h-0 min-w-0 flex-col bg-card">
					<div className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:px-5">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<label className="flex h-9 w-full max-w-[300px] min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-border pr-2.5 pl-3 focus-within:border-primary">
								<Search className="size-4 shrink-0 text-muted-foreground" />
								<input
									ref={searchRef}
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Mesa, comanda ou cliente"
									aria-label="Buscar conta"
									className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
								/>
								<kbd className="hidden rounded border border-border px-1.5 font-mono text-xs leading-4 text-muted-foreground md:inline">/</kbd>
							</label>
							<span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">
								{boardTabs.length
									? `${boardTabs.length} ${boardTabs.length === 1 ? "conta aberta" : "contas abertas"} · ${formatToMoney(totalOpen)} em consumo`
									: "Nenhuma conta aberta"}
							</span>
						</div>
						{effectiveMode === "por-conta" ? (
							<div className="flex flex-wrap items-center gap-1.5">
								<FilterChip icon={Layers} label="Todas" count={counts.todas} active={filter === "todas"} onClick={() => setFilter("todas")} />
								<FilterChip
									icon={AlarmClock}
									label="Atrasadas"
									tone="danger"
									count={counts.atrasadas}
									active={filter === "atrasadas"}
									onClick={() => setFilter(filter === "atrasadas" ? "todas" : "atrasadas")}
								/>
								<FilterChip
									icon={Hourglass}
									label="Atenção"
									tone="warning"
									count={counts.atencao}
									active={filter === "atencao"}
									onClick={() => setFilter(filter === "atencao" ? "todas" : "atencao")}
								/>
								{pontosHabilitados ? (
									<>
										<span className="mx-1 h-4 w-px bg-border" aria-hidden />
										<FilterChip icon={LayoutGrid} label="Mesas" count={counts.mesas} active={filter === "mesas"} onClick={() => setFilter("mesas")} />
										<FilterChip icon={Ticket} label="Comandas" count={counts.comandas} active={filter === "comandas"} onClick={() => setFilter("comandas")} />
									</>
								) : null}
							</div>
						) : null}
						{effectiveMode === "por-mesa" ? (
							<div className="flex justify-end">
								<Button size="sm" variant="outline" onClick={() => setActiveModal({ type: "novo-ponto" })}>
									<Plus className="size-4" />
									Nova mesa
								</Button>
							</div>
						) : null}
						{effectiveMode === "por-comanda" ? (
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex flex-wrap items-center gap-1.5">
									<FilterChip icon={Layers} label="Todas" count={cardCounts.todas} active={cardFilter === "todas"} onClick={() => setCardFilter("todas")} />
									<FilterChip
										icon={IdCard}
										label="Livres"
										count={cardCounts.livres}
										active={cardFilter === "livres"}
										onClick={() => setCardFilter("livres")}
									/>
									<FilterChip
										icon={ReceiptText}
										label="Em uso"
										count={cardCounts["em-uso"]}
										active={cardFilter === "em-uso"}
										onClick={() => setCardFilter("em-uso")}
									/>
									{cardCounts.desativadas > 0 ? (
										<FilterChip
											icon={Ticket}
											label="Desativadas"
											count={cardCounts.desativadas}
											active={cardFilter === "desativadas"}
											onClick={() => setCardFilter("desativadas")}
										/>
									) : null}
								</div>
								<div className="flex flex-wrap items-center gap-2">
									{activeCardCount > 0 ? (
										<Button size="sm" variant="outline" onClick={() => setActiveModal({ type: "exportar-comandas" })}>
											<FileDown className="size-4" />
											Arquivo para gráfica
										</Button>
									) : null}
									<Button size="sm" variant="outline" onClick={() => setActiveModal({ type: "nova-comanda" })}>
										<Plus className="size-4" />
										Nova comanda
									</Button>
								</div>
							</div>
						) : null}
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-7 sm:px-5">
						{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}

						{effectiveMode === "por-conta" ? (
							<PorConta
								loading={tabsLoading}
								hasAnyTab={boardTabs.length > 0}
								tabs={visibleTabs}
								now={now}
								selectedId={selectedId}
								pontosHabilitados={pontosHabilitados}
								onSelect={selectTab}
								onCreateTab={() => setActiveModal({ type: "nova-conta" })}
								onChooseTable={() => setMode("por-mesa")}
							/>
						) : effectiveMode === "por-comanda" ? (
							<PorComanda
								loading={!serviceCards}
								hasAnyCard={allCards.length > 0}
								cards={visibleCards}
								tabByCard={tabByCard}
								cardsInUse={cardsInUse}
								now={now}
								selectedId={selectedId}
								onSelect={selectTab}
								onOpenFree={(codigo) => setActiveModal({ type: "nova-conta", codigo })}
								onEditCard={(cardId) => setActiveModal({ type: "editar-comanda", cardId })}
								onCreateCards={() => setActiveModal({ type: "nova-comanda" })}
							/>
						) : (
							<PorMesa
								loading={pointsLoading}
								points={activePoints}
								tabsByPoint={tabsByPoint}
								looseTabs={boardTabs.filter((tab) => !tab.servicePointId).sort(compareBoardTabs)}
								now={now}
								selectedId={selectedId}
								onSelect={selectTab}
								onOpenFree={(pointId) => setActiveModal({ type: "nova-conta", servicePointId: pointId })}
								onEditPoint={(pointId) => setActiveModal({ type: "editar-ponto", pointId })}
								onCreatePoint={() => setActiveModal({ type: "novo-ponto" })}
							/>
						)}
					</div>
				</section>

				{/* ----------------------------------------------------------- Painel */}
				{selectedId ? (
					<aside
						aria-label="Detalhes da conta"
						className={cn(
							"flex min-h-0 min-w-0 flex-col bg-background",
							// Celular: o painel cobre a tela (o voltar fecha). Desktop: coluna ao lado do board.
							"max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:animate-in max-lg:fade-in-0 max-lg:slide-in-from-bottom-2",
							"lg:border-l lg:border-border",
						)}
					>
						<AccountPanel
							key={selectedId}
							tabId={selectedId}
							now={now}
							sheetTab={sheetTab}
							onSheetTabChange={setSheetTab}
							transferTargets={transferTargets}
							onPrev={() => step(-1)}
							onNext={() => step(1)}
							onClose={closePanel}
							onFinished={closePanel}
						/>
					</aside>
				) : null}
			</div>

			{activeModal?.type === "nova-conta" ? (
				<NewTab
					initialServicePointId={activeModal.servicePointId}
					initialCodigo={activeModal.codigo}
					closeModal={() => setActiveModal(null)}
					callbacks={{
						onOpenExisting: (tabId) => selectTab(tabId),
						onSuccess: (data) => {
							refresh();
							setActiveModal(null);
							// Conta nova: o painel abre direto no lançamento do primeiro pedido.
							setSheetTab("lancar");
							selectTab(data.data.tab.id);
						},
					}}
				/>
			) : null}
			{activeModal?.type === "novo-ponto" ? <NewServicePoint closeModal={() => setActiveModal(null)} callbacks={{ onSuccess: refresh }} /> : null}
			{activeModal?.type === "editar-ponto" && editingPoint ? (
				<ControlServicePoint servicePoint={editingPoint} closeModal={() => setActiveModal(null)} callbacks={{ onSuccess: refresh }} />
			) : null}
			{activeModal?.type === "configuracoes" ? <ServiceSettings closeModal={() => setActiveModal(null)} /> : null}
			{activeModal?.type === "exportar-comandas" ? (
				<ExportServiceCards cards={allCards} logoUrl={organizationLogoUrl} closeModal={() => setActiveModal(null)} />
			) : null}
			{activeModal?.type === "nova-comanda" ? (
				<NewServiceCards logoUrl={organizationLogoUrl} closeModal={() => setActiveModal(null)} callbacks={{ onSuccess: refresh }} />
			) : null}
			{activeModal?.type === "editar-comanda" && editingCard ? (
				<ControlServiceCard
					serviceCard={editingCard}
					logoUrl={organizationLogoUrl}
					closeModal={() => setActiveModal(null)}
					callbacks={{ onSuccess: refresh }}
				/>
			) : null}
		</div>
	);
}

// ============================================================================
// Por conta
// ============================================================================

type PorContaProps = {
	loading: boolean;
	hasAnyTab: boolean;
	tabs: TBoardTab[];
	now: number;
	selectedId: string | null;
	pontosHabilitados: boolean;
	onSelect: (tabId: string) => void;
	onCreateTab: () => void;
	onChooseTable: () => void;
};

function PorConta({ loading, hasAnyTab, tabs, now, selectedId, pontosHabilitados, onSelect, onCreateTab, onChooseTable }: PorContaProps) {
	if (loading) return <CardGridSkeleton />;

	if (!hasAnyTab) {
		return (
			<div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-14 text-center">
				<span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
					<ReceiptText className="size-5" />
				</span>
				<span className="text-xl font-bold tracking-tight">Nenhuma conta aberta no momento</span>
				<span className="max-w-[380px] text-sm leading-normal text-muted-foreground">
					Abra uma conta para começar a lançar pedidos. O pagamento acontece só no fechamento.
				</span>
				<div className="mt-2 flex flex-wrap justify-center gap-2">
					<Button className="h-11 gap-2 rounded-xl px-5 text-sm font-bold" onClick={onCreateTab}>
						<Plus className="size-4" />
						Abrir conta
					</Button>
					{pontosHabilitados ? (
						<Button variant="outline" className="h-11 gap-2 rounded-xl px-5 text-sm font-bold" onClick={onChooseTable}>
							<LayoutGrid className="size-4" />
							Escolher mesa
						</Button>
					) : null}
				</div>
			</div>
		);
	}

	if (tabs.length === 0) {
		return (
			<div className="flex flex-col items-center gap-1.5 px-4 py-12 text-center text-muted-foreground">
				<SearchX className="size-5" />
				<span className="text-sm font-bold text-foreground">Nenhuma conta encontrada</span>
				<span className="text-xs">Ajuste a busca ou o filtro.</span>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-2.5">
			{tabs.map((tab) => (
				<TabCard key={tab.id} tab={tab} now={now} selected={tab.id === selectedId} onSelect={() => onSelect(tab.id)} />
			))}
		</div>
	);
}

// ============================================================================
// Por mesa
// ============================================================================

type PorMesaProps = {
	loading: boolean;
	points: TServicePoint[];
	tabsByPoint: Map<string, TBoardTab[]>;
	looseTabs: TBoardTab[];
	now: number;
	selectedId: string | null;
	onSelect: (tabId: string) => void;
	onOpenFree: (pointId: string) => void;
	onEditPoint: (pointId: string) => void;
	onCreatePoint: () => void;
};

function PorMesa({ loading, points, tabsByPoint, looseTabs, now, selectedId, onSelect, onOpenFree, onEditPoint, onCreatePoint }: PorMesaProps) {
	// Areas na ordem em que aparecem no cadastro; ponto sem grupo cai em "Pontos".
	const areas = useMemo(() => {
		const map = new Map<string, TServicePoint[]>();
		for (const point of points) {
			const area = point.grupo?.trim() || "Pontos";
			map.set(area, [...(map.get(area) ?? []), point]);
		}
		return [...map.entries()];
	}, [points]);

	if (loading) return <CardGridSkeleton />;

	if (points.length === 0 && looseTabs.length === 0) {
		return (
			<div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-14 text-center">
				<LayoutGrid className="size-8 text-muted-foreground" />
				<span className="text-sm font-semibold">Nenhum ponto de atendimento cadastrado.</span>
				<span className="max-w-sm text-xs text-muted-foreground">Cadastre mesas, balcões ou quiosques para enxergar a ocupação do salão.</span>
				<Button size="sm" className="mt-1" onClick={onCreatePoint}>
					<Plus className="size-4" />
					CADASTRAR PONTO
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-5">
			{areas.map(([area, areaPoints]) => {
				const busy = areaPoints.filter((point) => tabsByPoint.has(point.id)).length;
				return (
					<AreaSection key={area} title={`${area} · ${busy} de ${areaPoints.length} ocupadas`}>
						{areaPoints.map((point) => {
							const pointTabs = tabsByPoint.get(point.id);
							return pointTabs ? (
								<OccupiedTile
									key={point.id}
									label={point.rotulo}
									pointTabs={pointTabs}
									now={now}
									selectedTabId={selectedId}
									onSelectTab={onSelect}
									onEdit={() => onEditPoint(point.id)}
								/>
							) : (
								<FreePointTile key={point.id} point={point} onOpen={() => onOpenFree(point.id)} onEdit={() => onEditPoint(point.id)} />
							);
						})}
					</AreaSection>
				);
			})}
			{looseTabs.length > 0 ? (
				<AreaSection title={`Comandas avulsas · ${looseTabs.length} ${looseTabs.length === 1 ? "aberta" : "abertas"}`}>
					{looseTabs.map((tab) => (
						<OccupiedTile key={tab.id} label={tab.label} pointTabs={[tab]} now={now} selectedTabId={selectedId} onSelectTab={onSelect} />
					))}
				</AreaSection>
			) : null}
		</div>
	);
}

// ============================================================================
// Por comanda
// ============================================================================

type PorComandaProps = {
	loading: boolean;
	hasAnyCard: boolean;
	cards: TServiceCard[];
	tabByCard: Map<string, TBoardTab>;
	cardsInUse: boolean;
	now: number;
	selectedId: string | null;
	onSelect: (tabId: string) => void;
	onOpenFree: (codigo: string) => void;
	onEditCard: (cardId: string) => void;
	onCreateCards: () => void;
};

function PorComanda({
	loading,
	hasAnyCard,
	cards,
	tabByCard,
	cardsInUse,
	now,
	selectedId,
	onSelect,
	onOpenFree,
	onEditCard,
	onCreateCards,
}: PorComandaProps) {
	if (loading) return <CardGridSkeleton />;

	if (!hasAnyCard) {
		return (
			<div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-14 text-center">
				<IdCard className="size-8 text-muted-foreground" />
				<span className="text-sm font-semibold">Nenhuma comanda cadastrada.</span>
				<span className="max-w-sm text-xs text-muted-foreground">
					Gere uma sequência numerada (ex.: 001 a 200) e baixe o arquivo para a gráfica imprimir os cartões com QR.
				</span>
				<Button size="sm" className="mt-1" onClick={onCreateCards}>
					<Plus className="size-4" />
					Gerar comandas
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{!cardsInUse ? (
				<div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
					<Info className="mt-0.5 size-4 shrink-0" />
					<span>
						As comandas ainda não são usadas para abrir contas. Quando os cartões estiverem prontos, ative em{" "}
						<span className="font-bold text-foreground">Modo de atendimento</span> uma forma com comandas e{" "}
						<span className="font-bold text-foreground">Usar comandas cadastradas</span>.
					</span>
				</div>
			) : null}
			{cards.length === 0 ? (
				<div className="flex flex-col items-center gap-1.5 px-4 py-12 text-center text-muted-foreground">
					<SearchX className="size-5" />
					<span className="text-sm font-bold text-foreground">Nenhuma comanda encontrada</span>
					<span className="text-xs">Ajuste a busca ou o filtro.</span>
				</div>
			) : (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] items-start gap-2.5">
					{cards.map((card) => {
						const tab = tabByCard.get(card.id);
						return tab ? (
							<OccupiedTile
								key={card.id}
								label={`Comanda ${card.codigo}`}
								pointTabs={[tab]}
								now={now}
								selectedTabId={selectedId}
								onSelectTab={onSelect}
								onEdit={() => onEditCard(card.id)}
								editLabel={`Editar comanda ${card.codigo}`}
								// O tile ja e a comanda: a linha diz onde ela esta e de quem e.
								rowLabel={(row) => row.servicePoint?.rotulo ?? row.cliente?.nome ?? row.responsavelVendedor?.nome ?? "Conta"}
							/>
						) : (
							<FreeCardTile key={card.id} card={card} onOpen={cardsInUse ? () => onOpenFree(card.codigo) : undefined} onEdit={() => onEditCard(card.id)} />
						);
					})}
				</div>
			)}
		</div>
	);
}

function AreaSection({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-2.5">
			<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</span>
			{/* items-start: tile nao estica ate o mais alto da linha (ocupado vs. livre e a leitura do salao). */}
			<div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] items-start gap-2.5">{children}</div>
		</div>
	);
}

// ============================================================================
// Pecas
// ============================================================================

type FilterChipProps = {
	icon: LucideIcon;
	label: string;
	count: number;
	active: boolean;
	tone?: "danger" | "warning";
	onClick: () => void;
};

/**
 * Filtro do board. Os de status sao semanticos (cor + icone + contador cheio) e
 * apagam quando zerados; os de tipo ficam neutros, depois do divisor.
 */
function FilterChip({ icon: Icon, label, count, active, tone, onClick }: FilterChipProps) {
	const zero = count === 0 && !!tone;
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border pr-2.5 pl-2.5 text-xs font-bold transition-colors",
				!tone && (active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-secondary/60"),
				tone === "danger" &&
					(active
						? "border-destructive bg-destructive text-white"
						: zero
							? "border-border bg-card text-muted-foreground"
							: "border-destructive/25 bg-destructive/10 text-destructive"),
				tone === "warning" &&
					(active
						? "border-warning bg-warning text-warning-foreground"
						: zero
							? "border-border bg-card text-muted-foreground"
							: "border-warning/40 bg-warning-surface text-warning-surface-foreground"),
			)}
		>
			<Icon className="size-3.5" />
			{label}
			{tone ? (
				<span
					className={cn(
						"flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums",
						active
							? "bg-white/35"
							: zero
								? "bg-secondary text-muted-foreground"
								: tone === "danger"
									? "bg-destructive text-white"
									: "bg-warning text-warning-foreground",
					)}
				>
					{count}
				</span>
			) : (
				<span className={cn("font-bold tabular-nums", active ? "text-background/75" : "text-muted-foreground")}>{count}</span>
			)}
		</button>
	);
}

function ModuleActions({
	contasHabilitadas,
	onOpenSettings,
	onCreateTab,
}: {
	contasHabilitadas: boolean;
	onOpenSettings: () => void;
	onCreateTab: () => void;
}) {
	return (
		<ActionToolbar>
			<ActionToolbar.Action icon={Settings2} onClick={onOpenSettings}>
				MODO DE ATENDIMENTO
			</ActionToolbar.Action>
			{contasHabilitadas ? (
				<ActionToolbar.Primary icon={Plus} onClick={onCreateTab}>
					NOVA CONTA
				</ActionToolbar.Primary>
			) : null}
		</ActionToolbar>
	);
}

function CardGridSkeleton() {
	return (
		<div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-2.5">
			{Array.from({ length: 6 }).map((_, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: skeletons estáticos
				<Skeleton key={index} className="h-40 w-full rounded-xl" />
			))}
		</div>
	);
}
