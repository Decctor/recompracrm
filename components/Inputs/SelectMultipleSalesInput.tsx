import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useSalesSimplifiedSearch } from "@/lib/queries/sales";
import { cn } from "@/lib/utils";
import type { TSalesSimplifiedSearchResult } from "@/app/api/sales/simplified-search/route";
import { BadgeDollarSign, Check, ChevronsUpDown } from "lucide-react";
import React, { useEffect, useId, useRef, useState } from "react";
import ErrorComponent from "../Layouts/ErrorComponent";
import GeneralPaginationComponent from "../Utils/Pagination";
import { Button } from "../ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "../ui/command";
import { Drawer, DrawerContent, DrawerTrigger } from "../ui/drawer";
import { Field, FieldLabel } from "../ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

type SelectInputProps<T> = {
	label: string;
	labelClassName?: string;
	holderClassName?: string;
	showLabel?: boolean;
	selected: (string | number)[] | null;
	editable?: boolean;
	resetOptionLabel: string;
	handleChange: (value: T[]) => void;
	onReset: () => void;
};

function MultipleSalesSelectInput<T>({
	label,
	labelClassName,
	holderClassName,
	showLabel = true,
	selected,
	editable = true,
	resetOptionLabel,
	handleChange,
	onReset,
}: SelectInputProps<T>) {
	const { data: salesResult, isLoading, isError, isSuccess, error, params, updateParams } = useSalesSimplifiedSearch();
	const sales = salesResult?.sales;
	const salesMatched = salesResult?.salesMatched || 0;
	const salesShowing = sales?.length || 0;
	const totalPages = salesResult?.totalPages || 0;

	function getValueID({ sales, selected }: { selected: (string | number)[] | null; sales: TSalesSimplifiedSearchResult["sales"] }) {
		if (sales && selected) {
			const filteredOptions = sales.filter((sale) => selected.includes(sale.id));
			if (filteredOptions) {
				const arrOfIds = filteredOptions.map((option) => option.id);
				return arrOfIds;
			}
			return null;
		}
		return null;
	}

	const isDesktop = useMediaQuery("(min-width: 768px)");

	const [isOpen, setIsOpen] = useState<boolean>(false);
	const [selectedIds, setSelectedIds] = useState<(string | number)[] | null>(getValueID({ sales: sales ?? [], selected }));
	const triggerRef = useRef<HTMLButtonElement>(null);
	// `undefined`, nunca `null`: o FloatingPortal do Base UI trata `container === null` como "container
	// ainda não resolvido" e desiste de criar o portal, então o popup não renderiza. Só com `undefined`
	// ele cai no fallback `document.body` — que é o caso de toda tela que não é modal.
	const dialogContainer = (triggerRef.current?.closest("[data-dialog-container]") as HTMLElement | null) ?? undefined;

	const generatedId = useId();
	const inputIdentifier = `${label.toLowerCase().replaceAll(" ", "_")}_${generatedId}`;

	function handleSelect({ id }: { id: string | number }) {
		const ids = selectedIds ? [...selectedIds] : [];
		if (!ids?.includes(id)) {
			const newIds = [...(ids || []), id];
			setSelectedIds(newIds);
			handleChange(newIds as T[]);
		} else {
			const newIds = ids.filter((item) => item !== id);
			setSelectedIds(newIds);
			handleChange(newIds as T[]);
		}
	}

	function resetState() {
		onReset();
		setSelectedIds(null);
		setIsOpen(false);
	}

	useEffect(() => {
		if (selected) {
			setSelectedIds(selected);
		}
	}, [selected]);

	const renderTrigger = () => (
		<Button
			ref={triggerRef}
			id={inputIdentifier}
			type="button"
			disabled={!editable}
			variant="outline"
			aria-expanded={isOpen}
			className={cn("w-full justify-between truncate border-border", holderClassName)}
		>
			{selectedIds && selectedIds.length > 0 && sales
				? sales.filter((item) => selectedIds.includes(item.id)).length > 1
					? "MÚLTIPLAS SELEÇÕES"
					: sales.filter((item) => selectedIds.includes(item.id))[0]?.cliente?.nome || "AO CONSUMIDOR"
				: "NÃO DEFINIDO"}
			<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
		</Button>
	);

	const renderContent = () => (
		<Command shouldFilter={false} className="w-full">
			<CommandInput placeholder="Filtre o item desejado..." value={params.search} onValueChange={(value) => updateParams({ search: value })} />
			<CommandList>
				<CommandGroup>
					<CommandItem value="reset-selection-option" onSelect={() => resetState()} className="cursor-pointer">
						{resetOptionLabel}
						<Check className={cn("ml-auto h-4 w-4", !selectedIds || selectedIds.length === 0 ? "opacity-100" : "opacity-0")} />
					</CommandItem>
				</CommandGroup>

				<CommandSeparator />

				{isLoading && <div className="p-2 text-center text-xs text-foreground/80">Carregando...</div>}
				{isError && (
					<div className="p-2">
						<ErrorComponent msg={getErrorMessage(error)} />
					</div>
				)}

				{!isLoading && !isError && (
					<>
						<div className="p-2">
							<GeneralPaginationComponent
								activePage={params.page}
								queryLoading={isLoading}
								selectPage={(page) => updateParams({ page })}
								totalPages={totalPages}
								itemsMatchedText={salesMatched > 1 ? `${salesMatched} vendas encontradas.` : `${salesMatched} venda encontrada.`}
								itemsShowingText={salesShowing > 1 ? `Mostrando ${salesShowing} vendas.` : `Mostrando ${salesShowing} venda.`}
								showSteppersText={false}
								pageIconSize={"sm"}
							/>
						</div>
						<CommandGroup>
							{isSuccess && sales?.length === 0 && <div className="p-2 text-center text-sm italic text-foreground">Sem opções disponíveis.</div>}
							{sales?.map((item) => (
								<CommandItem
									key={item.id}
									value={String(item.id)}
									// Use onSelect logic properly. Command expects simple value interaction.
									// We prevent default behavior if we want to keep it open, but multiselect usually stays open?
									// Actually, standard Popover select usually closes on single select, but this is MULTI select.
									// Existing behavior: keep open? code says: onClick => handleSelect.
									onSelect={() => {
										if (editable) handleSelect({ id: item.id });
										// Not closing menu to allow multiple selections
									}}
									className="cursor-pointer"
								>
									<div className="flex grow items-center gap-1 justify-between min-w-0">
										<p className="text-sm font-medium truncate flex-1 min-w-0">{item.cliente?.nome || "AO CONSUMIDOR"}</p>
										<div className="flex items-center gap-1 shrink-0">
											<BadgeDollarSign size={12} />
											<p className="text-xs text-foreground/80">{formatToMoney(item.valorTotal)}</p>
										</div>
									</div>
									{selectedIds?.includes(item.id) ? (
										<Check className={cn("ml-auto h-4 w-4", selectedIds?.includes(item.id) ? "opacity-100" : "opacity-0")} />
									) : null}
								</CommandItem>
							))}
						</CommandGroup>
					</>
				)}
			</CommandList>
		</Command>
	);

	if (isDesktop) {
		return (
			<Field className="gap-1" data-disabled={!editable}>
				{showLabel && (
					<FieldLabel htmlFor={inputIdentifier} className={cn("text-start text-sm font-medium tracking-tight text-foreground/80", labelClassName)}>
						{label}
					</FieldLabel>
				)}
				<Popover open={isOpen} onOpenChange={setIsOpen}>
					<PopoverTrigger render={renderTrigger()} />
					<PopoverContent container={dialogContainer} className="w-[350px] p-0" align="start">
						{renderContent()}
					</PopoverContent>
				</Popover>
			</Field>
		);
	}

	return (
		<Field className="gap-1" data-disabled={!editable}>
			{showLabel && (
				<FieldLabel htmlFor={inputIdentifier} className={cn("text-start text-sm font-medium tracking-tight text-foreground/80", labelClassName)}>
					{label}
				</FieldLabel>
			)}
			<Drawer open={isOpen} onOpenChange={setIsOpen}>
				<DrawerTrigger asChild>{renderTrigger()}</DrawerTrigger>
				<DrawerContent>
					<div className="mt-4 border-t p-2 pb-8">{renderContent()}</div>
				</DrawerContent>
			</Drawer>
		</Field>
	);
}

export default MultipleSalesSelectInput;
