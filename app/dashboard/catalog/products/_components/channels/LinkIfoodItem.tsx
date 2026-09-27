"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import type { TIfoodCategoryDTO } from "@/lib/integrations/ifood/catalog-types";
import { createCatalogLink } from "@/lib/mutations/catalog-links";
import { useCatalogLinkSuggestions } from "@/lib/queries/catalog-links";
import { useIfoodCatalogs, useIfoodCategories } from "@/lib/queries/ifood";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export type TLinkIfoodItemNode = {
	produtoId: string;
	produtoVarianteId: string | null;
	nome: string;
};

type LinkIfoodItemProps = {
	merchantId: string;
	merchantLabel: string;
	node: TLinkIfoodItemNode;
	/** Itens do iFood já presos a outro nó nesta loja — não são oferecidos. */
	linkedItemIds: Set<string>;
	closeModal: () => void;
	callbacks?: { onSuccess?: () => void };
};

type RemoteItemOption = {
	id: string;
	produtoId: string | null;
	nome: string;
	codigoExterno: string | null;
	preco: number | null;
	categoria: TIfoodCategoryDTO;
};

function flattenItems(categorias: TIfoodCategoryDTO[], linkedItemIds: Set<string>): RemoteItemOption[] {
	return categorias.flatMap((categoria) =>
		categoria.itens
			.filter((item): item is typeof item & { id: string } => !!item.id && !linkedItemIds.has(item.id))
			.map((item) => ({
				id: item.id,
				produtoId: item.produtoId,
				nome: item.nome ?? "Item sem nome",
				codigoExterno: item.codigoExterno,
				preco: item.preco,
				categoria,
			})),
	);
}

/**
 * Vincular um nó interno (produto sem variantes ou uma variante) a um item que JÁ existe no
 * iFood. A lista vem do catálogo remoto da loja, sem os itens já vinculados; a sugestão de
 * correspondência (código igual = FORTE, nome parecido = FRACA) vem pré-selecionada, mas é o
 * usuário quem confirma — uma sugestão fraca errada preso a um item vira preço errado na loja.
 */
