import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { loadTerminalTabsOverview, openTerminalTab, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Contas de atendimento (mesas e comandas) na maquininha — scope payment-terminal:sales:create:
// atender mesa é vender. GET traz a configuração de atendimento, os pontos ativos e as contas
// abertas; POST abre uma conta com o terminal como quem abriu (lib/tabs/open-tab.ts).
async function getTerminalTabsRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:sales:create");
	return NextResponse.json({ data: await loadTerminalTabsOverview({ organizationId: actor.organizationId }), message: "Contas carregadas." });
}
export type { TTerminalTabsOverview } from "@/lib/payment-attempts";

const OpenTerminalTabInputSchema = z.object({
	servicePointId: z.string({ invalid_type_error: "Tipo inválido para o ponto de atendimento." }).optional().nullable(),
	codigo: z.string({ invalid_type_error: "Tipo inválido para o código da comanda." }).max(40, "Código da comanda muito longo.").optional().nullable(),
	clienteId: z.string({ invalid_type_error: "Tipo inválido para o cliente." }).optional().nullable(),
	responsavelVendedorId: z.string({ invalid_type_error: "Tipo inválido para o vendedor." }).optional().nullable(),
	observacoes: z.string({ invalid_type_error: "Tipo inválido para observações." }).max(500).optional().nullable(),
});
export type TOpenTerminalTabRouteInput = z.infer<typeof OpenTerminalTabInputSchema>;

async function openTerminalTabRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:sales:create");
	const input = OpenTerminalTabInputSchema.parse(await request.json());
	const result = await openTerminalTab({ organizationId: actor.organizationId, deviceId: actor.principalId, input });
	return NextResponse.json(
		{ data: result, message: result.created ? "Conta aberta." : "Esta mesa já tinha uma conta aberta." },
		{ status: result.created ? 201 : 200 },
	);
}

export const GET = paymentTerminalApiHandler({ GET: getTerminalTabsRoute });
export const POST = paymentTerminalApiHandler({ POST: openTerminalTabRoute });
