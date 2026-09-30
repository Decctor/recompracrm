"use client";

import AddOnChannelPrices from "@/components/Modals/Products/AddOns/AddOnChannelPrices";
import AddOnGroupForm from "@/components/Modals/Products/AddOns/AddOnGroupForm";
import { validateAddOnGroupFields } from "@/components/Modals/Products/Blocks/AddOns";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { deleteProductAddOnReference, updateProductAddOn } from "@/lib/mutations/products";
import { useProductAddOnById } from "@/lib/queries/products";
import type { TGetProductAddOnsOutputById, TUpdateProductAddOnInput } from "@/app/api/products/add-ons/route";
import { useAddOnChannelSettingsState } from "@/state-hooks/use-add-on-channel-settings-state";
import { useProductAddOnState } from "@/state-hooks/use-product-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Unplug } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

type ControlProductAddOnProps = {
	productAddOnId: string;
	/** Preço por canal é recurso do ERP (a rota exige o módulo); sem ele a seção não aparece. */
	orgHasERPAccess?: boolean;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdateProductAddOnInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function ControlProductAddOn({ productAddOnId, orgHasERPAccess = false, closeModal, callbacks }: ControlProductAddOnProps) {
	const queryClient = useQueryClient();
	const { data: productAddOn, isLoading, error, queryKey } = useProductAddOnById({ productAddOnId });
	const { state, updateAddOn, addOption, updateOption, removeOption, redefineState } = useProductAddOnState({});
	const channelSettings = useAddOnChannelSettingsState({ produtoAddOnId: productAddOnId, enabled: orgHasERPAccess });

	useEffect(() => {
		if (productAddOn) {
			redefineState({
				id: productAddOn.id,
				nome: productAddOn.nome,
				internoNome: productAddOn.internoNome ?? "",
				minOpcoes: productAddOn.minOpcoes ?? 0,
				maxOpcoes: productAddOn.maxOpcoes ?? 1,
				ativo: productAddOn.ativo ?? true,
				opcoes: productAddOn.opcoes.map((opcao) => ({
					id: opcao.id,
					nome: opcao.nome,
					codigo: opcao.codigo ?? "",
					ativo: opcao.ativo ?? true,
					produtoId: opcao.produtoId ?? null,
					produtoVarianteId: opcao.produtoVarianteId ?? null,
					produtoConsumo: opcao.produtoVariante?.nome ?? opcao.produto?.nome ?? null,
					quantidadeConsumo: opcao.quantidadeConsumo ?? 1,
					precoDelta: opcao.precoDelta ?? 0,
					maxQtdePorItem: opcao.maxQtdePorItem ?? 1,
				})),
			});
		}
	}, [productAddOn, redefineState]);

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-product-add-on", productAddOnId],
		mutationFn: updateProductAddOn,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: queryKey });
			queryClient.invalidateQueries({ queryKey: channelSettings.queryKey });
			// Shared groups feed every product page that references them.
			queryClient.invalidateQueries({ queryKey: ["product-by-id"] });
			closeModal();
		},
		onError: (error) => {
			callbacks?.onError?.(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	function handleSubmit() {
		if (!validateAddOnGroupFields(state)) return;
		if (state.opcoes.filter((option) => !option.deletar).some((option) => !option.nome.trim())) {
			toast.error("Informe o nome de todas as opções do grupo.");
			return;
		}
		const liveOptionIds = new Set(state.opcoes.filter((opcao) => !opcao.deletar && opcao.id).map((opcao) => opcao.id as string));
		mutate({ productAddOnId, addOn: state, channelSettings: orgHasERPAccess ? channelSettings.buildPatch(liveOptionIds) : undefined });
	}

	return (
		<ResponsiveMenu
			menuTitle="EDITAR GRUPO DE ADICIONAIS"
			menuDescription="Edite os campos abaixo. As alterações afetam todos os produtos vinculados a esse grupo."
			menuActionButtonText="ATUALIZAR GRUPO"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="lg"
			drawerVariant="lg"
		>
			<div className="flex w-full flex-col gap-3">
				<AddOnGroupForm state={state} updateAddOn={updateAddOn} addOption={addOption} updateOption={updateOption} removeOption={removeOption} />
				{orgHasERPAccess ? <AddOnChannelPrices options={state.opcoes} channelSettings={channelSettings} /> : null}
				{productAddOn ? <LinkedProductsSection productAddOn={productAddOn} addOnQueryKey={queryKey} callbacks={callbacks} /> : null}
			</div>
		</ResponsiveMenu>
	);
}

type LinkedProductsSectionProps = {
	productAddOn: TGetProductAddOnsOutputById;
	addOnQueryKey: unknown[];
	callbacks?: ControlProductAddOnProps["callbacks"];
};

function LinkedProductsSection({ productAddOn, addOnQueryKey, callbacks }: LinkedProductsSectionProps) {
	const queryClient = useQueryClient();

	const { mutate: detach, isPending: detachIsPending } = useMutation({
		mutationKey: ["delete-product-add-on-reference", productAddOn.id],
		mutationFn: deleteProductAddOnReference,
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: addOnQueryKey });
			queryClient.invalidateQueries({ queryKey: ["product-add-ons"] });
			queryClient.invalidateQueries({ queryKey: ["product-by-id"] });
			callbacks?.onSuccess?.();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	return (
		<ResponsiveMenuSection title="PRODUTOS VINCULADOS" icon={<Package className="h-4 min-h-4 w-4 min-w-4" />}>
			{productAddOn.produtos.length === 0 ? (
				<div className="flex w-full items-center justify-center rounded-md border border-border px-3 py-3">
					<p className="text-center text-xs font-medium tracking-tight text-muted-foreground">
						Nenhum produto vinculado a esse grupo. Vincule-o a produtos pela página de cadastro de cada produto.
					</p>
				</div>
			) : (
				<div className="flex w-full flex-col gap-1.5">
					{productAddOn.produtos.map((reference) => (
						<div key={reference.id} className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
							<p className="min-w-0 flex-1 truncate text-xs font-medium tracking-tight text-foreground/90">
								{reference.produto.nome}
								{reference.produtoVariante ? ` — ${reference.produtoVariante.nome}` : ""}
							</p>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								disabled={detachIsPending}
								onClick={() =>
									detach({
										productId: reference.produtoId,
										productAddOnId: reference.produtoAddOnId,
										productVariantId: reference.produtoVarianteId,
									})
								}
								aria-label="Desvincular grupo do produto"
								className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
							>
								<Unplug className="h-3.5 w-3.5" />
							</Button>
						</div>
					))}
				</div>
			)}
		</ResponsiveMenuSection>
	);
}
