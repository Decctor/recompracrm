import type { TGetCampaignInteractionsInput } from "@/app/api/campaigns/interactions/route";
import MultipleSelectInput from "@/components/Inputs/MultipleSelectInput";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from "lucide-react";
import { useState } from "react";

type CampaignInteractionsFilterMenuProps = {
	filters: TGetCampaignInteractionsInput;
	updateFilters: (filters: Partial<TGetCampaignInteractionsInput>) => void;
	closeMenu: () => void;
};

const STATUS_OPTIONS = [
	{ id: 1, label: "AGENDADA", value: "AGENDADA" },
	{ id: 2, label: "EXECUTADA", value: "EXECUTADA" },
] as const;

const SORTING_FIELDS = [
	{ id: 1, label: "DATA DE AGENDAMENTO", value: "agendamentoData" },
	{ id: 2, label: "DATA DE EXECUÇÃO", value: "dataExecucao" },
	{ id: 3, label: "DATA DE ENVIO", value: "dataEnvio" },
] as const;

export default function CampaignInteractionsFilterMenu({ filters, updateFilters, closeMenu }: CampaignInteractionsFilterMenuProps) {
	const [filtersHolder, setFiltersHolder] = useState<TGetCampaignInteractionsInput>(filters);

	return (
		<Sheet open onOpenChange={closeMenu}>
			<SheetContent>
				<div className="flex h-full w-full flex-col">
					<SheetHeader>
						<SheetTitle>FILTRAR INTERAÇÕES</SheetTitle>
						<SheetDescription>Selecione os filtros e a ordenação para visualizar os logs.</SheetDescription>
					</SheetHeader>

					<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 flex h-full flex-col gap-y-4 overflow-y-auto overscroll-y-auto p-2">
						<div className="flex w-full flex-col gap-2">
							<MultipleSelectInput
								label="STATUS"
								selected={filtersHolder.status ?? []}
								options={STATUS_OPTIONS.map((option) => ({ ...option }))}
								handleChange={(value) =>
									setFiltersHolder((prev) => ({
										...prev,
										status: value as TGetCampaignInteractionsInput["status"],
									}))
								}
								onReset={() => setFiltersHolder((prev) => ({ ...prev, status: [] }))}
								resetOptionLabel="TODOS"
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
											orderByField: option.value as TGetCampaignInteractionsInput["orderByField"],
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
