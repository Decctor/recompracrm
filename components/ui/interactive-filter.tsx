"use client";

import { endOfDay, isSameDay, startOfDay, subDays, subMonths, subYears, type Locale } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDownNarrowWide, ArrowUpNarrowWide, Check, ChevronLeft, X } from "lucide-react";
import * as React from "react";

import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import { Calendar } from "./calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "./command";
import { Drawer, DrawerContent, DrawerTrigger } from "./drawer";
import { Input } from "./input";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

type InteractiveFilterMode = "auto" | "popover" | "drawer";

type InteractiveFilterContextValue = {
	mode: Exclude<InteractiveFilterMode, "auto">;
	open: boolean;
	setOpen: (open: boolean) => void;
	disabled: boolean;
};

type InteractiveAddFilterItemState = {
	id: string;
	label: string;
};

type InteractiveAddFilterContextValue = InteractiveFilterContextValue & {
	activeItem: InteractiveAddFilterItemState | null;
	setActiveItem: (item: InteractiveAddFilterItemState | null) => void;
};

const InteractiveFilterContext = React.createContext<InteractiveFilterContextValue | null>(null);
const InteractiveAddFilterContext = React.createContext<InteractiveAddFilterContextValue | null>(null);

function useInteractiveFilterContext() {
	const context = React.useContext(InteractiveFilterContext);
	if (!context) {
		throw new Error("InteractiveFilter components must be used inside InteractiveFilter.Root");
	}
	return context;
}

function useInteractiveAddFilterContext() {
	const context = React.useContext(InteractiveAddFilterContext);
	if (!context) {
		throw new Error("InteractiveFilter add filter components must be used inside InteractiveFilter.AddFilterRoot");
	}
	return context;
}

type InteractiveFilterRootProps = {
	children: React.ReactNode;
	className?: string;
	mode?: InteractiveFilterMode;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	disabled?: boolean;
};

function resolveInteractiveFilterMode(mode: InteractiveFilterMode, isDesktop: boolean): Exclude<InteractiveFilterMode, "auto"> {
	return mode === "auto" ? (isDesktop ? "popover" : "drawer") : mode;
}

function InteractiveFilterRoot({
	children,
	className,
	mode = "auto",
	open,
	defaultOpen = false,
	onOpenChange,
	disabled = false,
}: InteractiveFilterRootProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const resolvedMode = resolveInteractiveFilterMode(mode, isDesktop);
	const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
	const isControlled = open !== undefined;
	const currentOpen = isControlled ? open : internalOpen;

	function handleOpenChange(nextOpen: boolean) {
		if (disabled && nextOpen) return;
		if (!isControlled) setInternalOpen(nextOpen);
		onOpenChange?.(nextOpen);
	}

	const contextValue: InteractiveFilterContextValue = {
		mode: resolvedMode,
		open: currentOpen,
		setOpen: handleOpenChange,
		disabled,
	};

	const Wrapper = resolvedMode === "popover" ? Popover : Drawer;

	return (
		<InteractiveFilterContext.Provider value={contextValue}>
			<Wrapper open={currentOpen} onOpenChange={handleOpenChange}>
				<div className={cn("flex w-fit items-center", className)}>{children}</div>
			</Wrapper>
		</InteractiveFilterContext.Provider>
	);
}

function InteractiveFilterAddFilterRoot({
	children,
	className,
	mode = "auto",
	open,
	defaultOpen = false,
	onOpenChange,
	disabled = false,
}: InteractiveFilterRootProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const resolvedMode = resolveInteractiveFilterMode(mode, isDesktop);
	const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
	const [activeItem, setActiveItem] = React.useState<InteractiveAddFilterItemState | null>(null);
	const isControlled = open !== undefined;
	const currentOpen = isControlled ? open : internalOpen;

	function handleOpenChange(nextOpen: boolean) {
		if (disabled && nextOpen) return;
		if (!isControlled) setInternalOpen(nextOpen);
		if (!nextOpen) setActiveItem(null);
		onOpenChange?.(nextOpen);
	}

	const contextValue: InteractiveAddFilterContextValue = {
		mode: resolvedMode,
		open: currentOpen,
		setOpen: handleOpenChange,
		disabled,
		activeItem,
		setActiveItem,
	};

	const Wrapper = resolvedMode === "popover" ? Popover : Drawer;

	return (
		<InteractiveAddFilterContext.Provider value={contextValue}>
			<InteractiveFilterContext.Provider value={contextValue}>
				<Wrapper open={currentOpen} onOpenChange={handleOpenChange}>
					<div className={cn("flex w-fit items-center", className)}>{children}</div>
				</Wrapper>
			</InteractiveFilterContext.Provider>
		</InteractiveAddFilterContext.Provider>
	);
}

