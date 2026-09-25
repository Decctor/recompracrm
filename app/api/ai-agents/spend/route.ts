import { getOrganizationAiSpend, resolveAiSpendLimitUsd } from "@/lib/ai/agent/spend";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

// ============================================================================
// SERVICES
// ============================================================================

/** Gasto estimado com IA no mês corrente (São Paulo) e o limite configurado para a organização. */
async function getAiAgentSpend({ organizacaoId, limite }: { organizacaoId: string; limite: number | null }) {
	const { custoUsd, runs, desde } = await getOrganizationAiSpend(db, { organizacaoId });
	return {
		data: {
			mes: { custoUsd, runs, desde, limiteUsd: limite, percentual: limite ? Math.min(100, Math.round((custoUsd / limite) * 100)) : null },
		},
		message: "Gasto com IA carregado com sucesso.",
	};
}
export type TGetAiAgentSpendOutput = Awaited<ReturnType<typeof getAiAgentSpend>>;

// ============================================================================
// HANDLERS
// ============================================================================

async function getAiAgentSpendRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Sessão não encontrada.");
	if (!session.membership.permissoes.empresa.visualizar) {
		throw new createHttpError.Forbidden("Você não tem permissão para visualizar o gasto com o agente de IA.");
	}

	const result = await getAiAgentSpend({
		organizacaoId: session.membership.organizacao.id,
		limite: resolveAiSpendLimitUsd(session.membership.organizacao.configuracao),
	});
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getAiAgentSpendRoute });
