import { cn } from "@/lib/utils";
import { formatInteractiveDateRangeSummary } from "@/components/ui/interactive-filter-formatting";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { useId } from "react";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Field, FieldLabel } from "../ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

type DateIntervalInputProps = {
	label: string;
	labelClassName?: string;
	className?: string;
	value: { after?: Date; before?: Date };
	handleChange: (value: { after?: Date; before?: Date }) => void;
};
function DateIntervalInput({ label, labelClassName, className, value, handleChange }: DateIntervalInputProps) {
	const generatedId = useId();
	const inputIdentifier = `${label.toLowerCase().replaceAll(" ", "_")}_${generatedId}`;
	const hasSelectedDate = Boolean(value.after || value.before);

	return (
		<Field className="gap-1">
			<FieldLabel htmlFor={inputIdentifier} className={cn("text-start text-sm font-medium tracking-tight text-foreground/80", labelClassName)}>
				{label}
			</FieldLabel>
			<Popover>
				<PopoverTrigger
					render={
						<Button
							id={inputIdentifier}
							variant={"outline"}
							className={cn(
								"w-full justify-start rounded-md border border-border bg-[#fff] text-left text-sm font-normal shadow-xs outline-hidden ease-in-out focus:border-border dark:bg-[#121212]",
								hasSelectedDate ? "tabular-nums" : "text-muted-foreground",
								className,
							)}
						>
							<CalendarIcon className="mr-2 h-4 w-4" />
							<span className="whitespace-nowrap">{formatInteractiveDateRangeSummary(value.after, value.before, "Escolha uma data")}</span>
						</Button>
					}
				/>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="range"
						locale={ptBR}
						defaultMonth={value?.after}
						selected={{ from: value.after, to: value.before }}
						onSelect={(value) => handleChange({ after: value?.from, before: value?.to })}
						numberOfMonths={2}
					/>
				</PopoverContent>
			</Popover>
		</Field>
	);
}

export default DateIntervalInput;
