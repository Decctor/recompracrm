"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ControlProductAddOn from "@/components/Modals/Products/AddOns/ControlProductAddOn";
import NewProductAddOn from "@/components/Modals/Products/AddOns/NewProductAddOn";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { useProductAddOns } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import type { TGetProductAddOnsOutputDefault } from "@/app/api/products/add-ons/route";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Layers, ListChecks, Package, PencilIcon, Plus, X } from "lucide-react";
import { useState } from "react";

export default function ProductsAddOnsView() {
	const queryClient = useQueryClient();
	const [newAddOnModalIsOpen, setNewAddOnModalIsOpen] = useState<boolean>(false);
	const [editingAddOnId, setEditingAddOnId] = useState<string | null>(null);
	const { data: addOns, queryKey, isLoading, isError, isSuccess, error, filters, updateFilters } = useProductAddOns();

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey: queryKey });
	const handleOnSettled = async () => {
		await queryClient.invalidateQueries({ queryKey: ["product-add-ons"] });
		await queryClient.invalidateQueries({ queryKey: ["product-add-on-by-id"] });
	};

	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<Input
					value={filters.search}
					placeholder="Pesquisar grupo de adicionais..."
					onChange={(e) => updateFilters({ search: e.target.value })}
					className="grow rounded-xl"
				/>
				<Button
					variant={filters.activeOnly ? "default" : "outline"}
					size="sm"
					className="flex items-center gap-2"
					onClick={() => updateFilters({ activeOnly: !filters.activeOnly })}
				>
					<Check className="w-4 h-4 min-w-4 min-h-4" />
					SOMENTE ATIVOS
				</Button>
				<Button className="flex items-center gap-2" size="sm" onClick={() => setNewAddOnModalIsOpen(true)}>
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					NOVO GRUPO
				</Button>
			</div>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && addOns ? (
				addOns.length > 0 ? (
					addOns.map((addOn) => <AddOnGroupCard key={addOn.id} addOn={addOn} onEdit={() => setEditingAddOnId(addOn.id)} />)
				) : (
					<p className="w-full tracking-tight text-center">Nenhum grupo de adicionais encontrado.</p>
				)
			) : null}
			{newAddOnModalIsOpen ? (
				<NewProductAddOn
					closeModal={() => setNewAddOnModalIsOpen(false)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
			{editingAddOnId ? (
				<ControlProductAddOn
					productAddOnId={editingAddOnId}
					closeModal={() => setEditingAddOnId(null)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
		</div>
	);
}

type AddOnGroupCardProps = {
	addOn: TGetProductAddOnsOutputDefault[number];
	onEdit: () => void;
};

function AddOnGroupCard({ addOn, onEdit }: AddOnGroupCardProps) {
	const linkedProductNames = addOn.produtos.map((reference) =>
		reference.produtoVariante ? `${reference.produto.nome} — ${reference.produtoVariante.nome}` : reference.produto.nome,
	);
	const activeOptionsCount = addOn.opcoes.filter((opcao) => opcao.ativo).length;
	const inactiveOptionsCount = addOn.opcoes.length - activeOptionsCount;
	const optionsCountLabel = activeOptionsCount === 1 ? "1 opção" : `${activeOptionsCount} opções`;

	return (
		<div className="flex w-full flex-col gap-2 rounded-lg border border-border bg-background px-3 py-2.5 shadow-xs">
			<div className="flex w-full items-start justify-between gap-2">
				<div className="flex min-w-0 flex-1 items-start gap-2.5">
					<span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
						<Layers className="h-3.5 w-3.5 text-muted-foreground" />
					</span>
					<div className="min-w-0 flex-1">
						<h2 className="truncate text-sm font-semibold tracking-tight text-foreground">{addOn.nome}</h2>
						{addOn.internoNome ? (
							<p className="truncate text-xs font-medium tracking-tight text-muted-foreground">{addOn.internoNome}</p>
						) : null}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					<Chip.Root variant={addOn.ativo ? "success" : "destructive"}>
						<Chip.Icon>{addOn.ativo ? <Check /> : <X />}</Chip.Icon>
						<Chip.Label caps>{addOn.ativo ? "Ativo" : "Inativo"}</Chip.Label>
					</Chip.Root>
					<Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label="Editar grupo de adicionais" className="h-8 w-8">
						<PencilIcon className="h-4 w-4" />
					</Button>
				</div>
			</div>
			<div className="flex w-full flex-wrap items-center gap-1.5">
				<Chip.Root variant="outline">
					<Chip.Label>{`Mín ${addOn.minOpcoes} · Máx ${addOn.maxOpcoes}`}</Chip.Label>
				</Chip.Root>
				<Chip.Root variant="outline">
					<Chip.Icon>
						<ListChecks />
					</Chip.Icon>
					<Chip.Label>
						{inactiveOptionsCount > 0
							? `${optionsCountLabel} · ${inactiveOptionsCount} inativa${inactiveOptionsCount === 1 ? "" : "s"}`
							: optionsCountLabel}
					</Chip.Label>
				</Chip.Root>
				<Chip.Root
					variant={addOn.produtos.length > 0 ? "secondary" : "muted"}
					title={linkedProductNames.length > 0 ? linkedProductNames.join(", ") : undefined}
					className={cn(addOn.produtos.length === 0 && "opacity-70")}
				>
					<Chip.Icon>
						<Package />
					</Chip.Icon>
					<Chip.Label>
						{addOn.produtos.length === 0
							? "Sem produtos vinculados"
							: addOn.produtos.length === 1
								? "Usado em 1 produto"
								: `Usado em ${addOn.produtos.length} produtos`}
					</Chip.Label>
				</Chip.Root>
			</div>
		</div>
	);
}
