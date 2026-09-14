import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { STORE_CREDIT_AGING_BUCKET_KEYS, type TStoreCreditAgingBucket } from "@/lib/finances/store-credit/aging";
import type { TStoreCreditSortDirection, TStoreCreditSortField, TStoreCreditStatus } from "@/lib/finances/store-credit/constants";
import { getStoreCreditClients, getStoreCreditClientTitles } from "@/lib/finances/store-credit/queries";
import { canViewFinances } from "@/lib/permissions/finances";

const VALID_STATUSES: TStoreCreditStatus[] = ["EM_ABERTO", "VENCIDO", "QUITADO"];
const VALID_SORT_FIELDS: TStoreCreditSortField[] = ["saldo", "previsao", "nome"];

const GetStoreCreditInputSchema = z.object({
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
	search: z.string({ invalid_type_error: "Tipo inválido para pesquisa." }).optional().nullable(),
	// Recorte por quando o fiado foi gerado (a venda), não por quando vence — é o eixo do
	// fechamento mensal de quem fecha a conta do mês independente do vencimento.
	originAfter: z
		.string({ invalid_type_error: "Tipo inválido para o período de origem." })
		.datetime({ message: "Tipo inválido para o período de origem." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	originBefore: z
		.string({ invalid_type_error: "Tipo inválido para o período de origem." })
		.datetime({ message: "Tipo inválido para o período de origem." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	statuses: z
		.string({ invalid_type_error: "Tipo inválido para status." })
		.optional()
		.nullable()
		.transform((value) =>
			value ? (value.split(",").filter((item) => VALID_STATUSES.includes(item as TStoreCreditStatus)) as TStoreCreditStatus[]) : [],
		),
	agingBuckets: z
		.string({ invalid_type_error: "Tipo inválido para faixa de atraso." })
		.optional()
		.nullable()
		.transform((value) =>
			value
				? (value.split(",").filter((item) => STORE_CREDIT_AGING_BUCKET_KEYS.includes(item as TStoreCreditAgingBucket)) as TStoreCreditAgingBucket[])
				: [],
		),
	sortField: z
		.string({ invalid_type_error: "Tipo inválido para ordenação." })
		.optional()
		.nullable()
		.transform((value) => (value && VALID_SORT_FIELDS.includes(value as TStoreCreditSortField) ? (value as TStoreCreditSortField) : "saldo")),
	sortDirection: z
		.string({ invalid_type_error: "Tipo inválido para direção da ordenação." })
		.optional()
		.nullable()
		.transform((value) => (value === "asc" ? "asc" : "desc") as TStoreCreditSortDirection),
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