type InteractiveFilterTriggerProps = {
	children: React.ReactNode;
	className?: string;
};

function InteractiveFilterTrigger({ children, className }: InteractiveFilterTriggerProps) {
	const { mode, disabled, open } = useInteractiveFilterContext();
	const TriggerPrimitive = mode === "popover" ? PopoverTrigger : DrawerTrigger;

	return (
		<TriggerPrimitive asChild>
			<Button
				type="button"
				variant="ghost"
				disabled={disabled}
				aria-haspopup="dialog"
				aria-expanded={open}
				className={cn("h-auto w-fit items-center gap-3 px-3 py-2", className)}
			>
				{children}
			</Button>
		</TriggerPrimitive>
	);
}

function InteractiveFilterAddFilterTrigger({ children, className }: InteractiveFilterTriggerProps) {
	const { mode, disabled, open } = useInteractiveAddFilterContext();
	const TriggerPrimitive = mode === "popover" ? PopoverTrigger : DrawerTrigger;

	return (
		<TriggerPrimitive asChild>
			<Button
				type="button"
				variant="secondary"
				disabled={disabled}
				aria-haspopup="dialog"
				aria-expanded={open}
				className={cn("h-auto w-fit items-center gap-3 px-3 py-2", className)}
			>
				{children}
			</Button>
		</TriggerPrimitive>
	);
}

type InteractiveFilterIconProps = {
	children: React.ReactNode;
	className?: string;
};

function InteractiveFilterIcon({ children, className }: InteractiveFilterIconProps) {
	return <span className={cn("flex items-center gap-1.5", className)}>{children}</span>;
}

type InteractiveFilterLabelProps = {
	children: React.ReactNode;
	className?: string;
};

function InteractiveFilterLabel({ children, className }: InteractiveFilterLabelProps) {
	return <span className={cn("text-xs font-medium tracking-tight", className)}>{children}</span>;
}

type InteractiveFilterValueProps = {
	children: React.ReactNode;
	className?: string;
};

function InteractiveFilterValue({ children, className }: InteractiveFilterValueProps) {
	return <span className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>{children}</span>;
}

type InteractiveFilterClearProps = {
	onClear: () => void;
	className?: string;
	label?: string;
};

function InteractiveFilterClear({ onClear, className, label = "Limpar filtro" }: InteractiveFilterClearProps) {
	const { disabled } = useInteractiveFilterContext();

	function handleClick(event: React.MouseEvent<HTMLSpanElement>) {
		event.preventDefault();
		event.stopPropagation();
		if (disabled) return;
		onClear();
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLSpanElement>) {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		event.stopPropagation();
		if (disabled) return;
		onClear();
	}

	return (
		<span
			role="button"
			tabIndex={disabled ? -1 : 0}
			aria-label={label}
			className={cn(
				"inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary",
				disabled && "pointer-events-none opacity-40",
				className,
			)}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
		>
			<X className="h-3.5 w-3.5" />
		</span>
	);
}

type InteractiveFilterContentProps = {
	children: React.ReactNode;
	className?: string;
	drawerClassName?: string;
	align?: "start" | "center" | "end";
};

function InteractiveFilterContent({ children, className, drawerClassName, align = "start" }: InteractiveFilterContentProps) {
	const { mode } = useInteractiveFilterContext();

	if (mode === "popover") {
		return (
			<PopoverContent align={align} className={cn("w-72 p-0", className)}>
				{children}
			</PopoverContent>
		);
	}

	return (
		<DrawerContent className={cn("max-h-[80vh] w-full max-w-none p-0", drawerClassName)}>
			<div className="mt-4 w-full border-t">{children}</div>
		</DrawerContent>
	);
}

