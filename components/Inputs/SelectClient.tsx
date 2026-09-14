"use client";

import type { TSearchClientsOutput } from "@/app/api/clients/search/route";
import { getErrorMessage } from "@/lib/errors";
import { formatNameAsInitials } from "@/lib/formatting";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useClientsBySearch } from "@/lib/queries/clients";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, IdCard, Phone, Search } from "lucide-react";
import { type ComponentProps, type ReactNode, type RefObject, createContext, use, useId, useRef, useState } from "react";
import ErrorComponent from "../Layouts/ErrorComponent";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "../ui/command";
import { Drawer, DrawerContent, DrawerTrigger } from "../ui/drawer";
import { Field, FieldLabel } from "../ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

// ---------------------------------------------------------------------------
// Select especializado de clientes (busca por nome, telefone ou CPF/CNPJ).
// Compound components com contexto compartilhado — o consumidor compõe as partes
// que precisa. Para o caso comum, use o default export `SelectClientInput`.
// ---------------------------------------------------------------------------

export type TClientBySearch = TSearchClientsOutput["data"]["clients"][number];
export type TSelectClientValue = { id: string; nome: string; telefone: string } | null;

type TSelectClientContext = {
	state: {
		isOpen: boolean;
		search: string;
	};
	actions: {
		setOpen: (open: boolean) => void;
		updateSearch: (value: string) => void;
		select: (client: TClientBySearch) => void;
		reset: () => void;
	};
	meta: {
		value: TSelectClientValue;
		editable: boolean;
		isDesktop: boolean;
		inputIdentifier: string;
		resetOptionLabel: string;
		clients: TClientBySearch[];
		isSearching: boolean;
		isError: boolean;
		error: Error | null;
		hasSettledSearch: boolean;
		triggerRef: RefObject<HTMLButtonElement | null>;
	};
};

const SelectClientContext = createContext<TSelectClientContext | null>(null);

function useSelectClientContext() {
	const context = use(SelectClientContext);
	if (!context) throw new Error("Componentes SelectClient.* devem ser usados dentro de SelectClient.Root.");
	return context;
}

// ---------------------------------------------------------------------------
// Root: provider + Field/label + shell responsivo (Popover no desktop, Drawer no mobile)
// ---------------------------------------------------------------------------

type SelectClientRootProps = {
	label: string;
	labelClassName?: string;
	showLabel?: boolean;
	editable?: boolean;
	resetOptionLabel?: string;
	initialSearch?: string;
	value: TSelectClientValue;
	onSelect: (client: TClientBySearch) => void;
	onReset: () => void;
	children: ReactNode;
};

function SelectClientRoot({
	label,
	labelClassName,
	showLabel = true,
	editable = true,
	resetOptionLabel = "Selecione um cliente...",
	initialSearch = "",
	value,
	onSelect,
	onReset,
	children,
}: SelectClientRootProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const [isOpen, setIsOpen] = useState(false);
	const generatedId = useId();
	const inputIdentifier = `${label.toLowerCase().replaceAll(" ", "_")}_${generatedId}`;
	const triggerRef = useRef<HTMLButtonElement>(null);

	const {
		search,
		updateSearch,
		isSearchPending,
		isFetching,
		isError,
		error,
		data: clients = [],
		debouncedSearch,
	} = useClientsBySearch({ initialSearch });

	const contextValue: TSelectClientContext = {
		state: { isOpen, search },
		actions: {
			setOpen: setIsOpen,
			updateSearch,
			select: (client) => {
				onSelect(client);
				setIsOpen(false);
			},
			reset: () => {
				onReset();
				setIsOpen(false);
			},
		},
		meta: {
			value,
			editable,
			isDesktop,
			inputIdentifier,
			resetOptionLabel,
			clients,
			isSearching: isSearchPending || isFetching,
			isError,
			error,
			hasSettledSearch: debouncedSearch.trim().length >= 2,
			triggerRef,
		},
	};

	const shell = isDesktop ? (
		<Popover modal={false} open={isOpen} onOpenChange={setIsOpen}>
			{children}
		</Popover>
	) : (
		<Drawer open={isOpen} onOpenChange={setIsOpen}>
			{children}
		</Drawer>
	);

	return (
		<SelectClientContext value={contextValue}>
			<Field className="gap-1" data-disabled={!editable}>
				{showLabel && (
					<FieldLabel htmlFor={inputIdentifier} className={cn("text-start text-sm font-medium tracking-tight text-foreground/80", labelClassName)}>
						{label}
					</FieldLabel>
				)}
				{shell}
			</Field>
		</SelectClientContext>
	);
}

