"use client";
import DateInput from "@/components/Inputs/DateInput";
import MultipleSelectInput from "@/components/Inputs/MultipleSelectInput";
import NumberInput from "@/components/Inputs/NumberInput";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateForInputValue, formatDateOnInputChange } from "@/lib/formatting";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import type { TGetSalesInput } from "@/pages/api/sales";
import { useState } from "react";

type ClientPurchasesFilterMenuProps = {
	queryParams: TGetSalesInput;
	updateQueryParams: (params: Partial<TGetSalesInput>) => void;
	closeMenu: () => void;
};

export default function ClientPurchasesFilterMenu({ queryParams, updateQueryParams, closeMenu }: ClientPurchasesFilterMenuProps) {
	const [queryParamsHolder, setQueryParamsHolder] = useState<TGetSalesInput>(queryParams);
	const { data: filterOptions } = useSaleQueryFilterOptions();

	return (
		<Sheet open onOpenChange={closeMenu}>
			<SheetContent>
				<div className="flex h-full w-full flex-col">
					<SheetHeader>
						<SheetTitle>FILTRAR COMPRAS DO CLIENTE</SheetTitle>
						<SheetDescription>Escolha aqui parâmetros para filtrar as compras do cliente.</SheetDescription>
					</SheetHeader>

					<div className="flex h-full flex-col gap-y-4 overflow-y-auto overscroll-y-auto p-2 scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
						<div className="flex w-full flex-col gap-2">
							<MultipleSelectInput
								label="NATUREZAS DE VENDA"
								selected={queryParamsHolder.saleNatures ?? []}
								options={filterOptions?.saleNatures || []}
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, saleNatures: value as string[] }))}
								onReset={() => setQueryParamsHolder((prev) => ({ ...prev, saleNatures: [] }))}
								resetOptionLabel="NENHUMA DEFINIDA"
								width="100%"
							/>
							<MultipleSelectInput
								label="VENDEDORES"
								selected={queryParamsHolder.sellersIds ?? []}
								options={filterOptions?.sellers || []}
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, sellersIds: value as string[] }))}
								onReset={() => setQueryParamsHolder((prev) => ({ ...prev, sellersIds: [] }))}
								resetOptionLabel="NENHUM DEFINIDO"
								width="100%"
							/>
							<MultipleSelectInput
								label="PARCEIROS"
								selected={queryParamsHolder.partnersIds ?? []}
								options={filterOptions?.partners || []}
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, partnersIds: value as string[] }))}
								onReset={() => setQueryParamsHolder((prev) => ({ ...prev, partnersIds: [] }))}
								resetOptionLabel="NENHUM DEFINIDO"
								width="100%"
							/>
							<MultipleSelectInput
								label="GRUPOS DE PRODUTOS"
								selected={queryParamsHolder.productGroups ?? []}
								options={filterOptions?.productsGroups || []}
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, productGroups: value as string[] }))}
								onReset={() => setQueryParamsHolder((prev) => ({ ...prev, productGroups: [] }))}
								resetOptionLabel="NENHUM DEFINIDO"
								width="100%"
							/>
						</div>

						<div className="flex w-full flex-col gap-2">
							<h1 className="w-full text-xs tracking-tight text-primary">FILTRO POR VALOR TOTAL DA COMPRA</h1>
							<NumberInput
								label="VALOR MÍNIMO"
								value={queryParamsHolder.totalMin ?? undefined}
								placeholder="R$ 0,00"
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, totalMin: value }))}
								width="100%"
							/>
							<NumberInput
								label="VALOR MÁXIMO"
								value={queryParamsHolder.totalMax ?? undefined}
								placeholder="R$ 0,00"
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, totalMax: value }))}
								width="100%"
							/>
						</div>

						<div className="flex w-full flex-col gap-2">
							<h1 className="w-full text-xs tracking-tight text-primary">FILTRO POR PERÍODO</h1>
							<DateInput
								label="DEPOIS DE"
								value={formatDateForInputValue(queryParamsHolder.periodAfter)}
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, periodAfter: formatDateOnInputChange(value, "date") as Date }))}
								width="100%"
							/>
							<DateInput
								label="ANTES DE"
								value={formatDateForInputValue(queryParamsHolder.periodBefore)}
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, periodBefore: formatDateOnInputChange(value, "date", "end") as Date }))}
								width="100%"
							/>
						</div>
					</div>

					<Button
						onClick={() => {
							updateQueryParams({ ...queryParamsHolder, page: 1 });
							closeMenu();
						}}
					>
						FILTRAR
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}
