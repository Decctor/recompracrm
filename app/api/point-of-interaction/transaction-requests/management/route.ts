import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { poiTransactionRequests } from "@/services/drizzle/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetPoiTransactionRequestsInputSchema = z.object({
	status: z
		.string({ invalid_type_error: "Tipo não válido para status." })
		.optional()
		.transform((value) => (value ? value.split(",") : ["PENDENTE"])),
});
export type TGetPoiTransactionRequestsInput = z.infer<typeof GetPoiTransactionRequestsInputSchema>;

async function getPoiTransactionRequests({ input, orgId }: { input: TGetPoiTransactionRequestsInput; orgId: string }) {
	const requests = await db.query.poiTransactionRequests.findMany({
		where: and(
			eq(poiTransactionRequests.organizacaoId, orgId),
			inArray(poiTransactionRequests.status, input.status as Array<"PENDENTE" | "PROCESSANDO" | "APROVADO" | "REJEITADO" | "ERRO">),
		),
		with: {
			cliente: {
				columns: {
					id: true,
					nome: true,
					telefone: true,
				},
				// Saldo e moeda do programa: a aprovação de uma recompensa avulsa pede ao operador quanto
				// debitar, e ele precisa ver o que o cliente tem (e se são pontos ou reais).
				with: {
					saldos: {
						columns: { saldoValorDisponivel: true },
						with: { programa: { columns: { terminologia: true } } },
					},
				},
			},
			operadorAprovadorVendedor: {
				columns: {
					id: true,
					nome: true,
				},
			},
			transacaoAcumulo: {
				columns: {
					id: true,
					valor: true,
				},
				with: {},
			},
			transacaoResgate: {
				columns: {
					id: true,
					valor: true,
				},
				with: {
					resgateRecompensa: {
						columns: {
							id: true,
							descricao: true,
							imagemCapaUrl: true,
						},
					},
				},
			},
		},
		orderBy: [desc(poiTransactionRequests.dataInsercao)],
	});

	return {
		data: {
			requests,
		},
		message: "Solicitações obtidas com sucesso.",
	};
}
export type TGetPoiTransactionRequestsOutput = Awaited<ReturnType<typeof getPoiTransactionRequests>>;

async function getPoiTransactionRequestsRoute(request: NextRequest) {
	console.log("[INFO] [GET POI TRANSACTION REQUESTS] Request received");
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const input = GetPoiTransactionRequestsInputSchema.parse({ status: request.nextUrl.searchParams.get("status") ?? undefined });
	const result = await getPoiTransactionRequests({ input, orgId: session.membership.organizacao.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getPoiTransactionRequestsRoute });
