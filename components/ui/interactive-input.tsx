"use client";

import { Calendar } from "@/components/ui/calendar";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import * as React from "react";
import type { Locale } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "./command";
import { Drawer, DrawerContent, DrawerTrigger } from "./drawer";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Textarea } from "./textarea";

type InteractiveInputMode = "auto" | "popover" | "drawer";

type InteractiveInputContextValue = {
	mode: Exclude<InteractiveInputMode, "auto">;
	open: boolean;
	setOpen: (open: boolean) => void;
	disabled: boolean;
};

const InteractiveInputContext = React.createContext<InteractiveInputContextValue | null>(null);

function useInteractiveInputContext() {
	const context = React.useContext(InteractiveInputContext);
	if (!context) {
		throw new Error("InteractiveInput components must be used inside InteractiveInput.Root");
	}
	return context;
}

type InteractiveInputRootProps = {
	children: React.ReactNode;
	mode?: InteractiveInputMode;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	disabled?: boolean;
};

function InteractiveInputRoot({
	children,
	mode = "auto",
	open,
	defaultOpen = false,
	onOpenChange,
	disabled = false,
}: InteractiveInputRootProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const resolvedMode: Exclude<InteractiveInputMode, "auto"> = mode === "auto" ? (isDesktop ? "popover" : "drawer") : mode;
	const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
	const isControlled = open !== undefined;
	const currentOpen = isControlled ? open : internalOpen;

	function handleOpenChange(nextOpen: boolean) {
		if (disabled && nextOpen) return;
		if (!isControlled) setInternalOpen(nextOpen);
		onOpenChange?.(nextOpen);
	}

	const contextValue: InteractiveInputContextValue = {
		mode: resolvedMode,
		open: currentOpen,
		setOpen: handleOpenChange,
		disabled,
	};

	const Wrapper = resolvedMode === "popover" ? Popover : Drawer;

	return (
		<InteractiveInputContext.Provider value={contextValue}>
			<Wrapper open={currentOpen} onOpenChange={handleOpenChange}>
				{children}
			</Wrapper>
		</InteractiveInputContext.Provider>
	);
}

type InteractiveInputTriggerProps = {
	children: React.ReactElement;
};

function InteractiveInputTrigger({ children }: InteractiveInputTriggerProps) {
	const { mode } = useInteractiveInputContext();
	const TriggerPrimitive = mode === "popover" ? PopoverTrigger : DrawerTrigger;

	return <TriggerPrimitive asChild>{children}</TriggerPrimitive>;
}

type InteractiveInputContentProps = {
	children: React.ReactNode;
	className?: string;
	drawerClassName?: string;
	align?: "start" | "center" | "end";
};

function InteractiveInputContent({ children, className, drawerClassName, align = "start" }: InteractiveInputContentProps) {
	const { mode } = useInteractiveInputContext();

	if (mode === "popover") {
		return (
			<PopoverContent align={align} className={cn("w-auto p-0", className)}>
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

export type InteractiveInputOption<T extends string | number = string> = {
	id: string | number;
	value: T;
	label: string;
	startContent?: React.ReactNode;
	keywords?: string[];
};

type InteractiveInputSingleSelectContentProps<T extends string | number = string> = {
	options: InteractiveInputOption<T>[];
	value: T | null | undefined;
	onChange: (nextValue: T) => void;
	onClear?: () => void;
	searchPlaceholder?: string;
	emptyLabel?: string;
	clearLabel?: string;
	closeOnSelect?: boolean;
};

function InteractiveInputSingleSelectContent<T extends string | number = string>({
	options,
	value,
	onChange,
	onClear,
	searchPlaceholder = "Buscar...",
	emptyLabel = "Nenhuma opção encontrada.",
	clearLabel = "Limpar",
	closeOnSelect = true,
}: InteractiveInputSingleSelectContentProps<T>) {
	const { setOpen } = useInteractiveInputContext();
	const normalizedValue = value === null || value === undefined ? null : String(value);

	function handleSelect(selectedValue: string) {
		const option = options.find((item) => String(item.value) === selectedValue);
		if (!option) return;
		onChange(option.value);
		if (closeOnSelect) setOpen(false);
	}

	function handleClear() {
		onClear?.();
		setOpen(false);
	}

	return (
		<Command className="w-full" loop>
			<CommandInput placeholder={searchPlaceholder} className="h-9 w-full" />
			<CommandList className="w-full">
				<CommandEmpty className="w-full p-3">{emptyLabel}</CommandEmpty>
				<CommandGroup className="w-full">
					{onClear ? (
						<>
							<CommandItem value="__clear__" onSelect={handleClear}>
								{clearLabel}
								<Check className={cn("ml-auto", normalizedValue === null ? "opacity-100" : "opacity-0")} />
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

type InteractiveInputDateContentProps = {
	value?: Date;
	onChange: (nextValue: Date | undefined) => void;
	locale?: Locale;
	closeOnSelect?: boolean;
	className?: string;
};

function InteractiveInputDateContent({
	value,
	onChange,
	locale = ptBR,
	closeOnSelect = true,
	className,
}: InteractiveInputDateContentProps) {
	const { setOpen } = useInteractiveInputContext();

	function handleSelect(nextDate: Date | undefined) {
		onChange(nextDate);
		if (nextDate && closeOnSelect) setOpen(false);
	}

	return (
		<div className={cn("w-auto p-0", className)}>
			<Calendar
				autoFocus
				mode="single"
				locale={locale}
				selected={value}
				defaultMonth={value}
				onSelect={handleSelect}
			/>
		</div>
	);
}

type InteractiveInputTextareaContentProps = {
	value: string;
	onChange: (nextValue: string) => void;
	placeholder?: string;
	className?: string;
	textareaClassName?: string;
};

function InteractiveInputTextareaContent({
	value,
	onChange,
	placeholder = "Digite aqui...",
	className,
	textareaClassName,
}: InteractiveInputTextareaContentProps) {
	return (
		<div className={cn("p-3", className)}>
			<Textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				className={cn("min-h-24 resize-none field-sizing-content", textareaClassName)}
			/>
		</div>
	);
}

export const InteractiveInput = {
	Root: InteractiveInputRoot,
	Trigger: InteractiveInputTrigger,
	Content: InteractiveInputContent,
	SingleSelectContent: InteractiveInputSingleSelectContent,
	DateContent: InteractiveInputDateContent,
	TextareaContent: InteractiveInputTextareaContent,
};
