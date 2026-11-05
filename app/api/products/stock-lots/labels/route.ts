import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canViewInventory } from "@/lib/permissions/inventory";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getProductStockLotLabels } from "@/lib/stock/product-stock-lot-labels";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CreateProductStockLotLabelsInputSchema = z.object({
	lotIds: z
		.array(z.string({ invalid_type_error: "Tipo inválido para ID do lote." }))
		.min(1, "Informe ao menos um lote para gerar etiquetas."),
	copies: z.number({ invalid_type_error: "Tipo inválido para número de cópias." }).int().min(1).max(20).optional().default(1),
});
export type TCreateProductStockLotLabelsInput = z.infer<typeof CreateProductStockLotLabelsInputSchema>;

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

async function createProductStockLotLabels({
	input,
	session,
	origin,
}: {
	input: TCreateProductStockLotLabelsInput;
	session: TAuthUserSession;
	origin: string;
}) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const labels = await getProductStockLotLabels({ lotIds: input.lotIds, organizationId, origin });
	const labelsWithCopies = labels.flatMap((label) => Array.from({ length: input.copies }, () => label));

	return {
		data: {
			labels: labelsWithCopies,
		},
		message: "Etiquetas geradas com sucesso.",
	};
}
export type TCreateProductStockLotLabelsOutput = Awaited<ReturnType<typeof createProductStockLotLabels>>;

async function createProductStockLotLabelsRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canViewInventory(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para visualizar o estoque.");
	const input = CreateProductStockLotLabelsInputSchema.parse(await request.json());
	const result = await createProductStockLotLabels({ input, session, origin: request.nextUrl.origin });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: createProductStockLotLabelsRoute });
