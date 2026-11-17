import { canViewInventory } from "@/lib/permissions/inventory";
import { canViewCosts } from "@/lib/permissions/sensitive-data";
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

/** Organização da sessão para os relatórios e análises de estoque: exige `estoque.visualizar`. */
export function getInventoryReportOrganizationId(session: TAuthUserSession | null) {
	const organizationId = getSessionOrganizationId(session);
	if (!canViewInventory(session?.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para visualizar o estoque.");
	return organizationId;
}

/**
 * Organização e acesso a custos para os relatórios com algum valor ao custo (valor parado, em risco,
 * compra sugerida, valor imobilizado): quem não vê custos recebe esses campos como `null`.
 */
export function getInventoryReportAccess(session: TAuthUserSession | null) {
	const organizationId = getInventoryReportOrganizationId(session);
	return { organizationId, canViewCosts: canViewCosts(session?.membership?.permissoes) };
}

/**
 * Organização para os relatórios que são inteiramente sobre custo (valor imobilizado, variação de
 * custo de compra, perdas valorizadas): sem `dadosSensiveis.visualizarCustos`, não há o que mostrar.
 */
export function getInventoryCostReportOrganizationId(session: TAuthUserSession | null) {
	const organizationId = getInventoryReportOrganizationId(session);
	if (!canViewCosts(session?.membership?.permissoes)) throw new createHttpError.Forbidden("Você não tem permissão para ver custos.");
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
