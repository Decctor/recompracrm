import { type DBTransaction, db } from "@/services/drizzle";
import { serviceCards, tabs } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { normalizeServiceCardCode } from "./service-card-codes";
import { hashPublicToken } from "./utils";

// ============================================================================
// Comandas fixas (serviceCards) — resolucao no server. Sempre escopada pela
// organizacao: id, numero e token vem do request.
// ============================================================================

type TResolveServiceCardInput = { serviceCardId?: string | null; codigo?: string | null; token?: string | null };

export async function findServiceCard({ orgId, input }: { orgId: string; input: TResolveServiceCardInput }) {
	const conditions = [eq(serviceCards.organizacaoId, orgId)];
	if (input.serviceCardId) conditions.push(eq(serviceCards.id, input.serviceCardId));
	else if (input.token) conditions.push(eq(serviceCards.tokenPublicoHash, hashPublicToken(input.token)));
	else if (input.codigo?.trim()) conditions.push(eq(serviceCards.codigoNormalizado, normalizeServiceCardCode(input.codigo)));
	else return null;

	const [card] = await db
		.select()
		.from(serviceCards)
		.where(and(...conditions))
		.limit(1);
	return card ?? null;
}

/**
 * Resolve um cartao utilizavel para abrir/receber conta. Erros explicitos para o operador:
 * numero digitado errado nao pode virar uma comanda que nao existe fisicamente.
 */
export async function requireUsableServiceCard({ orgId, input }: { orgId: string; input: TResolveServiceCardInput }) {
	const card = await findServiceCard({ orgId, input });
	const label = input.codigo?.trim() || "informada";
	if (!card) throw new createHttpError.BadRequest(`Comanda ${label} nao cadastrada.`);
	if (!card.ativo) throw new createHttpError.BadRequest(`Comanda ${card.codigo} desativada.`);
	return card;
}

/** Conta aberta no cartao (no maximo uma — idx_tabs_org_service_card_aberta). */
export async function findOpenTabByServiceCard(
	executor: DBTransaction | typeof db,
	{ orgId, serviceCardId }: { orgId: string; serviceCardId: string },
) {
	const [tab] = await executor
		.select({ id: tabs.id, servicePointId: tabs.servicePointId, codigo: tabs.codigo })
		.from(tabs)
		.where(and(eq(tabs.organizacaoId, orgId), eq(tabs.serviceCardId, serviceCardId), eq(tabs.status, "ABERTA")))
		.limit(1);
	return tab ?? null;
}
