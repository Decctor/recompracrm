"use client";

import type { TGlobalSearchEntityType } from "@/app/api/global-search/route";
import NewClient from "@/components/Modals/Clients/NewClient";
import NewProduct from "@/components/Modals/Products/NewProduct";
import NewSeller from "@/components/Modals/Sellers/NewSeller";
import { AppSidebarConfig, filterSidebarConfig, type TSidebarItem } from "@/components/Sidebar/app-sidebar-config";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { canAccessDashboardCapability, type TDashboardCapability } from "@/lib/access/capabilities";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { useDebouncedText } from "@/lib/hooks/use-debounced-text";
import { appRoutes } from "@/lib/navigation/routes";
import { canCreateClients, canManageClientBase } from "@/lib/permissions/clients";
import { useGlobalSearch } from "@/lib/queries/global-search";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Package, ReceiptText, ScanBarcode, Search, UserRound, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Paleta de comandos do header (⌘K / Ctrl+K): busca global + ações rápidas + navegação.
 *
 * O termo vazio mostra ações e destinos; a partir de 2 caracteres a busca assume e o cmdk deixa de
 * filtrar localmente (os resultados já vêm filtrados do servidor). A relação cliente → vendas é o
 * uso mais comum: o mesmo termo que encontra o cliente encontra, no grupo "Vendas", as compras dele.
 */

type TEntityConfig = { rotulo: string; icon: React.ElementType; className: string };

// Paleta fechada do DESIGN.md: azul (primário), ouro (brand) e o secundário da organização. Nada de
// roxo/esmeralda de template.
const ENTITY_CONFIG: Record<TGlobalSearchEntityType, TEntityConfig> = {
	clients: { rotulo: "Clientes", icon: UsersRound, className: "border-primary/20 bg-primary/10 text-primary" },
	sales: { rotulo: "Vendas", icon: ReceiptText, className: "border-brand/35 bg-brand/18 text-foreground" },
	products: { rotulo: "Produtos", icon: Package, className: "border-brand-secondary/25 bg-brand-secondary/10 text-brand-secondary" },
	sellers: { rotulo: "Vendedores", icon: UserRound, className: "border-border bg-muted text-muted-foreground" },
};
const ENTITY_ORDER: TGlobalSearchEntityType[] = ["clients", "sales", "products", "sellers"];
const ENTITY_CAPABILITY: Record<TGlobalSearchEntityType, TDashboardCapability> = {
	clients: "customers",
	sales: "sales",
	products: "products",
	sellers: "sellers",
};

type TQuickActionModal = "newClient" | "newProduct" | "newSeller";
type TQuickAction = {
	key: string;
	rotulo: string;
	icon: React.ElementType;
	capability: TDashboardCapability;
	/** Além de ver o módulo, a ação de criar exige a permissão de escrita dele. */
	allowed?: (permissions: NonNullable<TAuthUserSession["membership"]>["permissoes"]) => boolean;
} & ({ kind: "modal"; modal: TQuickActionModal } | { kind: "route"; url: string });

const QUICK_ACTIONS: TQuickAction[] = [
	{ key: "new-sale", rotulo: "Nova venda", icon: ScanBarcode, capability: "newSale", kind: "route", url: appRoutes.sales.new() },
	{
		key: "new-client",
		rotulo: "Novo cliente",
		icon: UsersRound,
		capability: "customers",
		allowed: canCreateClients,
		kind: "modal",
		modal: "newClient",
	},
	{ key: "new-product", rotulo: "Novo produto", icon: Package, capability: "products", kind: "modal", modal: "newProduct" },
	{
		key: "new-seller",
		rotulo: "Novo vendedor",
		icon: UserRound,
		capability: "sellers",
		allowed: (permissions) => permissions.usuarios.editar,
		kind: "modal",
		modal: "newSeller",
	},
];

/** Achata a árvore da sidebar em destinos navegáveis: pai com url + filhos, sem duplicar o pai que só agrupa. */
function flattenNavigation(items: TSidebarItem[]): TSidebarItem[] {
	return items.flatMap((item) => {
		const children = item.items ? flattenNavigation(item.items) : [];
		const childUrls = new Set(children.map((child) => child.url));
		const self = item.url && !childUrls.has(item.url) ? [item] : [];
		return [...self, ...children];
	});
}

function Kbd({ children }: { children: React.ReactNode }) {
	return <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">{children}</kbd>;
}

type CommandPaletteProps = {
	user: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};

