"use client";
import { LoadingButton } from "@/components/loading-button";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { clientVinculationFlowReducer, INITIAL_CLIENT_VINCULATION_FLOW_STATE } from "@/lib/clients/client-vinculation-flow";
import { isClientSearchIntentComplete, parseClientSearchIntent } from "@/lib/clients/parse-client-search-intent";
import { getErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/mutations/clients";
import { useClientsBySearch } from "@/lib/queries/clients";
import { cn } from "@/lib/utils";
import type { TSearchClientsOutput } from "@/app/api/clients/search/route";
import { useClientState } from "@/state-hooks/use-client-state";
import { useMutation } from "@tanstack/react-query";
import { IdCard, LinkIcon, Mail, Phone, Search, UserPlus } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useReducer, useState } from "react";
import { toast } from "sonner";
import { Input } from "../ui/input";

const ClientVinculationCreationForm = dynamic(() => import("./ClientVinculationCreationForm"), {
	loading: ClientCreationFormSkeleton,
});

function preloadClientVinculationCreationForm() {
	void import("./ClientVinculationCreationForm");
}

type ClientVinculationMenuProps = {
	closeModal: () => void;
	onSelectClient: (client: { id: string; nome: string; telefone: string }) => void;
	// Vendedor do contexto (ex.: vendedor selecionado na venda) para autoria do cadastro
	// criado via menu. Quando ausente, o servidor usa o vínculo vendedor da sessão.
	authorSellerId?: string | null;
};

