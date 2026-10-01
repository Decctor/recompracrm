"use client";

import type { TGetCashbackProgramPrizesOutputDefault } from "@/app/api/cashback-programs/prizes/route";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectProductWithVariants from "@/components/Inputs/SelectProductWithVariants";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/files-storage";
import { formatToMoney, getCashbackUnitLabel } from "@/lib/formatting";
import { createCashbackProgramPrize, updateCashbackProgramPrize as updateCashbackProgramPrizeMutation } from "@/lib/mutations/cashback-programs";
import { cn } from "@/lib/utils";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { type TCashbackProgramPrizeState, useCashbackProgramPrizeState } from "@/state-hooks/use-cashback-program-state";
import { useMutation } from "@tanstack/react-query";
import { Gift, ImageUp, RotateCcw } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef } from "react";
import { toast } from "sonner";

type TPrize = TGetCashbackProgramPrizesOutputDefault[number];

export type TPrizeEditorFocus = "produto" | "valor";

type PrizeEditorProps = {
	/** Recompensa existente; ausente = rascunho de uma nova. */
	prize?: TPrize;
	organizationId: string;
	programId: string;
	terminology: TCashbackProgramTerminologyEnum;
	initialFocus: TPrizeEditorFocus;
	onDirtyChange: (isDirty: boolean) => void;
	onClose: () => void;
	callbacks: {
		onMutate: () => Promise<void>;
		onSettled: () => Promise<void>;
	};
};

function hydratePrizeState(prize?: TPrize): Partial<TCashbackProgramPrizeState> {
	if (!prize) return {};
	const linkedItem = prize.produtoVariante ?? prize.produto;
	return {
		ativo: prize.ativo,
		produtoId: prize.produtoId,
		produtoVarianteId: prize.produtoVarianteId,
		titulo: prize.titulo,
		descricao: prize.descricao,
		imagemCapaUrl: prize.imagemCapaUrl,
		valor: prize.valor,
		produto: linkedItem
			? {
					nome: prize.produtoVariante && prize.produto ? `${prize.produto.nome} · ${prize.produtoVariante.nome}` : linkedItem.nome,
					precoVenda: linkedItem.precoVenda,
					imagemCapaUrl: prize.produtoVariante?.imagemCapaUrl || prize.produto?.imagemCapaUrl || null,
				}
			: null,
	};
}

/** O que vai para a API. Comparar por aqui (e não pelo estado inteiro) ignora o que é só exibição. */
function toPayload(state: TCashbackProgramPrizeState) {
	return {
		ativo: state.ativo,
		produtoId: state.produtoId,
		produtoVarianteId: state.produtoVarianteId,
		titulo: state.titulo.trim(),
		descricao: state.descricao?.trim() ? state.descricao.trim() : null,
		imagemCapaUrl: state.imagemCapaUrl,
		valor: state.valor,
	};
}

function getBlockingReason(state: TCashbackProgramPrizeState, terminology: TCashbackProgramTerminologyEnum) {
	if (!state.produtoId) return "Escolha o produto que o cliente leva.";
	if (!state.titulo.trim()) return "Dê um título à recompensa.";
	if (!(state.valor > 0)) return `Defina quantos ${getCashbackUnitLabel(terminology)} a recompensa custa.`;
	return null;
}

/**
 * Editor em linha de uma recompensa. Mesmo idioma das seções de cadastro (cupom, produto, cliente):
 * campos sempre editáveis, rascunho local e `SectionApplyBar` para aplicar ou descartar. Só um
 * editor fica aberto por vez — quem garante é a lista, a partir de `onDirtyChange`.
 */
