import React, { useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import TextInput from "../Inputs/TextInput";

import { formatDateForInputValue, formatDateOnInputChange } from "@/lib/formatting";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import { cn } from "@/lib/utils";
import type { TGetClientsInput } from "@/pages/api/clients";
import { RFMLabels } from "@/utils/rfm";
import { CustomersAcquisitionChannels } from "@/utils/select-options";
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from "lucide-react";
import DateInput from "../Inputs/DateInput";
import MultipleSelectInput from "../Inputs/MultipleSelectInput";
import { Button } from "../ui/button";

type ClientsDatabaseFilterMenuProps = {
	filters: TGetClientsInput;
	updateFilters: (filters: Partial<TGetClientsInput>) => void;
	closeMenu: () => void;
};
function ClientsDatabaseFilterMenu({ filters, updateFilters, closeMenu }: ClientsDatabaseFilterMenuProps) {
	const [filtersHolder, setFiltersHolder] = useState<TGetClientsInput>(filters);
	const { data: filterOptions } = useSaleQueryFilterOptions();
	const SORTING_FIELDS = [
		{ id: 1, label: "NOME", value: "nome" },
		{ id: 2, label: "VALOR TOTAL DE COMPRAS", value: "comprasValorTotal" },
		{ id: 3, label: "QUANTIDADE TOTAL DE COMPRAS", value: "comprasQtdeTotal" },
		{ id: 4, label: "PRIMEIRA COMPRA", value: "primeiraCompraData" },
		{ id: 5, label: "ÚLTIMA COMPRA", value: "ultimaCompraData" },
	] as const;

	return (
		<Sheet open onOpenChange={closeMenu}>
			<SheetContent>
				<div className="flex h-full w-full flex-col">
					<SheetHeader>
						<SheetTitle>FILTRAR CLIENTES</SheetTitle>
						<SheetDescription>Escolha aqui parâmetros para filtrar o banco de clientes.</SheetDescription>
					</SheetHeader>

					<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 flex h-full flex-col gap-y-4 overflow-y-auto overscroll-y-auto p-2">
						<div className="flex w-full flex-col gap-2">
							<TextInput
								label="PESQUISA"
								value={filtersHolder.search ?? ""}
								placeholder={"Preenha aqui o nome do cliente para filtro."}
								handleChange={(value) => setFiltersHolder((prev) => ({ ...prev, search: value }))}
								width={"100%"}
							/>
						</div>

						<div className="flex w-full flex-col gap-2">
							<h1 className="w-full text-center text-[0.65rem] tracking-tight text-primary/80">FILTRO DAS ESTASTÍCAS POR PERÍODO</h1>
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
						<div className="flex w-full flex-col gap-2">
							<h1 className="w-full text-center text-[0.65rem] tracking-tight text-primary/80">OUTROS FILTROS DAS ESTASTÍCAS</h1>

							<MultipleSelectInput
								label="NATUREZA DA VENDA"
								selected={filtersHolder.statsSaleNatures ?? []}
								options={filterOptions?.saleNatures || []}
								handleChange={(value) => setFiltersHolder((prev) => ({ ...prev, statsSaleNatures: value as string[] }))}
								onReset={() => setFiltersHolder((prev) => ({ ...prev, statsSaleNatures: [] }))}
								resetOptionLabel="NENHUMA DEFINIDA"
								width="100%"
							/>
							<MultipleSelectInput
								label="CANAIS DE AQUISIÇÃO"
								selected={filtersHolder.acquisitionChannels ?? []}
								options={CustomersAcquisitionChannels}
								handleChange={(value) => setFiltersHolder((prev) => ({ ...prev, acquisitionChannels: value as string[] }))}
								onReset={() => setFiltersHolder((prev) => ({ ...prev, acquisitionChannels: [] }))}
								resetOptionLabel="NENHUM DEFINIDO"
								width="100%"
							/>
							<MultipleSelectInput
								label="TÍTULOS DE SEGMENTAÇÃO"
								selected={filtersHolder.segmentationTitles ?? []}
								options={RFMLabels.map((s, index) => ({ id: index + 1, label: s.text, value: s.text })) || []}
								handleChange={(value) => setFiltersHolder((prev) => ({ ...prev, segmentationTitles: value as string[] }))}
								onReset={() => setFiltersHolder((prev) => ({ ...prev, segmentationTitles: [] }))}
								resetOptionLabel="NENHUM DEFINIDO"
								width="100%"
							/>
						</div>
						<div className="flex w-full flex-col gap-2">
							<h1 className="w-full text-center text-[0.65rem] tracking-tight text-primary/80">ORDENAÇÃO</h1>
							<div className="flex items-center justify-center gap-2 flex-wrap">
								<button
									type="button"
									onClick={() => setFiltersHolder((prev) => ({ ...prev, orderByDirection: "asc" }))}
									className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-primary duration-300 ease-in-out", {
										"bg-primary/50 text-primary-foreground hover:bg-primary/40": filtersHolder.orderByDirection === "asc",
										"bg-transparent text-primary hover:bg-primary/20": filtersHolder.orderByDirection !== "asc",
									})}
								>
									<ArrowUpNarrowWide size={12} />
									<h1 className="text-xs font-medium tracking-tight">ORDEM CRESCENTE</h1>
								</button>
								<button
									type="button"
									onClick={() => setFiltersHolder((prev) => ({ ...prev, orderByDirection: "desc" }))}
									className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-primary duration-300 ease-in-out", {
										"bg-primary/50 text-primary-foreground hover:bg-primary/40": filtersHolder.orderByDirection === "desc",
										"bg-transparent text-primary hover:bg-primary/20": filtersHolder.orderByDirection !== "desc",
									})}
								>
									<ArrowDownNarrowWide size={12} />
									<h1 className="text-xs font-medium tracking-tight">ORDEM DECRESCENTE</h1>
								</button>
							</div>
							{SORTING_FIELDS.map((option) => (
								<button
									key={option.value}
									type="button"
									className={cn("w-full flex items-center text-xs tracking-tight px-2 py-1 rounded-lg", {
										"bg-primary/50 text-primary-foreground hover:bg-primary/40": filtersHolder.orderByField === option.value,
										"bg-transparent text-primary hover:bg-primary/20": filtersHolder.orderByField !== option.value,
									})}
									onClick={() =>
										setFiltersHolder((prev) => ({
											...prev,
											orderByField: option.value as TGetClientsInput["orderByField"],
										}))
									}
								>
									<h1>{option.label}</h1>
								</button>
							))}
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

export default ClientsDatabaseFilterMenu;
