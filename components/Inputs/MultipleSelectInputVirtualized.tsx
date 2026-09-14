import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronsUpDown } from "lucide-react";
import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "../ui/command";
import { Drawer, DrawerContent, DrawerTrigger } from "../ui/drawer";
import { Field, FieldLabel } from "../ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
type SelectOption = {
	id: string | number;
	value: string;
	label: string;
	startContent?: ReactNode;
};
type SelectInputProps = {
	label: string;
	labelClassName?: string;
	holderClassName?: string;
	showLabel?: boolean;
	selected: (string | number)[] | null;
	resetOptionLabel: string;
	optionsStartContent?: ReactNode;
	options: SelectOption[] | null;
	handleChange: (value: string[]) => void;
	onReset: () => void;
	itemHeight?: number;
	maxHeight?: number;
};

function MultipleSelectInputVirtualized({
	label,
	labelClassName,
	holderClassName,
	showLabel = true,
	selected,
	options,
	optionsStartContent,
	resetOptionLabel,
	handleChange,
	onReset,
	itemHeight = 40,
	maxHeight = 300,
}: SelectInputProps) {
	const generatedId = useId();
	const inputIdentifier = `${label.toLowerCase().replaceAll(" ", "_")}_${generatedId}`;
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const [isOpen, setIsOpen] = useState<boolean>(false);
	const [searchValue, setSearchValue] = useState<string>("");
	const triggerRef = useRef<HTMLButtonElement>(null);
	// `undefined`, nunca `null`: o FloatingPortal do Base UI trata `container === null` como "container
	// ainda não resolvido" e desiste de criar o portal, então o popup não renderiza. Só com `undefined`
	// ele cai no fallback `document.body` — que é o caso de toda tela que não é modal.
	const dialogContainer = (triggerRef.current?.closest("[data-dialog-container]") as HTMLElement | null) ?? undefined;

	// Filter options based on search
	const filteredOptions = useMemo(() => {
		if (!searchValue) return options ?? [];
		return (options ?? []).filter(
			(option) => option.label.toLowerCase().includes(searchValue.toLowerCase()) || option.value.toLowerCase().includes(searchValue.toLowerCase()),
		);
	}, [options, searchValue]);

	const selectedOptions = options?.filter((o) => (selected ? selected.includes(o.value) : false)) ?? [];

	return (
		<Field className="gap-1">
			{showLabel ? (
				<FieldLabel htmlFor={inputIdentifier} className={cn("text-start text-sm font-medium tracking-tight text-foreground/80", labelClassName)}>
					{label}
				</FieldLabel>
			) : null}

			{isDesktop ? (
				<Popover open={isOpen} onOpenChange={setIsOpen}>
					<PopoverTrigger
						render={
							<Button
								ref={triggerRef}
								id={inputIdentifier}
								type="button"
								variant="outline"
								aria-haspopup="listbox"
								aria-expanded={isOpen}
								className={cn("w-full justify-between truncate border border-border", holderClassName)}
							>
								<SelectedOptions selectedOptions={selectedOptions} placeholderText={resetOptionLabel} />
								<ChevronsUpDown className="opacity-50" />
							</Button>
						}
					/>
					<PopoverContent container={dialogContainer} className="p-0 w-[var(--anchor-width)]">
						<VirtualizedOptionsList
							value={selected?.map((p) => p.toString()) ?? null}
							selectedOptions={selectedOptions}
							placeholderText={resetOptionLabel}
							resetOptionText={resetOptionLabel}
							handleChange={handleChange}
							handleReset={onReset}
							options={filteredOptions}
							optionsStartContent={optionsStartContent}
							closeMenu={() => setIsOpen(false)}
							searchValue={searchValue}
							setSearchValue={setSearchValue}
							itemHeight={itemHeight}
							maxHeight={maxHeight}
						/>
					</PopoverContent>
				</Popover>
			) : (
				<Drawer open={isOpen} onOpenChange={setIsOpen}>
					<DrawerTrigger asChild>
						<Button
							id={inputIdentifier}
							type="button"
							variant="outline"
							aria-haspopup="listbox"
							aria-expanded={isOpen}
							className={cn("w-full justify-between truncate border border-border", holderClassName)}
						>
							<SelectedOptions selectedOptions={selectedOptions} placeholderText={resetOptionLabel} />
							<ChevronsUpDown className="opacity-50" />
						</Button>
					</DrawerTrigger>
					<DrawerContent>
						<div className="mt-4 border-t">
							<VirtualizedOptionsList
								value={selected?.map((p) => p.toString()) ?? null}
								selectedOptions={selectedOptions}
								placeholderText={resetOptionLabel}
								resetOptionText={resetOptionLabel}
								handleChange={handleChange}
								handleReset={onReset}
								options={filteredOptions}
								optionsStartContent={optionsStartContent}
								closeMenu={() => setIsOpen(false)}
								searchValue={searchValue}
								setSearchValue={setSearchValue}
								itemHeight={itemHeight}
								maxHeight={maxHeight}
							/>
						</div>
					</DrawerContent>
				</Drawer>
			)}
		</Field>
	);
}

