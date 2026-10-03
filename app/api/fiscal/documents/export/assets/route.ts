import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { listFiscalDocumentAssetsForExport } from "@/lib/fiscal/asset-export";
import { FiscalDocumentsFiltersSchema } from "@/lib/fiscal/document-filters";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetFiscalDocumentAssetsExportInputSchema = FiscalDocumentsFiltersSchema.extend({
	asset: z.enum(["xml", "pdf"], {
		required_error: "Tipo de arquivo não informado.",
		invalid_type_error: "Tipo de arquivo inválido.",
	}),
	page: z
		.string({
			required_error: "Página não informada.",
			invalid_type_error: "Tipo inválido para página.",
		})
		.default("1")
		.transform((val) => (val ? Math.max(1, Number(val)) : 1)),
});
export type TGetFiscalDocumentAssetsExportInput = z.infer<typeof GetFiscalDocumentAssetsExportInputSchema>;

async function getFiscalDocumentAssetsExport({ input, organizationId }: { input: TGetFiscalDocumentAssetsExportInput; organizationId: string }) {
	const { asset, page, ...filters } = input;
	const result = await listFiscalDocumentAssetsForExport({ organizationId, filters, asset, page });
	return {
		data: result,
		message: "Arquivos fiscais preparados para exportação.",
	};
}
export type TGetFiscalDocumentAssetsExportOutput = Awaited<ReturnType<typeof getFiscalDocumentAssetsExport>>;
export type TFiscalDocumentAssetExportEntry = TGetFiscalDocumentAssetsExportOutput["data"]["arquivos"][number];

async function getFiscalDocumentAssetsExportRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!session.membership?.permissoes.fiscal.visualizar) {
		throw new createHttpError.Forbidden("Oops, você não possui permissão para visualizar documentos fiscais.");
	}

	const searchParams = request.nextUrl.searchParams;
	const input = GetFiscalDocumentAssetsExportInputSchema.parse({
		search: searchParams.get("search") ?? undefined,
		statusInterno: searchParams.get("statusInterno") ?? undefined,
		tipos: searchParams.get("tipos") ?? undefined,
		ambiente: searchParams.get("ambiente") ?? undefined,
		periodAfter: searchParams.get("periodAfter") ?? undefined,
		periodBefore: searchParams.get("periodBefore") ?? undefined,
		asset: searchParams.get("asset") ?? undefined,
		page: searchParams.get("page") ?? undefined,
	});
	const result = await getFiscalDocumentAssetsExport({ input, organizationId });
	return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = appApiHandler({ GET: getFiscalDocumentAssetsExportRoute });
