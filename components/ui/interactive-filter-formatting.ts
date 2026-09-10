import type { InteractiveFilterOption, InteractiveFilterSortValue } from "./interactive-filter";
import { formatToMoney } from "@/lib/formatting";
import dayjs from "dayjs";

export function formatInteractiveOptionSummary<T extends string | number>(options: InteractiveFilterOption<T>[], values: T[]) {
	if (values.length === 0) return "TODOS";
	const labels = options.filter((option) => values.includes(option.value)).map((option) => option.label);
	if (labels.length === 0) return `${values.length} selecionado(s)`;
	if (labels.length <= 2) return labels.join(", ");
	return `${labels.length} selecionado(s)`;
}

export function formatInteractiveDateRangeSummary(after?: Date | string | null, before?: Date | string | null, emptyLabel = "TODO PERÍODO") {
	const start = after ? dayjs(after) : null;
	const end = before ? dayjs(before) : null;
	const validStart = start?.isValid() ? start : null;
	const validEnd = end?.isValid() ? end : null;

	if (!validStart && !validEnd) return emptyLabel;
	if (!validStart) return `Até ${validEnd?.format("DD/MM/YYYY")}`;
	if (!validEnd) return `A partir de ${validStart.format("DD/MM/YYYY")}`;

	if (validStart.isSame(validEnd, "day")) return validStart.format("DD/MM/YYYY");
	if (validStart.isSame(validEnd, "month")) return `${validStart.format("DD")}–${validEnd.format("DD/MM/YYYY")}`;
	if (validStart.isSame(validEnd, "year")) return `${validStart.format("DD/MM")}–${validEnd.format("DD/MM/YYYY")}`;

	return `${validStart.format("DD/MM/YYYY")}–${validEnd.format("DD/MM/YYYY")}`;
}

export function formatInteractiveNumberRangeSummary(min?: number | null, max?: number | null, emptyLabel = "TODOS") {
	if (min == null && max == null) return emptyLabel;
	if (min != null && max != null) return `${formatToMoney(min)} a ${formatToMoney(max)}`;
	if (min != null) return `A partir de ${formatToMoney(min)}`;
	return `Até ${formatToMoney(max ?? 0)}`;
}

export function formatInteractiveCountSummary(values: unknown[] | null | undefined, emptyLabel = "TODOS") {
	if (!values || values.length === 0) return emptyLabel;
	return `${values.length} selecionado(s)`;
}

export function formatInteractiveSortFieldSummary<T extends string>(
	fieldOptions: InteractiveFilterOption<T>[],
	field: T,
	fallbackLabel = "PADRÃO",
) {
	return fieldOptions.find((option) => option.value === field)?.label ?? fallbackLabel;
}

export function formatInteractiveSortSummary<T extends string>({
	fieldOptions,
	value,
	includeDirection = false,
	ascLabel = "CRESCENTE",
	descLabel = "DECRESCENTE",
}: {
	fieldOptions: InteractiveFilterOption<T>[];
	value: InteractiveFilterSortValue<T>;
	includeDirection?: boolean;
	ascLabel?: string;
	descLabel?: string;
}) {
	const fieldLabel = formatInteractiveSortFieldSummary(fieldOptions, value.field);
	if (!includeDirection) return fieldLabel;
	const directionLabel = value.direction === "asc" ? ascLabel : descLabel;
	return `${fieldLabel} · ${directionLabel}`;
}

export function isInteractiveSortActive<T extends string>(
	value: InteractiveFilterSortValue<T>,
	defaults: InteractiveFilterSortValue<T>,
) {
	return value.field !== defaults.field || value.direction !== defaults.direction;
}
