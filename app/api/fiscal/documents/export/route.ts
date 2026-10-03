import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import {
	extractPayloadItems,
	extractRecipientFromPayload,
	extractTaxTotalsFromPayload,
	parseFiscalDocumentProviderPayload,
} from "@/lib/fiscal/document-details-view";
import { FiscalDocumentsFiltersSchema } from "@/lib/fiscal/document-filters";
import { buildFiscalDocumentsConditions, fiscalDocumentReferenceDate } from "@/lib/fiscal/document-list-conditions";
import { db } from "@/services/drizzle";
import { fiscalOutboundDocuments } from "@/services/drizzle/schema";
import { and, count, desc, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Exportação dos documentos fiscais em planilha, página a página.
 *
 * Mesmos filtros da listagem (`buildFiscalDocumentsConditions`). Os totais do ICMSTot, o
 * destinatário e os CFOPs saem do payload enviado ao provedor, mas o payload em si nunca deixa o
 * servidor: a página devolve só os números e textos que viram célula. Documento sem payload
 * (rascunho, erro de prontidão) devolve `totais: null` — a planilha mostra vazio, não R$ 0,00.
 */
const EXPORT_PAGE_SIZE = 200;

const GetFiscalDocumentsExportInputSchema = FiscalDocumentsFiltersSchema.extend({
	page: z
		.string({
			required_error: "Página não informada.",
			invalid_type_error: "Tipo inválido para página.",
		})
		.default("1")
		.transform((val) => (val ? Math.max(1, Number(val)) : 1)),
});
export type TGetFiscalDocumentsExportInput = z.infer<typeof GetFiscalDocumentsExportInputSchema>;

async function getFiscalDocumentsExport({ input, organizationId }: { input: TGetFiscalDocumentsExportInput; organizationId: string }) {
	const where = and(...buildFiscalDocumentsConditions({ organizationId, filters: input }));
	const { page } = input;

	// A contagem só na primeira página: o laço de exportação já sabe quantas páginas tem depois dela.
	const [documentsPage, countResult] = await Promise.all([
		db
			.select({ id: fiscalOutboundDocuments.id })
			.from(fiscalOutboundDocuments)
			.where(where)
			.orderBy(desc(fiscalDocumentReferenceDate), desc(fiscalOutboundDocuments.id))
			.offset(EXPORT_PAGE_SIZE * (page - 1))
			.limit(EXPORT_PAGE_SIZE),
		page === 1 ? db.select({ count: count() }).from(fiscalOutboundDocuments).where(where) : Promise.resolve(null),
	]);
	const documentIds = documentsPage.map((document) => document.id);

	const documentsHydrated =
		documentIds.length === 0
			? []
			: await db.query.fiscalOutboundDocuments.findMany({
					where: inArray(fiscalOutboundDocuments.id, documentIds),
					columns: {
						id: true,
						tipo: true,
						ambiente: true,
						statusInterno: true,
						serie: true,
						numero: true,
						chaveAcesso: true,
						protocolo: true,
						chaveAcessoReferencia: true,
						codigoRejeicao: true,
						mensagens: true,
						provedorPayload: true,
						dataEmissao: true,
						dataAutorizacao: true,
						dataCancelamento: true,
						dataInsercao: true,
					},
					with: {
						venda: {
							columns: { id: true, dataVenda: true, valorTotal: true, entregaModalidade: true },
							with: { cliente: { columns: { nome: true, cpfCnpj: true } } },
						},
					},
				});

	const documentsById = new Map(documentsHydrated.map((document) => [document.id, document]));
	// Preserva a ordem da página: `IN (...)` não garante ordem.
	const documents = documentIds.flatMap((id) => {
		const document = documentsById.get(id);
		if (!document) return [];
		const { provedorPayload, mensagens, ...fields } = document;
		const payload = parseFiscalDocumentProviderPayload(provedorPayload);
		const cfops = [...new Set(extractPayloadItems(payload).flatMap((item) => (item.cfop ? [item.cfop] : [])))];
		return [
			{
				...fields,
				ultimaMensagem: mensagens?.at(-1) ?? null,
				totais: extractTaxTotalsFromPayload(payload),
				destinatario: extractRecipientFromPayload(payload),
				cfops,
			},
		];
	});

	const documentsMatched = countResult?.[0]?.count ?? null;
	return {
		data: {
			documents,
			documentsMatched,
			totalPages: documentsMatched === null ? null : Math.ceil(documentsMatched / EXPORT_PAGE_SIZE),
		},
		message: "Documentos fiscais exportados com sucesso.",
	};
}
export type TGetFiscalDocumentsExportOutput = Awaited<ReturnType<typeof getFiscalDocumentsExport>>;
export type TFiscalDocumentExportEntry = TGetFiscalDocumentsExportOutput["data"]["documents"][number];

async function getFiscalDocumentsExportRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!session.membership?.permissoes.fiscal.visualizar) {
		throw new createHttpError.Forbidden("Oops, você não possui permissão para visualizar o módulo fiscal.");
	}

	const searchParams = request.nextUrl.searchParams;
	const input = GetFiscalDocumentsExportInputSchema.parse({
		search: searchParams.get("search") ?? undefined,
		statusInterno: searchParams.get("statusInterno") ?? undefined,
		tipos: searchParams.get("tipos") ?? undefined,
		ambiente: searchParams.get("ambiente") ?? undefined,
		periodAfter: searchParams.get("periodAfter") ?? undefined,
		periodBefore: searchParams.get("periodBefore") ?? undefined,
		page: searchParams.get("page") ?? undefined,
	});
	const result = await getFiscalDocumentsExport({ input, organizationId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getFiscalDocumentsExportRoute });
