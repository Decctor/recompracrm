import { isActionApprovalExpired } from "@/lib/action-approvals";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { type DB, type DBTransaction, db } from "@/services/drizzle";
import { actionApprovalRequests, clients } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { STORE_CREDIT_TOLERANCE } from "./constants";
import {
	describeStoreCreditDenial,
	evaluateStoreCredit,
	getStoreCreditAvailable,
	requiresStoreCreditRelease,
	sumStoreCreditPayments,
} from "./policy";
import { getClientStoreCreditOpenBalance } from "./queries";

/**
 * Aplicação da regra de liberação de fiado (lib/finances/store-credit/policy.ts) no servidor.
 *
 * Roda dentro da transação que grava o fiado — confirmação da venda e edição de venda confirmada,
 * os dois únicos caminhos que criam `FIADO_NOTA` (o recebimento parcial de conta recusa fiado).
 * O PDV, a conta de atendimento, a maquininha, a loja e os agentes passam por eles, então nenhum
 * canal contorna a regra. A tela só espelha a decisão para explicar o bloqueio antes do clique.
 */

export type TClientStoreCreditPosition = {
	clienteId: string;
	clienteNome: string;
	fiadoLiberado: boolean;
	fiadoLimite: number | null;
	fiadoLiberadoEm: Date | null;
	fiadoLiberadoPorId: string | null;
	saldoEmAberto: number;
	/** `null` = sem limite. */
	disponivel: number | null;
};

export async function getClientStoreCreditPosition({
	database = db,
	organizacaoId,
	clienteId,
}: {
	database?: DB | DBTransaction;
	organizacaoId: string;
	clienteId: string;
}): Promise<TClientStoreCreditPosition | null> {
	const [client] = await database
		.select({
			id: clients.id,
			nome: clients.nome,
			fiadoLiberado: clients.fiadoLiberado,
			fiadoLimite: clients.fiadoLimite,
			fiadoLiberadoEm: clients.fiadoLiberadoEm,
			fiadoLiberadoPorId: clients.fiadoLiberadoPorId,
		})
		.from(clients)
		.where(and(eq(clients.id, clienteId), eq(clients.organizacaoId, organizacaoId)));
	if (!client) return null;
	const saldoEmAberto = await getClientStoreCreditOpenBalance({ database, organizacaoId, clienteId });
	const terms = { fiadoLiberado: client.fiadoLiberado, fiadoLimite: client.fiadoLimite };
	return {
		clienteId: client.id,
		clienteNome: client.nome,
		...terms,
		fiadoLiberadoEm: client.fiadoLiberadoEm,
		fiadoLiberadoPorId: client.fiadoLiberadoPorId,
		saldoEmAberto,
		disponivel: getStoreCreditAvailable({ terms, saldoEmAberto }),
	};
}

/**
 * Serializa as decisões de fiado de um cliente. Sem isto, dois caixas confirmando vendas fiado do
 * mesmo cliente leem o mesmo saldo e, juntos, passam do limite. Bloqueante e de transação: solta
 * no commit/rollback. A confirmação já segura outra trava do cliente ("primeira-compra") antes de
 * pedir esta, e a edição pede só esta — ordem fixa, sem ciclo de espera. A mudança da liberação no
 * cadastro também pede esta trava: sem ela, um bloqueio podia "concluir" enquanto uma venda que já
 * tinha lido "liberado" ainda gravava o fiado.
 */
export async function lockClientStoreCredit(tx: DBTransaction, organizacaoId: string, clienteId: string) {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${organizacaoId}:${clienteId}:fiado`}, 0))`);
}

/**
 * Barra o fiado fora da regra, ou consome a aprovação VENDA_FIADO que o autoriza.
 *
 * Fora da regra e sem aprovação = 403 com o motivo. Com aprovação, ela precisa ser desta
 * organização, deste cliente, APROVADA, dentro da validade, pedida pelo PDV web (a maquininha não
 * pede liberação de fiado) e cobrir o valor de fiado da venda; o consumo é one-shot nesta mesma
 * transação, condicionado a APROVADA — duas vendas não usam a mesma liberação.
 */
export async function enforceStoreCreditRelease({
	tx,
	organization,
	clienteId,
	payments,
	approvalId,
	vendaId,
}: {
	tx: DBTransaction;
	organization: { id: string; configuracao: Pick<TOrganizationConfiguration, "preferencias"> };
	clienteId: string | null | undefined;
	payments: { metodo: TPaymentMethodEnum; valor: number }[];
	approvalId: string | null | undefined;
	vendaId: string;
}): Promise<void> {
	const valorSolicitado = sumStoreCreditPayments(payments);
	if (valorSolicitado <= 0) return;
	if (!requiresStoreCreditRelease(organization.configuracao)) return;
	if (!clienteId) throw new createHttpError.BadRequest("Identifique o cliente para registrar uma venda no fiado.");

	await lockClientStoreCredit(tx, organization.id, clienteId);
	const position = await getClientStoreCreditPosition({ database: tx, organizacaoId: organization.id, clienteId });
	if (!position) throw new createHttpError.NotFound("Cliente da venda não encontrado.");

	const evaluation = evaluateStoreCredit({ exigeLiberacao: true, terms: position, saldoEmAberto: position.saldoEmAberto, valorSolicitado });
	if (evaluation.status === "PERMITIDO") return;

	if (!approvalId) {
		throw new createHttpError.Forbidden(`${describeStoreCreditDenial(evaluation)} Peça a liberação a um gestor para finalizar a venda.`);
	}

	const approval = await tx.query.actionApprovalRequests.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, approvalId), eq(fields.organizacaoId, organization.id)),
	});
	if (!approval || approval.tipo !== "VENDA_FIADO" || approval.payload.tipo !== "VENDA_FIADO") {
		throw new createHttpError.Forbidden("Liberação de fiado não encontrada para esta organização.");
	}
	if (approval.solicitanteDispositivoId) throw new createHttpError.Forbidden("A liberação de fiado foi pedida por um terminal.");
	if (approval.status !== "APROVADA") throw new createHttpError.Forbidden("A liberação de fiado informada não está aprovada ou já foi utilizada.");
	if (isActionApprovalExpired(approval)) throw new createHttpError.Forbidden("A liberação de fiado expirou. Peça uma nova liberação.");
	if (approval.payload.clienteId !== clienteId) throw new createHttpError.Forbidden("A liberação de fiado é de outro cliente.");
	if (valorSolicitado > approval.payload.valorSolicitado + STORE_CREDIT_TOLERANCE) {
		throw new createHttpError.Forbidden("O fiado da venda passa do valor liberado pelo gestor. Peça uma nova liberação.");
	}

	const [consumed] = await tx
		.update(actionApprovalRequests)
		.set({ status: "CONSUMIDA", consumo: { vendaId }, dataConsumo: new Date() })
		.where(and(eq(actionApprovalRequests.id, approval.id), eq(actionApprovalRequests.status, "APROVADA")))
		.returning({ id: actionApprovalRequests.id });
	if (!consumed) throw new createHttpError.Conflict("A liberação de fiado já foi utilizada em outra venda.");
}