type InteractiveFilterAddFilterContentProps = InteractiveFilterContentProps & {
	searchPlaceholder?: string;
	emptyLabel?: string;
	backLabel?: string;
};

function InteractiveFilterAddFilterContent({
	children,
	className,
	drawerClassName,
	align = "start",
	searchPlaceholder = "Adicionar filtro...",
	emptyLabel = "Nenhum filtro encontrado.",
	backLabel = "VOLTAR",
}: InteractiveFilterAddFilterContentProps) {
	const { mode, activeItem, setActiveItem } = useInteractiveAddFilterContext();
	const activeHeader = activeItem ? (
		<button
			type="button"
			className="flex items-center gap-2 border-b px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-muted/40"
			onClick={() => setActiveItem(null)}
		>
			<ChevronLeft className="h-4 w-4 text-muted-foreground" />
			<span className="text-muted-foreground">{backLabel}</span>
			<span className="truncate text-foreground">{activeItem.label}</span>
		</button>
	) : null;

	if (mode === "popover") {
		return (
			<PopoverContent align={align} className={cn("w-72 p-0", className)}>
				{activeItem ? (
					<div className="flex flex-col">
						{activeHeader}
						{children}
					</div>
				) : (
					<Command className="w-full" loop>
						<CommandInput placeholder={searchPlaceholder} className="h-9 w-full" />
						<CommandList className="w-full">
							<CommandEmpty className="w-full p-3">{emptyLabel}</CommandEmpty>
							{children}
						</CommandList>
					</Command>
				)}
			</PopoverContent>
		);
	}

	return (
		<DrawerContent className={cn("max-h-[80vh] w-full max-w-none p-0", drawerClassName)}>
			<div className="mt-4 w-full border-t">
				{activeItem ? (
					<div className="flex flex-col">
						{activeHeader}
						{children}
					</div>
				) : (
					<Command className="w-full" loop>
						<CommandInput placeholder={searchPlaceholder} className="h-10 w-full" />
						<CommandList className="w-full">
							<CommandEmpty className="w-full p-3">{emptyLabel}</CommandEmpty>
							{children}
						</CommandList>
					</Command>
				)}
			</div>
		</DrawerContent>
	);
}

export type InteractiveFilterOption<T extends string | number = string> = {
	id: string | number;
	value: T;
	label: string;
	startContent?: React.ReactNode;
	keywords?: string[];
};

type InteractiveFilterMultiContentProps<T extends string | number = string> = {
	options: InteractiveFilterOption<T>[];
	value: T[];
	onChange: (nextValue: T[]) => void;
	onClear?: () => void;
	isCleared?: boolean;
	searchPlaceholder?: string;
	emptyLabel?: string;
	clearLabel?: string;
	closeOnChange?: boolean;
};

