"use client";

import { PageHeader } from "@/components/Layouts/PageHeader";
import { appRoutes } from "@/lib/navigation/routes";
import { useFiscalDocumentById } from "@/lib/queries/fiscal";
import { FiscalDocumentDetails, FiscalDocumentDetailsError, FiscalDocumentDetailsSkeleton } from "./components/fiscal-document-details";
import type { TFiscalPermissions } from "./helpers/fiscal-document-action-state";

type FiscalDocumentPageProps = {
	documentId: string;
	permissions: TFiscalPermissions;
	exceptionalPresenceEnabled: boolean;
};

/**
 * Pagina de um documento fiscal (`/dashboard/fiscal/documents/[documentId]`). Com o documento
 * carregado, o detalhe monta o proprio cabecalho (titulo, selo e acoes dependem dele); antes
 * disso, so o voltar e um titulo generico.
 */
export default function FiscalDocumentPage({ documentId, permissions, exceptionalPresenceEnabled }: FiscalDocumentPageProps) {
	const { data, isLoading, isError, error, isFetching, refetch } = useFiscalDocumentById(documentId);
	const document = data?.document;
	const backHref = `${appRoutes.fiscal.root()}?view=documents`;

	if (document) {
		return (
			<div className="flex w-full flex-col py-3">
				<FiscalDocumentDetails
					key={document.id}
					document={document}
					events={data?.events ?? []}
					permissions={permissions}
					exceptionalPresenceEnabled={exceptionalPresenceEnabled}
					backHref={backHref}
					onChanged={() => void refetch()}
				/>
			</div>
		);
	}

	return (
		<div className="flex w-full flex-col gap-6 py-3">
			<PageHeader.Root>
				<PageHeader.Bar>
					<PageHeader.Back href={backHref} />
				</PageHeader.Bar>
				<PageHeader.Heading>
					<PageHeader.Title>Documento fiscal</PageHeader.Title>
					<PageHeader.Description>Situação, venda vinculada, itens e histórico do documento.</PageHeader.Description>
				</PageHeader.Heading>
			</PageHeader.Root>
			{isLoading ? <FiscalDocumentDetailsSkeleton /> : null}
			{isError ? <FiscalDocumentDetailsError error={error} isFetching={isFetching} retry={() => void refetch()} /> : null}
		</div>
	);
}