export default function ClientVinculationMenu({ closeModal, onSelectClient, authorSellerId }: ClientVinculationMenuProps) {
	const {
		search,
		updateSearch,
		debouncedSearch,
		isSearchPending,
		data: clients = [],
		isFetching,
		isError,
		refetch,
	} = useClientsBySearch({ initialSearch: "" });
	const { state, updateClient, addClientLocation, updateClientLocation, removeClientLocation, resetState } = useClientState();
	const [flowState, dispatchFlow] = useReducer(clientVinculationFlowReducer, INITIAL_CLIENT_VINCULATION_FLOW_STATE);
	const [isCreationFormReady, setIsCreationFormReady] = useState(false);

	const { mutate: handleCreateClient, isPending } = useMutation({
		mutationKey: ["create-client-from-vinculation"],
		mutationFn: createClient,
		onSuccess: (response) => {
			toast.success(response.message);
			onSelectClient({
				id: response.data.insertedId,
				nome: state.client.nome,
				telefone: state.client.telefone ?? "",
			});
			resetState();
			closeModal();
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	const normalizedSearch = search.trim();
	const normalizedDebouncedSearch = debouncedSearch.trim();
	const hasSearch = normalizedSearch.length > 0;
	const hasEnoughSearch = normalizedSearch.length >= 2;
	const hasResults = clients.length > 0;
	const isSearchSettled = normalizedDebouncedSearch.length >= 2 && !isSearchPending && !isFetching;
	const isCreating = flowState.mode === "create";
	const showResults = flowState.mode === "search" && isSearchSettled && !isError && hasResults;
	const showEmptyResults = flowState.mode === "search" && isSearchSettled && !isError && !hasResults;
	const isCreateValid = state.client.nome.trim().length > 0;

	const startCreation = useCallback(
		({ searchToApply, source }: { searchToApply: string; source: "manual" | "no_results" }) => {
			const normalizedSearchToApply = searchToApply.trim();
			setIsCreationFormReady(false);
			resetState();

			const intent = parseClientSearchIntent(normalizedSearchToApply);
			switch (intent.kind) {
				case "name":
					updateClient({ nome: intent.nome });
					break;
				case "phone":
					updateClient({ telefone: intent.telefone });
					break;
				case "cpf_cnpj":
					updateClient({ cpfCnpj: intent.cpfCnpj });
					break;
			}

			dispatchFlow({ type: "START_CREATION", source, search: normalizedSearchToApply });
		},
		[resetState, updateClient],
	);

	// Sem resultado só abre o cadastro sozinho quando a busca é um identificador completo:
	// um telefone pela metade não é "cliente inexistente", é digitação em andamento — trocar de
	// modo aqui tirava o campo do operador antes de ele terminar o número.
	const isSearchIntentComplete = isClientSearchIntentComplete(normalizedDebouncedSearch);
	useEffect(() => {
		if (flowState.mode !== "search" || !isSearchSettled || isError || hasResults) return;
		if (!isSearchIntentComplete) return;
		if (flowState.suppressAutomaticCreationFor === normalizedDebouncedSearch) return;

		startCreation({ searchToApply: normalizedDebouncedSearch, source: "no_results" });
	}, [flowState, hasResults, isError, isSearchSettled, isSearchIntentComplete, normalizedDebouncedSearch, startCreation]);

	function handleSearchChange(value: string) {
		dispatchFlow({ type: "SEARCH_CHANGED", search: value });
		updateSearch(value);
	}

	function handleReturnToSearch() {
		setIsCreationFormReady(false);
		resetState();
		dispatchFlow({ type: "RETURN_TO_SEARCH" });
	}

	const handleCreationFormReady = useCallback(() => setIsCreationFormReady(true), []);

	function handleCreateAndLink() {
		if (!state.client.nome.trim()) {
			toast.error("Nome do cliente não informado.");
			return;
		}

		handleCreateClient({
			client: { ...state.client, autorVendedorId: authorSellerId ?? null },
			clientLocations: state.clientLocations
				.filter((location) => !location.deletar)
				.map((location) => ({
					titulo: location.titulo,
					localizacaoCep: location.localizacaoCep,
					localizacaoEstado: location.localizacaoEstado,
					localizacaoCidade: location.localizacaoCidade,
					localizacaoBairro: location.localizacaoBairro,
					localizacaoLogradouro: location.localizacaoLogradouro,
					localizacaoNumero: location.localizacaoNumero,
					localizacaoComplemento: location.localizacaoComplemento,
					localizacaoLatitude: location.localizacaoLatitude,
					localizacaoLongitude: location.localizacaoLongitude,
				})),
			clientTags: state.clientTags
				.filter((tag) => !tag.deletar)
				.map((tag) => ({
					clienteTagId: tag.clienteTagId,
				})),
		});
	}

	return (
		<ResponsiveMenu.Root
			open
			onOpenChange={(open) => {
				if (!open) closeModal();
			}}
		>
			<ResponsiveMenu.Content dialogVariant="sm" drawerVariant="full" dialogClassName="h-[60%] min-h-[60%] w-[40%] min-w-[40%] max-w-[40%]">
				<ResponsiveMenu.Header>
					<ResponsiveMenu.Title>VINCULAR CLIENTE</ResponsiveMenu.Title>
					<ResponsiveMenu.Description>Busque por nome, telefone ou CPF/CNPJ para vincular um cliente na venda.</ResponsiveMenu.Description>
				</ResponsiveMenu.Header>
				<ResponsiveMenu.Body>
					{flowState.mode === "search" ? (
						<Input
							value={search ?? ""}
							placeholder="Pesquisar cliente por nome, telefone ou CPF/CNPJ..."
							onChange={(event) => handleSearchChange(event.target.value)}
							className="min-h-10 w-full rounded-xl"
							autoFocus
						/>
					) : null}
					{flowState.mode === "search" && !hasSearch ? (
						<div className="flex flex-col items-center justify-center py-10 px-4">
							<div className="relative mb-4">
								<div className="relative w-14 h-14 rounded-2xl flex items-center justify-center bg-brand/5 border border-brand shadow-sm">
									<Search className="w-7 h-7 text-brand/60" strokeWidth={1.75} />
								</div>
							</div>
							<p className="text-sm font-medium text-foreground mb-1">Comece a buscar</p>
							<p className="text-xs text-muted-foreground text-center max-w-[240px] leading-relaxed">
								Digite nome, telefone ou CPF/CNPJ no campo acima para encontrar e vincular o cliente à venda.
							</p>
							<div className="mt-4 flex flex-wrap justify-center gap-2">
								{["NOME", "TELEFONE", "CPF/CNPJ"].map((hint) => (
									<span key={hint} className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-brand/60 text-brand-foreground border border-brand/80">
										{hint}
									</span>
								))}
							</div>
						</div>
					) : null}
					{flowState.mode === "search" && hasSearch && !hasEnoughSearch ? (
						<p className="py-6 text-center text-sm text-muted-foreground">Digite pelo menos 2 caracteres para buscar.</p>
					) : null}
					{flowState.mode === "search" && hasEnoughSearch && (isSearchPending || isFetching) ? <ClientSearchSkeleton /> : null}
					{flowState.mode === "search" && isSearchSettled && isError ? (
						<div className="flex flex-col items-center gap-3 py-8 text-center">
							<div className="space-y-1">
								<p className="text-sm font-semibold">Não foi possível buscar os clientes.</p>
								<p className="text-xs text-muted-foreground">Confira sua conexão e tente novamente.</p>
							</div>
							<Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
								TENTAR NOVAMENTE
							</Button>
						</div>
					) : null}
					{showResults ? (
						<div className="w-full flex flex-col gap-3">
							<CreateClientTrigger
								onPreload={preloadClientVinculationCreationForm}
								onClick={() => startCreation({ searchToApply: normalizedDebouncedSearch, source: "manual" })}
							/>
							<p className="text-sm font-medium">Clientes encontrados:</p>
							{clients.map((client) => (
								<ClientVinculationMenuCard key={client.id} client={client} handleSelectClient={onSelectClient} closeModal={closeModal} />
							))}
						</div>
					) : null}

					{showEmptyResults ? (
						<div className="flex flex-col items-center gap-3 py-8 text-center">
							<div className="space-y-1">
								<p className="text-sm font-semibold">Nenhum cliente encontrado.</p>
								<p className="text-xs text-muted-foreground">
									{isSearchIntentComplete ? "Tente outra busca ou cadastre um novo cliente." : "Continue digitando o telefone ou cadastre um novo cliente."}
								</p>
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onPointerEnter={preloadClientVinculationCreationForm}
								onFocus={preloadClientVinculationCreationForm}
								onClick={() => startCreation({ searchToApply: normalizedDebouncedSearch, source: "manual" })}
							>
								<UserPlus className="size-4" />
								CADASTRAR NOVO CLIENTE
							</Button>
						</div>
					) : null}

					{isCreating ? (
						<ClientVinculationCreationForm
							source={flowState.source}
							seedSearch={flowState.seedSearch}
							state={state}
							updateClient={updateClient}
							addClientLocation={addClientLocation}
							updateClientLocation={updateClientLocation}
							removeClientLocation={removeClientLocation}
							onReturnToSearch={handleReturnToSearch}
							onReady={handleCreationFormReady}
						/>
					) : null}
				</ResponsiveMenu.Body>
				<ResponsiveMenu.Footer>
					<ResponsiveMenu.Close variant="outline">CANCELAR</ResponsiveMenu.Close>
					{(isCreating ? "CADASTRAR E VINCULAR" : undefined) ? (
						<LoadingButton
							loading={isPending}
							onClick={isCreating ? handleCreateAndLink : undefined}
							disabled={!isCreating || !isCreationFormReady || !isCreateValid}
						>
							{isCreating ? "CADASTRAR E VINCULAR" : undefined}
						</LoadingButton>
					) : null}
				</ResponsiveMenu.Footer>
			</ResponsiveMenu.Content>
		</ResponsiveMenu.Root>
	);
}

function CreateClientTrigger({ onClick, onPreload }: { onClick: () => void; onPreload: () => void }) {
	return (
		<Button
			type="button"
			variant="outline"
			className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-left"
			onPointerEnter={onPreload}
			onFocus={onPreload}
			onClick={onClick}
		>
			<span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
				<UserPlus className="size-4" />
			</span>
			<span className="min-w-0 whitespace-normal">
				<span className="block text-sm font-semibold">Não é nenhum destes?</span>
				<span className="block text-xs font-normal text-muted-foreground">Cadastrar um novo cliente</span>
			</span>
		</Button>
	);
}

function ClientSearchSkeleton() {
	return (
		<div className="flex flex-col gap-3" aria-label="Buscando clientes">
			<Skeleton className="h-4 w-36" />
			{[0, 1, 2].map((item) => (
				<Skeleton key={item} className="h-[68px] w-full rounded-xl" />
			))}
		</div>
	);
}

function ClientCreationFormSkeleton() {
	return (
		<div className="flex flex-col gap-4" aria-label="Carregando formulário de cadastro">
			<Skeleton className="h-8 w-44" />
			<div className="grid grid-cols-1 gap-3 rounded-xl border border-border p-3 md:grid-cols-2">
				{[0, 1, 2, 3, 4].map((item) => (
					<div key={item} className="space-y-2">
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-10 w-full" />
					</div>
				))}
			</div>
		</div>
	);
}

type ClientVinculationMenuCardProps = {
	client: TSearchClientsOutput["data"]["clients"][number];
	handleSelectClient: (client: { id: string; nome: string; telefone: string }) => void;
	closeModal: () => void;
};

function ClientVinculationMenuCard({ client, handleSelectClient }: ClientVinculationMenuCardProps) {
	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-2 shadow-2xs")}>
			<div className="w-full flex items-center justify-between flex-col md:flex-row gap-2">
				<div className="flex items-start flex-col gap-1">
					<h1 className="text-xs font-bold tracking-tight lg:text-sm">{client.nome}</h1>

					<div className="flex items-center gap-2 flex-wrap">
						<div className={cn("flex items-center gap-1")}>
							<Phone className="w-4 h-4 min-w-4 min-h-4" />
							<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic">{client.telefone || "NÃO DEFINIDO"}</h1>
						</div>
						{client.cpfCnpj ? (
							<div className={cn("flex items-center gap-1")}>
								<IdCard className="w-4 h-4 min-w-4 min-h-4" />
								<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic">{client.cpfCnpj}</h1>
							</div>
						) : null}

						{client.email ? (
							<div className="flex items-center gap-1">
								<Mail className="w-4 h-4 min-w-4 min-h-4" />
								<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic">{client.email}</h1>
							</div>
						) : null}
					</div>
				</div>
				<Button
					onClick={() => handleSelectClient({ id: client.id, nome: client.nome, telefone: client.telefone })}
					variant="brand"
					className="flex items-center gap-1.5"
					size="sm"
				>
					<LinkIcon className="w-3 min-w-3 h-3 min-h-3" />
					VINCULAR
				</Button>
			</div>
		</div>
	);
}