export default function PrizeEditor({
	prize,
	organizationId,
	programId,
	terminology,
	initialFocus,
	onDirtyChange,
	onClose,
	callbacks,
}: PrizeEditorProps) {
	const isNew = !prize;
	const { state, initialState, updateCashbackProgramPrize, updateImageHolder } = useCashbackProgramPrizeState({
		initialState: hydratePrizeState(prize),
	});
	const imageInputId = useId();
	const valueFieldRef = useRef<HTMLDivElement>(null);
	const productFieldRef = useRef<HTMLDivElement>(null);

	const isDirty = isNew || !!state.imagemCapaHolder.file || JSON.stringify(toPayload(state)) !== JSON.stringify(toPayload(initialState));
	const blockingReason = getBlockingReason(state, terminology);

	useEffect(() => {
		onDirtyChange(isDirty);
	}, [isDirty, onDirtyChange]);
	useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

	useEffect(() => {
		const holder = initialFocus === "valor" ? valueFieldRef.current : productFieldRef.current;
		holder?.querySelector<HTMLElement>("input, button")?.focus();
	}, [initialFocus]);

	// A pré-visualização é um object URL: liberar ao trocar de arquivo ou fechar o editor.
	const previewUrl = state.imagemCapaHolder.previewUrl;
	useEffect(() => {
		return () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	const { mutate: savePrize, isPending } = useMutation({
		mutationKey: [isNew ? "create-cashback-program-prize" : "update-cashback-program-prize", prize?.id],
		mutationFn: async () => {
			let imagemCapaUrl = state.imagemCapaUrl;
			if (state.imagemCapaHolder.file) {
				const { url } = await uploadFile({
					file: state.imagemCapaHolder.file,
					fileName: `recompensa-${state.titulo || "capa"}`,
					vinculationId: organizationId,
					prefix: "organizations",
				});
				imagemCapaUrl = url;
			}
			const cashbackProgramPrize = { ...toPayload(state), imagemCapaUrl };
			if (prize) return await updateCashbackProgramPrizeMutation({ cashbackProgramPrizeId: prize.id, cashbackProgramPrize });
			return await createCashbackProgramPrize({ cashbackProgramId: programId, cashbackProgramPrize });
		},
		onMutate: callbacks.onMutate,
		onSuccess: (data) => {
			toast.success(isNew ? "Recompensa criada." : data.message);
			onDirtyChange(false);
			onClose();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled: callbacks.onSettled,
	});

	const productImageUrl = state.produto?.imagemCapaUrl ?? null;
	const shownImageUrl = state.imagemCapaHolder.previewUrl ?? state.imagemCapaUrl;
	const hasCustomImage = !!state.imagemCapaHolder.file || (!!state.imagemCapaUrl && state.imagemCapaUrl !== productImageUrl);
	const unitLabel = getCashbackUnitLabel(terminology);
	const productPrice = state.produto?.precoVenda;

	return (
		<div className="flex w-full flex-col gap-4 bg-muted/30 px-3 py-4 sm:px-4">
			<div className="flex w-full flex-col gap-4 md:flex-row">
				<div className="flex shrink-0 flex-col items-center gap-2 md:w-36">
					<label
						htmlFor={imageInputId}
						className="group relative aspect-square w-32 cursor-pointer overflow-hidden rounded-xl border border-border bg-background focus-within:ring-[3px] focus-within:ring-ring/50"
					>
						{shownImageUrl ? (
							<Image src={shownImageUrl} alt={state.titulo || "Capa da recompensa"} fill className="object-cover" />
						) : (
							<span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
								<Gift className="h-6 w-6" />
								<span className="text-micro">Sem imagem</span>
							</span>
						)}
						<span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-foreground/70 py-1 text-micro text-background opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
							<ImageUp className="h-3 w-3" />
							Trocar imagem
						</span>
						<input
							id={imageInputId}
							type="file"
							accept=".png,.jpeg,.jpg,.webp"
							className="sr-only"
							onChange={(event) => {
								const file = event.target.files?.[0] ?? null;
								updateImageHolder({ file, previewUrl: file ? URL.createObjectURL(file) : null });
								event.target.value = "";
							}}
						/>
					</label>
					{hasCustomImage && productImageUrl ? (
						<Button
							type="button"
							variant="ghost"
							size="xs"
							onClick={() => updateCashbackProgramPrize({ imagemCapaUrl: productImageUrl, imagemCapaHolder: { file: null, previewUrl: null } })}
						>
							<RotateCcw />
							USAR IMAGEM DO PRODUTO
						</Button>
					) : null}
				</div>

				<div className="flex min-w-0 grow flex-col gap-3">
					<div ref={productFieldRef}>
						<SelectProductWithVariants
							label="PRODUTO"
							initialSearch={state.produto?.nome ?? ""}
							value={state.produtoId ? { productId: state.produtoId, productVariantId: state.produtoVarianteId } : null}
							selectedLabel={state.produto?.nome}
							handleChange={(value) => {
								const product = value?.product;
								const variant = value?.productVariant;
								if (!product) return;
								const linkedName = variant ? `${product.nome} · ${variant.nome}` : product.nome;
								const linkedImage = variant?.imagemCapaUrl || product.imagemCapaUrl || null;
								// O título acompanha o produto enquanto o usuário não o personalizou.
								const titleFollowsProduct = !state.titulo.trim() || state.titulo === state.produto?.nome;
								// Idem a imagem: só segue o produto se ainda era a imagem do produto.
								const imageFollowsProduct = !hasCustomImage;
								updateCashbackProgramPrize({
									produtoId: product.id,
									produtoVarianteId: variant?.id ?? null,
									produto: { nome: linkedName, precoVenda: variant?.precoVenda ?? product.precoVenda ?? null, imagemCapaUrl: linkedImage },
									...(titleFollowsProduct ? { titulo: linkedName } : {}),
									...(imageFollowsProduct ? { imagemCapaUrl: linkedImage } : {}),
								});
							}}
							onReset={() => updateCashbackProgramPrize({ produtoId: null, produtoVarianteId: null, produto: null })}
							resetOptionLabel="SELECIONE UM PRODUTO"
						/>
					</div>
					<div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
						<TextInput
							label="TÍTULO"
							required
							placeholder="Como o cliente vê a recompensa..."
							value={state.titulo}
							handleChange={(value) => updateCashbackProgramPrize({ titulo: value })}
						/>
						<div ref={valueFieldRef} className="flex flex-col gap-1">
							<NumberInput
								label={terminology === "PONTOS" ? "VALOR EM PONTOS" : "VALOR EM CASHBACK"}
								required
								placeholder={`Quantos ${unitLabel}...`}
								value={state.valor}
								handleChange={(value) => updateCashbackProgramPrize({ valor: value })}
							/>
							{productPrice ? <p className="text-micro text-muted-foreground text-numeric">Produto vendido a {formatToMoney(productPrice)}</p> : null}
						</div>
					</div>
					<TextareaInput
						label="DESCRIÇÃO"
						placeholder="Opcional. Aparece no cartão da recompensa no tablet e na loja."
						value={state.descricao ?? ""}
						handleChange={(value) => updateCashbackProgramPrize({ descricao: value })}
					/>
					<label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
						<Switch checked={state.ativo} onCheckedChange={(checked) => updateCashbackProgramPrize({ ativo: checked })} />
						{state.ativo ? "Disponível para resgate" : "Fora do resgate (inativa)"}
					</label>
				</div>
			</div>

			<div className={cn("flex w-full justify-end", isDirty && "hidden")}>
				<Button type="button" variant="ghost" size="sm" onClick={onClose}>
					FECHAR
				</Button>
			</div>
			<SectionApplyBar
				isDirty={isDirty}
				isPending={isPending}
				disabled={!!blockingReason}
				disabledReason={blockingReason}
				message={isNew ? "Nova recompensa ainda não salva" : "Alterações não salvas nesta recompensa"}
				applyButtonText={isNew ? "CRIAR RECOMPENSA" : "SALVAR RECOMPENSA"}
				onApply={() => savePrize()}
				onDiscard={() => {
					onDirtyChange(false);
					onClose();
				}}
			/>
		</div>
	);
}
