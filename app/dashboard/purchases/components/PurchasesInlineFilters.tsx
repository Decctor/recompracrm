"use client";

import type { TGetPurchasesDefaultInput } from "@/app/api/purchases/route";
import { InteractiveFilter, type InteractiveFilterOption, type InteractiveFilterSortValue } from "@/components/ui/interactive-filter";
import {
	formatInteractiveDateRangeSummary,
	formatInteractiveNumberRangeSummary,
	formatInteractiveOptionSummary,
	formatInteractiveSortFieldSummary,
	isInteractiveSortActive,
} from "@/components/ui/interactive-filter-formatting";
import { useSupplierOptions } from "@/lib/queries/suppliers";
import { cn } from "@/lib/utils";
import type { TPurchaseOriginEnum, TPurchaseStatusEnum } from "@/schemas/enums";
import dayjs from "dayjs";
import { ArrowDownUp, Building2, Calendar, CircleDashed, FileText, ListFilter, Wallet, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PURCHASE_STATUS_META, PURCHASE_STATUS_ORDER } from "./purchase-status-meta";

type TOrderField = TGetPurchasesDefaultInput["orderByField"];

type PurchasesInlineFiltersProps = {
	filters: TGetPurchasesDefaultInput;
	updateFilters: (filters: Partial<TGetPurchasesDefaultInput>) => void;
};

