import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { StoreCreditFiltersSchema } from "@/lib/finances/store-credit/filters";
import { getStoreCreditClients, getStoreCreditClientTitles } from "@/lib/finances/store-credit/queries";
import { canViewFinances } from "@/lib/permissions/finances";

const GetStoreCreditInputSchema = StoreCreditFiltersSchema.extend({
	clientId: z.string({ invalid_type_error: "Tipo inválido para ID do cliente." }).optional().nullable(),
	includeSettled: z
		.string({ invalid_type_error: "Tipo inválido para inclusão do histórico." })
		.optional()
		.nullable()
		.transform((value) => value === "true"),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
});
export type TGetStoreCreditInput = z.infer<typeof GetStoreCreditInputSchema>;

async function getStoreCredit({ input, session }: { input: TGetStoreCreditInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (input.clientId) {
		const titulos = await getStoreCreditClientTitles({
			organizacaoId,
			clienteId: input.clientId,
			includeSettled: input.includeSettled,
			originAfter: input.originAfter,
			originBefore: input.originBefore,
		});
		return {
			data: { byClient: { clienteId: input.clientId, titulos }, default: null },
			message: "Fiados do cliente listados com sucesso.",
		};
	}

	const result = await getStoreCreditClients({
		organizacaoId,
		search: input.search,
		statuses: input.statuses,
		agingBuckets: input.agingBuckets,
		sortField: input.sortField,
		sortDirection: input.sortDirection,
		page: input.page,
		originAfter: input.originAfter,
		originBefore: input.originBefore,
	});

	return { data: { byClient: null, default: result }, message: "Fiados listados com sucesso." };
}
export type TGetStoreCreditOutput = Awaited<ReturnType<typeof getStoreCredit>>;
export type TGetStoreCreditOutputDefault = NonNullable<TGetStoreCreditOutput["data"]["default"]>;
export type TGetStoreCreditOutputByClient = NonNullable<TGetStoreCreditOutput["data"]["byClient"]>;

async function getStoreCreditRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canViewFinances(session.membership.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar o módulo financeiro.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetStoreCreditInputSchema.parse({
		clientId: searchParams.get("clientId"),
		includeSettled: searchParams.get("includeSettled"),
		page: searchParams.get("page"),
		search: searchParams.get("search"),
		statuses: searchParams.get("statuses"),
		agingBuckets: searchParams.get("agingBuckets"),
		sortField: searchParams.get("sortField"),
		sortDirection: searchParams.get("sortDirection"),
		originAfter: searchParams.get("originAfter"),
		originBefore: searchParams.get("originBefore"),
	});

	const result = await getStoreCredit({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStoreCreditRoute });
