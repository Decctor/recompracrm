import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateOnInputChange } from "@/lib/formatting";
import { formatDateForInputValue } from "@/lib/formatting";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import type { TGetClientsInput } from "@/pages/api/clients";
import type { TClientSearchQueryParams } from "@/schemas/clients";
import { TUserSession } from "@/schemas/users";
import { RFMLabels } from "@/utils/rfm";
import { CustomersAcquisitionChannels } from "@/utils/select-options";
import React, { useState } from "react";
import DateInput from "../Inputs/DateInput";
import MultipleSelectInput from "../Inputs/MultipleSelectInput";
import NumberInput from "../Inputs/NumberInput";
import MultipleSalesSelectInput from "../Inputs/SelectMultipleSalesInput";
import TextInput from "../Inputs/TextInput";
import { Button } from "../ui/button";

type RFMAnalysisQueryParamsMenuProps = {
	filters: TGetClientsInput;
	updateFilters: (newParams: Partial<TGetClientsInput>) => void;
	closeMenu: () => void;
};
function RFMAnalysisQueryParamsMenu({ filters, updateFilters, closeMenu }: RFMAnalysisQueryParamsMenuProps) {
	const [filtersHolder, setFiltersHolder] = useState<TGetClientsInput>(filters);
	const { data: filterOptions } = useSaleQueryFilterOptions();

	return (
		<Sheet open onOpenChange={closeMenu}>
			<SheetContent>
				<div className="flex h-full w-full flex-col">
					<SheetHeader>
						<SheetTitle>FILTRAR CLIENTES</SheetTitle>
						<SheetDescription>Escolha aqui parâmetros para filtrar os clientes.</SheetDescription>
					</SheetHeader>
					<div className="flex h-full flex-col gap-y-4 overflow-y-auto overscroll-y-auto p-2 scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
						<div className="flex w-full flex-col gap-2">
							<TextInput
								label="PESQUISA"
								value={filtersHolder.search ?? ""}
								placeholder={"Preenha aqui o nome do cliente para filtro."}
								handleChange={(value) => setFiltersHolder((prev) => ({ ...prev, search: value }))}
								width={"100%"}
							/>
							<MultipleSelectInput
								label="CANAL DE AQUISIÇÃO"
								selected={filtersHolder.acquisitionChannels}
								options={CustomersAcquisitionChannels.map((s, index) => ({ id: index + 1, label: s.label, value: s.value })) || []}
								handleChange={(value) =>
									setFiltersHolder((prev) => ({
										...prev,
										acquisitionChannels: value as string[],
									}))
								}
								resetOptionLabel="CANAL DE AQUISIÇÃO"
								onReset={() => setFiltersHolder((prev) => ({ ...prev, acquisitionChannels: [] }))}
								width="100%"
							/>
							<MultipleSelectInput
								label="CATEGORIA DE CLIENTES"
								selected={filtersHolder.segmentationTitles}
								options={RFMLabels.map((s, index) => ({ id: index + 1, label: s.text, value: s.text })) || []}
								handleChange={(value) =>
									setFiltersHolder((prev) => ({
										...prev,
										segmentationTitles: value as string[],
									}))
								}
								resetOptionLabel="CATEGORIA DE CLIENTES"
								onReset={() => setFiltersHolder((prev) => ({ ...prev, segmentationTitles: [] }))}
								width="100%"
							/>
						</div>
						<h1 className="w-full text-center text-[0.75rem] tracking-tight text-primary/80">FILTRO PARA COMPRAS</h1>
						<MultipleSalesSelectInput
							label="VENDAS EXCLUÍDAS"
							selected={filtersHolder.statsExcludedSalesIds}
							handleChange={(value) =>
								setFiltersHolder((prev) => ({
									...prev,
									statsExcludedSalesIds: value as string[],
								}))
							}
							resetOptionLabel="VENDAS EXCLUÍDAS"
							onReset={() => setFiltersHolder((prev) => ({ ...prev, statsExcludedSalesIds: [] }))}
							width="100%"
						/>
						<MultipleSelectInput
							label="NATUREZA DA VENDA"
							selected={filtersHolder.statsSaleNatures}
							options={filterOptions?.saleNatures || []}
							handleChange={(value) =>
								setFiltersHolder((prev) => ({
									...prev,
									statsSaleNatures: value as string[],
								}))
							}
							resetOptionLabel="NATUREZA DA VENDA"
							onReset={() => setFiltersHolder((prev) => ({ ...prev, statsSaleNatures: [] }))}
							width="100%"
						/>

						<div className="flex w-full flex-col gap-2">
							<h1 className="w-full text-center text-[0.65rem] tracking-tight text-primary/80">FILTRO POR PERÍODO</h1>
							<DateInput
								label="DEPOIS DE"
								value={formatDateForInputValue(filtersHolder.statsPeriodAfter)}
								handleChange={(value) => setFiltersHolder((prev) => ({ ...prev, statsPeriodAfter: formatDateOnInputChange(value, "date") as Date }))}
								width="100%"
							/>
							<DateInput
								label="ANTES DE"
								value={formatDateForInputValue(filtersHolder.statsPeriodBefore)}
								handleChange={(value) => setFiltersHolder((prev) => ({ ...prev, statsPeriodBefore: formatDateOnInputChange(value, "date") as Date }))}
								width="100%"
							/>
						</div>
					</div>
					<Button
						onClick={() => {
							updateFilters({ ...filtersHolder, page: 1 });
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

export default RFMAnalysisQueryParamsMenu;
