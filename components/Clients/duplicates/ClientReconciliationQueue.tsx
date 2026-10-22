"use client";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { usePendingClientDuplicates, usePendingClientDuplicatesCount } from "@/lib/queries/client-duplicates";
import { cn } from "@/lib/utils";
import type { TGetClientDuplicatesOutput } from "@/app/api/clients/duplicates/route";
import type { TClientDuplicateSignalTypeEnum } from "@/schemas/enums";
import { ArrowLeftIcon, CheckCheckIcon, ChevronRightIcon, CopyXIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { ClientReconciliation, useClientReconciliation, useReconciliationMenuActionProps } from "./ClientReconciliation";
import { DUPLICATE_SIGNAL_ORDER, DuplicateSignalChip, duplicateSignalPriority, resolveDuplicateSignal, sortDuplicateReasons } from "./signals";

type TPair = NonNullable<TGetClientDuplicatesOutput["data"]["default"]>["items"][number];

/** A contagem busca uma página de 100; acima disso o total exato não importa para a decisão. */
const COUNT_PAGE_SIZE = 100;

const MENU_TITLE = "RECONCILIAÇÃO DE CLIENTES";

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
				"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
				active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted",
			)}
		>
			{children}
		</button>
	);
}

type TSignalCounts = NonNullable<NonNullable<TGetClientDuplicatesOutput["data"]["default"]>["signalCounts"]>;

type QueueListProps = {
	pairs: TPair[];
	/** Contagem agregada no banco (independe das páginas carregadas e do filtro ativo). */
	signalCounts: TSignalCounts | null;
	signalFilter: TClientDuplicateSignalTypeEnum | null;
	onFilterChange: (filter: TClientDuplicateSignalTypeEnum | null) => void;
	onSelectPair: (pair: TPair) => void;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	fetchNextPage: () => void;
	/** Lista anterior exibida enquanto o novo filtro carrega. */
	isStale: boolean;
};

function QueueList({
	pairs,
	signalCounts,
	signalFilter,
	onFilterChange,
	onSelectPair,
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
	isStale,
}: QueueListProps) {
	// Ordena pelo sinal mais forte do par (CPF antes de telefone, telefone antes de e-mail):
	// os pares que quase certamente são a mesma pessoa aparecem primeiro.
	const sortedPairs = useMemo(() => {
		function strongestSignal(pair: TPair) {
			return Math.min(...pair.motivos.map((reason) => duplicateSignalPriority(reason.tipo)));
		}
		return [...pairs].sort((a, b) => strongestSignal(a) - strongestSignal(b));
	}, [pairs]);

	const filterableTypes = DUPLICATE_SIGNAL_ORDER.filter((tipo) => (signalCounts?.byType[tipo] ?? 0) > 0);

	if (pairs.length === 0 && !signalFilter) {
		return (
			<div className="flex w-full grow flex-col items-center justify-center gap-2 py-10 text-center">
				<CheckCheckIcon className="h-8 w-8 text-muted-foreground" />
				<p className="text-sm font-semibold">Tudo reconciliado</p>
				<p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
					Nenhuma duplicidade pendente. Contatos compartilhados são detectados ao atualizar cadastros; nomes semelhantes são verificados diariamente.
				</p>
			</div>
		);
	}

	return (
		<>
			{filterableTypes.length > 1 || signalFilter ? (
				<div className="flex w-full flex-wrap items-center gap-1.5">
					<FilterChip active={signalFilter === null} onClick={() => onFilterChange(null)}>
						Todos ({signalCounts?.total ?? pairs.length})
					</FilterChip>
					{filterableTypes.map((tipo) => (
						<FilterChip key={tipo} active={signalFilter === tipo} onClick={() => onFilterChange(signalFilter === tipo ? null : tipo)}>
							{resolveDuplicateSignal(tipo).short} ({signalCounts?.byType[tipo]})
						</FilterChip>
					))}
				</div>
			) : null}

			{sortedPairs.length === 0 ? (
				<p className="py-6 text-center text-xs text-muted-foreground">Nenhum par pendente com esse sinal.</p>
			) : (
				<ul className={cn("flex w-full flex-col overflow-hidden rounded-xl border border-border transition-opacity", isStale && "opacity-60")}>
					{sortedPairs.map((pair) => (
						<li key={pair.id} className="border-b border-border last:border-b-0">
							<button
								type="button"
								onClick={() => onSelectPair(pair)}
								className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
							>
								<span className="flex min-w-0 grow flex-col gap-1.5">
									<span className="truncate text-xs font-semibold">
										{pair.clienteA?.nome ?? "Cliente"} <span className="font-normal text-muted-foreground">×</span> {pair.clienteB?.nome ?? "Cliente"}
									</span>
									<span className="flex flex-wrap gap-1">
										{sortDuplicateReasons(pair.motivos).map((reason, index) => (
											<DuplicateSignalChip
												key={`${reason.tipo}-${index}`}
												tipo={reason.tipo}
												valor={reason.valor}
												labelStyle="short"
												size="xs"
												className="max-w-full"
											/>
										))}
									</span>
								</span>
								<ChevronRightIcon className="h-4 w-4 min-h-4 min-w-4 shrink-0 text-muted-foreground" />
							</button>
						</li>
					))}
				</ul>
			)}

			{hasNextPage ? (
				<div className="flex w-full justify-center">
					<Button type="button" variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={fetchNextPage}>
						{isFetchingNextPage ? "Carregando..." : "Carregar mais"}
					</Button>
				</div>
			) : null}
		</>
	);
}

