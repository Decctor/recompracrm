"use client";

import ClientGeneralBlock from "@/components/Modals/Clients/Blocks/General";
import ClientLocationsBlock from "@/components/Modals/Clients/Blocks/Locations";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatToPhone } from "@/lib/formatting";
import { createClient } from "@/lib/mutations/clients";
import { useClientsBySearch } from "@/lib/queries/clients";
import { cn } from "@/lib/utils";
import type { TGetClientsOutputDefault } from "@/pages/api/clients";
import type { TSearchClientsOutput } from "@/pages/api/clients/search";
import { useClientState } from "@/state-hooks/use-client-state";
import { useMutation } from "@tanstack/react-query";
import { LinkIcon, Search, UserRound } from "lucide-react";
import { IdCard, Mail, Phone } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import ResponsiveMenuViewOnly from "../Utils/ResponsiveMenuViewOnly";
import { Input } from "../ui/input";
type ClientVinculationMenuProps = {
	closeModal: () => void;
	onSelectClient: (client: { id: string; nome: string; telefone: string }) => void;
};

export default function ClientVinculationMenu({ closeModal, onSelectClient }: ClientVinculationMenuProps) {
	const { search, updateSearch, data: clients = [], isFetching } = useClientsBySearch({ initialSearch: "" });
	const { state, updateClient, addClientLocation, updateClientLocation, removeClientLocation, resetState } = useClientState();

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

	const hasSearch = !!search.trim().length;
	const hasResults = clients.length > 0;
	const showCreateForm = hasSearch && !isFetching && !hasResults;

	useEffect(() => {
		if (!showCreateForm) return;
		if (state.client.telefone) return;
		updateClient({ telefone: formatToPhone(search) });
	}, [search, showCreateForm, state.client.telefone, updateClient]);

	function handleCreateAndLink() {
		if (!state.client.nome.trim()) {
			toast.error("Nome do cliente não informado.");
			return;
		}

		handleCreateClient({
			client: state.client,
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
		});
	}

	return (
		<ResponsiveMenuViewOnly
			menuTitle="VINCULAR CLIENTE"
			menuDescription="Busque por nome, telefone ou CPF/CNPJ para vincular um cliente na venda."
			menuCancelButtonText="CANCELAR"
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="sm"
		>
			<Input
				value={search ?? ""}
				placeholder="Pesquisar cliente por nome, telefone ou CPF/CNPJ..."
				onChange={(e) => updateSearch(e.target.value)}
				className="w-full rounded-xl min-h-10"
			/>
			{!hasSearch ? (
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
							<span key={hint} className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-brand/10 text-brand-foreground border border-brand/20">
								{hint}
							</span>
						))}
					</div>
				</div>
			) : null}
			{isFetching ? <p className="text-sm text-muted-foreground">Buscando clientes...</p> : null}
			{hasResults ? (
				<div className="w-full flex flex-col gap-3">
					<p className="text-sm font-medium">Clientes encontrados:</p>
					{clients.map((client) => (
						<ClientVinculationMenuCard key={client.id} client={client} handleSelectClient={onSelectClient} closeModal={closeModal} />
					))}
				</div>
			) : null}

			{showCreateForm ? (
				<div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
					<div className="flex items-center gap-2 text-sm font-semibold">
						<UserRound className="h-4 w-4" />
						Nenhum cliente encontrado. Crie um novo cadastro:
					</div>
					<ClientGeneralBlock client={state.client} updateClient={updateClient} />
					<ClientLocationsBlock
						locations={state.clientLocations}
						addClientLocation={addClientLocation}
						updateClientLocation={updateClientLocation}
						removeClientLocation={removeClientLocation}
					/>
				</div>
			) : null}
		</ResponsiveMenuViewOnly>
	);
}

type ClientVinculationMenuCardProps = {
	client: TSearchClientsOutput["data"]["clients"][number];
	handleSelectClient: (client: { id: string; nome: string; telefone: string }) => void;
	closeModal: () => void;
};

function ClientVinculationMenuCard({ client, handleSelectClient }: ClientVinculationMenuCardProps) {
	return (
		<div className={cn("bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-2 shadow-2xs")}>
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
