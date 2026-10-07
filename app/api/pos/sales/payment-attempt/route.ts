import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { appApiHandler } from "@/lib/app-api";
import type { TAuthUserSession } from "@/lib/authentication/types";
import {
	OPEN_PAYMENT_ATTEMPT_STATUSES,
	cancelPaymentAttemptFromPlatform,
	createAssignedPaymentAttempt,
	isNewPaymentAttemptAllowed,
	isOpenPaymentAttemptStatus,
	resolvePaymentAttemptNextAction,
} from "@/lib/payment-attempts";
import { getSaleFinancialState } from "@/lib/sales/sale-processing/get-sale-financial-state";
import { db } from "@/services/drizzle";
import { paymentAttempts } from "@/services/drizzle/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Rastreamento, pelo PDV web (sessão humana), da cobrança atribuída à maquininha — o lado da
// plataforma do Fluxo B. A tela de sucesso faz polling de `?saleId=`; a pill do PDV lê a lista de
// pendências da organização. As ações de saída (cancelar, reatribuir) são as únicas mutações.

const GetSalePaymentAttemptInputSchema = z.object({
	saleId: z.string({ invalid_type_error: "Tipo não válido para o ID da venda." }).optional().nullable(),
});
export type TGetSalePaymentAttemptInput = z.infer<typeof GetSalePaymentAttemptInputSchema>;

const ATTEMPT_WITH = {
	dispositivo: { columns: { id: true, nome: true } },
	venda: { columns: { id: true, valorTotal: true, statusVenda: true, dataVenda: true }, with: { cliente: { columns: { nome: true } } } },
} as const;

type TAttemptRow = NonNullable<Awaited<ReturnType<typeof fetchLatestAttempt>>>;

async function fetchLatestAttempt({ organizationId, saleId }: { organizationId: string; saleId: string }) {
	return db.query.paymentAttempts.findFirst({
		where: and(eq(paymentAttempts.organizacaoId, organizationId), eq(paymentAttempts.vendaId, saleId)),
		orderBy: desc(paymentAttempts.dataInsercao),
		with: ATTEMPT_WITH,
	});
}

function buildAttemptView(attempt: TAttemptRow, now: Date) {
	return {
		id: attempt.id,
		status: attempt.status,
		motivo: attempt.motivoNaoAprovacao,
		metodo: attempt.metodo,
		valor: attempt.valor,
		totalParcelas: attempt.totalParcelas ?? 1,
		dispositivoId: attempt.dispositivoId,
		dispositivoNome: attempt.dispositivo.nome,
		aberta: isOpenPaymentAttemptStatus(attempt.status),
		novaTentativaPermitida: isNewPaymentAttemptAllowed(attempt.status),
		nextAction: resolvePaymentAttemptNextAction({ status: attempt.status, dataInicio: attempt.dataInicio, now }),
		erroMensagem: attempt.erroMensagem,
		bandeira: attempt.bandeira,
		panMascarado: attempt.panMascarado,
		codigoAutorizacao: attempt.codigoAutorizacao,
		dataInsercao: attempt.dataInsercao,
		dataConclusao: attempt.dataConclusao,
		dataConsumo: attempt.dataConsumo,
		venda: {
			id: attempt.venda.id,
			identificacao: `Venda #${attempt.venda.id.slice(-8).toUpperCase()}`,
			clienteNome: attempt.venda.cliente?.nome ?? null,
			total: attempt.venda.valorTotal,
			statusVenda: attempt.venda.statusVenda,
			dataVenda: attempt.venda.dataVenda,
		},
	};
}

async function getSalePaymentAttempt({ input, organizationId }: { input: TGetSalePaymentAttemptInput; organizationId: string }) {
	const now = new Date();
	if (input.saleId) {
		const attempt = await fetchLatestAttempt({ organizationId, saleId: input.saleId });
		const financial = attempt ? await getSaleFinancialState({ organizationId, saleId: input.saleId }) : null;
		return {
			data: {
				bySale: attempt ? { attempt: buildAttemptView(attempt, now), pago: financial?.isFullyPaid ?? false } : null,
				pending: null,
			},
			message: "Cobrança consultada com sucesso.",
		};
	}
	const rows = await db.query.paymentAttempts.findMany({
		where: and(eq(paymentAttempts.organizacaoId, organizationId), inArray(paymentAttempts.status, [...OPEN_PAYMENT_ATTEMPT_STATUSES])),
		orderBy: desc(paymentAttempts.dataInsercao),
		with: ATTEMPT_WITH,
		limit: 50,
	});
	return {
		data: { bySale: null, pending: rows.map((row) => buildAttemptView(row, now)) },
		message: "Cobranças pendentes listadas com sucesso.",
	};
}
export type TGetSalePaymentAttemptOutput = Awaited<ReturnType<typeof getSalePaymentAttempt>>;
export type TSalePaymentAttemptView = NonNullable<TGetSalePaymentAttemptOutput["data"]["bySale"]>["attempt"];

