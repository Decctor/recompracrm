"use client";

import type { TGetProductChannelSettingsOutput } from "@/app/api/products/channel-settings/route";
import type { TGetProductsOutputById } from "@/app/api/products/route";
import { cycleAvailabilityChoice } from "@/components/SalesChannels/ProductChannelControls";
import { getErrorMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/files-storage";
import { updateProductChannelSettings } from "@/lib/mutations/product-channel-settings";
import { updateProduct } from "@/lib/mutations/products";
import {
	type TProductChannelAvailabilityChoice,
	buildAddOnsUpdateInput,
	buildBasePricesUpdateInput,
	buildChannelMaps,
	buildChannelSettingsInput,
	buildCoreGeneralUpdateInput,
	buildVariationsUpdateInput,
	hydrateAddOnsState,
	hydrateVariationsState,
	mapProductToCoreState,
	mergeProductStateFromHydration,
	processVariantImages,
	validateAddOnsState,
	validateCoreGeneralState,
	validateVariationsState,
} from "@/lib/products/product-registry-state";
import { type TProductState, type TUseProductState, useProductCoreState, useProductState } from "@/state-hooks/use-product-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type ProductSectionEditorCallbacks = {
	onMutate?: () => void;
	onSuccess?: () => void;
	onError?: (error: Error) => void;
	onSettled?: () => void;
};

export function wrapWithDirty<T extends (...args: never[]) => void>(fn: T, markDirty: () => void): T {
	return ((...args: Parameters<T>) => {
		markDirty();
		fn(...args);
	}) as T;
}

function hydrateVariationsFullState(product: TGetProductsOutputById): TProductState {
	return mergeProductStateFromHydration(hydrateVariationsState(product));
}

function hydrateAddOnsFullState(product: TGetProductsOutputById): TProductState {
	return mergeProductStateFromHydration(hydrateAddOnsState(product));
}

/**
 * Marcador de "há rascunho pendente" de uma seção. O espelho em ref existe porque o efeito de
 * re-hidratação roda com o valor capturado no render: sem ele, um refetch em voo apagaria as
 * edições que o usuário acabou de fazer.
 */
export function useDirtyFlag() {
	const [isDirty, setIsDirty] = useState(false);
	const isDirtyRef = useRef(false);

	const markDirty = useCallback(() => {
		isDirtyRef.current = true;
		setIsDirty(true);
	}, []);

	const clearDirty = useCallback(() => {
		isDirtyRef.current = false;
		setIsDirty(false);
	}, []);

	return { isDirty, isDirtyRef, markDirty, clearDirty };
}

function useSectionDirtyState(product: TGetProductsOutputById, hydrate: (product: TGetProductsOutputById) => TProductState) {
	const { isDirty, isDirtyRef, markDirty, clearDirty } = useDirtyFlag();
	const productState = useProductState({ initialState: hydrate(product) });
	const { state, redefineState } = productState;

	const discard = useCallback(() => {
		redefineState(hydrate(product));
		clearDirty();
	}, [clearDirty, hydrate, product, redefineState]);

	useEffect(() => {
		if (!isDirtyRef.current) {
			redefineState(hydrate(product));
		}
	}, [hydrate, isDirtyRef, product, redefineState]);

	return { state, isDirty, markDirty, discard, clearDirty, productState };
}