export default MultipleSelectInputVirtualized;

type VirtualizedOptionsListProps = {
	value: string[] | null;
	selectedOptions: SelectOption[];
	placeholderText: string;
	resetOptionText: string;
	handleChange: (value: string[]) => void;
	handleReset: () => void;
	options: SelectOption[];
	optionsStartContent?: ReactNode;
	closeMenu: () => void;
	searchValue: string;
	setSearchValue: (value: string) => void;
	itemHeight: number;
	maxHeight: number;
};

function VirtualizedOptionsList({
	value,
	selectedOptions,
	placeholderText,
	resetOptionText,
	handleChange,
	handleReset,
	options,
	optionsStartContent,
	closeMenu,
	searchValue,
	setSearchValue,
	itemHeight,
	maxHeight,
}: VirtualizedOptionsListProps) {
	const parentRef = useRef<HTMLDivElement>(null);

	// Create virtualized items array
	const virtualizedItems = useMemo(() => {
		const items = [
			{ type: "reset" as const, id: "reset", label: resetOptionText, value: null },
			...options.map((option) => ({ type: "option" as const, ...option })),
		];
		return items;
	}, [options, resetOptionText]);

	const virtualizer = useVirtualizer({
		count: virtualizedItems.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => itemHeight,
		overscan: 5,
	});

	const virtualItems = virtualizer.getVirtualItems();
	const selectedOptionsValues = selectedOptions.map((v) => v.value);

	return (
		<Command loop shouldFilter={false}>
			<CommandInput placeholder={placeholderText} className="h-9 w-full" value={searchValue} onValueChange={setSearchValue} />
			<CommandList className="w-full">
				{options.length === 0 && searchValue ? (
					<CommandEmpty className="w-full p-3">Nenhuma opção encontrada.</CommandEmpty>
				) : (
					<CommandGroup
						ref={parentRef}
						className="w-full overflow-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30"
						style={{
							height: Math.min(maxHeight, virtualizedItems.length * itemHeight),
						}}
					>
						<div
							style={{
								height: virtualizer.getTotalSize(),
								width: "100%",
								position: "relative",
							}}
						>
							{virtualItems.map((virtualItem) => {
								const item = virtualizedItems[virtualItem.index];
								if (!item) return null;
								return (
									<div
										key={virtualItem.key}
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											width: "100%",
											height: `${virtualItem.size}px`,
											transform: `translateY(${virtualItem.start}px)`,
										}}
									>
										{item.type === "reset" ? (
											<>
												<CommandItem
													value={undefined}
													onSelect={() => {
														handleReset();
														closeMenu();
													}}
												>
													{resetOptionText}
													<Check className={cn("ml-auto", value === null ? "opacity-100" : "opacity-0")} />
												</CommandItem>
												{virtualItem.index === 0 && <CommandSeparator className="my-1" />}
											</>
										) : (
											<CommandItem
												key={item.id}
												value={item.value}
												onSelect={(currentValue) => {
													if (selectedOptionsValues.includes(currentValue)) {
														handleChange(selectedOptionsValues.filter((s) => s !== currentValue));
													} else {
														handleChange([...selectedOptionsValues, currentValue]);
													}
												}}
												className="h-full"
											>
												{item.startContent ? item.startContent : optionsStartContent ? optionsStartContent : undefined}
												{item.label}
												<Check className={cn("ml-auto", selectedOptionsValues.includes(item.value) ? "opacity-100" : "opacity-0")} />
											</CommandItem>
										)}
									</div>
								);
							})}
						</div>
					</CommandGroup>
				)}
			</CommandList>
		</Command>
	);
}

type SelectedOptionsProps = {
	selectedOptions: SelectOption[];
	placeholderText: string;
};

function SelectedOptions({ selectedOptions, placeholderText }: SelectedOptionsProps) {
	if (selectedOptions.length === 0) return <span className="flex items-center gap-1 truncate">{placeholderText}</span>;

	return (
		<span className="flex items-center gap-1 overflow-hidden truncate">
			{selectedOptions.map((option, index, arr) => (
				<span key={option.id} className="flex items-center gap-1">
					{option.startContent ?? null}
					{option.label}
					{index + 1 !== arr.length ? ", " : null}
				</span>
			))}
		</span>
	);
}