const SalePaymentAttemptActionInputSchema = z.object({
	saleId: z.string({ required_error: "ID da venda não informado.", invalid_type_error: "Tipo não válido para o ID da venda." }),
	action: z.enum(["CANCELAR", "REATRIBUIR"], { required_error: "Ação não informada.", invalid_type_error: "Ação inválida." }),
	dispositivoId: z.string({ invalid_type_error: "Tipo não válido para o terminal." }).optional().nullable(),
});
export type TSalePaymentAttemptActionInput = z.infer<typeof SalePaymentAttemptActionInputSchema>;

// Ambas as ações só valem em CRIADA (a plataforma nunca cancela o que o terminal já pode ter
// cobrado); o CAS em cancelPaymentAttemptFromPlatform resolve a corrida com o outcome.
// Cancelar deixa a venda confirmada com a transação pendente: o operador então edita o pagamento
// (dinheiro, PIX, fiado...) pelo fluxo de edição existente ou cancela a venda.
async function runSalePaymentAttemptAction({ input, session }: { input: TSalePaymentAttemptActionInput; session: TAuthUserSession }) {
	const organizationId = session.membership!.organizacao.id;
	const current = await fetchLatestAttempt({ organizationId, saleId: input.saleId });
	if (!current || !isOpenPaymentAttemptStatus(current.status)) throw new createHttpError.NotFound("Esta venda não tem cobrança em andamento na maquininha.");

	const result = await db.transaction(async (tx) => {
		const cancelled = await cancelPaymentAttemptFromPlatform({
			tx,
			organizationId,
			attemptId: current.id,
			userId: session.user.id,
			motivo: input.action === "REATRIBUIR" ? "Cobrança reatribuída a outro terminal pelo PDV." : "Cobrança cancelada pelo operador no PDV.",
		});
		if (input.action === "CANCELAR") return { attemptId: cancelled.id, novaTentativaId: null };

		if (!input.dispositivoId) throw new createHttpError.BadRequest("Informe o terminal que vai receber a cobrança.");
		if (!cancelled.transacaoFinanceiraId) throw new createHttpError.Conflict("A cobrança não está mais vinculada a uma transação pendente.");
		const next = await createAssignedPaymentAttempt({
			tx,
			organizationId,
			saleId: input.saleId,
			deviceId: input.dispositivoId,
			financialTransactionId: cancelled.transacaoFinanceiraId,
			metodo: current.metodo,
			valor: current.valor,
			totalParcelas: current.totalParcelas ?? 1,
			parcelamentoResponsavel: current.parcelamentoResponsavel,
			actorUserId: session.user.id,
		});
		return { attemptId: cancelled.id, novaTentativaId: next.id, dispositivoNome: next.dispositivoNome };
	});

	return {
		data: result,
		message:
			input.action === "CANCELAR"
				? "Cobrança na maquininha cancelada. A venda continua confirmada com o pagamento pendente: edite o pagamento ou cancele a venda."
				: `Cobrança reatribuída para "${result.dispositivoNome}".`,
	};
}
export type TSalePaymentAttemptActionOutput = Awaited<ReturnType<typeof runSalePaymentAttemptAction>>;

function requirePosSession(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

async function getSalePaymentAttemptRoute(request: NextRequest) {
	const session = requirePosSession(await getCurrentSessionUncached());
	if (!session.membership!.permissoes.vendas.criar && !session.membership!.permissoes.vendas.visualizar) {
		throw new createHttpError.Forbidden("Você não tem permissão para acompanhar cobranças.");
	}
	const input = GetSalePaymentAttemptInputSchema.parse({ saleId: request.nextUrl.searchParams.get("saleId") });
	const result = await getSalePaymentAttempt({ input, organizationId: session.membership!.organizacao.id });
	return NextResponse.json(result);
}

async function salePaymentAttemptActionRoute(request: NextRequest) {
	const session = requirePosSession(await getCurrentSessionUncached());
	if (!session.membership!.permissoes.vendas.criar) throw new createHttpError.Forbidden("Você não tem permissão para alterar cobranças.");
	const input = SalePaymentAttemptActionInputSchema.parse(await request.json());
	const result = await runSalePaymentAttemptAction({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSalePaymentAttemptRoute });
export const POST = appApiHandler({ POST: salePaymentAttemptActionRoute });
