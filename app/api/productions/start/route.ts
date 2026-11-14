import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { canEditProductions } from "@/lib/permissions/productions";
import { db } from "@/services/drizzle";
import { productions } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const StartProductionInputSchema = z.object({
	productionId: z.string({
		required_error: "ID da produção não informado.",
		invalid_type_error: "Tipo inválido para ID da produção.",
	}),
});
export type TStartProductionInput = z.infer<typeof StartProductionInputSchema>;

const STARTABLE_STATUSES = ["RASCUNHO", "PLANEJADA"] as const;

/**
 * Inicia uma produção planejada (ou rascunho): passa a EM_PRODUCAO, começa a contar o tempo a partir de
 * agora e libera a pesagem. Em produções planejadas `dataInicio` guardava o início previsto; aqui ele
 * vira o início real, e a previsão de conclusão é deslocada mantendo a duração planejada.
 */
async function startProduction({ input, session }: { input: TStartProductionInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const production = await db.query.productions.findFirst({
		where: and(eq(productions.id, input.productionId), eq(productions.organizacaoId, organizationId)),
		columns: { id: true, status: true, dataInicio: true, dataPrevisaoConclusao: true },
	});
	if (!production) throw new createHttpError.NotFound("Produção não encontrada.");
	if (!STARTABLE_STATUSES.includes(production.status as (typeof STARTABLE_STATUSES)[number])) {
		throw new createHttpError.BadRequest("Apenas produções em rascunho ou planejadas podem ser iniciadas.");
	}

	const startedAt = new Date();
	const plannedDuration =
		production.dataInicio && production.dataPrevisaoConclusao ? production.dataPrevisaoConclusao.getTime() - production.dataInicio.getTime() : null;

	const [updatedProduction] = await db
		.update(productions)
		.set({
			status: "EM_PRODUCAO",
			dataInicio: startedAt,
			dataPrevisaoConclusao:
				plannedDuration != null && plannedDuration > 0 ? new Date(startedAt.getTime() + plannedDuration) : production.dataPrevisaoConclusao,
		})
		.where(and(eq(productions.id, production.id), eq(productions.organizacaoId, organizationId)))
		.returning({ id: productions.id, dataInicio: productions.dataInicio });

	if (!updatedProduction?.id) throw new createHttpError.NotFound("Produção não encontrada.");

	return {
		data: {
			startedId: updatedProduction.id,
			dataInicio: updatedProduction.dataInicio,
		},
		message: "Produção iniciada com sucesso.",
	};
}
export type TStartProductionOutput = Awaited<ReturnType<typeof startProduction>>;

async function startProductionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canEditProductions(session.membership.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para iniciar produções.");
	const input = StartProductionInputSchema.parse(await request.json());
	const result = await startProduction({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: startProductionRoute });
