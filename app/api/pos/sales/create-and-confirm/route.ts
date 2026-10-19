import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { createAndConfirmSale as createAndConfirmSaleWithActor } from "@/lib/sales/create-and-confirm-sale";
import { CreateAndConfirmSaleInputSchema, type TCreateAndConfirmSaleInput } from "@/schemas/sale-checkout";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

// 1. Entrada: o schema vive em `schemas/sale-checkout.ts` porque a maquininha usa o mesmo pipeline
// (lib/sales/create-and-confirm-sale.ts) como ator dispositivo.
export type { TCreateAndConfirmSaleInput };

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

// 2. Serviço: o operador logado é o ator.
async function createAndConfirmSale({ input, session }: { input: TCreateAndConfirmSaleInput; session: TAuthUserSession }) {
	return createAndConfirmSaleWithActor({ actor: { kind: "USER", session }, input });
}
export type TCreateAndConfirmSaleOutput = Awaited<ReturnType<typeof createAndConfirmSale>>;

// 3. Rota.
async function createAndConfirmSaleRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const body = await request.json();
	const input = CreateAndConfirmSaleInputSchema.parse(body);
	const result = await createAndConfirmSale({ input, session });
	return NextResponse.json(result);
}

// 4. Export.
export const POST = appApiHandler({ POST: createAndConfirmSaleRoute });
