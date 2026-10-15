import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { CheckoutPaymentSplitSchema } from "@/lib/payments";
import { resolveActiveSalesSession, validateSalesSessionSeller } from "@/lib/sales-sessions";
import { receiveTabPayment } from "@/lib/tabs";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Recebimento parcial de uma conta aberta (docs/dev-planning/tab-partial-payments-plan.md).
// Um recebimento = um metodo = uma transacao. Joao pagando metade em Pix e metade em dinheiro
// sao dois recebimentos.

const CreateTabPaymentInputSchema = z.object({
	tabId: z.string({ required_error: "ID da conta nao informado." }),
	payment: CheckoutPaymentSplitSchema.pick({ metodo: true, valor: true, contaFinanceiraId: true, observacoes: true }),
	payerName: z.string({ invalid_type_error: "Tipo nao valido para o nome do pagador." }).max(80).optional().nullable(),
	sessaoVendaId: z.string({ invalid_type_error: "Tipo nao valido para o ID da sessao de venda." }).optional().nullable(),
});
export type TCreateTabPaymentInput = z.infer<typeof CreateTabPaymentInputSchema>;

async function createTabPayment({ input, session }: { input: TCreateTabPaymentInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
	});
	if (!organization) throw new createHttpError.NotFound("Organizacao nao encontrada.");

	// Turno de caixa: mesma resolucao do fechamento (obrigatoriedade + validacao do vendedor).
	const sessaoObrigatoria = organization.configuracao.preferencias.sessoesVenda?.obrigatorio ?? false;
	if (sessaoObrigatoria && !input.sessaoVendaId) {
		throw new createHttpError.BadRequest("Nenhum caixa aberto. Abra uma sessao de venda para continuar.");
	}

	let sessaoVendaId: string | null = null;
	if (input.sessaoVendaId) {
		const activeSession = await resolveActiveSalesSession({ orgId, sessaoVendaId: input.sessaoVendaId });
		if (!activeSession) throw new createHttpError.BadRequest("Sessao de venda invalida ou nao esta aberta.");
		const draftSale = await db.query.sales.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.tabId, input.tabId), eq(fields.organizacaoId, orgId), eq(fields.statusVenda, "ORCAMENTO")),
			columns: { vendedorId: true },
		});
		if (!draftSale) throw new createHttpError.BadRequest("Conta sem consumo lancado.");
		validateSalesSessionSeller({ session: activeSession, vendedorId: draftSale.vendedorId });
		sessaoVendaId = activeSession.id;
	}

	const result = await receiveTabPayment({
		organization,
		userId: session.user.id,
		input: {
			tabId: input.tabId,
			payment: input.payment,
			payerName: input.payerName,
			sessaoVendaId,
		},
	});

	return { data: result, message: "Recebimento registrado com sucesso." };
}
export type TCreateTabPaymentOutput = Awaited<ReturnType<typeof createTabPayment>>;

async function createTabPaymentRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const body = await request.json();
	const input = CreateTabPaymentInputSchema.parse(body);
	const result = await createTabPayment({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: createTabPaymentRoute });