function InteractiveFilterMultiContent<T extends string | number = string>({
	options,
	value,
	onChange,
	onClear,
	isCleared = false,
	searchPlaceholder = "Buscar...",
	emptyLabel = "Nenhuma opção encontrada.",
	clearLabel,
	closeOnChange = false,
}: InteractiveFilterMultiContentProps<T>) {
	const { setOpen } = useInteractiveFilterContext();
	const normalizedSelectedValues = React.useMemo(() => value.map((item) => String(item)), [value]);
	const resolvedClearLabel = clearLabel ?? (onClear ? "Limpar" : undefined);

	const optionByNormalizedValue = React.useMemo(() => {
		const map = new Map<string, T>();
		for (const option of options) {
			map.set(String(option.value), option.value);
		}
		return map;
	}, [options]);

	function handleToggleValue(currentValue: string) {
		const hasValue = normalizedSelectedValues.includes(currentValue);
		const nextNormalizedValues = hasValue
			? normalizedSelectedValues.filter((selectedValue) => selectedValue !== currentValue)
			: [...normalizedSelectedValues, currentValue];

		const nextValues = nextNormalizedValues
			.map((normalizedValue) => optionByNormalizedValue.get(normalizedValue))
			.filter((normalizedValue): normalizedValue is T => normalizedValue !== undefined);

		onChange(nextValues);
		if (closeOnChange) setOpen(false);
	}

	function handleClear() {
		if (onClear) onClear();
		else onChange([]);
		setOpen(false);
	}

	return (
		<Command className="w-full" loop>
			<CommandInput placeholder={searchPlaceholder} className="h-9 w-full" />
			<CommandList className="w-full">
				<CommandEmpty className="w-full p-3">{emptyLabel}</CommandEmpty>
				<CommandGroup className="w-full">
					{resolvedClearLabel ? (
						<>
							<CommandItem value="__clear__" onSelect={handleClear}>
								{resolvedClearLabel}
								<Check className={cn("ml-auto", isCleared ? "opacity-100" : "opacity-0")} />
							</CommandItem>
							<CommandSeparator className="my-1" />
						</>
					) : null}
					{options.map((option) => {
						const optionValue = String(option.value);
						const isSelected = normalizedSelectedValues.includes(optionValue);
						return (
							<CommandItem key={option.id} value={optionValue} keywords={option.keywords ?? [option.label, optionValue]} onSelect={handleToggleValue}>
								{option.startContent}
								<span className="truncate">{option.label}</span>
								<Check className={cn("ml-auto", isSelected ? "opacity-100" : "opacity-0")} />
							</CommandItem>
						);
					})}
				</CommandGroup>
			</CommandList>
		</Command>
	);
}

type InteractiveFilterSingleContentProps<T extends string | number = string> = {
	options: InteractiveFilterOption<T>[];
	value: T | null | undefined;
	onChange: (nextValue: T) => void;
	onClear?: () => void;
	isCleared?: boolean;
	searchPlaceholder?: string;
	emptyLabel?: string;
	clearLabel?: string;
	closeOnSelect?: boolean;
};

function InteractiveFilterSingleContent<T extends string | number = string>({
	options,
	value,
	onChange,
	onClear,
	isCleared = value === null || value === undefined,
	searchPlaceholder = "Buscar...",
	emptyLabel = "Nenhuma opção encontrada.",
	clearLabel,
	closeOnSelect = true,
}: InteractiveFilterSingleContentProps<T>) {
	const { setOpen } = useInteractiveFilterContext();
	const normalizedValue = value === null || value === undefined ? null : String(value);
	const resolvedClearLabel = clearLabel ?? (onClear ? "Limpar" : undefined);

	function handleSelect(currentValue: string) {
		const selectedOption = options.find((option) => String(option.value) === currentValue);
		if (!selectedOption) return;
		onChange(selectedOption.value);
		if (closeOnSelect) setOpen(false);
	}

	function handleClear() {
		if (!onClear) return;
		onClear();
		setOpen(false);
	}

	return (
		<Command className="w-full" loop>
			<CommandInput placeholder={searchPlaceholder} className="h-9 w-full" />
			<CommandList className="w-full">
				<CommandEmpty className="w-full p-3">{emptyLabel}</CommandEmpty>
				<CommandGroup className="w-full">
					{resolvedClearLabel && onClear ? (
						<>
							<CommandItem value="__clear__" onSelect={handleClear}>
								{resolvedClearLabel}
								<Check className={cn("ml-auto", isCleared ? "opacity-100" : "opacity-0")} />
							</CommandItem>
							<CommandSeparator className="my-1" />
						</>
					) : null}
					{options.map((option) => {
						const optionValue = String(option.value);
						const isSelected = normalizedValue === optionValue;
						return (
							<CommandItem key={option.id} value={optionValue} keywords={option.keywords ?? [option.label, optionValue]} onSelect={handleSelect}>
								{option.startContent}
								<span className="truncate">{option.label}</span>
								<Check className={cn("ml-auto", isSelected ? "opacity-100" : "opacity-0")} />
							</CommandItem>
						);
					})}
				</CommandGroup>
			</CommandList>
		</Command>
	);
}