export default function LinkIfoodItem({ merchantId, merchantLabel, node, linkedItemIds, closeModal, callbacks }: LinkIfoodItemProps) {
	const queryClient = useQueryClient();
	const catalogsQuery = useIfoodCatalogs({ merchantId });
	const catalogId = catalogsQuery.data?.catalogos[0]?.id ?? null;
	const categoriesQuery = useIfoodCategories({ merchantId, catalogId });
	const suggestionsQuery = useCatalogLinkSuggestions({ merchantId, catalogId });

	const items = useMemo(() => flattenItems(categoriesQuery.data ?? [], linkedItemIds), [categoriesQuery.data, linkedItemIds]);
	const suggestion = useMemo(
		() =>
			suggestionsQuery.data?.suggestions.find(
				(entry) => entry.candidato?.produtoId === node.produtoId && (entry.candidato.produtoVarianteId ?? null) === node.produtoVarianteId,
			) ?? null,
		[node.produtoId, node.produtoVarianteId, suggestionsQuery.data],
	);

	const [search, setSearch] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	// A sugestão só pré-seleciona enquanto o usuário não escolheu nada: trocar a escolha dele por
	// causa de um refetch seria exatamente o erro que a confirmação humana existe para evitar.
	const effectiveSelectedId = selectedId ?? (suggestion && items.some((item) => item.id === suggestion.item.id) ? suggestion.item.id : null);

	const filteredItems = useMemo(() => {
		const needle = search.trim().toLocaleLowerCase("pt-BR");
		if (!needle) return items;
		return items.filter((item) =>
			[item.nome, item.codigoExterno ?? "", item.categoria.nome ?? ""].join(" ").toLocaleLowerCase("pt-BR").includes(needle),
		);
	}, [items, search]);

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-catalog-link", merchantId, node.produtoId, node.produtoVarianteId],
		mutationFn: () => {
			const item = items.find((entry) => entry.id === effectiveSelectedId);
			if (!item) throw new Error("Selecione um item do iFood.");
			return createCatalogLink({
				merchantId,
				tipo: node.produtoVarianteId ? "VARIANTE" : "PRODUTO",
				produtoId: node.produtoId,
				produtoVarianteId: node.produtoVarianteId,
				externoItemId: item.id,
				externoProdutoId: item.produtoId,
				externoCategoriaId: item.categoria.id,
			});
		},
		onSuccess: (data) => {
			toast.success(data.message);
			callbacks?.onSuccess?.();
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["sales-channel-matrix"] });
			queryClient.invalidateQueries({ queryKey: ["catalog-links", merchantId] });
			queryClient.invalidateQueries({ queryKey: ["catalog-link-suggestions", merchantId] });
		},
	});

	const isLoading = catalogsQuery.isLoading || categoriesQuery.isLoading;
	const error = catalogsQuery.error ?? categoriesQuery.error;

	return (
		<ResponsiveMenu
			menuTitle="VINCULAR AO IFOOD"
			menuDescription={`${node.nome} passa a controlar preço e disponibilidade do item escolhido em ${merchantLabel}.`}
			menuActionButtonText="VINCULAR"
			menuCancelButtonText="CANCELAR"
			menuActionButtonDisabled={!effectiveSelectedId}
			actionFunction={() => mutate()}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
			drawerVariant="lg"
		>
			<div className="flex w-full flex-col gap-3 px-1 py-2">
				{isLoading ? <LoadingComponent /> : null}
				{error ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
				{!isLoading && !error && !catalogId ? <ErrorComponent msg="A loja não tem catálogo no iFood." /> : null}

				{!isLoading && !error && catalogId ? (
					<>
						{suggestion ? (
							<div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
								<Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
								<p className="text-xs text-muted-foreground">
									Sugestão <span className="font-semibold text-foreground">{suggestion.forca === "FORTE" ? "forte" : "fraca"}</span>:{" "}
									<span className="font-semibold text-foreground">{suggestion.item.nome ?? suggestion.item.id}</span> — {suggestion.motivo}
									{suggestion.forca === "FRACA" ? " Confira antes de vincular." : null}
								</p>
							</div>
						) : null}

						<div className="relative">
							<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								placeholder="Pesquisar item, código ou categoria..."
								onChange={(event) => setSearch(event.target.value)}
								className="pl-9"
							/>
						</div>

						<div className="flex max-h-[50vh] flex-col overflow-y-auto rounded-xl border border-border">
							{filteredItems.length === 0 ? (
								<p className="px-3 py-6 text-center text-sm text-muted-foreground">
									{items.length === 0 ? "Todos os itens desta loja já estão vinculados." : "Nenhum item corresponde à busca."}
								</p>
							) : (
								filteredItems.map((item) => {
									const selected = item.id === effectiveSelectedId;
									return (
										<button
											key={item.id}
											type="button"
											onClick={() => setSelectedId(item.id)}
											aria-pressed={selected}
											className={cn(
												"flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/40",
												selected && "bg-primary/5",
											)}
										>
											<span className="flex min-w-0 flex-col">
												<span className="truncate text-sm font-medium">{item.nome}</span>
												<span className="truncate text-[0.65rem] text-muted-foreground">
													{item.categoria.nome ?? "Sem categoria"}
													{item.codigoExterno ? ` · ${item.codigoExterno}` : null}
												</span>
											</span>
											<span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
												{item.preco != null ? formatToMoney(item.preco) : "—"}
												<span
													className={cn(
														"flex size-5 items-center justify-center rounded-full border",
														selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
													)}
												>
													{selected ? <Check className="size-3" /> : null}
												</span>
											</span>
										</button>
									);
								})
							)}
						</div>
					</>
				) : null}
			</div>
		</ResponsiveMenu>
	);
}
