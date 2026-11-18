import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanViewClients } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import { resolveMunicipalityCoordinates } from "@/utils/states-cities";
import { and, count, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function getClientsByLocation({ session }: { session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const cityWhere = and(
		eq(clients.organizacaoId, organizacaoId),
		isNotNull(clients.localizacaoCidade),
		ne(clients.localizacaoCidade, ""),
		isNotNull(clients.localizacaoEstado),
		ne(clients.localizacaoEstado, ""),
	);

	const [cityRows, totalsRows] = await Promise.all([
		db
			.select({ cidade: clients.localizacaoCidade, estado: clients.localizacaoEstado, clientes: count(clients.id) })
			.from(clients)
			.where(cityWhere)
			.groupBy(clients.localizacaoCidade, clients.localizacaoEstado)
			.orderBy(desc(count(clients.id))),
		db
			.select({
				totalClientes: count(clients.id),
				clientesComCidade: sql<number>`count(*) filter (where ${clients.localizacaoCidade} is not null and ${clients.localizacaoCidade} <> '' and ${clients.localizacaoEstado} is not null and ${clients.localizacaoEstado} <> '')::int`,
			})
			.from(clients)
			.where(eq(clients.organizacaoId, organizacaoId)),
	]);

	const totals = totalsRows[0];
	const totalClientes = Number(totals?.totalClientes ?? 0);
	const clientesComCidade = Number(totals?.clientesComCidade ?? 0);

	const pontos: Array<{ cidade: string; estado: string; clientes: number; latitude: number; longitude: number }> = [];
	const cidadesNaoMapeadas: Array<{ cidade: string; estado: string; clientes: number }> = [];

	for (const row of cityRows) {
		const cidade = row.cidade ?? "";
		const estado = row.estado ?? "";
		const clientes = Number(row.clientes ?? 0);
		const coords = await resolveMunicipalityCoordinates(cidade, estado);
		if (coords) pontos.push({ cidade, estado, clientes, latitude: coords.latitude, longitude: coords.longitude });
		else cidadesNaoMapeadas.push({ cidade, estado, clientes });
	}

	return {
		data: {
			pontos,
			resumo: {
				totalClientes,
				clientesComCidade,
				clientesSemCidade: Math.max(totalClientes - clientesComCidade, 0),
				cidadesMapeadas: pontos.length,
				cidadesSemCoordenadas: cidadesNaoMapeadas.length,
			},
			cidadesNaoMapeadas,
		},
		message: "Distribuição geográfica de clientes carregada com sucesso.",
	};
}
export type TGetClientsByLocationOutput = Awaited<ReturnType<typeof getClientsByLocation>>;

async function getClientsByLocationRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanViewClients(session);
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const result = await getClientsByLocation({ session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({
	GET: getClientsByLocationRoute,
});
