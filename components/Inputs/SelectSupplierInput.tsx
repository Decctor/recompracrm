"use client";

import type { TGetSuppliersOutputDefault } from "@/app/api/suppliers/route";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getErrorMessage } from "@/lib/errors";
import { formatToCNPJ, formatToPhone } from "@/lib/formatting";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { createSupplier } from "@/lib/mutations/suppliers";
import { useSuppliersBySearch } from "@/lib/queries/suppliers";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { RequiredIndicator } from "./RequiredIndicator";

export type TSelectSupplierValue = {
	id: string;
	nome: string;
	cpfCnpj?: string | null;
	telefone?: string | null;
	email?: string | null;
};

type TSupplierSearchResult = TGetSuppliersOutputDefault["suppliers"][number];

type SelectSupplierInputProps = {
	label: string;
	labelClassName?: string;
	holderClassName?: string;
	showLabel?: boolean;
	value: TSelectSupplierValue | null;
	editable?: boolean;
	onSelect: (supplier: TSelectSupplierValue) => void;
	onClear: () => void;
};

type TSupplierDraft = {
	nome: string;
	cpfCnpj: string;
	telefone: string;
	email: string;
};

const EMPTY_DRAFT: TSupplierDraft = { nome: "", cpfCnpj: "", telefone: "", email: "" };

