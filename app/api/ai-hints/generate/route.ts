import { generateHintsForSubject } from "@/lib/ai-hints/generate-hints";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { GenerateHintsInputSchema } from "@/schemas/ai-hints";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function generateHints(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) {
		throw new createHttpError.Unauthorized("Você não está autenticado.");
	}

	const orgId = session.membership.organizacao.id;
	const body = await request.json();
	const input = GenerateHintsInputSchema.parse(body);

	const result = await generateHintsForSubject({
		organizacaoId: orgId,
		assunto: input.assunto,
		contextoAdicional: input.contextoAdicional,
	});

	if (result.limiteAtingido && result.hints.length === 0) {
		return NextResponse.json(
			{
				data: { hints: [], tokensUsados: 0, limiteAtingido: true },
				message: "Limite semanal de dicas atingido.",
			},
			{ status: 200 },
		);
	}

	return NextResponse.json(
		{
			data: result,
			message: `${result.hints.length} dica(s) gerada(s) com sucesso.`,
		},
		{ status: 200 },
	);
}

export const POST = appApiHandler({ POST: generateHints });
