import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { appApiHandler } from "@/lib/app-api";
import { PROCESSING_STALE_AFTER_MS, consumeApprovedPaymentAttempt, resolvePaymentAttemptNextAction } from "@/lib/payment-attempts";
import { PaymentAttemptStatusEnum, type TPaymentAttemptStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { paymentAttempts } from "@/services/drizzle/schema";
import { type SQL, and, count, desc, eq, inArray, lt } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Listagem administrativa de tentativas que precisam de gente (P11 de
// recompracrm-pos-android/docs/11): resultado incerto, aprovação sem efetivação e cobranças que
// o terminal iniciou e nunca concluiu. É o gate do piloto e a base do runbook "cobrou, mas não
// efetivou" (lib/payment-attempts/README.md). Lista simples, não dashboard.

const PAGE_SIZE = 50;

const GetAdminPaymentAttemptsInputSchema = z.object({
	status: z
		.string({ invalid_type_error: "Tipo não válido para status." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",").filter(Boolean) : []))
		.pipe(z.array(PaymentAttemptStatusEnum)),
	organizationId: z.string({ invalid_type_error: "Tipo não válido para a organização." }).optional().nullable(),
	page: z
		.string({ invalid_type_error: "Tipo não válido para página." })
		.optional()
		.nullable()
		.transform((value) => (value ? Math.max(1, Number(value) || 1) : 1)),
});
export type TGetAdminPaymentAttemptsInput = z.infer<typeof GetAdminPaymentAttemptsInputSchema>;

async function queryAttempts({ where, limit, offset }: { where: SQL | undefined; limit: number; offset?: number }) {
	return db.query.paymentAttempts.findMany({
		where,
		with: {
			organizacao: { columns: { id: true, nome: true } },
			dispositivo: { columns: { id: true, nome: true, ultimoAcesso: true } },
			venda: { columns: { id: true, statusVenda: true, valorTotal: true } },
			transacaoFinanceira: { columns: { id: true, dataEfetivacao: true, provedorStatus: true } },
			eventos: { orderBy: (fields, { desc: descending }) => [descending(fields.dataInsercao)], limit: 10 },
		},
		orderBy: desc(paymentAttempts.dataInsercao),
		limit,
		offset,
	});
}

type TAttemptRow = Awaited<ReturnType<typeof queryAttempts>>[number];

function toListItem(attempt: TAttemptRow, now: Date) {
	return {
		id: attempt.id,
		status: attempt.status,
		motivo: attempt.motivoNaoAprovacao,
		nextAction: resolvePaymentAttemptNextAction({ status: attempt.status, dataInicio: attempt.dataInicio, now }),
		operacao: attempt.operacao,
		provedor: attempt.provedor,
		metodo: attempt.metodo,
		valor: attempt.valor,
		totalParcelas: attempt.totalParcelas ?? 1,
		ordemProvedorId: attempt.ordemProvedorId === null ? null : String(attempt.ordemProvedorId),
		itkProvedor: attempt.itkProvedor,
		atkProvedor: attempt.atkProvedor,
		valorAutorizado: attempt.valorAutorizado,
		erroCodigo: attempt.erroCodigo,
		erroMensagem: attempt.erroMensagem,
		versao: attempt.versao,
		dataInsercao: attempt.dataInsercao,
		dataInicio: attempt.dataInicio,
		dataAtualizacao: attempt.dataAtualizacao,
		organizacao: { id: attempt.organizacao.id, nome: attempt.organizacao.nome },
		dispositivo: { id: attempt.dispositivo.id, nome: attempt.dispositivo.nome, ultimoAcesso: attempt.dispositivo.ultimoAcesso },
		venda: { id: attempt.vendaId, statusVenda: attempt.venda.statusVenda, valorTotal: attempt.venda.valorTotal },
		transacaoFinanceira: attempt.transacaoFinanceira
			? { id: attempt.transacaoFinanceira.id, dataEfetivacao: attempt.transacaoFinanceira.dataEfetivacao, provedorStatus: attempt.transacaoFinanceira.provedorStatus }
			: null,
		eventos: attempt.eventos.map((event) => ({
			id: event.id,
			tipo: event.tipo,
			origem: event.origem,
			statusAnterior: event.statusAnterior,
			statusPosterior: event.statusPosterior,
			descricao: event.descricao,
			dataInsercao: event.dataInsercao,
		})),
	};
}

// Visão padrão (sem filtro de status): o que exige atenção humana. PROCESSANDO só entra acima do
// SLA — um PROCESSANDO recente é operação normal, não incidente.
const ATTENTION_STATUSES: TPaymentAttemptStatusEnum[] = ["RESULTADO_INCERTO", "APROVADA_EFETIVACAO_PENDENTE"];

async function getAdminPaymentAttempts({ input }: { input: TGetAdminPaymentAttemptsInput }) {
	const now = new Date();
	const organizationFilter = input.organizationId ? [eq(paymentAttempts.organizacaoId, input.organizationId)] : [];

	if (input.status.length > 0) {
		const where = and(inArray(paymentAttempts.status, input.status), ...organizationFilter);
		const [rows, [{ total }]] = await Promise.all([
			queryAttempts({ where, limit: PAGE_SIZE, offset: (input.page - 1) * PAGE_SIZE }),
			db.select({ total: count() }).from(paymentAttempts).where(where),
		]);
		return {
			data: { attempts: rows.map((row) => toListItem(row, now)), pagination: { page: input.page, pageSize: PAGE_SIZE, total: Number(total) } },
			message: "Tentativas de pagamento listadas com sucesso.",
		};
	}

	const [attention, staleProcessing] = await Promise.all([
		queryAttempts({ where: and(inArray(paymentAttempts.status, ATTENTION_STATUSES), ...organizationFilter), limit: PAGE_SIZE }),
		queryAttempts({
			where: and(eq(paymentAttempts.status, "PROCESSANDO"), lt(paymentAttempts.dataInicio, new Date(now.getTime() - PROCESSING_STALE_AFTER_MS)), ...organizationFilter),
			limit: PAGE_SIZE,
		}),
	]);
	const attempts = [...attention, ...staleProcessing].sort((a, b) => b.dataInsercao.getTime() - a.dataInsercao.getTime()).map((row) => toListItem(row, now));
	return {
		data: { attempts, pagination: { page: 1, pageSize: PAGE_SIZE, total: attempts.length } },
		message: "Tentativas que exigem atenção listadas com sucesso.",
	};
}
export type TGetAdminPaymentAttemptsOutput = Awaited<ReturnType<typeof getAdminPaymentAttempts>>;
export type TAdminPaymentAttemptListItem = TGetAdminPaymentAttemptsOutput["data"]["attempts"][number];

const AdminPaymentAttemptActionInputSchema = z.object({
	attemptId: z.string({ required_error: "ID da tentativa não informado.", invalid_type_error: "Tipo não válido para o ID da tentativa." }),
	action: z.enum(["RETOMAR_EFETIVACAO"], { required_error: "Ação não informada.", invalid_type_error: "Ação inválida." }),
});
export type TAdminPaymentAttemptActionInput = z.infer<typeof AdminPaymentAttemptActionInputSchema>;

// "Cobrou, mas não efetivou": a aprovação está persistida e a efetivação falhou. Retomar é
// idempotente e nunca reabre a adquirente. Resolver um RESULTADO_INCERTO exige evidência externa
// (comprovante/portal da adquirente) e continua manual até existir o contrato de reconciliação.
async function runAdminPaymentAttemptAction({ input, userId }: { input: TAdminPaymentAttemptActionInput; userId: string }) {
	const attempt = await db.query.paymentAttempts.findFirst({ where: eq(paymentAttempts.id, input.attemptId), columns: { id: true, organizacaoId: true, status: true } });
	if (!attempt) throw new createHttpError.NotFound("Tentativa de pagamento não encontrada.");
	if (attempt.status !== "APROVADA_EFETIVACAO_PENDENTE" && attempt.status !== "CONSUMIDA") {
		throw new createHttpError.Conflict("Só tentativas aprovadas sem efetivação podem ter a efetivação retomada.");
	}
	const result = await consumeApprovedPaymentAttempt({ organizationId: attempt.organizacaoId, paymentAttemptId: attempt.id, actorUserId: userId });
	return {
		data: result,
		message: result.alreadyConsumed ? "A tentativa já estava consumida." : "Efetivação retomada: transação financeira efetivada e tentativa consumida.",
	};
}
export type TAdminPaymentAttemptActionOutput = Awaited<ReturnType<typeof runAdminPaymentAttemptAction>>;

async function requireAdmin() {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");
	return session;
}

async function getAdminPaymentAttemptsRoute(request: NextRequest) {
	await requireAdmin();
	const { searchParams } = request.nextUrl;
	const input = GetAdminPaymentAttemptsInputSchema.parse({
		status: searchParams.get("status"),
		organizationId: searchParams.get("organizationId"),
		page: searchParams.get("page"),
	});
	return NextResponse.json(await getAdminPaymentAttempts({ input }));
}

async function adminPaymentAttemptActionRoute(request: NextRequest) {
	const session = await requireAdmin();
	const input = AdminPaymentAttemptActionInputSchema.parse(await request.json());
	return NextResponse.json(await runAdminPaymentAttemptAction({ input, userId: session.user.id }));
}

export const GET = appApiHandler({ GET: getAdminPaymentAttemptsRoute });
export const POST = appApiHandler({ POST: adminPaymentAttemptActionRoute });
