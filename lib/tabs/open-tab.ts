import { db } from "@/services/drizzle";
import { tabs } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { tabUsesCode } from "@/schemas/service-settings";
import { requireUsableServiceCard } from "./service-cards";
import { acquireTabOpeningLock, generatePublicToken, hashPublicToken, resolveServiceSettings } from "./utils";

export type TOpenTabInput = {
	servicePointId?: string | null;
	codigo?: string | null;
	/** Comanda fixa (modo COMANDA_CADASTRADA). Alternativa a `codigo`: o numero sai do cartao. */
	serviceCardId?: string | null;
	clienteId?: string | null;
	responsavelVendedorId?: string | null;
	observacoes?: string | null;
};

/**
 * Abre (ou resolve) uma conta de atendimento conforme as politicas de serviceSettings.
 *
 * - ponto obrigatorio / codigo manual sao validados contra a configuracao;
 * - abertura em ponto usa advisory lock por (org, ponto): no preset "Somente mesas"
 *   (identificacao automatica, max 1 conta por ponto), selecionar a mesa RESOLVE a
 *   tab aberta existente em vez de criar outra;
 * - comanda fisica (codigo) e defendida tambem pelo partial unique idx_tabs_org_codigo_aberta;
 * - em COMANDA_CADASTRADA o codigo precisa resolver uma comanda fixa ativa; a conta grava o
 *   cartao e o numero impresso como snapshot (idx_tabs_org_service_card_aberta: 1 conta por cartao);
 * - o token publico bruto e retornado somente na criacao (persistimos apenas o hash);
 * - nao cria venda — a venda rascunho e lazy no primeiro pedido (launchTabOrder).
 */
// userId nulo = ator de sistema (conta aberta por aprovacao automatica de solicitacao pelo QR).
export async function openTab({ orgId, userId, input }: { orgId: string; userId: string | null; input: TOpenTabInput }) {
	const settings = await resolveServiceSettings({ orgId });
	if (!settings.contas.habilitadas) {
		throw new createHttpError.BadRequest("Contas de atendimento nao estao habilitadas para esta organizacao.");
	}

	const servicePointId = input.servicePointId ?? null;
	let codigo = input.codigo?.trim() || null;
	let serviceCardId: string | null = null;

	if (settings.contas.pontoObrigatorio && !servicePointId) {
		throw new createHttpError.BadRequest("Selecione o ponto de atendimento para abrir a conta.");
	}
	if (tabUsesCode(settings.contas) && !codigo && !input.serviceCardId) {
		throw new createHttpError.BadRequest("Informe o codigo da comanda para abrir a conta.");
	}
	// Codigo avulso e recusado: so abre conta em comanda cadastrada e ativa.
	if (settings.contas.identificacao === "COMANDA_CADASTRADA") {
		const card = await requireUsableServiceCard({ orgId, input: { serviceCardId: input.serviceCardId, codigo } });
		serviceCardId = card.id;
		codigo = card.codigo;
	}

	if (servicePointId) {
		const servicePoint = await db.query.servicePoints.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, servicePointId), eq(fields.organizacaoId, orgId)),
			columns: { id: true, ativo: true },
		});
		if (!servicePoint) throw new createHttpError.NotFound("Ponto de atendimento nao encontrado.");
		if (!servicePoint.ativo) throw new createHttpError.BadRequest("Ponto de atendimento inativo.");
	}

	// Isolamento multi-tenant: as FKs sao globais por id — referencias recebidas do
	// request precisam pertencer a organizacao da sessao antes de serem persistidas.
	if (input.clienteId) {
		const client = await db.query.clients.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.clienteId as string), eq(fields.organizacaoId, orgId)),
			columns: { id: true },
		});
		if (!client) throw new createHttpError.NotFound("Cliente nao encontrado.");
	}
	if (input.responsavelVendedorId) {
		const seller = await db.query.sellers.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.responsavelVendedorId as string), eq(fields.organizacaoId, orgId)),
			columns: { id: true },
		});
		if (!seller) throw new createHttpError.NotFound("Vendedor nao encontrado.");
	}

	return db.transaction(async (tx) => {
		if (servicePointId) {
			await acquireTabOpeningLock(tx, { orgId, servicePointId });

			// Reconsulta APOS o lock: outra transacao pode ter aberto uma tab neste ponto.
			const openTabsAtPoint = await tx
				.select({ id: tabs.id })
				.from(tabs)
				.where(and(eq(tabs.organizacaoId, orgId), eq(tabs.servicePointId, servicePointId), eq(tabs.status, "ABERTA")));

			// Identificacao automatica + limite 1: selecionar a mesa resolve a tab aberta existente.
			if (settings.contas.identificacao === "AUTOMATICA" && settings.contas.maxAbertasPorPonto === 1 && openTabsAtPoint.length > 0) {
				const existing = await tx.query.tabs.findFirst({
					where: (fields, { eq }) => eq(fields.id, openTabsAtPoint[0].id),
				});
				return { tab: existing!, created: false as const, tokenPublico: null };
			}

			if (settings.contas.maxAbertasPorPonto !== null && openTabsAtPoint.length >= settings.contas.maxAbertasPorPonto) {
				throw new createHttpError.BadRequest("O ponto de atendimento ja atingiu o limite de contas abertas.");
			}
		}

		const tokenPublico = generatePublicToken();

		try {
			const [created] = await tx
				.insert(tabs)
				.values({
					organizacaoId: orgId,
					servicePointId,
					codigo,
					serviceCardId,
					clienteId: input.clienteId ?? null,
					status: "ABERTA",
					tokenPublicoHash: hashPublicToken(tokenPublico),
					responsavelVendedorId: input.responsavelVendedorId ?? null,
					abertaPorUsuarioId: userId,
					observacoes: input.observacoes ?? null,
				})
				.returning();

			return { tab: created, created: true as const, tokenPublico };
		} catch (error) {
			// Violacao do partial unique de codigo aberto — mensagem amigavel.
			if (error instanceof Error && "code" in error && (error as { code?: string }).code === "23505") {
				throw new createHttpError.Conflict(
					serviceCardId ? `A comanda ${codigo} ja esta em uso.` : `Ja existe uma conta aberta com o codigo "${codigo}".`,
				);
			}
			throw error;
		}
	});
}
export type TOpenTabResult = Awaited<ReturnType<typeof openTab>>;