type InteractiveFilterAddFilterSectionProps = {
	children: React.ReactNode;
	heading?: string;
};

function InteractiveFilterAddFilterSection({ children, heading }: InteractiveFilterAddFilterSectionProps) {
	const { activeItem } = useInteractiveAddFilterContext();

	if (activeItem) {
		return <>{children}</>;
	}

	return (
		<CommandGroup heading={heading} className="w-full">
			{children}
		</CommandGroup>
	);
}

type InteractiveFilterAddFilterItemProps = {
	id: string;
	label: string;
	icon?: React.ReactNode;
	keywords?: string[];
	className?: string;
	children: React.ReactNode;
};

function InteractiveFilterAddFilterItem({ id, label, icon, keywords, className, children }: InteractiveFilterAddFilterItemProps) {
	const { activeItem, setActiveItem } = useInteractiveAddFilterContext();

	if (activeItem) {
		if (activeItem.id !== id) return null;
		return <div className={cn("w-full", className)}>{children}</div>;
	}

	return (
		<CommandItem value={label} keywords={keywords ?? [label, id]} onSelect={() => setActiveItem({ id, label })} className={cn("gap-2", className)}>
			{icon}
			<span className="truncate">{label}</span>
		</CommandItem>
	);
}

export type InteractiveFilterDateRange = {
	from?: Date;
	to?: Date;
};

export type InteractiveFilterDateRangePreset = {
	id: string;
	label: string;
	getValue: (referenceDate: Date) => Required<InteractiveFilterDateRange>;
};

export const defaultInteractiveFilterDateRangePresets: readonly InteractiveFilterDateRangePreset[] = [
	{
		id: "today",
		label: "HOJE",
		getValue: (referenceDate) => ({
			from: startOfDay(referenceDate),
			to: endOfDay(referenceDate),
		}),
	},
	{
		id: "last-7-days",
		label: "ÚLTIMOS 7 DIAS",
		getValue: (referenceDate) => ({
			from: startOfDay(subDays(referenceDate, 6)),
			to: endOfDay(referenceDate),
		}),
	},
	{
		id: "last-month",
		label: "ÚLTIMO MÊS",
		getValue: (referenceDate) => ({
			from: startOfDay(subMonths(referenceDate, 1)),
			to: endOfDay(referenceDate),
		}),
	},
	{
		id: "last-semester",
		label: "ÚLTIMO SEMESTRE",
		getValue: (referenceDate) => ({
			from: startOfDay(subMonths(referenceDate, 6)),
			to: endOfDay(referenceDate),
		}),
	},
	{
		id: "last-year",
		label: "ÚLTIMO ANO",
		getValue: (referenceDate) => ({
			from: startOfDay(subYears(referenceDate, 1)),
			to: endOfDay(referenceDate),
		}),
	},
];

type InteractiveFilterDateRangeContentProps = {
	value: InteractiveFilterDateRange;
	onChange: (nextValue: InteractiveFilterDateRange) => void;
	locale?: Locale;
	numberOfMonths?: number;
	presets?: readonly InteractiveFilterDateRangePreset[];
	className?: string;
};

function InteractiveFilterDateRangeContent({
	value,
	onChange,
	locale = ptBR,
	numberOfMonths = 2,
	presets = defaultInteractiveFilterDateRangePresets,
	className,
}: InteractiveFilterDateRangeContentProps) {
	const { setOpen } = useInteractiveFilterContext();
	const referenceDate = new Date();

	function isPresetSelected(preset: InteractiveFilterDateRangePreset) {
		if (!value.from || !value.to) return false;

		const presetValue = preset.getValue(referenceDate);
		return isSameDay(value.from, presetValue.from) && isSameDay(value.to, presetValue.to);
	}

	function handlePresetSelect(preset: InteractiveFilterDateRangePreset) {
		onChange(preset.getValue(referenceDate));
		setOpen(false);
	}

	return (
		<div className={cn("w-auto overflow-hidden p-0", className)}>
			{presets.length > 0 ? (
				<div className="border-b border-border px-3 py-3">
					<p className="mb-2 text-[0.65rem] font-bold tracking-[0.08em] text-muted-foreground">PERÍODOS RÁPIDOS</p>
					<div className="flex flex-wrap gap-1.5">
						{presets.map((preset) => {
							const isSelected = isPresetSelected(preset);

							return (
								<button
									key={preset.id}
									type="button"
									aria-pressed={isSelected}
									className={cn(
										"rounded-full px-3 py-1.5 text-[0.7rem] font-bold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
										isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
									)}
									onClick={() => handlePresetSelect(preset)}
								>
									{preset.label}
								</button>
							);
						})}
					</div>
				</div>
			) : null}
			<Calendar
				autoFocus
				mode="range"
				locale={locale}
				defaultMonth={value.from}
				selected={{ from: value.from, to: value.to }}
				onSelect={(selectedValue) => onChange({ from: selectedValue?.from, to: selectedValue?.to })}
				numberOfMonths={numberOfMonths}
			/>
		</div>
	);
}

