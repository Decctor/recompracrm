import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertCanViewClients } from "@/lib/clients/access";
import { formatClientExportRow } from "@/lib/clients/export-rows";
import { getClients, parseGetClientsSearchParams, type TGetClientsInput } from "@/lib/clients/listing";
import { canExportClients } from "@/lib/permissions/sensitive-data";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

export type TExportClientsInput = Omit<TGetClientsInput, "id">;

/**
 * Exportação da base de clientes com os filtros da listagem, página a página (a tela mostra o
 * progresso). Antes a planilha era montada no navegador paginando `GET /api/clients`, que só exige
 * ver clientes; aqui a saída para arquivo passa por `dadosSensiveis.exportarClientes`.
 */
async function exportClients({ input, session }: { input: TExportClientsInput; session: TAuthUserSession }) {
	const result = await getClients({ input: { ...input, id: null }, session });
	const page = result.data.default;
	if (!page) throw new createHttpError.NotFound("Clientes não encontrados.");
	return {
		data: {
			rows: page.clients.map(formatClientExportRow),
			totalPages: page.totalPages ?? 0,
			totalMatched: page.clientsMatched ?? 0,
		},
		message: "Clientes exportados com sucesso.",
	};
}
export type TExportClientsOutput = Awaited<ReturnType<typeof exportClients>>;

async function exportClientsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanViewClients(session);
	if (!canExportClients(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para exportar a base de clientes.");

	const { id: _id, ...input } = parseGetClientsSearchParams(request.nextUrl.searchParams);
	const result = await exportClients({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: exportClientsRoute });
