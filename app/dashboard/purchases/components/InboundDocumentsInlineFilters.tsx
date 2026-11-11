"use client";

import { InteractiveFilter, type InteractiveFilterOption } from "@/components/ui/interactive-filter";
import { formatInteractiveNumberRangeSummary, formatInteractiveOptionSummary } from "@/components/ui/interactive-filter-formatting";
import { INBOUND_WITHOUT_MANIFEST_FILTER } from "@/lib/fiscal/inbound/registration-status";
import type { TFiscalInboundDocumentsFilters } from "@/lib/queries/fiscal";
import { useSupplierOptions } from "@/lib/queries/suppliers";
import type { TFiscalInboundRegistrationStatusEnum } from "@/schemas/enums";
import { Building2, CircleDashed, Eye, ListFilter, Wallet } from "lucide-react";
import { INBOUND_REGISTRATION_STATUS_META, INBOUND_REGISTRATION_STATUS_ORDER } from "./purchase-status-meta";
import { InlineFilter, PeriodFilter, StatusOptionIcon } from "./PurchasesInlineFilters";

type TManifestFilterValue = TFiscalInboundDocumentsFilters["manifestations"][number];

const STATUS_OPTIONS = INBOUND_REGISTRATION_STATUS_ORDER.map((status) => ({
	id: status,
	value: status,
	label: INBOUND_REGISTRATION_STATUS_META[status].label.toUpperCase(),
	startContent: (
		<StatusOptionIcon icon={INBOUND_REGISTRATION_STATUS_META[status].icon} className={INBOUND_REGISTRATION_STATUS_META[status].chipClassName} />
	),
})) satisfies InteractiveFilterOption<TFiscalInboundRegistrationStatusEnum>[];

const MANIFEST_OPTIONS = [
	{ id: INBOUND_WITHOUT_MANIFEST_FILTER, value: INBOUND_WITHOUT_MANIFEST_FILTER, label: "SEM MANIFESTAÇÃO" },
	{ id: "CIENCIA", value: "CIENCIA", label: "CIÊNCIA" },
	{ id: "CONFIRMACAO", value: "CONFIRMACAO", label: "CONFIRMADA" },
	{ id: "DESCONHECIMENTO", value: "DESCONHECIMENTO", label: "DESCONHECIDA" },
	{ id: "NAO_REALIZADA", value: "NAO_REALIZADA", label: "NÃO REALIZADA" },
] satisfies InteractiveFilterOption<TManifestFilterValue>[];

function formatLastSync(date: Date | string | null) {
	if (!date) return null;
	const minutes = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60_000));
	if (minutes < 1) return "Sincronizado com a SEFAZ agora";
	if (minutes < 60) return `Sincronizado com a SEFAZ há ${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `Sincronizado com a SEFAZ há ${hours} h`;
	const days = Math.round(hours / 24);
	return `Sincronizado com a SEFAZ há ${days} ${days === 1 ? "dia" : "dias"}`;
}

export default function InboundDocumentsInlineFilters({
	filters,
	updateFilters,
	lastSync,
}: {
	filters: TFiscalInboundDocumentsFilters;
	updateFilters: (filters: Partial<TFiscalInboundDocumentsFilters>) => void;
	lastSync: Date | string | null;
}) {
	const { data: supplierOptionsResult } = useSupplierOptions();
	const supplierOptions = (supplierOptionsResult ?? []).map((supplier) => ({
		id: supplier.id,
		value: supplier.id,
		label: supplier.nome,
	})) satisfies InteractiveFilterOption<string>[];

	const hasSuppliers = filters.supplierIds.length > 0;
	const hasManifestations = filters.manifestations.length > 0;
	const hasValue = filters.valueMin != null || filters.valueMax != null;
	const lastSyncLabel = formatLastSync(lastSync);

	const setStatuses = (registrationStatuses: TFiscalInboundRegistrationStatusEnum[]) => updateFilters({ registrationStatuses });
	const setSuppliers = (supplierIds: string[]) => updateFilters({ supplierIds });
	const setManifestations = (manifestations: TManifestFilterValue[]) => updateFilters({ manifestations });
	const setValue = ({ greaterThan, lessThan }: { greaterThan?: number | null; lessThan?: number | null }) =>
		updateFilters({ valueMin: greaterThan ?? null, valueMax: lessThan ?? null });

	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			<InlineFilter
				icon={CircleDashed}
				label="SITUAÇÃO"
				summary={formatInteractiveOptionSummary(STATUS_OPTIONS, filters.registrationStatuses)}
				onClear={() => setStatuses([])}
			>
				<InteractiveFilter.MultiContent
					options={STATUS_OPTIONS}
					value={filters.registrationStatuses}
					onChange={setStatuses}
					onClear={() => setStatuses([])}
					clearLabel="TODAS"
				/>
			</InlineFilter>
			<PeriodFilter
				after={filters.periodAfter}
				before={filters.periodBefore}
				onChange={(periodAfter, periodBefore) => updateFilters({ periodAfter, periodBefore })}
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
			{hasManifestations ? (
				<InlineFilter
					icon={Eye}
					label="MANIFESTAÇÃO"
					summary={formatInteractiveOptionSummary(MANIFEST_OPTIONS, filters.manifestations)}
					onClear={() => setManifestations([])}
				>
					<InteractiveFilter.MultiContent
						options={MANIFEST_OPTIONS}
						value={filters.manifestations}
						onChange={setManifestations}
						onClear={() => setManifestations([])}
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

			{!hasSuppliers || !hasManifestations || !hasValue ? (
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
							{!hasManifestations ? (
								<InteractiveFilter.AddFilterItem id="manifestations" label="MANIFESTAÇÃO" icon={<Eye className="h-4 w-4" />}>
									<InteractiveFilter.MultiContent
										options={MANIFEST_OPTIONS}
										value={filters.manifestations}
										onChange={setManifestations}
										onClear={() => setManifestations([])}
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
						</InteractiveFilter.AddFilterSection>
					</InteractiveFilter.AddFilterContent>
				</InteractiveFilter.AddFilterRoot>
			) : null}
			{lastSyncLabel ? <span className="ml-auto text-xs text-muted-foreground">{lastSyncLabel}</span> : null}
		</div>
	);
}