type InteractiveFilterTextContentProps = {
	value: string | null | undefined;
	onChange: (nextValue: string) => void;
	onClear?: () => void;
	placeholder?: string;
	submitLabel?: string;
	clearLabel?: string;
	autoCloseOnSubmit?: boolean;
};

function InteractiveFilterTextContent({
	value,
	onChange,
	onClear,
	placeholder = "Digite um valor...",
	submitLabel = "Aplicar",
	clearLabel = "Limpar",
	autoCloseOnSubmit = true,
}: InteractiveFilterTextContentProps) {
	const { setOpen } = useInteractiveFilterContext();
	const [internalValue, setInternalValue] = React.useState(value ?? "");

	React.useEffect(() => {
		setInternalValue(value ?? "");
	}, [value]);

	function handleSubmit() {
		onChange(internalValue.trim());
		if (autoCloseOnSubmit) setOpen(false);
	}

	function handleClear() {
		setInternalValue("");
		if (onClear) onClear();
		else onChange("");
		setOpen(false);
	}

	return (
		<div className="flex flex-col gap-3 p-3">
			<Input value={internalValue} placeholder={placeholder} onChange={(event) => setInternalValue(event.target.value)} />
			<div className="flex items-center justify-end gap-2">
				<Button type="button" variant="ghost" size="sm" onClick={handleClear}>
					{clearLabel}
				</Button>
				<Button type="button" size="sm" onClick={handleSubmit}>
					{submitLabel}
				</Button>
			</div>
		</div>
	);
}

type InteractiveFilterBooleanContentProps = {
	value: boolean;
	onChange: (nextValue: boolean) => void;
	onClear?: () => void;
	label: string;
	description?: string;
	trueLabel?: string;
	falseLabel?: string;
	autoCloseOnChange?: boolean;
};