function SelectSupplierInput({
	label,
	labelClassName,
	holderClassName,
	showLabel = true,
	value,
	editable = true,
	onSelect,
	onClear,
}: SelectSupplierInputProps) {
	const queryClient = useQueryClient();
	const { data: suppliers, isLoading, isError, isSuccess, search, updateSearch, queryKey } = useSuppliersBySearch();

	const isDesktop = useMediaQuery("(min-width: 768px)");
	const [isOpen, setIsOpen] = useState(false);
	const [draft, setDraft] = useState<TSupplierDraft | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	// `undefined`, nunca `null`: o FloatingPortal do Base UI trata `container === null` como "container
	// ainda não resolvido" e desiste de criar o portal, então o popup não renderiza. Só com `undefined`
	// ele cai no fallback `document.body` — que é o caso de toda tela que não é modal.
	const dialogContainer = (triggerRef.current?.closest("[data-dialog-container]") as HTMLElement | null) ?? undefined;

	const generatedId = useId();
	const inputIdentifier = `${label.toLowerCase().replaceAll(" ", "_")}_${generatedId}`;

	const { mutate: mutateCreateSupplier, isPending: createIsPending } = useMutation({
		mutationKey: ["create-supplier"],
		mutationFn: createSupplier,
		onSuccess: (data) => {
			toast.success(data.message);
			handleSelect(data.data.supplier);
			queryClient.invalidateQueries({ queryKey: ["suppliers-by-search"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function handleOpenChange(open: boolean) {
		setIsOpen(open);
		if (!open) {
			setDraft(null);
			updateSearch("");
		}
	}

	function handleSelect(supplier: TSupplierSearchResult | TSelectSupplierValue) {
		onSelect({
			id: supplier.id,
			nome: supplier.nome,
			cpfCnpj: supplier.cpfCnpj ?? null,
			telefone: supplier.telefone ?? null,
			email: supplier.email ?? null,
		});
		handleOpenChange(false);
	}

	function startCreateDraft() {
		setDraft({ ...EMPTY_DRAFT, nome: search.trim() });
	}

	function submitCreateDraft() {
		if (!draft || draft.nome.trim().length < 2) {
			toast.error("Informe o nome do fornecedor (mínimo de 2 caracteres).");
			return;
		}
		mutateCreateSupplier({
			supplier: {
				nome: draft.nome.trim(),
				cpfCnpj: draft.cpfCnpj.trim() || null,
				telefone: draft.telefone.trim() || null,
				email: draft.email.trim() || null,
				inscricaoEstadual: null,
			},
		});
	}

	const renderTrigger = () => (
		<Button
			ref={triggerRef}
			id={inputIdentifier}
			type="button"
			disabled={!editable}
			variant="outline"
			aria-expanded={isOpen}
			className={cn("w-full justify-between border-border", holderClassName)}
		>
			{value ? (
				<span className="flex min-w-0 items-center gap-1.5">
					<Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
					<span className="truncate font-medium">{value.nome}</span>
					{value.cpfCnpj ? <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{formatToCNPJ(value.cpfCnpj)}</span> : null}
				</span>
			) : (
				<span className="font-normal text-muted-foreground italic">Selecionar fornecedor...</span>
			)}
			<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
		</Button>
	);

	const renderCreateForm = () => (
		<div className="flex w-full flex-col gap-2 p-3">
			<button
				type="button"
				onClick={() => setDraft(null)}
				className="flex w-fit cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft className="h-3.5 w-3.5" />
				Voltar para a busca
			</button>
			<div className="flex flex-col gap-1">
				<label className="text-xs font-medium tracking-tight text-foreground/80">
					NOME <RequiredIndicator />
				</label>
				<Input
					value={draft?.nome ?? ""}
					onChange={(e) => setDraft((prev) => ({ ...(prev ?? EMPTY_DRAFT), nome: e.target.value }))}
					placeholder="Nome do fornecedor..."
					className="h-9 text-sm placeholder:italic"
					autoFocus
				/>
			</div>
			<div className="flex flex-col gap-1">
				<label className="text-xs font-medium tracking-tight text-foreground/80">CNPJ</label>
				<Input
					value={draft?.cpfCnpj ?? ""}
					onChange={(e) => setDraft((prev) => ({ ...(prev ?? EMPTY_DRAFT), cpfCnpj: formatToCNPJ(e.target.value) }))}
					placeholder="CNPJ do fornecedor..."
					className="h-9 text-sm placeholder:italic"
				/>
			</div>
			<div className="flex gap-1.5">
				<div className="flex w-1/2 flex-col gap-1">
					<label className="text-xs font-medium tracking-tight text-foreground/80">TELEFONE</label>
					<Input
						value={draft?.telefone ?? ""}
						onChange={(e) => setDraft((prev) => ({ ...(prev ?? EMPTY_DRAFT), telefone: formatToPhone(e.target.value) }))}
						placeholder="Telefone..."
						className="h-9 text-sm placeholder:italic"
					/>
				</div>
				<div className="flex w-1/2 flex-col gap-1">
					<label className="text-xs font-medium tracking-tight text-foreground/80">EMAIL</label>
					<Input
						value={draft?.email ?? ""}
						onChange={(e) => setDraft((prev) => ({ ...(prev ?? EMPTY_DRAFT), email: e.target.value }))}
						placeholder="Email..."
						className="h-9 text-sm placeholder:italic"
					/>
				</div>
			</div>
			<LoadingButton type="button" size="sm" className="mt-1 w-full" loading={createIsPending} onClick={submitCreateDraft}>
				<Plus className="h-4 w-4" />
				CRIAR E SELECIONAR
			</LoadingButton>
		</div>
	);

	const renderContent = () => {
		if (draft !== null) return renderCreateForm();

		return (
			<Command shouldFilter={false} className="w-full">
				<CommandInput placeholder="Pesquisar fornecedores (nome, CNPJ)..." value={search} onValueChange={updateSearch} />
				<CommandList>
					{value ? (
						<>
							<CommandGroup>
								<CommandItem
									value="clear-selection-option"
									onSelect={() => {
										onClear();
										handleOpenChange(false);
									}}
									className="cursor-pointer"
								>
									<X className="h-4 w-4 text-muted-foreground" />
									REMOVER FORNECEDOR VINCULADO
								</CommandItem>
							</CommandGroup>
							<CommandSeparator />
						</>
					) : null}

					{isLoading && <div className="p-2 text-center text-xs text-foreground/80">Carregando...</div>}
					{isError && <div className="p-2 text-center text-xs text-destructive">Erro ao buscar fornecedores.</div>}

					{isSuccess && suppliers && (
						<CommandGroup heading={search.trim().length === 0 ? "Fornecedores recentes" : undefined}>
							{suppliers.length === 0 && (
								<div className="p-2 text-center text-sm italic text-foreground">
									{search.trim().length > 0 ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado ainda."}
								</div>
							)}
							{suppliers.map((supplier) => (
								<CommandItem
									key={supplier.id}
									value={supplier.id}
									onSelect={() => {
										if (editable) handleSelect(supplier);
									}}
									className="cursor-pointer"
								>
									<div className="flex min-w-0 grow items-center justify-between gap-2">
										<div className="flex min-w-0 flex-1 items-center gap-1.5">
											<Building2 className="h-3.5 min-h-3.5 w-3.5 min-w-3.5 text-muted-foreground" />
											<p className="truncate text-sm font-medium">{supplier.nome}</p>
										</div>
										{supplier.cpfCnpj ? <p className="shrink-0 text-xs text-muted-foreground">{formatToCNPJ(supplier.cpfCnpj)}</p> : null}
									</div>
									{value?.id === supplier.id ? <Check className="ml-auto h-4 w-4 opacity-100" /> : null}
								</CommandItem>
							))}
						</CommandGroup>
					)}

					<CommandSeparator />
					<CommandGroup>
						<CommandItem value="create-supplier-option" onSelect={startCreateDraft} className="cursor-pointer">
							<Plus className="h-4 w-4" />
							<span className="truncate">{search.trim().length > 0 ? `Criar fornecedor "${search.trim()}"` : "Criar novo fornecedor"}</span>
						</CommandItem>
					</CommandGroup>
				</CommandList>
			</Command>
		);
	};

	if (isDesktop) {
		return (
			<Field className="gap-1" data-disabled={!editable}>
				{showLabel && (
					<FieldLabel htmlFor={inputIdentifier} className={cn("text-start text-sm font-medium tracking-tight text-foreground/80", labelClassName)}>
						{label}
					</FieldLabel>
				)}
				<Popover open={isOpen} onOpenChange={handleOpenChange}>
					<PopoverTrigger render={renderTrigger()} />
					<PopoverContent container={dialogContainer} className="w-[400px] p-0" align="start">
						{renderContent()}
					</PopoverContent>
				</Popover>
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
			<Drawer open={isOpen} onOpenChange={handleOpenChange}>
				<DrawerTrigger asChild>{renderTrigger()}</DrawerTrigger>
				<DrawerContent>
					<div className="mt-4 border-t p-2 pb-8">{renderContent()}</div>
				</DrawerContent>
			</Drawer>
		</Field>
	);
}

export default SelectSupplierInput;
