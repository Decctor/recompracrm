"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { publishProductToIfood } from "@/lib/mutations/catalog-links";
import { useIfoodCatalogs, useIfoodCategories } from "@/lib/queries/ifood";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type PublishIfoodProductProps = {
	merchantId: string;
	merchantLabel: string;
	produtoId: string;
	produtoNome: string;
	closeModal: () => void;
	callbacks?: { onSuccess?: () => void };
};

/**
 * Publicar um produto interno como item NOVO no iFood (um item por variante — decisão D2 do doc
 * de sync). A prévia vem do próprio serviço em modo simulação, então o que a tela lista é
 * exatamente o que será criado: nome, preço resolvido do canal e disponibilidade.
 */
export default function PublishIfoodProduct({ merchantId, merchantLabel, produtoId, produtoNome, closeModal, callbacks }: PublishIfoodProductProps) {
	const queryClient = useQueryClient();
	const catalogsQuery = useIfoodCatalogs({ merchantId });
	const catalogId = catalogsQuery.data?.catalogos[0]?.id ?? null;
	const categoriesQuery = useIfoodCategories({ merchantId, catalogId });
	const [categoriaId, setCategoriaId] = useState<string | null>(null);

	// A simulação é um POST sem efeito colateral; `simular` é a promessa da rota. `categoriaId`
	// é obrigatório no schema mas ignorado na simulação — o placeholder só satisfaz o parse.
	const previewQuery = useQuery({
		queryKey: ["ifood-publish-preview", merchantId, produtoId],
		queryFn: () => publishProductToIfood({ merchantId, produtoId, categoriaId: "simulacao", simular: true }),
		retry: false,
	});
	const nodes = previewQuery.data?.data.simulacao ?? [];

	const { mutate, isPending } = useMutation({
		mutationKey: ["publish-ifood-product", merchantId, produtoId],
		mutationFn: () => {
			if (!categoriaId) throw new Error("Escolha a categoria do iFood.");
			return publishProductToIfood({ merchantId, produtoId, categoriaId, simular: false });
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
			queryClient.invalidateQueries({ queryKey: ["ifood-categories", merchantId] });
		},
	});

	const isLoading = catalogsQuery.isLoading || categoriesQuery.isLoading || previewQuery.isLoading;
	const error = catalogsQuery.error ?? categoriesQuery.error ?? previewQuery.error;
	const categorias = categoriesQuery.data ?? [];

	return (
		<ResponsiveMenu
			menuTitle="PUBLICAR NO IFOOD"
			menuDescription={`${produtoNome} será criado como item novo em ${merchantLabel}, já vinculado para sincronizar daqui em diante.`}
			menuActionButtonText={nodes.length > 1 ? `PUBLICAR ${nodes.length} ITENS` : "PUBLICAR"}
			menuCancelButtonText="CANCELAR"
			menuActionButtonDisabled={!categoriaId || nodes.length === 0 || !!error}
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

				{!isLoading && !error ? (
					<>
						<div className="flex flex-col gap-1.5">
							<span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">Categoria no iFood</span>
							<Select
								items={categorias.map((categoria) => ({ value: categoria.id, label: categoria.nome ?? categoria.id }))}
								value={categoriaId ?? ""}
								onValueChange={(value) => setCategoriaId(value || null)}
							>
								<SelectTrigger className="w-full" aria-label="Categoria no iFood">
									<SelectValue placeholder="Escolha a categoria" />
								</SelectTrigger>
								<SelectContent>
									{categorias.map((categoria) => (
										<SelectItem key={categoria.id} value={categoria.id}>
											{categoria.nome ?? categoria.id}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{categorias.length === 0 ? (
								<p className="text-xs text-muted-foreground">A loja não tem categorias. Crie uma na aba Catálogo do iFood antes de publicar.</p>
							) : null}
						</div>

						<div className="flex flex-col gap-1.5">
							<span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
								{nodes.length === 1 ? "O item que será criado" : `Os ${nodes.length} itens que serão criados`}
							</span>
							<div className="flex flex-col rounded-xl border border-border">
								{nodes.map((node) => (
									<div
										key={node.produtoVarianteId ?? node.produtoId}
										className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0"
									>
										<span className="flex min-w-0 flex-col">
											<span className="truncate text-sm font-medium">{node.nome}</span>
											<span className="truncate text-[0.65rem] text-muted-foreground">
												{node.codigo}
												{node.descricao ? ` · ${node.descricao}` : null}
											</span>
										</span>
										<span className="flex shrink-0 flex-col items-end text-xs tabular-nums">
											<span>{formatToMoney(node.preco)}</span>
											<span className={node.disponivel ? "text-emerald-600" : "text-muted-foreground"}>{node.disponivel ? "disponível" : "pausado"}</span>
										</span>
									</div>
								))}
							</div>
						</div>

						{nodes.length > 1 ? (
							<div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
								<AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
								<p className="text-xs text-muted-foreground">
									Produto com variantes: cada variante vira um item próprio no iFood, com o preço resolvido daquela variante neste canal.
								</p>
							</div>
						) : null}
					</>
				) : null}
			</div>
		</ResponsiveMenu>
	);
}