function InteractiveFilterBooleanContent({
	value,
	onChange,
	label,
	description,
	trueLabel = "ATIVAR",
	falseLabel = "DESATIVAR",
	autoCloseOnChange = true,
}: InteractiveFilterBooleanContentProps) {
	const { setOpen } = useInteractiveFilterContext();

	function handleCheckedChange(checked: boolean) {
		onChange(checked);
		if (autoCloseOnChange) setOpen(false);
	}

	return (
		<div className="flex flex-col gap-3 p-3">
			<div className="flex items-start gap-3">
				<div className="grid gap-1.5">
					<Label htmlFor={label} className="text-sm font-medium">
						{label}
					</Label>
					{description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
				</div>
			</div>
			<div className="flex items-center justify-end gap-2">
				<Button type="button" size="sm" onClick={() => handleCheckedChange(!value)}>
					{value ? falseLabel : trueLabel}
				</Button>
			</div>
		</div>
	);
}

export type InteractiveFilterNumberRange = {
	greaterThan?: number | null;
	lessThan?: number | null;
};

export type InteractiveFilterSortDirection = "asc" | "desc";

export type InteractiveFilterSortValue<TField extends string = string> = {
	field: TField;
	direction: InteractiveFilterSortDirection;
};

type InteractiveFilterNumberRangeContentProps = {
	value: InteractiveFilterNumberRange;
	onChange: (nextValue: InteractiveFilterNumberRange) => void;
	onClear?: () => void;
	minPlaceholder?: string;
	maxPlaceholder?: string;
	submitLabel?: string;
	clearLabel?: string;
	autoCloseOnSubmit?: boolean;
};

function InteractiveFilterNumberRangeContent({
	value,
	onChange,
	onClear,
	minPlaceholder = "Valor mínimo",
	maxPlaceholder = "Valor máximo",
	submitLabel = "Aplicar",
	clearLabel = "Limpar",
	autoCloseOnSubmit = true,
}: InteractiveFilterNumberRangeContentProps) {
	const { setOpen } = useInteractiveFilterContext();
	const [minValue, setMinValue] = React.useState(value.greaterThan?.toString() ?? "");
	const [maxValue, setMaxValue] = React.useState(value.lessThan?.toString() ?? "");

	React.useEffect(() => {
		setMinValue(value.greaterThan?.toString() ?? "");
		setMaxValue(value.lessThan?.toString() ?? "");
	}, [value.greaterThan, value.lessThan]);

	function parseNumber(nextValue: string) {
		if (!nextValue.trim()) return null;
		const normalizedValue = Number(nextValue.replace(",", "."));
		return Number.isFinite(normalizedValue) ? normalizedValue : null;
	}

	function handleSubmit() {
		onChange({
			greaterThan: parseNumber(minValue),
			lessThan: parseNumber(maxValue),
		});
		if (autoCloseOnSubmit) setOpen(false);
	}

	function handleClear() {
		setMinValue("");
		setMaxValue("");
		if (onClear) onClear();
		else onChange({ greaterThan: null, lessThan: null });
		setOpen(false);
	}

	return (
		<div className="flex flex-col gap-3 p-3">
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<Input type="number" inputMode="decimal" value={minValue} placeholder={minPlaceholder} onChange={(event) => setMinValue(event.target.value)} />
				<Input type="number" inputMode="decimal" value={maxValue} placeholder={maxPlaceholder} onChange={(event) => setMaxValue(event.target.value)} />
			</div>
			<div className="flex items-center justify-end gap-2">
				<Button type="button" variant="ghost" size="sm" onClick={handleClear}>
					{clearLabel}
				</Button>
				<Button type="button" size="sm" onClick={handleSubmit}>
					{submitLabel}
				</Button>
			</div>
		</div>
	);
}

type InteractiveFilterSortDirectionToggleProps = {
	direction: InteractiveFilterSortDirection;
	onDirectionChange: (nextDirection: InteractiveFilterSortDirection) => void;
	className?: string;
	ascLabel?: string;
	descLabel?: string;
};

function InteractiveFilterSortDirectionToggle({
	direction,
	onDirectionChange,
	className,
	ascLabel = "Ordem crescente",
	descLabel = "Ordem decrescente",
}: InteractiveFilterSortDirectionToggleProps) {
	const { disabled } = useInteractiveFilterContext();
	const isAscending = direction === "asc";
	const ariaLabel = isAscending ? ascLabel : descLabel;

	function handleToggle(event: React.MouseEvent<HTMLButtonElement>) {
		event.preventDefault();
		event.stopPropagation();
		if (disabled) return;
		onDirectionChange(isAscending ? "desc" : "asc");
	}

	return (
		<button
			type="button"
			disabled={disabled}
			aria-label={ariaLabel}
			title={ariaLabel}
			className={cn(
				"inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary",
				disabled && "pointer-events-none opacity-40",
				className,
			)}
			onClick={handleToggle}
		>
			{isAscending ? <ArrowUpNarrowWide className="h-3.5 w-3.5" /> : <ArrowDownNarrowWide className="h-3.5 w-3.5" />}
		</button>
	);
}

type InteractiveFilterSortContentProps<TField extends string = string> = {
	fieldOptions: InteractiveFilterOption<TField>[];
	value: InteractiveFilterSortValue<TField>;
	onChange: (nextValue: InteractiveFilterSortValue<TField>) => void;
	searchPlaceholder?: string;
	emptyLabel?: string;
	showDirectionControls?: boolean;
	ascLabel?: string;
	descLabel?: string;
	closeOnFieldSelect?: boolean;
};

function InteractiveFilterSortContent<TField extends string = string>({
	fieldOptions,
	value,
	onChange,
	searchPlaceholder = "Buscar campo...",
	emptyLabel = "Nenhum campo encontrado.",
	showDirectionControls = true,
	ascLabel = "CRESCENTE",
	descLabel = "DECRESCENTE",
	closeOnFieldSelect = false,
}: InteractiveFilterSortContentProps<TField>) {
	const { setOpen } = useInteractiveFilterContext();
	const normalizedField = String(value.field);

	function handleDirectionChange(nextDirection: InteractiveFilterSortDirection) {
		onChange({ ...value, direction: nextDirection });
	}

	function handleFieldSelect(currentValue: string) {
		const selectedOption = fieldOptions.find((option) => String(option.value) === currentValue);
		if (!selectedOption) return;
		onChange({ ...value, field: selectedOption.value });
		if (closeOnFieldSelect) setOpen(false);
	}

	return (
		<div className="flex w-full flex-col">
			{showDirectionControls ? (
				<div className="flex flex-wrap items-center justify-center gap-2 border-b p-3">
					<button
						type="button"
						className={cn(
							"flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium tracking-tight transition-colors",
							value.direction === "asc" ? "bg-primary/50 text-foreground hover:bg-primary/40" : "bg-transparent text-foreground hover:bg-primary/20",
						)}
						onClick={() => handleDirectionChange("asc")}
					>
						<ArrowUpNarrowWide className="h-3 w-3" />
						{ascLabel}
					</button>
					<button
						type="button"
						className={cn(
							"flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium tracking-tight transition-colors",
							value.direction === "desc" ? "bg-primary/50 text-foreground hover:bg-primary/40" : "bg-transparent text-foreground hover:bg-primary/20",
						)}
						onClick={() => handleDirectionChange("desc")}
					>
						<ArrowDownNarrowWide className="h-3 w-3" />
						{descLabel}
					</button>
				</div>
			) : null}
			<Command className="w-full" loop>
				<CommandInput placeholder={searchPlaceholder} className="h-9 w-full" />
				<CommandList className="w-full">
					<CommandEmpty className="w-full p-3">{emptyLabel}</CommandEmpty>
					<CommandGroup className="w-full">
						{fieldOptions.map((option) => {
							const optionValue = String(option.value);
							const isSelected = normalizedField === optionValue;
							return (
								<CommandItem key={option.id} value={optionValue} keywords={option.keywords ?? [option.label, optionValue]} onSelect={handleFieldSelect}>
									{option.startContent}
									<span className="truncate">{option.label}</span>
									<Check className={cn("ml-auto", isSelected ? "opacity-100" : "opacity-0")} />
								</CommandItem>
							);
						})}
					</CommandGroup>
				</CommandList>
			</Command>
		</div>
	);
}

export const InteractiveFilter = {
	Root: InteractiveFilterRoot,
	Trigger: InteractiveFilterTrigger,
	Icon: InteractiveFilterIcon,
	Label: InteractiveFilterLabel,
	Value: InteractiveFilterValue,
	Clear: InteractiveFilterClear,
	Content: InteractiveFilterContent,
	MultiContent: InteractiveFilterMultiContent,
	SingleContent: InteractiveFilterSingleContent,
	DateRangeContent: InteractiveFilterDateRangeContent,
	TextContent: InteractiveFilterTextContent,
	BooleanContent: InteractiveFilterBooleanContent,
	NumberRangeContent: InteractiveFilterNumberRangeContent,
	SortContent: InteractiveFilterSortContent,
	SortDirectionToggle: InteractiveFilterSortDirectionToggle,
	AddFilterRoot: InteractiveFilterAddFilterRoot,
	AddFilterTrigger: InteractiveFilterAddFilterTrigger,
	AddFilterContent: InteractiveFilterAddFilterContent,
	AddFilterSection: InteractiveFilterAddFilterSection,
	AddFilterItem: InteractiveFilterAddFilterItem,
};