export function CommandPalette({ user, membership }: CommandPaletteProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [activeFilters, setActiveFilters] = useState<TGlobalSearchEntityType[]>([]);
	const [activeModal, setActiveModal] = useState<TQuickActionModal | null>(null);
	const [isApplePlatform, setIsApplePlatform] = useState(true);

	useEffect(() => {
		setIsApplePlatform(/Mac|iPhone|iPad|iPod/.test(window.navigator.platform || window.navigator.userAgent));
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((previous) => !previous);
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	useEffect(() => {
		if (!open) {
			setSearch("");
			setActiveFilters([]);
		}
	}, [open]);

	const capabilityContext = useMemo(() => ({ organization: membership.organizacao, permissions: membership.permissoes }), [membership]);
	const searchEntities = useMemo(
		() => ENTITY_ORDER.filter((entity) => canAccessDashboardCapability(ENTITY_CAPABILITY[entity], capabilityContext)),
		[capabilityContext],
	);
	const quickActions = useMemo(
		() =>
			QUICK_ACTIONS.filter(
				(action) => canAccessDashboardCapability(action.capability, capabilityContext) && (action.allowed?.(capabilityContext.permissions) ?? true),
			),
		[capabilityContext],
	);
	const navigationItems = useMemo(
		() => flattenNavigation(filterSidebarConfig(AppSidebarConfig, capabilityContext).flatMap((group) => group.items)),
		[capabilityContext],
	);

	const trimmedSearch = search.trim();
	const debouncedSearch = useDebouncedText(trimmedSearch, 250);
	const shouldSearch = trimmedSearch.length >= 2;

	const { data, isLoading, isFetching, isError } = useGlobalSearch({
		search: debouncedSearch,
		entities: activeFilters,
		limit: 5,
		enabled: open && shouldSearch,
	});

	const toggleFilter = useCallback((entity: TGlobalSearchEntityType) => {
		setActiveFilters((previous) => (previous.includes(entity) ? previous.filter((item) => item !== entity) : [...previous, entity]));
	}, []);

	const navigateTo = useCallback(
		(url: string) => {
			setOpen(false);
			router.push(url);
		},
		[router],
	);

	const runQuickAction = useCallback(
		(action: TQuickAction) => {
			setOpen(false);
			if (action.kind === "route") router.push(action.url);
			else setActiveModal(action.modal);
		},
		[router],
	);

	// Quem cria pela paleta pode estar em qualquer tela: invalida as listagens da entidade para que a
	// página aberta (se for a dela) reflita o registro novo sem recarregar.
	const invalidateEntityQueries = useCallback(
		(prefix: "client" | "product" | "seller") => {
			void queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith(prefix) });
		},
		[queryClient],
	);

	// Enquanto o termo digitado ainda não virou o termo debounced, os resultados na tela são do termo
	// anterior — mostra o spinner para o usuário não ler resultado velho como resposta.
	const isWaitingDebounce = shouldSearch && debouncedSearch !== trimmedSearch;
	const showLoading = shouldSearch && (isWaitingDebounce || isLoading);
	const hasResults = !!data && Object.values(data).some((items) => items.length > 0);
	const shortcutModifier = isApplePlatform ? "⌘" : "Ctrl";

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label="Buscar em todo o sistema"
				aria-keyshortcuts={isApplePlatform ? "Meta+K" : "Control+K"}
				className={cn(
					"flex shrink-0 items-center gap-2 rounded-lg bg-secondary px-2 py-1.5 text-muted-foreground",
					"transition-colors duration-200 hover:bg-secondary/70 hover:text-foreground",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
				)}
			>
				<Search aria-hidden className="size-3.5 shrink-0" />
				<span className="hidden text-xs font-semibold leading-none md:inline">Buscar</span>
				<kbd className="pointer-events-none hidden select-none items-center gap-0.5 rounded border border-border/60 bg-background px-1 font-mono text-[10px] font-medium leading-4 md:inline-flex">
					{shortcutModifier}K
				</kbd>
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent showCloseButton={false} className="top-[10%] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[15%] sm:max-w-[640px]">
					<DialogTitle className="sr-only">Busca global</DialogTitle>
					<DialogDescription className="sr-only">Busque clientes, vendas, produtos e vendedores, ou acesse ações e páginas rapidamente.</DialogDescription>
					<Command shouldFilter={!shouldSearch} loop>
						<CommandInput placeholder="Buscar cliente, venda, produto, vendedor..." value={search} onValueChange={setSearch} />

						<div className="flex flex-wrap gap-1.5 px-2 pt-2 pb-1">
							{searchEntities.map((entity) => {
								const config = ENTITY_CONFIG[entity];
								const Icon = config.icon;
								const isActive = activeFilters.includes(entity);
								return (
									<button
										type="button"
										key={entity}
										aria-pressed={isActive}
										onClick={() => toggleFilter(entity)}
										className={cn(
											"inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
											isActive ? config.className : "border-border bg-background text-muted-foreground hover:bg-muted",
										)}
									>
										<Icon aria-hidden className="size-3" />
										{config.rotulo}
									</button>
								);
							})}
						</div>

						<CommandList className="max-h-[min(60svh,420px)]">
							{showLoading ? (
								<div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
									<Loader2 className="size-4 animate-spin" />
									Buscando...
								</div>
							) : null}

							{shouldSearch && !showLoading && isError ? (
								<div className="py-6 text-center text-sm text-destructive">Não foi possível buscar agora. Tente novamente.</div>
							) : null}

							{shouldSearch && !showLoading && !isError && !hasResults ? <CommandEmpty>Nenhum resultado para "{trimmedSearch}".</CommandEmpty> : null}

							{shouldSearch && !showLoading && data
								? ENTITY_ORDER.map((entity) => {
										const items = data[entity];
										if (!items || items.length === 0) return null;
										const config = ENTITY_CONFIG[entity];
										const Icon = config.icon;
										return (
											<CommandGroup key={entity} heading={`${config.rotulo} (${items.length})`}>
												{items.map((item) => (
													<CommandItem key={`${entity}-${item.id}`} value={`${entity}-${item.id}`} onSelect={() => navigateTo(item.url)} className="gap-3">
														<span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", config.className)}>
															<Icon className="size-4" />
														</span>
														<span className="flex min-w-0 flex-col">
															<span className="truncate text-sm font-semibold">{item.rotulo}</span>
															{item.descricao ? <span className="truncate text-xs text-muted-foreground">{item.descricao}</span> : null}
														</span>
													</CommandItem>
												))}
											</CommandGroup>
										);
									})
								: null}

							{shouldSearch && isFetching && !showLoading ? (
								<div className="flex items-center justify-center py-1">
									<Loader2 className="size-3 animate-spin text-muted-foreground/50" />
								</div>
							) : null}

							{!shouldSearch ? (
								<>
									<CommandEmpty>Nenhuma ação ou página com esse nome. Digite ao menos 2 caracteres para buscar registros.</CommandEmpty>
									{quickActions.length > 0 ? (
										<CommandGroup heading="Ações rápidas">
											{quickActions.map((action) => {
												const Icon = action.icon;
												return (
													<CommandItem key={action.key} value={action.rotulo} onSelect={() => runQuickAction(action)}>
														<Icon aria-hidden className="text-muted-foreground" />
														<span className="font-medium">{action.rotulo}</span>
													</CommandItem>
												);
											})}
										</CommandGroup>
									) : null}
									<CommandGroup heading="Navegação">
										{navigationItems.map((item) => (
											<CommandItem key={item.id} value={item.title} onSelect={() => item.url && navigateTo(item.url)}>
												{item.icon}
												<span>{item.title}</span>
											</CommandItem>
										))}
									</CommandGroup>
								</>
							) : null}
						</CommandList>

						<div className="hidden items-center gap-3 border-t border-border/50 px-3 py-2 text-xs text-muted-foreground sm:flex">
							<span className="flex items-center gap-1">
								<Kbd>↑↓</Kbd> navegar
							</span>
							<span className="flex items-center gap-1">
								<Kbd>↵</Kbd> abrir
							</span>
							<span className="flex items-center gap-1">
								<Kbd>esc</Kbd> fechar
							</span>
						</div>
					</Command>
				</DialogContent>
			</Dialog>

			{activeModal === "newClient" ? (
				<NewClient
					closeModal={() => setActiveModal(null)}
					canCreateTags={canManageClientBase(capabilityContext.permissions)}
					callbacks={{ onSettled: () => invalidateEntityQueries("client") }}
				/>
			) : null}
			{activeModal === "newProduct" ? (
				<NewProduct
					user={user}
					userMembership={membership}
					closeModal={() => setActiveModal(null)}
					callbacks={{ onSettled: () => invalidateEntityQueries("product") }}
				/>
			) : null}
			{activeModal === "newSeller" ? (
				<NewSeller user={user} closeModal={() => setActiveModal(null)} callbacks={{ onSettled: () => invalidateEntityQueries("seller") }} />
			) : null}
		</>
	);
}
