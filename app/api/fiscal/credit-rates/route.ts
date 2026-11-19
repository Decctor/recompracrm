import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { listFiscalCreditRates } from "@/lib/fiscal/credit-rates";
import { FiscalCreditRateInputSchema } from "@/schemas/fiscal";
import { db } from "@/services/drizzle";
import { fiscalCreditRates, fiscalTaxGroups } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetFiscalCreditRatesInputSchema = z.object({ competencia: FiscalCreditRateInputSchema.shape.competencia.optional().nullable() });
export type TGetFiscalCreditRatesInput = z.infer<typeof GetFiscalCreditRatesInputSchema>;
const CreateFiscalCreditRatesInputSchema = FiscalCreditRateInputSchema.extend({
	groupIds: z
		.array(z.string({ required_error: "Grupo não informado.", invalid_type_error: "Grupo inválido." }), {
			required_error: "Grupos não informados.",
			invalid_type_error: "Grupos inválidos.",
		})
		.min(1)
		.max(100)
		.transform((ids) => [...new Set(ids)]),
});
export type TCreateFiscalCreditRatesInput = z.infer<typeof CreateFiscalCreditRatesInputSchema>;
function requireMembership(session: TAuthUserSession) {
	const membership = session.membership;
	if (!membership) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!membership.permissoes.fiscal.configurar) throw new createHttpError.Forbidden("Você não possui permissão para configurar o fiscal.");
	return membership;
}
async function getFiscalCreditRates({ input, session }: { input: TGetFiscalCreditRatesInput; session: TAuthUserSession }) {
	const membership = requireMembership(session);
	return {
		data: { default: await listFiscalCreditRates(membership.organizacao.id, input.competencia) },
		message: "Percentuais de crédito encontrados com sucesso.",
	};
}
export type TGetFiscalCreditRatesOutput = Awaited<ReturnType<typeof getFiscalCreditRates>>;
async function createFiscalCreditRates({ input, session }: { input: TCreateFiscalCreditRatesInput; session: TAuthUserSession }) {
	const membership = requireMembership(session);
	const orgId = membership.organizacao.id;
	const rows = await db.transaction(async (tx) => {
		const groups = await tx
			.select({ id: fiscalTaxGroups.id })
			.from(fiscalTaxGroups)
			.where(and(eq(fiscalTaxGroups.organizacaoId, orgId), inArray(fiscalTaxGroups.id, input.groupIds)))
			.orderBy(fiscalTaxGroups.id)
			.for("update");
		if (groups.length !== input.groupIds.length) throw new createHttpError.NotFound("Grupo tributário não encontrado nesta organização.");
		// Append-only: revisões mantém percentual, autor e orientação anteriores consultáveis.
		return tx
			.insert(fiscalCreditRates)
			.values(
				groups.map((group) => ({
					organizacaoId: orgId,
					grupoTributarioId: group.id,
					competencia: input.competencia,
					percentual: input.percentual,
					observacao: input.observacao,
					autorId: session.user.id,
				})),
			)
			.returning({ id: fiscalCreditRates.id });
	});
	return { data: { insertedIds: rows.map((row) => row.id) }, message: "Percentuais de crédito cadastrados com sucesso." };
}
export type TCreateFiscalCreditRatesOutput = Awaited<ReturnType<typeof createFiscalCreditRates>>;
async function getFiscalCreditRatesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetFiscalCreditRatesInputSchema.parse({ competencia: request.nextUrl.searchParams.get("competencia") });
	return NextResponse.json(await getFiscalCreditRates({ input, session }));
}
async function createFiscalCreditRatesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	requireMembership(session);
	const input = CreateFiscalCreditRatesInputSchema.parse(await request.json());
	return NextResponse.json(await createFiscalCreditRates({ input, session }), { status: 201 });
}
export const GET = appApiHandler({ GET: getFiscalCreditRatesRoute });
export const POST = appApiHandler({ POST: createFiscalCreditRatesRoute });
