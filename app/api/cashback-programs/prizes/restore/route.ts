import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { cashbackProgramPrizes } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const RestoreCashbackProgramPrizeInputSchema = z.object({
	id: z.string({
		required_error: "ID do prêmio do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o ID do prêmio do programa de cashback.",
	}),
});
export type TRestoreCashbackProgramPrizeInput = z.infer<typeof RestoreCashbackProgramPrizeInputSchema>;

/**
 * Tira a recompensa do arquivo. Volta inativa de propósito: ela pode ter ficado meses fora e o
 * valor em pontos talvez não faça mais sentido — quem restaura revisa e ativa.
 */
async function restoreCashbackProgramPrize({ input, session }: { input: TRestoreCashbackProgramPrizeInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const [restoredPrize] = await db
		.update(cashbackProgramPrizes)
		.set({ ativo: false, dataArquivamento: null, dataAtualizacao: new Date() })
		.where(and(eq(cashbackProgramPrizes.id, input.id), eq(cashbackProgramPrizes.organizacaoId, userOrgId)))
		.returning({ id: cashbackProgramPrizes.id });
	if (!restoredPrize) throw new createHttpError.NotFound("Prêmio do programa de cashback não encontrado.");

	return {
		data: { restoredId: restoredPrize.id },
		message: "Recompensa restaurada. Ela volta inativa: revise e ative quando quiser.",
	};
}
export type TRestoreCashbackProgramPrizeOutput = Awaited<ReturnType<typeof restoreCashbackProgramPrize>>;

async function restoreCashbackProgramPrizeRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const input = RestoreCashbackProgramPrizeInputSchema.parse(await request.json());
	const result = await restoreCashbackProgramPrize({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: restoreCashbackProgramPrizeRoute });