/** Ícone do status dentro da opção do filtro, no mesmo tom do chip do card. */
export function StatusOptionIcon({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
	return (
		<span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg", className)}>
			<Icon className="h-3.5 w-3.5" />
		</span>
	);
}

const STATUS_OPTIONS = PURCHASE_STATUS_ORDER.map((status) => ({
	id: status,
	value: status,
	label: PURCHASE_STATUS_META[status].label.toUpperCase(),
	startContent: <StatusOptionIcon icon={PURCHASE_STATUS_META[status].icon} className={PURCHASE_STATUS_META[status].chipClassName} />,
})) satisfies InteractiveFilterOption<TPurchaseStatusEnum>[];

const ORIGIN_OPTIONS = [
	{ id: "DOCUMENTO", value: "DOCUMENTO", label: "LIDA DE UM DOCUMENTO" },
	{ id: "MANUAL", value: "MANUAL", label: "DIGITADA" },
] satisfies InteractiveFilterOption<TPurchaseOriginEnum>[];

const ORDER_FIELD_OPTIONS = [
	{ id: "dataInsercao", value: "dataInsercao", label: "DATA DE CADASTRO" },
	{ id: "pedidoData", value: "pedidoData", label: "DATA DA COMPRA" },
	{ id: "valor", value: "valor", label: "VALOR" },
	{ id: "titulo", value: "titulo", label: "TÍTULO" },
] satisfies InteractiveFilterOption<TOrderField>[];

const DEFAULT_SORT = { field: "dataInsercao", direction: "desc" } satisfies InteractiveFilterSortValue<TOrderField>;

/** O calendário devolve o último dia à meia-noite; o filtro precisa do dia inteiro. */
export function normalizeDateRange(period: { from?: Date; to?: Date }) {
	return {
		after: period.from ? dayjs(period.from).startOf("day").toDate() : null,
		before: period.to ? dayjs(period.to).endOf("day").toDate() : period.from ? dayjs(period.from).endOf("day").toDate() : null,
	};
}

export default function PurchasesInlineFilters({ filters, updateFilters }: PurchasesInlineFiltersProps) {
	const { data: supplierOptionsResult } = useSupplierOptions();
	const supplierOptions = (supplierOptionsResult ?? []).map((supplier) => ({
		id: supplier.id,
		value: supplier.id,
		label: supplier.nome,
	})) satisfies InteractiveFilterOption<string>[];
	const sortValue = { field: filters.orderByField, direction: filters.orderByDirection } satisfies InteractiveFilterSortValue<TOrderField>;

	const hasSuppliers = filters.supplierIds.length > 0;
	const hasOrigins = filters.origins.length > 0;
	const hasValue = filters.valueMin != null || filters.valueMax != null;
	const hasSort = isInteractiveSortActive(sortValue, DEFAULT_SORT);

	const setStatus = (status: TPurchaseStatusEnum[]) => updateFilters({ status, page: 1 });
	const setSuppliers = (supplierIds: string[]) => updateFilters({ supplierIds, page: 1 });
	const setOrigins = (origins: TPurchaseOriginEnum[]) => updateFilters({ origins, page: 1 });
	const setValue = ({ greaterThan, lessThan }: { greaterThan?: number | null; lessThan?: number | null }) =>
		updateFilters({ valueMin: greaterThan ?? null, valueMax: lessThan ?? null, page: 1 });
	const setSort = ({ field, direction }: InteractiveFilterSortValue<TOrderField>) =>
		updateFilters({ orderByField: field, orderByDirection: direction, page: 1 });

	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			<InlineFilter
				icon={CircleDashed}
				label="STATUS"
				summary={formatInteractiveOptionSummary(STATUS_OPTIONS, filters.status)}
				onClear={() => setStatus([])}
			>
				<InteractiveFilter.MultiContent
					options={STATUS_OPTIONS}
					value={filters.status}
					onChange={setStatus}
					onClear={() => setStatus([])}
					clearLabel="TODOS"
				/>
			</InlineFilter>

			<PeriodFilter
				after={filters.periodAfter}
				before={filters.periodBefore}
				onChange={(periodAfter, periodBefore) => updateFilters({ periodAfter, periodBefore, page: 1 })}
			/>

			{hasSuppliers ? (
				<InlineFilter
					icon={Building2}
					label="FORNECEDOR"
					summary={formatInteractiveOptionSummary(supplierOptions, filters.supplierIds)}
					onClear={() => setSuppliers([])}
				>
					<InteractiveFilter.MultiContent
						options={supplierOptions}
						value={filters.supplierIds}
						onChange={setSuppliers}
						onClear={() => setSuppliers([])}
						searchPlaceholder="Buscar fornecedor..."
						clearLabel="TODOS"
					/>
				</InlineFilter>
			) : null}
			{hasOrigins ? (
				<InlineFilter
					icon={FileText}
					label="ORIGEM"
					summary={formatInteractiveOptionSummary(ORIGIN_OPTIONS, filters.origins)}
					onClear={() => setOrigins([])}
				>
					<InteractiveFilter.MultiContent
						options={ORIGIN_OPTIONS}
						value={filters.origins}
						onChange={setOrigins}
						onClear={() => setOrigins([])}
						clearLabel="TODAS"
					/>
				</InlineFilter>
			) : null}
			{hasValue ? (
				<InlineFilter
					icon={Wallet}
					label="VALOR"
					summary={formatInteractiveNumberRangeSummary(filters.valueMin, filters.valueMax)}
					onClear={() => setValue({})}
					contentClassName="w-80"
				>
					<InteractiveFilter.NumberRangeContent
						value={{ greaterThan: filters.valueMin, lessThan: filters.valueMax }}
						onChange={setValue}
						onClear={() => setValue({})}
					/>
				</InlineFilter>
			) : null}
			{hasSort ? (
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<ArrowDownUp className="h-4 w-4" />
							<InteractiveFilter.Label>ORDENAR POR</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{formatInteractiveSortFieldSummary(ORDER_FIELD_OPTIONS, sortValue.field)}</InteractiveFilter.Value>
						<InteractiveFilter.SortDirectionToggle
							direction={sortValue.direction}
							onDirectionChange={(direction) => setSort({ ...sortValue, direction })}
						/>
						<InteractiveFilter.Clear onClear={() => setSort(DEFAULT_SORT)} label="Limpar ordenação" />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-72 p-0">
						<InteractiveFilter.SortContent fieldOptions={ORDER_FIELD_OPTIONS} value={sortValue} onChange={setSort} />
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			) : null}

			<InteractiveFilter.AddFilterRoot className="w-fit">
				<InteractiveFilter.AddFilterTrigger>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>ADICIONAR FILTRO</InteractiveFilter.Label>
				</InteractiveFilter.AddFilterTrigger>
				<InteractiveFilter.AddFilterContent>
					<InteractiveFilter.AddFilterSection heading="Filtros">
						{!hasSuppliers ? (
							<InteractiveFilter.AddFilterItem id="suppliers" label="FORNECEDOR" icon={<Building2 className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={supplierOptions}
									value={filters.supplierIds}
									onChange={setSuppliers}
									onClear={() => setSuppliers([])}
									searchPlaceholder="Buscar fornecedor..."
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasOrigins ? (
							<InteractiveFilter.AddFilterItem id="origins" label="ORIGEM" icon={<FileText className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={ORIGIN_OPTIONS}
									value={filters.origins}
									onChange={setOrigins}
									onClear={() => setOrigins([])}
									clearLabel="TODAS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasValue ? (
							<InteractiveFilter.AddFilterItem id="value" label="VALOR" icon={<Wallet className="h-4 w-4" />}>
								<InteractiveFilter.NumberRangeContent
									value={{ greaterThan: filters.valueMin, lessThan: filters.valueMax }}
									onChange={setValue}
									onClear={() => setValue({})}
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasSort ? (
							<InteractiveFilter.AddFilterItem id="sort" label="ORDENAR POR" icon={<ArrowDownUp className="h-4 w-4" />}>
								<InteractiveFilter.SortContent fieldOptions={ORDER_FIELD_OPTIONS} value={sortValue} onChange={setSort} />
							</InteractiveFilter.AddFilterItem>
						) : null}
					</InteractiveFilter.AddFilterSection>
				</InteractiveFilter.AddFilterContent>
			</InteractiveFilter.AddFilterRoot>
		</div>
	);
}

/** Filtro de período, sempre visível. */
export function PeriodFilter({
	after,
	before,
	onChange,
}: {
	after: Date | null;
	before: Date | null;
	onChange: (after: Date | null, before: Date | null) => void;
}) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<Calendar className="h-4 w-4" />
					<InteractiveFilter.Label>PERÍODO</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveDateRangeSummary(after, before)}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={() => onChange(null, null)} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-auto p-0">
				<InteractiveFilter.DateRangeContent
					value={{ from: after ?? undefined, to: before ?? undefined }}
					onChange={(period) => {
						const normalized = normalizeDateRange(period);
						onChange(normalized.after, normalized.before);
					}}
				/>
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

/** Um filtro já ativo na linha: gatilho com rótulo, resumo e limpar, conteúdo no popover. */
export function InlineFilter({
	icon: Icon,
	label,
	summary,
	onClear,
	contentClassName,
	children,
}: {
	icon: LucideIcon;
	label: string;
	summary: ReactNode;
	onClear: () => void;
	contentClassName?: string;
	children: ReactNode;
}) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<Icon className="h-4 w-4" />
					<InteractiveFilter.Label>{label}</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{summary}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={onClear} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className={cn("w-72 p-0", contentClassName)}>{children}</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}
