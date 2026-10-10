"use client";

import type { TGetProductsOutputById } from "@/app/api/products/route";
import type { TUpdateProductMainSupplierInput } from "@/app/api/products/main-supplier/route";
import SelectSupplierInput from "@/components/Inputs/SelectSupplierInput";
import { LoadingButton } from "@/components/loading-button";
import { Chip } from "@/components/ui/chip";
import { Section } from "@/components/ui/section";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToCNPJ, formatToMoney } from "@/lib/formatting";
import { updateProductMainSupplier } from "@/lib/mutations/products";
import { MAIN_SUPPLIER_SUGGESTION_WINDOW_MONTHS, type TMainSupplierCandidate } from "@/lib/products/main-supplier-shared";
import { useProductMainSupplierCandidates } from "@/lib/queries/products";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Sparkles, Truck } from "lucide-react";
import { toast } from "sonner";

type MainSupplierSectionProps = {
	product: TGetProductsOutputById;
	// Escolher fornecedor e ver o histórico de compras exige a permissão de visualizar compras.
	userHasPurchasesViewPermission: boolean;
	callbacks: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/**
 * Fornecedor principal do produto. A escolha é sempre do usuário: as compras efetivadas geram
 * sugestões ranqueadas, mas só o clique em "DEFINIR COMO PRINCIPAL" (ou o seletor) grava.
 */
export default function MainSupplierSection({ product, userHasPurchasesViewPermission, callbacks }: MainSupplierSectionProps) {
	const queryClient = useQueryClient();
	const mainSupplier = product.fornecedorPrincipal;
	const {
		data: candidates,
		isLoading: candidatesLoading,
		isError: candidatesError,
		queryKey: candidatesQueryKey,
	} = useProductMainSupplierCandidates({ productId: product.id, enabled: userHasPurchasesViewPermission });

	const { mutate, isPending, variables } = useMutation({
		mutationKey: ["update-product-main-supplier", product.id],
		mutationFn: updateProductMainSupplier,
		onMutate: () => callbacks.onMutate?.(),
		onSuccess: (data) => {
			callbacks.onSuccess?.();
			toast.success(data.message);
		},
		onError: (error) => {
			callbacks.onError?.(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			callbacks.onSettled?.();
			await queryClient.invalidateQueries({ queryKey: ["products"] });
			await queryClient.invalidateQueries({ queryKey: ["product-main-supplier-suggestions"] });
			await queryClient.invalidateQueries({ queryKey: candidatesQueryKey });
		},
	});

	const assign = (fornecedorId: TUpdateProductMainSupplierInput["fornecedorId"]) => mutate({ productIds: [product.id], fornecedorId });

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Truck className="h-4 w-4 min-h-4 min-w-4" />
				</Section.Icon>
				<Section.Title>FORNECEDOR PRINCIPAL</Section.Title>
			</Section.Header>
			<Section.Body className="flex flex-col gap-4">
				{userHasPurchasesViewPermission ? (
					<SelectSupplierInput
						label="FORNECEDOR PRINCIPAL"
						showLabel={false}
						value={mainSupplier}
						editable={!isPending}
						onSelect={(supplier) => {
							if (supplier.id !== mainSupplier?.id) assign(supplier.id);
						}}
						onClear={() => assign(null)}
					/>
				) : (
					<div className="flex items-center gap-1.5 text-sm">
						<Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
						{mainSupplier ? (
							<span className="font-medium">{mainSupplier.nome}</span>
						) : (
							<span className="italic text-muted-foreground">Nenhum fornecedor principal definido.</span>
						)}
					</div>
				)}
				{mainSupplier && !mainSupplier.ativo ? (
					<p className="text-xs text-muted-foreground">Este fornecedor está inativo. O vínculo foi mantido até que você escolha outro.</p>
				) : null}

				{userHasPurchasesViewPermission ? (
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-1.5">
							<Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
							<span className="text-xs font-medium uppercase tracking-tight text-muted-foreground">Sugestões pelo histórico de compras</span>
						</div>
						{candidatesLoading ? <p className="text-xs italic text-muted-foreground">Carregando histórico de compras...</p> : null}
						{candidatesError ? <p className="text-xs text-destructive">Erro ao carregar o histórico de compras.</p> : null}
						{candidates && candidates.length === 0 ? (
							<p className="text-xs italic text-muted-foreground">Nenhuma compra efetivada com fornecedor vinculado para este produto.</p>
						) : null}
						{candidates && candidates.length > 0 ? (
							<div className="flex flex-col divide-y divide-border rounded-lg border border-border">
								{candidates.map((candidate) => (
									<MainSupplierCandidateRow
										key={candidate.fornecedor.id}
										candidate={candidate}
										isCurrent={candidate.fornecedor.id === mainSupplier?.id}
										isAssigning={isPending && variables?.fornecedorId === candidate.fornecedor.id}
										disabled={isPending}
										onAssign={() => assign(candidate.fornecedor.id)}
									/>
								))}
							</div>
						) : null}
					</div>
				) : null}
			</Section.Body>
		</Section.Root>
	);
}

function MainSupplierCandidateRow({
	candidate,
	isCurrent,
	isAssigning,
	disabled,
	onAssign,
}: {
	candidate: TMainSupplierCandidate;
	isCurrent: boolean;
	isAssigning: boolean;
	disabled: boolean;
	onAssign: () => void;
}) {
	const details = [
		`${candidate.comprasRecentes} compra(s) em ${MAIN_SUPPLIER_SUGGESTION_WINDOW_MONTHS} meses`,
		`${candidate.comprasTotal} no total (${formatDecimalPlaces(candidate.participacao * 100, 0, 0)}%)`,
		`${formatDecimalPlaces(candidate.quantidadeTotal)} un. · ${formatToMoney(candidate.valorTotal)}`,
		candidate.dataUltimaCompra ? `última em ${formatDateAsLocale(candidate.dataUltimaCompra)}` : null,
	].filter(Boolean);

	return (
		<div className="flex w-full flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex min-w-0 flex-col gap-0.5">
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="truncate text-sm font-medium">{candidate.fornecedor.nome}</span>
					{candidate.fornecedor.cpfCnpj ? <span className="text-xs text-muted-foreground">{formatToCNPJ(candidate.fornecedor.cpfCnpj)}</span> : null}
					{candidate.sugerido ? (
						<Chip.Root size="xs" variant="info">
							<Chip.Label caps weight="semibold">
								Sugerido
							</Chip.Label>
						</Chip.Root>
					) : null}
					{!candidate.fornecedor.ativo ? (
						<Chip.Root size="xs" variant="muted">
							<Chip.Label caps weight="semibold">
								Inativo
							</Chip.Label>
						</Chip.Root>
					) : null}
				</div>
				<span className="text-xs text-muted-foreground">{details.join(" · ")}</span>
			</div>
			{isCurrent ? (
				<Chip.Root size="sm" variant="success" className="self-start sm:self-center">
					<Chip.Label caps weight="semibold">
						Principal
					</Chip.Label>
				</Chip.Root>
			) : (
				<LoadingButton
					type="button"
					size="sm"
					variant="outline"
					className="self-start sm:self-center"
					loading={isAssigning}
					disabled={disabled}
					onClick={onAssign}
				>
					DEFINIR COMO PRINCIPAL
				</LoadingButton>
			)}
		</div>
	);
}
