"use client";

import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import type { TFiscalDocumentSaleSummaryView } from "@/lib/fiscal/document-details-view";
import { formatDateAsLocale, formatToCPForCNPJ, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { ArrowRight, Calendar, CircleUser, IdCard, ShoppingCart, Store, UserRound } from "lucide-react";
import Link from "next/link";
import { FiscalDocumentInfoRows } from "./fiscal-document-info-rows";

type FiscalDocumentSaleSectionProps = {
	sale: TFiscalDocumentSaleSummaryView | null;
};

/**
 * A venda por trás do documento, no formato do painel de cliente da venda: linhas curtas e o
 * total fechando o cartão. Os itens em si estão em "Itens da nota", como a SEFAZ os viu.
 */
export function FiscalDocumentSaleSection({ sale }: FiscalDocumentSaleSectionProps) {
	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<ShoppingCart />
				</Section.Icon>
				<Section.Title>Venda vinculada</Section.Title>
				{sale?.vendaId ? (
					<Section.Actions>
						<Button variant="ghost" size="xs" asChild>
							<Link href={appRoutes.sales.details(sale.vendaId)}>
								VER VENDA
								<ArrowRight className="ml-1 size-3" />
							</Link>
						</Button>
					</Section.Actions>
				) : null}
			</Section.Header>
			<Section.Body>
				{sale ? (
					<>
						<FiscalDocumentInfoRows
							rows={[
								{ icon: CircleUser, label: "Cliente", value: sale.clienteNome ?? "Consumidor não identificado" },
								{ icon: IdCard, label: "CPF/CNPJ", value: sale.clienteCpfCnpj ? formatToCPForCNPJ(sale.clienteCpfCnpj) : null },
								{ icon: Calendar, label: "Data da venda", value: sale.dataVenda ? formatDateAsLocale(sale.dataVenda, true) : null },
								{ icon: Store, label: "Canal", value: sale.canal },
								{ icon: UserRound, label: "Vendedor", value: sale.vendedorNome },
							]}
						/>
						{sale.valorTotal != null ? (
							<div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-2">
								<span className="text-xs font-bold tracking-tight text-muted-foreground uppercase">Total da venda</span>
								<span className="text-sm font-bold whitespace-nowrap tabular-nums">
									{formatToMoney(sale.valorTotal)}
									{sale.itens.length > 0 ? (
										<span className="ml-1 text-xs font-semibold text-muted-foreground">
											{sale.itens.length} {sale.itens.length === 1 ? "item" : "itens"}
										</span>
									) : null}
								</span>
							</div>
						) : null}
					</>
				) : (
					<p className="text-sm text-muted-foreground">Documento sem venda vinculada.</p>
				)}
			</Section.Body>
		</Section.Root>
	);
}
