import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { linkTabClient } from "@/lib/tabs";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const UpdateTabClientInputSchema = z.object({
	tabId: z.string({ required_error: "ID da conta nao informado.", invalid_type_error: "Tipo nao valido para ID da conta." }),
	clienteId: z.string({ required_error: "Cliente nao informado.", invalid_type_error: "Tipo nao valido para ID do cliente." }).nullable(),
});
export type TUpdateTabClientInput = z.infer<typeof UpdateTabClientInputSchema>;

async function updateTabClient({ input, session }: { input: TUpdateTabClientInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;
	const result = await linkTabClient({ orgId, input });

	return {
		data: result,
		message: result.clienteId ? "Cliente vinculado a conta." : "Cliente desvinculado da conta.",
	};
}
export type TUpdateTabClientOutput = Awaited<ReturnType<typeof updateTabClient>>;

async function updateTabClientRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());

	const body = await request.json();
	const input = UpdateTabClientInputSchema.parse(body);
	const result = await updateTabClient({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: updateTabClientRoute });
