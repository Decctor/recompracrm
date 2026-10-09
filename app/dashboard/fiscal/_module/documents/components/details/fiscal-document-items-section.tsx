"use client";

import { Section } from "@/components/ui/section";
import {
	isPlaceholderItemDescription,
	type TFiscalDocumentPayloadItemView,
	type TFiscalDocumentTaxTotalsView,
} from "@/lib/fiscal/document-details-view";
import { formatToMoney } from "@/lib/formatting";
import { Package } from "lucide-react";

type FiscalDocumentItemsSectionProps = {
	items: TFiscalDocumentPayloadItemView[];
	totals: TFiscalDocumentTaxTotalsView | null;
	// produtoId → nome, vindo da venda. Só é usado quando a nota levou o "ITEM N" de reserva.
	productNames: Map<string, string>;
};

function money(value: number | null | undefined) {
	return value != null ? formatToMoney(value) : "—";
}

/**
 * Itens como foram ao provedor (det do payload) e os totais do ICMSTot logo abaixo: o que a SEFAZ
 * viu, numa seção só. Cada item é uma linha com o nome ocupando a maior parte da largura — no
 * celular o nome sobe para uma linha inteira e os códigos ficam embaixo.
 */
export function FiscalDocumentItemsSection({ items, totals, productNames }: FiscalDocumentItemsSectionProps) {
	const taxTiles: Array<[string, number | null]> = totals
		? [
				["Produtos", totals.vProd],
				["Desconto", totals.vDesc],
				["Base de cálculo ICMS", totals.vBC],
				["ICMS", totals.vICMS],
				["ICMS-ST", totals.vST],
				["FCP", totals.vFCP],
				["PIS", totals.vPIS],
				["COFINS", totals.vCOFINS],
			]
		: [];

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Package />
				</Section.Icon>
				<Section.Title>{`Itens da nota (${items.length})`}</Section.Title>
			</Section.Header>
			<Section.Body>
				{items.length === 0 && !totals ? (
					<p className="text-sm text-muted-foreground">Itens e tributos aparecem aqui depois da primeira tentativa de envio.</p>
				) : null}
				{items.length > 0 ? (
					<div className="flex flex-col gap-1.5">
						{items.map((item) => {
							const placeholder = isPlaceholderItemDescription(item.descricao);
							const productName = placeholder && item.produtoId ? productNames.get(item.produtoId) : undefined;
							return (
								<div
									key={item.numero}
									className="grid grid-cols-[repeat(4,auto)_minmax(80px,1fr)] items-center gap-3 rounded-lg bg-secondary/30 px-3 py-2.5 text-xs sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto_auto_minmax(80px,auto)]"
								>
									<div className="col-span-full flex min-w-0 flex-col sm:col-span-1">
										<span className="text-sm font-bold tracking-tight">{productName ?? item.descricao}</span>
										<span className="text-muted-foreground">
											Item {item.numero}
											{productName ? ` · na nota como “${item.descricao}”` : null}
										</span>
									</div>
									<ItemCode label="NCM" value={item.ncm} />
									<ItemCode label="CFOP" value={item.cfop} />
									<ItemCode label="CSOSN" value={item.csosn} />
									<ItemCode label="Qtde" value={item.quantidade != null ? String(item.quantidade) : null} align="right" />
									<span className="text-right text-sm font-bold tabular-nums">{money(item.valorTotal)}</span>
								</div>
							);
						})}
					</div>
				) : null}
				{totals ? (
					<>
						<div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
							{taxTiles.map(([label, value]) => (
								<div key={label} className="flex flex-col items-center rounded-lg bg-secondary/50 p-3 text-center">
									<span className="text-[0.65rem] text-muted-foreground uppercase">{label}</span>
									<span className="text-sm font-bold tabular-nums">{money(value)}</span>
								</div>
							))}
						</div>
						<div className="flex items-center justify-between gap-3 border-t border-border pt-2">
							<span className="text-xs font-bold tracking-tight text-muted-foreground uppercase">Valor da nota</span>
							<span className="text-sm font-bold whitespace-nowrap tabular-nums">
								{money(totals.vNF)}
								{totals.vTotTrib != null ? (
									<span className="ml-1 text-xs font-semibold text-muted-foreground">tributos aprox. {money(totals.vTotTrib)}</span>
								) : null}
							</span>
						</div>
					</>
				) : null}
			</Section.Body>
		</Section.Root>
	);
}

function ItemCode({ label, value, align = "left" }: { label: string; value: string | null; align?: "left" | "right" }) {
	return (
		<div className={align === "right" ? "flex flex-col text-right" : "flex flex-col"}>
			<span className="text-micro text-muted-foreground uppercase">{label}</span>
			<span className="font-semibold tabular-nums">{value ?? "—"}</span>
		</div>
	);
}
