import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { StoreCreditFiltersSchema } from "@/lib/finances/store-credit/filters";
import { getStoreCreditTitlesForExport } from "@/lib/finances/store-credit/queries";
import { canViewFinances } from "@/lib/permissions/finances";

/**
 * Exportação dos fiados em planilha, página a página — uma linha por título. A aba de clientes da
 * planilha é agregada no navegador a partir destas linhas, então as duas abas sempre fecham.
 */
const GetStoreCreditExportInputSchema = StoreCreditFiltersSchema.omit({ sortField: true, sortDirection: true }).extend({
	includeSettled: z
		.string({ invalid_type_error: "Tipo inválido para inclusão dos quitados." })
		.optional()
		.nullable()
		.transform((value) => value === "true"),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((value) => (value ? Math.max(1, Number(value)) : 1)),
});
export type TGetStoreCreditExportInput = z.infer<typeof GetStoreCreditExportInputSchema>;

async function getStoreCreditExport({ input, session }: { input: TGetStoreCreditExportInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const result = await getStoreCreditTitlesForExport({ organizacaoId, ...input });
	return { data: result, message: "Fiados exportados com sucesso." };
}
export type TGetStoreCreditExportOutput = Awaited<ReturnType<typeof getStoreCreditExport>>;
export type TStoreCreditExportTitle = TGetStoreCreditExportOutput["data"]["titulos"][number];

async function getStoreCreditExportRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canViewFinances(session.membership.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar o módulo financeiro.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetStoreCreditExportInputSchema.parse({
		search: searchParams.get("search"),
		statuses: searchParams.get("statuses"),
		agingBuckets: searchParams.get("agingBuckets"),
		originAfter: searchParams.get("originAfter"),
		originBefore: searchParams.get("originBefore"),
		includeSettled: searchParams.get("includeSettled"),
		page: searchParams.get("page"),
	});

	const result = await getStoreCreditExport({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStoreCreditExportRoute });
