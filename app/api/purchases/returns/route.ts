import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { registerPurchaseReturn } from "@/lib/purchase/returns";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

/** Devolução ao fornecedor de itens de uma compra recebida (ADR-0002, Fase 8). */

const CreatePurchaseReturnInputSchema = z.object({
	purchaseId: z.string({ required_error: "ID da compra não informado.", invalid_type_error: "Tipo não válido para o ID da compra." }),
	data: z
		.string({ required_error: "Data da devolução não informada.", invalid_type_error: "Tipo não válido para a data da devolução." })
		.datetime({ message: "Tipo não válido para a data da devolução." })
		.transform((value) => new Date(value)),
	motivo: z.string({ required_error: "Motivo da devolução não informado." }).trim().min(3, "Descreva o motivo da devolução."),
	itens: z
		.array(
			z.object({
				itemId: z.string({ required_error: "Item não informado." }),
				quantidade: z.number({ required_error: "Quantidade não informada.", invalid_type_error: "Tipo não válido para a quantidade." }).nonnegative(),
			}),
		)
		.min(1, "Informe ao menos um item."),
});
export type TCreatePurchaseReturnInput = z.input<typeof CreatePurchaseReturnInputSchema>;
type TCreatePurchaseReturnParsed = z.infer<typeof CreatePurchaseReturnInputSchema>;

async function createPurchaseReturn({ input, session }: { input: TCreatePurchaseReturnParsed; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const record = await db.transaction((tx) =>
		registerPurchaseReturn({ trx: tx, organizationId, userId: session.user.id, purchaseId: input.purchaseId, data: input.data, motivo: input.motivo, itens: input.itens }),
	);
	return {
		data: { devolucao: record },
		message: `Devolução registrada: ${record.itens.length} ${record.itens.length === 1 ? "item" : "itens"}, crédito de R$ ${record.valorTotalFornecedor.toFixed(2)} com o fornecedor.`,
	};
}
export type TCreatePurchaseReturnOutput = Awaited<ReturnType<typeof createPurchaseReturn>>;

async function createPurchaseReturnRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!session.membership?.permissoes.compras.editar) throw new createHttpError.Forbidden("Você não possui permissão para devolver itens de compras.");
	const input = CreatePurchaseReturnInputSchema.parse(await request.json());
	return NextResponse.json(await createPurchaseReturn({ input, session }), { status: 201 });
}
export const POST = appApiHandler({ POST: createPurchaseReturnRoute });
