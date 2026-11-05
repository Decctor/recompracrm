import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { cancelTab, cancelTabOrder } from "@/lib/tabs";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const CancelTabInputSchema = z
	.object({
		tabId: z.string({ invalid_type_error: "Tipo nao valido para ID da conta." }).optional().nullable(),
		tabOrderId: z.string({ invalid_type_error: "Tipo nao valido para ID do pedido." }).optional().nullable(),
		devolverEstoque: z.boolean({ invalid_type_error: "Tipo nao valido para devolucao de estoque." }).optional().nullable(),
		confirmarItensEntregues: z.boolean({ invalid_type_error: "Tipo nao valido para confirmacao de itens entregues." }).optional().nullable(),
		motivo: z.string({ invalid_type_error: "Tipo nao valido para motivo." }).optional().nullable(),
	})
	.superRefine((value, ctx) => {
		const hasTab = !!value.tabId;
		const hasOrder = !!value.tabOrderId;
		if (hasTab === hasOrder) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe a conta OU o pedido a cancelar." });
		}
	});
export type TCancelTabRouteInput = z.infer<typeof CancelTabInputSchema>;

async function cancelTabOrOrder({ input, session }: { input: TCancelTabRouteInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
	});
	if (!organization) throw new createHttpError.NotFound("Organizacao nao encontrada.");

	if (input.tabOrderId) {
		const result = await cancelTabOrder({
			organization,
			userId: session.user.id,
			input: { tabOrderId: input.tabOrderId, devolverEstoque: input.devolverEstoque, motivo: input.motivo },
		});
		return { data: { pedido: result, conta: null }, message: "Pedido cancelado com sucesso." };
	}

	const result = await cancelTab({
		organization,
		userId: session.user.id,
		input: { tabId: input.tabId as string, confirmarItensEntregues: input.confirmarItensEntregues, motivo: input.motivo },
	});
	return { data: { pedido: null, conta: result }, message: "Conta cancelada com sucesso." };
}
export type TCancelTabOutput = Awaited<ReturnType<typeof cancelTabOrOrder>>;

async function cancelTabRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	if (!session.membership!.permissoes.vendas.excluir) throw new createHttpError.Forbidden("Voce nao possui permissao para cancelar contas ou pedidos.");

	const body = await request.json();
	const input = CancelTabInputSchema.parse(body);
	const result = await cancelTabOrOrder({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: cancelTabRoute });
