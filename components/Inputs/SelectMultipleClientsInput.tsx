import { useClientsByIds, useClientsBySearch } from "@/lib/queries/clients";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, UserRound, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { Button } from "../ui/button";
import { chipVariants } from "../ui/chip";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "../ui/command";
import { Drawer, DrawerContent, DrawerTrigger } from "../ui/drawer";
import { Field, FieldLabel } from "../ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

type SelectMultipleClientsInputProps = {
	label: string;
	labelClassName?: string;
	holderClassName?: string;
	showLabel?: boolean;
	selected: string[];
	editable?: boolean;
	handleChange: (value: string[]) => void;
	onReset: () => void;
};

function SelectMultipleClientsInput({
	label,
	labelClassName,
	holderClassName,
	showLabel = true,
	selected,
	editable = true,
	handleChange,
	onReset,
}: SelectMultipleClientsInputProps) {
	const { data: searchClients, isLoading, isError, isSuccess, search, updateSearch } = useClientsBySearch({ initialSearch: "" });
	// Seleção que veio pronta (persistida) não passou por nenhuma busca, então seus nomes não
	// estariam em `knownClientsById` — o gatilho mostraria só a contagem. Hidrata por ID.
	const { data: preselectedClients } = useClientsByIds({ clientIds: selected });
	const [knownClientsById, setKnownClientsById] = useState(new Map<string, NonNullable<typeof searchClients>[number]>());

	useEffect(() => {
		const incoming = [...(searchClients ?? []), ...(preselectedClients ?? [])];
		if (incoming.length === 0) return;
		setKnownClientsById((prev) => {
			const next = new Map(prev);
			for (const client of incoming) next.set(client.id, client);
			return next;
		});
	}, [searchClients, preselectedClients]);

	const selectedClientsById = useMemo(() => {
		return new Map([...(searchClients ?? []).map((client) => [client.id, client] as const), ...knownClientsById]);
	}, [knownClientsById, searchClients]);

	const isDesktop = useMediaQuery("(min-width: 768px)");
	const [isOpen, setIsOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	// `undefined`, nunca `null`: o FloatingPortal do Base UI trata `container === null` como "container
	// ainda não resolvido" e desiste de criar o portal, então o popup não renderiza. Só com `undefined`
	// ele cai no fallback `document.body` — que é o caso de toda tela que não é modal.
	const dialogContainer = (triggerRef.current?.closest("[data-dialog-container]") as HTMLElement | null) ?? undefined;

	const generatedId = useId();
	const inputIdentifier = `${label.toLowerCase().replaceAll(" ", "_")}_${generatedId}`;

	function handleSelect(id: string) {
		if (selected.includes(id)) {
			handleChange(selected.filter((item) => item !== id));
		} else {
			handleChange([...selected, id]);
		}
	}

	function resetState() {
		onReset();
		setIsOpen(false);
	}

	const namedSelection = selected.map((id) => selectedClientsById.get(id)?.nome).filter((nome): nome is string => Boolean(nome));
	// Quem já está na lista, com nome quando a hidratação por ID chegou. Alimenta os chips abaixo
	// do gatilho e o grupo "selecionados" do menu — antes, ver ou tirar alguém exigia lembrar o
	// nome e pesquisar de novo.
	const selectedClients = selected.map((id) => ({ id, client: selectedClientsById.get(id) ?? null }));
	const isSearching = search.trim().length >= 2;
	const triggerLabel =
		selected.length === 0
			? "NENHUM SELECIONADO"
			: selected.length === 1
				? (selectedClientsById.get(selected[0])?.nome ?? "1 CLIENTE SELECIONADO")
				: // Dois nomes cabem no gatilho; a partir daí a contagem informa mais que a truncagem.
					namedSelection.length === selected.length && selected.length === 2
					? namedSelection.join(", ")
					: `${selected.length} CLIENTES SELECIONADOS`;

	const renderTrigger = () => (
		<Button
			ref={triggerRef}
			id={inputIdentifier}
			type="button"
			disabled={!editable}
			variant="outline"
			aria-expanded={isOpen}
			className={cn("w-full justify-between truncate border-border", holderClassName)}
		>
			{triggerLabel}
			<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
		</Button>
	);

	const renderContent = () => (
		<Command shouldFilter={false} className="w-full">
			<CommandInput placeholder="Pesquisar clientes (nome, telefone, CPF/CNPJ)..." value={search} onValueChange={updateSearch} />
			<CommandList>
				<CommandGroup>
					<CommandItem value="reset-selection-option" onSelect={() => resetState()} className="cursor-pointer">
						LIMPAR SELEÇÃO
						<Check className={cn("ml-auto h-4 w-4", selected.length === 0 ? "opacity-100" : "opacity-0")} />
					</CommandItem>
				</CommandGroup>

				<CommandSeparator />

				{/* Sem busca digitada o menu mostra quem já está na lista, cada um desmarcável no
				    lugar. Com busca, a lista de resultados assume — o item já marcado aparece lá
				    com o check. */}
				{!isSearching && selectedClients.length > 0 && (
					<>
						<CommandGroup heading={`SELECIONADOS (${selectedClients.length})`}>
							{selectedClients.map(({ id, client }) => (
								<CommandItem
									key={id}
									value={`selected-${id}`}
									onSelect={() => {
										if (editable) handleSelect(id);
									}}
									className="cursor-pointer"
								>
									<div className="flex grow items-center gap-2 justify-between min-w-0">
										<div className="flex items-center gap-1.5 flex-1 min-w-0">
											<UserRound className="w-3.5 h-3.5 min-w-3.5 min-h-3.5 text-muted-foreground" />
											<p className="text-sm font-medium truncate">{client?.nome ?? "Carregando..."}</p>
										</div>
										{client?.telefone ? <p className="text-xs text-muted-foreground shrink-0">{client.telefone}</p> : null}
									</div>
									<Check className="ml-auto h-4 w-4 opacity-100" />
								</CommandItem>
							))}
						</CommandGroup>
						<CommandSeparator />
					</>
				)}

				{isLoading && <div className="p-2 text-center text-xs text-foreground/80">Carregando...</div>}
				{isError && <div className="p-2 text-center text-xs text-destructive">Erro ao buscar clientes.</div>}

				{!isSearching && !isLoading && (
					<div className="p-2 text-center text-xs text-muted-foreground italic">
						{selectedClients.length > 0 ? "Digite pelo menos 2 caracteres para adicionar mais clientes." : "Digite pelo menos 2 caracteres para buscar."}
					</div>
				)}

				{isSearching && isSuccess && searchClients && (
					<CommandGroup>
						{searchClients.length === 0 && (
							<div className="p-2 text-center text-sm italic text-foreground">Nenhum cliente encontrado.</div>
						)}
						{searchClients.map((client) => (
							<CommandItem
								key={client.id}
								value={client.id}
								onSelect={() => {
									if (editable) handleSelect(client.id);
								}}
								className="cursor-pointer"
							>
								<div className="flex grow items-center gap-2 justify-between min-w-0">
									<div className="flex items-center gap-1.5 flex-1 min-w-0">
										<UserRound className="w-3.5 h-3.5 min-w-3.5 min-h-3.5 text-muted-foreground" />
										<p className="text-sm font-medium truncate">{client.nome}</p>
									</div>
									{client.telefone ? (
										<p className="text-xs text-muted-foreground shrink-0">{client.telefone}</p>
									) : (
										<p className="text-xs text-destructive shrink-0">SEM TELEFONE</p>
									)}
								</div>
								{selected.includes(client.id) ? <Check className="ml-auto h-4 w-4 opacity-100" /> : null}
							</CommandItem>
						))}
					</CommandGroup>
				)}
			</CommandList>
		</Command>
	);

	// A seleção fica visível sem abrir nada: um chip por cliente, com o X que tira dali mesmo.
	// Chips rolam depois de ~5 linhas para uma lista de exclusão longa não empurrar o formulário.
	const renderSelectedChips = () =>
		selectedClients.length > 0 ? (
			<ul className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/30" aria-label={`${label}: selecionados`}>
				{selectedClients.map(({ id, client }) => (
					<li key={id} className={cn(chipVariants({ variant: "muted", size: "sm", shape: "pill" }), "max-w-full gap-1 py-1 pr-1")}>
						<span className="truncate">{client?.nome ?? "Carregando..."}</span>
						{editable && (
							<button
								type="button"
								aria-label={`Remover ${client?.nome ?? "cliente"}`}
								className="flex size-4 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
								onClick={() => handleSelect(id)}
							>
								<X className="size-3" />
							</button>
						)}
					</li>
				))}
			</ul>
		) : null;

	if (isDesktop) {
		return (
			<Field className="gap-1" data-disabled={!editable}>
				{showLabel && (
					<FieldLabel htmlFor={inputIdentifier} className={cn("text-start text-sm font-medium tracking-tight text-foreground/80", labelClassName)}>
						{label}
					</FieldLabel>
				)}
				<Popover open={isOpen} onOpenChange={setIsOpen}>
					<PopoverTrigger render={renderTrigger()} />
					<PopoverContent container={dialogContainer} className="w-[400px] p-0" align="start">
						{renderContent()}
					</PopoverContent>
				</Popover>
				{renderSelectedChips()}
			</Field>
		);
	}

	return (
		<Field className="gap-1" data-disabled={!editable}>
			{showLabel && (
				<FieldLabel htmlFor={inputIdentifier} className={cn("text-start text-sm font-medium tracking-tight text-foreground/80", labelClassName)}>
					{label}
				</FieldLabel>
			)}
			<Drawer open={isOpen} onOpenChange={setIsOpen}>
				<DrawerTrigger asChild>{renderTrigger()}</DrawerTrigger>
				<DrawerContent>
					<div className="mt-4 border-t p-2 pb-8">{renderContent()}</div>
				</DrawerContent>
			</Drawer>
			{renderSelectedChips()}
		</Field>
	);
}

export default SelectMultipleClientsInput;
