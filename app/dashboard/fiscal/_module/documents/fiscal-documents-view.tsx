"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { InteractiveFilter, type InteractiveFilterOption } from "@/components/ui/interactive-filter";
import { formatInteractiveDateRangeSummary, formatInteractiveOptionSummary } from "@/components/ui/interactive-filter-formatting";
import { Input } from "@/components/ui/input";
import ExportFiscalDocuments from "@/components/Modals/FiscalDocument/ExportFiscalDocuments";
import { getErrorMessage } from "@/lib/errors";
import { useFiscalDocuments, useFiscalPending, useFiscalSettings } from "@/lib/queries/fiscal";
import { FISCAL_DOCUMENT_TYPE_LABELS } from "@/lib/sales/export-summaries";
import type { TFiscalDocumentTypeEnum } from "@/schemas/enums";
import { AlertTriangle, Calendar, FileSpreadsheet, FileText } from "lucide-react";
import dayjs from "dayjs";
import { useQueryState } from "nuqs";
import { useState } from "react";
import { FiscalDocumentCard } from "./components/fiscal-document-card";
import type { TFiscalPermissions } from "./helpers/fiscal-document-action-state";
import { FISCAL_DOCUMENT_STATUS_FILTERS } from "./helpers/fiscal-document-filters";

const FISCAL_DOCUMENT_TYPE_OPTIONS: InteractiveFilterOption<TFiscalDocumentTypeEnum>[] = (
	Object.entries(FISCAL_DOCUMENT_TYPE_LABELS) as [TFiscalDocumentTypeEnum, string][]
).map(([value, label]) => ({ id: value, value, label }));

type FiscalDocumentsViewProps = {
	permissions: TFiscalPermissions;
};

/**
 * Aba Documentos: busca, filtros por status e lista paginada. Cada card leva para a pagina do
 * documento (`appRoutes.fiscal.document`).
 */
export function FiscalDocumentsView({ permissions }: FiscalDocumentsViewProps) {
	const [, setViewMode] = useQueryState("view");
	const { data, isLoading, isError, isSuccess, error, filters, updateFilters } = useFiscalDocuments();
	const { data: fiscalSettings } = useFiscalSettings({ enabled: permissions.configurar });
	const { data: pending } = useFiscalPending();
	const [exportModalIsOpen, setExportModalIsOpen] = useState(false);
	const exceptionalPresenceEnabled = fiscalSettings?.fiscalConfiguracao?.emissaoManual?.classificacaoPresencialExcepcional?.habilitada ?? false;

	const documents = data?.documents ?? [];
	const documentsMatched = data?.documentsMatched ?? 0;
	const totalPages = data?.totalPages ?? 0;
	const documentsShowing = documents.length;
	const pendingTotal = pending?.resumo.total ?? 0;

	return (
		<div className="w-full flex flex-col gap-3">
			{pendingTotal > 0 ? (
				<button
					type="button"
					onClick={() => void setViewMode("pending")}
					className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-left text-xs dark:border-amber-900/50 dark:bg-amber-950/30"
				>
					<span className="flex items-center gap-1.5 font-semibold">
						<AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
						{pending?.resumo.documentos ?? 0} documento(s) travado(s), {pending?.resumo.prazosExpirando ?? 0} prazo(s) correndo e{" "}
						{pending?.resumo.produtosSemPerfil ?? 0} produto(s) sem perfil fiscal.
					</span>
					<span className="font-bold uppercase tracking-tight text-amber-800 dark:text-amber-200">Ver pendências →</span>
				</button>
			) : null}
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar documento fiscal..."
					onChange={(e) => updateFilters({ search: e.target.value })}
					className="grow rounded-xl"
				/>
				<Button variant="ghost" className="flex items-center gap-2" size="sm" onClick={() => setExportModalIsOpen(true)}>
					<FileSpreadsheet className="h-4 w-4 min-h-4 min-w-4" />
					EXPORTAR
				</Button>
			</div>
			<div className="flex w-full flex-wrap items-center gap-2">
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<Calendar className="h-4 w-4" />
							<InteractiveFilter.Label>PERÍODO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{formatInteractiveDateRangeSummary(filters.periodAfter, filters.periodBefore)}</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ periodAfter: null, periodBefore: null, page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0">
						<InteractiveFilter.DateRangeContent
							value={{ from: filters.periodAfter ?? undefined, to: filters.periodBefore ?? undefined }}
							// O seletor devolve o último dia à meia-noite; sem o fim do dia, "1 a 30" perderia as notas do dia 30.
							onChange={(period) =>
								updateFilters({
									periodAfter: period.from ? dayjs(period.from).startOf("day").toDate() : null,
									periodBefore: period.to ? dayjs(period.to).endOf("day").toDate() : null,
									page: 1,
								})
							}
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<FileText className="h-4 w-4" />
							<InteractiveFilter.Label>TIPO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{formatInteractiveOptionSummary(FISCAL_DOCUMENT_TYPE_OPTIONS, filters.tipos)}</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ tipos: [], page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-72 p-0">
						<InteractiveFilter.MultiContent
							options={FISCAL_DOCUMENT_TYPE_OPTIONS}
							value={filters.tipos}
							onChange={(tipos) => updateFilters({ tipos, page: 1 })}
							onClear={() => updateFilters({ tipos: [], page: 1 })}
							clearLabel="TODOS"
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			</div>
			<div className="w-full flex items-center gap-1.5 flex-wrap">
				{FISCAL_DOCUMENT_STATUS_FILTERS.map((filter) => {
					const isActive = JSON.stringify(filters.statusInterno ?? []) === JSON.stringify(filter.statuses);
					return (
						<Button
							key={filter.label}
							variant={isActive ? "default" : "ghost"}
							size="fit"
							className="px-2 py-1 text-xs rounded-lg"
							onClick={() => updateFilters({ statusInterno: filter.statuses, page: 1 })}
						>
							{filter.label}
						</Button>
					);
				})}
			</div>
			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={
					documentsMatched > 0 ? `${documentsMatched} documentos fiscais encontrados.` : `${documentsMatched} documento fiscal encontrado.`
				}
				itemsShowingText={documentsShowing > 0 ? `Mostrando ${documentsShowing} documentos fiscais.` : `Mostrando ${documentsShowing} documento fiscal.`}
			/>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && documents ? (
				documents.length > 0 ? (
					documents.map((document) => (
						<FiscalDocumentCard key={document.id} document={document} permissions={permissions} exceptionalPresenceEnabled={exceptionalPresenceEnabled} />
					))
				) : (
					<p className="w-full tracking-tight text-center">Nenhum documento fiscal encontrado.</p>
				)
			) : null}
			{exportModalIsOpen ? <ExportFiscalDocuments filters={filters} closeModal={() => setExportModalIsOpen(false)} /> : null}
		</div>
	);
}