// ---------------------------------------------------------------------------
// Trigger: botão padrão dos inputs (children opcional para conteúdo custom)
// ---------------------------------------------------------------------------

type SelectClientTriggerProps = {
	className?: string;
	children?: ReactNode;
} & Omit<ComponentProps<typeof Button>, "children" | "className">;

function SelectClientTrigger({ className, children, ...buttonProps }: SelectClientTriggerProps) {
	const {
		state: { isOpen },
		meta: { value, editable, isDesktop, inputIdentifier, resetOptionLabel, triggerRef },
	} = useSelectClientContext();

	const TriggerSlot = isDesktop ? PopoverTrigger : DrawerTrigger;

	return (
		<TriggerSlot asChild>
			<Button
				ref={triggerRef}
				id={inputIdentifier}
				type="button"
				disabled={!editable}
				variant="outline"
				aria-expanded={isOpen}
				className={cn("w-full justify-between truncate border-border", className)}
				{...buttonProps}
			>
				{children ?? <span className={cn("truncate", !value && "text-muted-foreground")}>{value?.nome ?? resetOptionLabel}</span>}
				<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
			</Button>
		</TriggerSlot>
	);
}

// ---------------------------------------------------------------------------
// Content: shell do popover/drawer + Command com busca e opção de reset
// ---------------------------------------------------------------------------

type SelectClientContentProps = {
	className?: string;
	listClassName?: string;
	searchPlaceholder?: string;
	children?: ReactNode;
};

