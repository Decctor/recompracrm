"use client";

import type { TGetFiscalDocumentsOutputById } from "@/app/api/fiscal/documents/route";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { PageHeader } from "@/components/Layouts/PageHeader";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getErrorMessage } from "@/lib/errors";
import {
	buildFiscalDocumentSaleSummary,
	buildSaleProductNames,
	extractPayloadItems,
	extractTaxTotalsFromPayload,
	parseFiscalDocumentProviderPayload,
	parseFiscalDocumentProviderResponse,
} from "@/lib/fiscal/document-details-view";
import type { TFiscalDocumentActionKey } from "@/lib/fiscal/document-actions";
import { cn } from "@/lib/utils";
import { FileCode, FileText, RefreshCcw, RefreshCw, type LucideIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { TFiscalPermissions } from "../helpers/fiscal-document-action-state";
import { buildFiscalDocumentHeading } from "../helpers/fiscal-document-heading";
import { FISCAL_DOCUMENT_STATUS_CHIP_CLASSNAME, resolveFiscalDocumentStatusChip } from "../helpers/fiscal-document-status-chip";
import { useFiscalDocumentActionRunner, type TFiscalDocumentActionRunner } from "../helpers/use-fiscal-document-action-runner";
import { FiscalDocumentEventsTimeline } from "./details/fiscal-document-events-timeline";
import { FiscalDocumentExceptionalPresenceNotice } from "./details/fiscal-document-exceptional-presence-notice";
import { FiscalDocumentIdentificationPanel } from "./details/fiscal-document-identification-panel";
import { FiscalDocumentItemsSection } from "./details/fiscal-document-items-section";
import { FiscalDocumentSaleSection } from "./details/fiscal-document-sale-section";
import { FiscalDocumentSupportSection } from "./details/fiscal-document-support-section";
import { FiscalDocumentSituationSection } from "./fiscal-document-situation-section";

type TFiscalDocumentDetails = TGetFiscalDocumentsOutputById["document"];

export function FiscalDocumentDetailsSkeleton() {
	return <LoadingComponent />;
}

export function FiscalDocumentDetailsError({ error, isFetching, retry }: { error: unknown; isFetching: boolean; retry: () => void }) {
	return (
		<Empty className="min-h-72 rounded-xl border border-border bg-card">
			<EmptyHeader>
				<EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
					<RefreshCw className={cn(isFetching && "animate-spin")} />
				</EmptyMedia>
				<EmptyTitle>Não foi possível carregar o documento</EmptyTitle>
				<EmptyDescription>{getErrorMessage(error)}</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button variant="outline" onClick={retry} disabled={isFetching}>
					<RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
					Tentar novamente
				</Button>
			</EmptyContent>
		</Empty>
	);
}

type FiscalDocumentDetailsProps = {
	document: TFiscalDocumentDetails;
	events: TGetFiscalDocumentsOutputById["events"];
	permissions: TFiscalPermissions;
	exceptionalPresenceEnabled: boolean;
	backHref: string;
	onChanged: () => void;
};

// Pares lado a lado que empilham sozinhos quando a coluna fica estreita demais para o conteúdo.
const SECTION_PAIR_CLASSNAME = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,26.25rem),1fr))] items-stretch gap-4";

/**
 * Página de um documento fiscal no mesmo desenho da venda e do cliente: cabeçalho com o número e
 * o selo, e seções em pares. "Situação" abre a página com o estado e a próxima ação; a venda fica
 * ao lado; identificação e histórico na segunda linha; itens e tributos; suporte fechado no fim.
 */
