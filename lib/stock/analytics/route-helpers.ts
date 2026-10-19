import type { TAuthUserSession } from "@/lib/authentication/types";
import createHttpError from "http-errors";
import { z } from "zod";
import { CONSUMPTION_WINDOW_DAYS } from "./consumption";

/** Organização da sessão, exigida por todas as rotas de relatórios de estoque. */
export function getSessionOrganizationId(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return organizationId;
}

/** Período dos relatórios. Sem datas, os últimos 30 dias até agora. */
export const StockReportPeriodInputSchema = z
	.object({
		periodAfter: z
			.string({ invalid_type_error: "Tipo inválido para período inicial." })
			.optional()
			.nullable()
			.transform((value) => (value ? new Date(value) : null)),
		periodBefore: z
			.string({ invalid_type_error: "Tipo inválido para período final." })
			.optional()
			.nullable()
			.transform((value) => (value ? new Date(value) : null)),
	})
	.transform((input) => {
		const before = input.periodBefore && !Number.isNaN(input.periodBefore.getTime()) ? input.periodBefore : new Date();
		const after =
			input.periodAfter && !Number.isNaN(input.periodAfter.getTime())
				? input.periodAfter
				: new Date(before.getTime() - CONSUMPTION_WINDOW_DAYS * 86_400_000);
		if (after.getTime() >= before.getTime()) throw new createHttpError.BadRequest("O período inicial precisa ser anterior ao final.");
		return { periodAfter: after, periodBefore: before };
	});
export type TStockReportPeriodInput = z.infer<typeof StockReportPeriodInputSchema>;

export function parsePeriodSearchParams(searchParams: URLSearchParams) {
	return { periodAfter: searchParams.get("periodAfter"), periodBefore: searchParams.get("periodBefore") };
}
