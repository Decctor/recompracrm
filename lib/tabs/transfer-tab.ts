import { db } from "@/services/drizzle";
import { tabs } from "@/services/drizzle/schema";
import { and, eq, ne } from "drizzle-orm";
import createHttpError from "http-errors";
import { requireUsableServiceCard } from "./service-cards";
import { acquireTabOpeningLock, resolveServiceSettings } from "./utils";

export type TTransferTabInput = {
	tabId: string;
	servicePointDestinoId?: string | null;
	/** Troca de comanda fixa (cartao perdido/trocado). Pode vir junto com a troca de ponto. */
	serviceCardDestinoId?: string | null;
	motivo?: string | null;
};

/**
 * Transfere uma conta aberta para outro ponto de atendimento e/ou outra comanda fixa,
 * preservando pedidos, venda rascunho, itens e cliente. Operacao explicita e auditada em metadados.
 */
export async function transferTab({ orgId, userId, input }: { orgId: string; userId: string; input: TTransferTabInput }) {
	if (!input.servicePointDestinoId && !input.serviceCardDestinoId) {
		throw new createHttpError.BadRequest("Informe o ponto ou a comanda de destino.");
	}
	const settings = await resolveServiceSettings({ orgId });

	let destination: { id: string; rotulo: string } | null = null;
	if (input.servicePointDestinoId) {
		const point = await db.query.servicePoints.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.servicePointDestinoId as string), eq(fields.organizacaoId, orgId)),
			columns: { id: true, ativo: true, rotulo: true },
		});
		if (!point) throw new createHttpError.NotFound("Ponto de atendimento de destino nao encontrado.");
		if (!point.ativo) throw new createHttpError.BadRequest("Ponto de atendimento de destino inativo.");
		destination = point;
	}

	const card = input.serviceCardDestinoId ? await requireUsableServiceCard({ orgId, input: { serviceCardId: input.serviceCardDestinoId } }) : null;

	try {
		return await db.transaction(async (tx) => {
			// Mesma guarda da abertura: serializa contra abertura/transferencia concorrente no destino.
			if (destination) await acquireTabOpeningLock(tx, { orgId, servicePointId: destination.id });

			const [tab] = await tx
				.select()
				.from(tabs)
				.where(and(eq(tabs.id, input.tabId), eq(tabs.organizacaoId, orgId)))
				.for("update");

			if (!tab) throw new createHttpError.NotFound("Conta nao encontrada.");
			if (tab.status !== "ABERTA") throw new createHttpError.BadRequest("Somente contas abertas podem ser transferidas.");
			if (destination && tab.servicePointId === destination.id && !card) {
				throw new createHttpError.BadRequest("A conta ja esta neste ponto de atendimento.");
			}
			if (card && tab.serviceCardId === card.id) throw new createHttpError.BadRequest("A conta ja esta nesta comanda.");

			if (destination && tab.servicePointId !== destination.id && settings.contas.maxAbertasPorPonto !== null) {
				const openTabsAtDestination = await tx
					.select({ id: tabs.id })
					.from(tabs)
					.where(and(eq(tabs.organizacaoId, orgId), eq(tabs.servicePointId, destination.id), eq(tabs.status, "ABERTA"), ne(tabs.id, tab.id)));
				if (openTabsAtDestination.length >= settings.contas.maxAbertasPorPonto) {
					throw new createHttpError.BadRequest("O ponto de destino ja atingiu o limite de contas abertas.");
				}
			}

			const previousMetadata = (tab.metadados as Record<string, unknown> | null) ?? {};
			const previousTransfers = Array.isArray(previousMetadata.transferencias) ? previousMetadata.transferencias : [];

			await tx
				.update(tabs)
				.set({
					...(destination ? { servicePointId: destination.id } : {}),
					// O numero impresso acompanha o cartao: a conta passa a ser "Comanda <novo>".
					...(card ? { serviceCardId: card.id, codigo: card.codigo } : {}),
					metadados: {
						...previousMetadata,
						transferencias: [
							...previousTransfers,
							{
								...(destination ? { dePontoId: tab.servicePointId, paraPontoId: destination.id } : {}),
								...(card ? { deCartaoId: tab.serviceCardId, deCodigo: tab.codigo, paraCartaoId: card.id, paraCodigo: card.codigo } : {}),
								usuarioId: userId,
								motivo: input.motivo ?? null,
								data: new Date().toISOString(),
							},
						],
					},
				})
				.where(eq(tabs.id, tab.id));

			return { tabId: tab.id, servicePointId: destination?.id ?? tab.servicePointId, serviceCardId: card?.id ?? tab.serviceCardId };
		});
	} catch (error) {
		// idx_tabs_org_service_card_aberta / idx_tabs_org_codigo_aberta: o cartao de destino ja tem conta aberta.
		if (card && error instanceof Error && "code" in error && (error as { code?: string }).code === "23505") {
			throw new createHttpError.Conflict(`A comanda ${card.codigo} ja esta em uso.`);
		}
		throw error;
	}
}
export type TTransferTabResult = Awaited<ReturnType<typeof transferTab>>;
