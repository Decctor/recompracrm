import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { transferTab } from "@/lib/tabs";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const TransferTabInputSchema = z.object({
	tabId: z.string({ required_error: "ID da conta nao informado." }),
	servicePointDestinoId: z.string({ invalid_type_error: "Tipo nao valido para ID do ponto de destino." }).optional().nullable(),
	serviceCardDestinoId: z.string({ invalid_type_error: "Tipo nao valido para ID da comanda de destino." }).optional().nullable(),
	motivo: z.string({ invalid_type_error: "Tipo nao valido para motivo." }).optional().nullable(),
});
export type TTransferTabRouteInput = z.infer<typeof TransferTabInputSchema>;

async function transferTabService({ input, session }: { input: TTransferTabRouteInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;
	const result = await transferTab({ orgId, userId: session.user.id, input });

	return {
		data: result,
		message: "Conta transferida com sucesso.",
	};
}
export type TTransferTabOutput = Awaited<ReturnType<typeof transferTabService>>;

async function transferTabRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());

	const body = await request.json();
	const input = TransferTabInputSchema.parse(body);
	const result = await transferTabService({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: transferTabRoute });
