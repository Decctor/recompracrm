"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Badge } from "@/components/ui/badge";
import { formatToMoney } from "@/lib/formatting";
import type { TPOSBarcodeCandidates } from "@/lib/hooks/use-pos-barcode-scan";
import type { TPOSBarcodeMatch } from "@/lib/queries/pos";
import { Package } from "lucide-react";
import Image from "next/image";

// Mais de um item do cadastro responde ao mesmo código (duplicidade que o formulário de produto
// avisa, mas não impede). O operador escolhe aqui em vez de a leitura adivinhar.

type BarcodeMatchPickerProps = {
	candidates: TPOSBarcodeCandidates;
	onChoose: (match: TPOSBarcodeMatch) => void;
	onClose: () => void;
};

function describeMatch(match: TPOSBarcodeMatch) {
	const variant = match.variantId ? match.product.variantes.find((candidate) => candidate.id === match.variantId) : null;
	return {
		key: `${match.product.id}:${match.variantId ?? ""}`,
		nome: variant ? `${match.product.nome} - ${variant.nome}` : match.product.nome,
		codigo: variant?.codigo ?? match.product.codigo,
		imagemUrl: variant?.imagemCapaUrl ?? match.product.imagemCapaUrl,
		preco: variant ? variant.precoVenda : match.product.precoVenda,
		matchedBy: match.matchedBy,
	};
}

const MATCHED_BY_LABEL: Record<TPOSBarcodeMatch["matchedBy"], string> = {
	VARIANTE_CODIGO_BARRAS: "Código de barras da variante",
	PRODUTO_CODIGO_BARRAS: "Código de barras do produto",
	VARIANTE_CODIGO: "Código da variante",
	PRODUTO_CODIGO: "Código do produto",
};

export default function BarcodeMatchPicker({ candidates, onChoose, onClose }: BarcodeMatchPickerProps) {
	return (
		<ResponsiveMenu
			mode="read-only"
			menuTitle="QUAL PRODUTO?"
			menuDescription={`Mais de um item do cadastro usa o código ${candidates.code}. Escolha o que foi lido.`}
			menuCancelButtonText="CANCELAR"
			stateIsLoading={false}
			stateError={null}
			closeMenu={onClose}
		>
			<div className="flex w-full flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
				{candidates.matches.map((match) => {
					const row = describeMatch(match);
					return (
						<button
							key={row.key}
							type="button"
							onClick={() => onChoose(match)}
							className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
						>
							<span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary/60">
								{row.imagemUrl ? (
									<Image src={row.imagemUrl} alt="" fill sizes="44px" className="object-cover" />
								) : (
									<Package className="size-5 text-muted-foreground/60" />
								)}
							</span>
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="truncate text-sm font-bold leading-tight">{row.nome}</span>
								<span className="truncate text-[0.7rem] text-muted-foreground">{row.codigo}</span>
								<Badge variant="secondary" className="w-fit text-[0.6rem]">
									{MATCHED_BY_LABEL[row.matchedBy]}
								</Badge>
							</span>
							<span className="shrink-0 text-sm font-bold tabular-nums">{formatToMoney(row.preco ?? 0)}</span>
						</button>
					);
				})}
			</div>
		</ResponsiveMenu>
	);
}