export function useProductVariationsSectionEditor({
	product,
	callbacks,
}: {
	product: TGetProductsOutputById;
	callbacks?: ProductSectionEditorCallbacks;
}) {
	const { state, isDirty, markDirty, discard, clearDirty, productState } = useSectionDirtyState(product, hydrateVariationsFullState);

	const { mutate: applyMutation, isPending } = useMutation({
		mutationKey: ["apply-product-variations", product.id],
		mutationFn: async () => {
			const validationError = validateVariationsState(state);
			if (validationError) throw new Error(validationError);

			const processedVariants = await processVariantImages(state.productVariants);
			return updateProduct(
				buildVariationsUpdateInput(product, {
					productOptions: state.productOptions,
					productVariants: processedVariants,
				}),
			);
		},
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			clearDirty();
			callbacks?.onSuccess?.();
			toast.success(data.message);
		},
		onError: (error) => {
			callbacks?.onError?.(error as Error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	const apply = useCallback(() => applyMutation(), [applyMutation]);

	const updaters = useMemo(
		() => ({
			addProductVariant: wrapWithDirty(productState.addProductVariant, markDirty),
			updateProductVariant: wrapWithDirty(productState.updateProductVariant, markDirty),
			updateProductVariantImageHolder: wrapWithDirty(productState.updateProductVariantImageHolder, markDirty),
			removeProductVariant: wrapWithDirty(productState.removeProductVariant, markDirty),
			addProductOption: wrapWithDirty(productState.addProductOption, markDirty),
			updateProductOption: wrapWithDirty(productState.updateProductOption, markDirty),
			removeProductOption: wrapWithDirty(productState.removeProductOption, markDirty),
			addProductOptionValue: wrapWithDirty(productState.addProductOptionValue, markDirty),
			updateProductOptionValue: wrapWithDirty(productState.updateProductOptionValue, markDirty),
			removeProductOptionValue: wrapWithDirty(productState.removeProductOptionValue, markDirty),
			generateVariantMatrix: wrapWithDirty(productState.generateVariantMatrix, markDirty),
		}),
		[markDirty, productState],
	);

	return {
		state,
		isDirty,
		isPending,
		apply,
		discard,
		...updaters,
	};
}

export function useProductAddOnsSectionEditor({
	product,
	callbacks,
}: {
	product: TGetProductsOutputById;
	callbacks?: ProductSectionEditorCallbacks;
}) {
	const { state, isDirty, markDirty, discard, clearDirty, productState } = useSectionDirtyState(product, hydrateAddOnsFullState);

	const { mutate: applyMutation, isPending } = useMutation({
		mutationKey: ["apply-product-add-ons", product.id],
		mutationFn: async () => {
			const validationError = validateAddOnsState(state);
			if (validationError) throw new Error(validationError);

			return updateProduct(buildAddOnsUpdateInput(product, { productAddOns: state.productAddOns }));
		},
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			clearDirty();
			callbacks?.onSuccess?.();
			toast.success(data.message);
		},
		onError: (error) => {
			callbacks?.onError?.(error as Error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	const apply = useCallback(() => applyMutation(), [applyMutation]);

	const updaters = useMemo(
		() => ({
			addProductAddOn: wrapWithDirty(productState.addProductAddOn, markDirty),
			updateProductAddOn: wrapWithDirty(productState.updateProductAddOn, markDirty),
			removeProductAddOn: wrapWithDirty(productState.removeProductAddOn, markDirty),
			moveProductAddOn: wrapWithDirty(productState.moveProductAddOn, markDirty),
			addProductAddOnOption: wrapWithDirty(productState.addProductAddOnOption, markDirty),
			updateProductAddOnOption: wrapWithDirty(productState.updateProductAddOnOption, markDirty),
			removeProductAddOnOption: wrapWithDirty(productState.removeProductAddOnOption, markDirty),
		}),
		[markDirty, productState],
	);

	return {
		state,
		isDirty,
		isPending,
		apply,
		discard,
		...updaters,
	};
}

export type TUseProductVariationsSectionEditor = ReturnType<typeof useProductVariationsSectionEditor>;
export type TUseProductAddOnsSectionEditor = ReturnType<typeof useProductAddOnsSectionEditor>;

export type TUseProductVariationsSectionEditorUpdaters = Pick<
	TUseProductState,
	| "addProductVariant"
	| "updateProductVariant"
	| "updateProductVariantImageHolder"
	| "removeProductVariant"
	| "addProductOption"
	| "updateProductOption"
	| "removeProductOption"
	| "addProductOptionValue"
	| "updateProductOptionValue"
	| "removeProductOptionValue"
	| "generateVariantMatrix"
>;

/**
 * Seção "INFORMAÇÕES GERAIS": rascunho dos dados cadastrais do produto com barra de aplicar.
 *
 * A quantidade só entra no payload quando o produto NÃO rastreia estoque. Com rastreamento ativo o
 * saldo pertence ao livro-razão e muda por recontagem — `buildCoreGeneralUpdateInput` envia `null`
 * para a rota não gerar um AJUSTE a partir de um saldo lido minutos atrás.
 */
export function useProductCoreSectionEditor({ product, callbacks }: { product: TGetProductsOutputById; callbacks?: ProductSectionEditorCallbacks }) {
	const { isDirty, isDirtyRef, markDirty, clearDirty } = useDirtyFlag();
	const coreState = useProductCoreState({ initialState: mapProductToCoreState(product) });
	const { state, redefineState } = coreState;

	const discard = useCallback(() => {
		redefineState(mapProductToCoreState(product));
		clearDirty();
	}, [clearDirty, product, redefineState]);

	useEffect(() => {
		if (!isDirtyRef.current) {
			redefineState(mapProductToCoreState(product));
		}
	}, [isDirtyRef, product, redefineState]);

	const { mutate: applyMutation, isPending } = useMutation({
		mutationKey: ["apply-product-core", product.id],
		mutationFn: async () => {
			const validationError = validateCoreGeneralState(state);
			if (validationError) throw new Error(validationError);

			let imagemCapaUrl = state.imagemCapaUrl ?? null;
			if (state.imagemCapaHolder.file) {
				const { url } = await uploadFile({
					file: state.imagemCapaHolder.file,
					fileName: state.nome || "produto",
					prefix: "syncrono",
				});
				imagemCapaUrl = url;
			}

			return updateProduct(buildCoreGeneralUpdateInput(product, state, imagemCapaUrl));
		},
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			clearDirty();
			callbacks?.onSuccess?.();
			toast.success(data.message);
		},
		onError: (error) => {
			callbacks?.onError?.(error as Error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	const apply = useCallback(() => applyMutation(), [applyMutation]);

	const updaters = useMemo(
		() => ({
			updateProduct: wrapWithDirty(coreState.updateProduct, markDirty),
			updateProductImageHolder: wrapWithDirty(coreState.updateProductImageHolder, markDirty),
		}),
		[coreState.updateProduct, coreState.updateProductImageHolder, markDirty],
	);

	return {
		state,
		isDirty,
		isPending,
		apply,
		discard,
		...updaters,
	};
}

type TProductBasePrices = { precoCusto: number | null; precoVenda: number | null };

function readBasePrices(product: TGetProductsOutputById): TProductBasePrices {
	return { precoCusto: product.precoCusto ?? null, precoVenda: product.precoVenda ?? null };
}

/**
 * Seção "PREÇOS E CANAIS DE VENDA": duas fatias que sujam independentemente (preços base do produto
 * e a matriz de canais), uma única barra de aplicar.
 *
 * O apply envia só o que mudou, em sequência, e limpa a fatia assim que ela é aceita — se os canais
 * falharem depois dos preços terem ido, um novo APLICAR reenvia apenas os canais, e a barra
 * continua visível porque a fatia de canais segue suja.
 */
export function useProductPricingSectionEditor({
	product,
	channelData,
	callbacks,
}: {
	product: TGetProductsOutputById;
	channelData: TGetProductChannelSettingsOutput["data"] | undefined;
	callbacks?: ProductSectionEditorCallbacks;
}) {
	const queryClient = useQueryClient();
	const { isDirty: pricesAreDirty, isDirtyRef: pricesDirtyRef, markDirty: markPricesDirty, clearDirty: clearPricesDirty } = useDirtyFlag();
	const { isDirty: channelsAreDirty, isDirtyRef: channelsDirtyRef, markDirty: markChannelsDirty, clearDirty: clearChannelsDirty } = useDirtyFlag();

	const [basePrices, setBasePrices] = useState<TProductBasePrices>(() => readBasePrices(product));
	const [choices, setChoices] = useState<Map<string, TProductChannelAvailabilityChoice>>(new Map());
	const [channelPrices, setChannelPrices] = useState<Map<string, number | null>>(new Map());

	useEffect(() => {
		if (!pricesDirtyRef.current) setBasePrices(readBasePrices(product));
	}, [pricesDirtyRef, product]);

	useEffect(() => {
		if (!channelData || channelsDirtyRef.current) return;
		const maps = buildChannelMaps(channelData.settings);
		setChoices(maps.choices);
		setChannelPrices(maps.prices);
	}, [channelData, channelsDirtyRef]);

	const updateBasePrices = useCallback(
		(patch: Partial<TProductBasePrices>) => {
			markPricesDirty();
			setBasePrices((previous) => ({ ...previous, ...patch }));
		},
		[markPricesDirty],
	);

	const cycleChannelChoice = useCallback(
		(key: string) => {
			markChannelsDirty();
			setChoices((previous) => {
				const next = new Map(previous);
				next.set(key, cycleAvailabilityChoice(next.get(key) ?? null));
				return next;
			});
		},
		[markChannelsDirty],
	);

	const updateChannelPrice = useCallback(
		(key: string, value: number | null) => {
			markChannelsDirty();
			setChannelPrices((previous) => {
				const next = new Map(previous);
				next.set(key, value);
				return next;
			});
		},
		[markChannelsDirty],
	);

	const discard = useCallback(() => {
		setBasePrices(readBasePrices(product));
		clearPricesDirty();
		if (channelData) {
			const maps = buildChannelMaps(channelData.settings);
			setChoices(maps.choices);
			setChannelPrices(maps.prices);
		}
		clearChannelsDirty();
	}, [channelData, clearChannelsDirty, clearPricesDirty, product]);

	const { mutate: applyMutation, isPending } = useMutation({
		mutationKey: ["apply-product-prices-channels", product.id],
		mutationFn: async () => {
			if (basePrices.precoCusto != null && basePrices.precoCusto < 0) throw new Error("O preço de custo não pode ser negativo.");
			if (basePrices.precoVenda != null && basePrices.precoVenda < 0) throw new Error("O preço de venda não pode ser negativo.");

			let message = "Nenhuma alteração para aplicar.";

			if (pricesDirtyRef.current) {
				const result = await updateProduct(buildBasePricesUpdateInput(product, basePrices));
				message = result.message;
				// Limpa já: se a etapa de canais falhar, o retry não deve reenviar os preços.
				clearPricesDirty();
			}

			if (channelsDirtyRef.current && channelData) {
				const result = await updateProductChannelSettings(
					buildChannelSettingsInput({ product, channels: channelData.channels, choices, prices: channelPrices }),
				);
				message = result.message;
				clearChannelsDirty();
			}

			return { message };
		},
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
		},
		onError: (error) => {
			callbacks?.onError?.(error as Error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			callbacks?.onSettled?.();
			queryClient.invalidateQueries({ queryKey: ["product-channel-settings", product.id] });
		},
	});

	const apply = useCallback(() => applyMutation(), [applyMutation]);

	return {
		basePrices,
		updateBasePrices,
		choices,
		channelPrices,
		cycleChannelChoice,
		updateChannelPrice,
		isDirty: pricesAreDirty || channelsAreDirty,
		isPending,
		apply,
		discard,
	};
}

export type TUseProductCoreSectionEditor = ReturnType<typeof useProductCoreSectionEditor>;
export type TUseProductPricingSectionEditor = ReturnType<typeof useProductPricingSectionEditor>;
