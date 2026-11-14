import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { canEditProductions } from "@/lib/permissions/productions";
import { db } from "@/services/drizzle";
import { productionInputs, productionOutputs, productions } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const WeighProductionItemInputSchema = z.object({
	productionId: z.string({
		required_error: "ID da produção não informado.",
		invalid_type_error: "Tipo inválido para ID da produção.",
	}),
	itemId: z.string({
		required_error: "ID do item não informado.",
		invalid_type_error: "Tipo inválido para ID do item.",
	}),
	itemKind: z.enum(["ENTRADA", "SAIDA"], {
		required_error: "Tipo do item não informado.",
		invalid_type_error: "Tipo inválido para tipo do item.",
	}),
	/** Quantidade pesada. `null` desfaz a conferência ("Redefinir"). */
	quantidadeReal: z
		.number({
			required_error: "Quantidade real não informada.",
			invalid_type_error: "Tipo inválido para quantidade real.",
		})
		.nonnegative({ message: "Quantidade real não pode ser negativa." })
		.nullable(),
});
export type TWeighProductionItemInput = z.infer<typeof WeighProductionItemInputSchema>;

/**
 * Pesagem de um item na tela de produção. `quantidadeReal` preenchida é o que marca o item como
 * conferido — não há outra flag. Um PATCH por toque em "Confirmar", sem reenviar a produção inteira.
 */
async function weighProductionItem({ input, session }: { input: TWeighProductionItemInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const production = await db.query.productions.findFirst({
		where: and(eq(productions.id, input.productionId), eq(productions.organizacaoId, organizationId)),
		columns: { id: true, status: true },
	});
	if (!production) throw new createHttpError.NotFound("Produção não encontrada.");
	if (production.status !== "EM_PRODUCAO") throw new createHttpError.BadRequest("A pesagem só é liberada com a produção em andamento.");

	const table = input.itemKind === "ENTRADA" ? productionInputs : productionOutputs;
	const [updatedItem] = await db
		.update(table)
		.set({ quantidadeReal: input.quantidadeReal })
		.where(and(eq(table.id, input.itemId), eq(table.producaoId, production.id), eq(table.organizacaoId, organizationId)))
		.returning({ id: table.id, quantidadeReal: table.quantidadeReal });

	if (!updatedItem?.id) throw new createHttpError.NotFound("Item da produção não encontrado.");

	return {
		data: {
			updatedId: updatedItem.id,
			quantidadeReal: updatedItem.quantidadeReal,
		},
		message: input.quantidadeReal == null ? "Conferência desfeita." : "Item conferido.",
	};
}
export type TWeighProductionItemOutput = Awaited<ReturnType<typeof weighProductionItem>>;

async function weighProductionItemRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canEditProductions(session.membership.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para pesar itens da produção.");
	const input = WeighProductionItemInputSchema.parse(await request.json());
	const result = await weighProductionItem({ input, session });
	return NextResponse.json(result);
}

export const PATCH = appApiHandler({ PATCH: weighProductionItemRoute });
