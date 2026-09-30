import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { appApiHandler } from "@/lib/app-api";
import { type TDesktopAgentPollingCadence, resolveDesktopAgentPollingCadence } from "@/lib/desktop-agent/polling";
import { claimPrintJobs } from "@/lib/desktop-agent/print-jobs";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ClaimPrintJobsInputSchema = z.object({
	limite: z
		.number({ invalid_type_error: "Tipo não válido para o limite de jobs." })
		.int("Limite de jobs deve ser um número inteiro.")
		.min(1, "Limite de jobs deve ser de ao menos 1.")
		.max(10, "Limite de jobs não pode exceder 10.")
		.optional()
		.nullable(),
});
export type TClaimPrintJobsInput = z.infer<typeof ClaimPrintJobsInputSchema>;

// Claim atômico da fila (plano: ciclo de vida do job): o agent leva até N jobs roteáveis às
// suas impressoras, com lease — o report exige a posse da tentativa devolvida aqui.
async function claimPrintJobsRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "desktop-agent:print-jobs:update");

	const body = await request.json().catch(() => ({}));
	const input = ClaimPrintJobsInputSchema.parse(body);
	const result = await claimPrintJobs({ actor, limite: input.limite ?? 5 });

	return NextResponse.json(
		{
			// A cadência viaja em todo claim para que um agent que perdeu o `/configuration` no boot
			// (rede ainda subindo) se corrija no primeiro claim bem-sucedido.
			data: { ...result, polling: resolveDesktopAgentPollingCadence() },
			message: result.jobs.length > 0 ? "Jobs de impressão reservados com sucesso." : "Nenhum job de impressão pendente.",
		},
		{ status: 200 },
	);
}
export type TClaimPrintJobsRouteOutput = {
	data: Awaited<ReturnType<typeof claimPrintJobs>> & { polling: TDesktopAgentPollingCadence };
	message: string;
};

export const POST = appApiHandler({ POST: claimPrintJobsRoute });