type QueueMenuProps = QueueListProps & {
	closeMenu: () => void;
	selectedPair: TPair | null;
	onBack: () => void;
	listIsLoading: boolean;
	listError: string | null;
};

/**
 * Um único ResponsiveMenu que alterna entre a lista de pares e a comparação
 * inline; precisa viver dentro do provider para montar o rodapé de mesclagem.
 */
function QueueMenu({ closeMenu, selectedPair, onBack, listIsLoading, listError, ...listProps }: QueueMenuProps) {
	const { state, meta } = useClientReconciliation();
	const actionProps = useReconciliationMenuActionProps();

	if (selectedPair) {
		const detailBaseProps = {
			menuTitle: MENU_TITLE,
			menuDescription: "Compare os cadastros, escolha qual será mantido e mescle o histórico, ou descarte o par se não forem a mesma pessoa.",
			stateIsLoading: state.isLoading,
			stateError: state.error,
			closeMenu,
			dialogVariant: "md",
			drawerVariant: "lg",
			lockClose: state.isPending,
		} as const;

		const backRow = (
			<div className="flex w-full items-center gap-1.5">
				<Button type="button" variant="ghost" size="xs" disabled={state.isPending} onClick={onBack} className="gap-1 px-2 text-muted-foreground">
					<ArrowLeftIcon />
					Fila
				</Button>
				<span className="min-w-0 truncate text-xs font-semibold text-muted-foreground">
					{selectedPair.clienteA?.nome ?? "Cliente"} × {selectedPair.clienteB?.nome ?? "Cliente"}
				</span>
			</div>
		);

		if (!meta.canReconcile) {
			return (
				<ResponsiveMenu {...detailBaseProps} mode="read-only" menuCancelButtonText="FECHAR">
					{backRow}
					<ClientReconciliation.Body />
				</ResponsiveMenu>
			);
		}

		return (
			<ResponsiveMenu {...detailBaseProps} {...actionProps}>
				{backRow}
				<ClientReconciliation.Body />
			</ResponsiveMenu>
		);
	}

	return (
		<ResponsiveMenu
			mode="read-only"
			menuTitle={MENU_TITLE}
			menuDescription="Possíveis cadastros duplicados detectados por CPF/CNPJ, telefone, e-mail, @ do Instagram ou nome semelhante. Confira os dados antes de mesclar."
			menuCancelButtonText="FECHAR"
			stateIsLoading={listIsLoading}
			stateError={listError}
			closeMenu={closeMenu}
			dialogVariant="sm"
			drawerVariant="md"
		>
			<QueueList {...listProps} />
		</ResponsiveMenu>
	);
}

/**
 * Fila global de reconciliação: botão no cabeçalho da página de clientes com o
 * total pendente. Abre um único menu em que a lista de pares e a comparação se
 * alternam inline — sem diálogo sobre diálogo.
 */
export function ClientReconciliationQueue({ canReconcile }: { canReconcile: boolean }) {
	const [queueOpen, setQueueOpen] = useState(false);
	const [selectedPair, setSelectedPair] = useState<TPair | null>(null);
	const [signalFilter, setSignalFilter] = useState<TClientDuplicateSignalTypeEnum | null>(null);

	const listQuery = usePendingClientDuplicates({ enabled: queueOpen, signalType: signalFilter });
	const countQuery = usePendingClientDuplicatesCount();
	const pendingCount = countQuery.data?.items.length ?? 0;
	const hasMoreThanCounted = !!countQuery.data?.nextCursor;

	const pairs = listQuery.data?.pages.flatMap((page) => page.items) ?? [];
	const signalCounts = listQuery.data?.pages[0]?.signalCounts ?? null;

	if (pendingCount === 0) return null;

	function closeQueue() {
		setQueueOpen(false);
		setSelectedPair(null);
	}

	return (
		<>
			<Button variant="outline" size="sm" onClick={() => setQueueOpen(true)} className="gap-1.5">
				<CopyXIcon />
				RECONCILIAÇÃO
				<Chip.Root variant="brand" size="xs" shape="pill">
					<Chip.Label weight="bold" className="tabular-nums">
						{hasMoreThanCounted ? `${COUNT_PAGE_SIZE}+` : pendingCount}
					</Chip.Label>
				</Chip.Root>
			</Button>

			{queueOpen ? (
				<ClientReconciliation.Provider
					pairId={selectedPair?.id ?? ""}
					perspectiveClienteId={selectedPair?.clienteA?.id ?? ""}
					canReconcile={canReconcile}
					onResolved={() => {
						setSelectedPair(null);
						void listQuery.refetch();
						void countQuery.refetch();
					}}
				>
					<QueueMenu
						closeMenu={closeQueue}
						selectedPair={selectedPair}
						onBack={() => setSelectedPair(null)}
						listIsLoading={listQuery.isLoading}
						listError={listQuery.isError ? getErrorMessage(listQuery.error) : null}
						pairs={pairs}
						signalCounts={signalCounts}
						signalFilter={signalFilter}
						onFilterChange={setSignalFilter}
						onSelectPair={setSelectedPair}
						hasNextPage={!!listQuery.hasNextPage}
						isFetchingNextPage={listQuery.isFetchingNextPage}
						fetchNextPage={() => void listQuery.fetchNextPage()}
						isStale={listQuery.isPlaceholderData}
					/>
				</ClientReconciliation.Provider>
			) : null}
		</>
	);
}