function SelectClientContent({
	className,
	listClassName,
	searchPlaceholder = "Busque por nome, telefone ou CPF/CNPJ...",
	children,
}: SelectClientContentProps) {
	const {
		state: { search },
		actions: { updateSearch, reset },
		meta: { value, isDesktop, resetOptionLabel, triggerRef },
	} = useSelectClientContext();

	// `undefined`, nunca `null`: o FloatingPortal do Base UI trata `container === null` como "container
	// ainda não resolvido" e desiste de criar o portal, então o popup não renderiza. Só com `undefined`
	// ele cai no fallback `document.body` — que é o caso de toda tela que não é modal.
	const dialogContainer = (triggerRef.current?.closest("[data-dialog-container]") as HTMLElement | null) ?? undefined;

	const command = (
		<Command shouldFilter={false} className="flex w-full flex-col overflow-hidden">
			<CommandInput placeholder={searchPlaceholder} value={search} onValueChange={updateSearch} className="shrink-0" />
			<CommandList className="max-h-none overflow-visible p-0">
				<CommandGroup>
					<CommandItem value="reset-selection-option" onSelect={reset} className="cursor-pointer">
						{resetOptionLabel}
						<Check className={cn("ml-auto h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
					</CommandItem>
				</CommandGroup>
				<CommandSeparator />
				<div
					className={cn(
						"scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 min-h-0 overflow-y-auto overscroll-contain",
						listClassName ?? "max-h-[min(430px,55vh)]",
					)}
					onWheel={(event) => event.stopPropagation()}
				>
					{children ?? <SelectClientList />}
				</div>
			</CommandList>
		</Command>
	);

	if (isDesktop) {
		return (
			<PopoverContent
				container={dialogContainer}
				className={cn("flex max-h-[min(480px,var(--available-height))] w-[360px] flex-col overflow-hidden p-0", className)}
				align="start"
			>
				{command}
			</PopoverContent>
		);
	}

	return (
		<DrawerContent className="overflow-hidden">
			<div className={cn("mt-4 flex min-h-0 flex-col border-t p-2 pb-8", className)}>{command}</div>
		</DrawerContent>
	);
}

// ---------------------------------------------------------------------------
// List: estados de busca + resultados (renderItem é render prop de dados)
// ---------------------------------------------------------------------------

type SelectClientListProps = {
	renderItem?: (ctx: { client: TClientBySearch; selected: boolean }) => ReactNode;
};

function SelectClientList({ renderItem }: SelectClientListProps) {
	const {
		meta: { clients, isSearching, isError, error, hasSettledSearch, value },
	} = useSelectClientContext();

	if (isError) {
		return (
			<div className="p-2">
				<ErrorComponent msg={getErrorMessage(error)} />
			</div>
		);
	}

	if (!hasSettledSearch && !isSearching) {
		return (
			<div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
				<Search className="h-5 w-5 text-muted-foreground/60" />
				<p className="text-xs text-muted-foreground">Digite ao menos 2 caracteres para buscar por nome, telefone ou CPF/CNPJ.</p>
			</div>
		);
	}

	if (isSearching) {
		return <div className="p-3 text-center text-xs text-foreground/80">Buscando clientes...</div>;
	}

	if (clients.length === 0) {
		return <div className="p-3 text-center text-sm italic text-foreground">Nenhum cliente encontrado.</div>;
	}

	return (
		<CommandGroup>
			<div className="flex flex-col gap-1 p-1">
				{clients.map((client) => {
					const selected = value?.id === client.id;
					if (renderItem) return <div key={client.id}>{renderItem({ client, selected })}</div>;
					return <SelectClientItem key={client.id} client={client} />;
				})}
			</div>
		</CommandGroup>
	);
}

// ---------------------------------------------------------------------------
// Item: linha padrão de cliente (avatar de iniciais + nome + telefone/CPF)
// ---------------------------------------------------------------------------

type SelectClientItemProps = {
	client: TClientBySearch;
	children?: ReactNode;
};

function SelectClientItem({ client, children }: SelectClientItemProps) {
	const {
		actions: { select },
		meta: { value },
	} = useSelectClientContext();
	const selected = value?.id === client.id;

	return (
		<button
			type="button"
			className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border px-2 py-2 text-left transition-colors hover:bg-accent"
			onClick={() => select(client)}
		>
			{children ?? (
				<>
					<Avatar className="h-8 w-8 min-h-8 min-w-8 rounded-md">
						<AvatarFallback className="rounded-md text-[0.65rem]">{formatNameAsInitials(client.nome)}</AvatarFallback>
					</Avatar>
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-medium">{client.nome}</p>
						<div className="flex items-center gap-2 text-[0.7rem] text-foreground/70">
							{client.telefone ? (
								<span className="flex items-center gap-1 truncate">
									<Phone className="h-3 w-3 min-h-3 min-w-3" />
									{client.telefone}
								</span>
							) : null}
							{client.cpfCnpj ? (
								<span className="flex items-center gap-1 truncate">
									<IdCard className="h-3 w-3 min-h-3 min-w-3" />
									{client.cpfCnpj}
								</span>
							) : null}
						</div>
					</div>
				</>
			)}
			{selected && <Check className="h-4 w-4 shrink-0 text-foreground" />}
		</button>
	);
}

export const SelectClient = {
	Root: SelectClientRoot,
	Trigger: SelectClientTrigger,
	Content: SelectClientContent,
	List: SelectClientList,
	Item: SelectClientItem,
};

// ---------------------------------------------------------------------------
// Variant pronto para o caso comum: label + trigger padrão + lista padrão.
// Segue as convenções de props dos demais inputs do projeto.
// ---------------------------------------------------------------------------

type SelectClientInputProps = {
	label: string;
	labelClassName?: string;
	holderClassName?: string;
	contentClassName?: string;
	listClassName?: string;
	showLabel?: boolean;
	editable?: boolean;
	initialSearch?: string;
	resetOptionLabel?: string;
	value: TSelectClientValue;
	handleChange: (client: TClientBySearch) => void;
	onReset: () => void;
};

function SelectClientInput({
	label,
	labelClassName,
	holderClassName,
	contentClassName,
	listClassName,
	showLabel = true,
	editable = true,
	initialSearch,
	resetOptionLabel,
	value,
	handleChange,
	onReset,
}: SelectClientInputProps) {
	return (
		<SelectClient.Root
			label={label}
			labelClassName={labelClassName}
			showLabel={showLabel}
			editable={editable}
			initialSearch={initialSearch}
			resetOptionLabel={resetOptionLabel}
			value={value}
			onSelect={handleChange}
			onReset={onReset}
		>
			<SelectClient.Trigger className={holderClassName} />
			<SelectClient.Content className={contentClassName} listClassName={listClassName} />
		</SelectClient.Root>
	);
}

export default SelectClientInput;