export function FiscalDocumentDetails({
	document,
	events,
	permissions,
	exceptionalPresenceEnabled,
	backHref,
	onChanged,
}: FiscalDocumentDetailsProps) {
	const runner = useFiscalDocumentActionRunner({ document, permissions, exceptionalPresenceEnabled, onChanged });
	const heading = buildFiscalDocumentHeading(document);
	const chip = resolveFiscalDocumentStatusChip(document.statusInterno);
	const providerPayload = useMemo(() => parseFiscalDocumentProviderPayload(document.provedorPayload), [document.provedorPayload]);
	const providerResponse = useMemo(() => parseFiscalDocumentProviderResponse(document.provedorRetorno), [document.provedorRetorno]);
	const taxTotals = useMemo(() => extractTaxTotalsFromPayload(providerPayload), [providerPayload]);
	const payloadItems = useMemo(() => extractPayloadItems(providerPayload), [providerPayload]);
	const saleSummary = useMemo(
		() =>
			buildFiscalDocumentSaleSummary({
				vendaId: document.vendaId,
				snapshotOrigemVenda: document.snapshotOrigemVenda,
				venda: document.venda ?? null,
			}),
		[document.snapshotOrigemVenda, document.venda, document.vendaId],
	);
	const productNames = useMemo(() => buildSaleProductNames(document.venda ?? null), [document.venda]);
	const messages = useMemo(
		() =>
			Array.isArray(document.mensagens) ? document.mensagens.map((message) => (typeof message === "string" ? message : JSON.stringify(message))) : [],
		[document.mensagens],
	);

	return (
		<TooltipProvider>
			<div className="flex w-full flex-col gap-6">
				<PageHeader.Root>
					<PageHeader.Bar>
						<PageHeader.Back href={backHref} />
						<PageHeader.Actions>
							<HeaderActionButton runner={runner} actionKey="SINCRONIZAR" icon={RefreshCcw} label="Atualizar status" />
							<HeaderActionButton runner={runner} actionKey="BAIXAR_PDF" icon={FileText} label="DANFE" />
							<HeaderActionButton runner={runner} actionKey="BAIXAR_XML" icon={FileCode} label="XML" />
						</PageHeader.Actions>
					</PageHeader.Bar>
					<PageHeader.Heading>
						<PageHeader.Title>
							{heading.title}
							<HeadingChip className={chip.className}>{chip.label}</HeadingChip>
							{document.ambiente === "HOMOLOGACAO" ? (
								<HeadingChip className="border-warning/40 bg-warning/10 text-warning-surface-foreground">HOMOLOGAÇÃO</HeadingChip>
							) : null}
						</PageHeader.Title>
						<PageHeader.Description>{heading.description}</PageHeader.Description>
					</PageHeader.Heading>
				</PageHeader.Root>
				<div className={SECTION_PAIR_CLASSNAME}>
					<FiscalDocumentSituationSection document={document} events={events} runner={runner} permissions={permissions} onChanged={onChanged} />
					<FiscalDocumentSaleSection sale={saleSummary} />
				</div>
				{document.presencaConsumidorDeclarada ? <FiscalDocumentExceptionalPresenceNotice document={document} /> : null}
				<div className={SECTION_PAIR_CLASSNAME}>
					<FiscalDocumentIdentificationPanel document={document} />
					<FiscalDocumentEventsTimeline events={events} />
				</div>
				<FiscalDocumentItemsSection items={payloadItems} totals={taxTotals} productNames={productNames} />
				<FiscalDocumentSupportSection document={document} payload={providerPayload} response={providerResponse} messages={messages} />
				{runner.modals}
			</div>
		</TooltipProvider>
	);
}

function HeadingChip({ className, children }: { className: string; children: ReactNode }) {
	return <span className={cn(FISCAL_DOCUMENT_STATUS_CHIP_CLASSNAME, "leading-tight", className)}>{children}</span>;
}

/**
 * Ações de consulta no topo, como "Editar" na venda: atualizar o status e baixar os arquivos. As
 * ações que mudam o documento moram em "Situação", ao lado da frase que as justifica.
 */
function HeaderActionButton({
	runner,
	actionKey,
	icon: Icon,
	label,
}: {
	runner: TFiscalDocumentActionRunner;
	actionKey: Extract<TFiscalDocumentActionKey, "SINCRONIZAR" | "BAIXAR_PDF" | "BAIXAR_XML">;
	icon: LucideIcon;
	label: string;
}) {
	const action = runner.actions[actionKey];
	if (!action || (!action.available && !action.permissionBlocked)) return null;
	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			disabled={!action.available || runner.isPending}
			title={action.reason ?? undefined}
			onClick={() => runner.run(actionKey)}
			className="gap-1.5"
		>
			<Icon className={cn("size-4", runner.pendingAction === actionKey && "animate-spin")} />
			{label}
		</Button>
	);
}
