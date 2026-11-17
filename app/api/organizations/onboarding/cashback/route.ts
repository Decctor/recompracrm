import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canConfigureCashback } from "@/lib/permissions/cashback";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { CashbackProgramSchema } from "@/schemas/cashback-programs";
import { db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackPrograms } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Idempotent upsert of the org's single cashback program during onboarding. Creating the org no
// longer seeds a default program, so the cashback stage owns it: it creates the program on first
// submit and updates it on resume / re-submit (e.g. the user toggling "ativar" on or off).
const UpsertOnboardingCashbackInputSchema = z.object({
	cashbackProgram: CashbackProgramSchema.omit({ dataInsercao: true, dataAtualizacao: true }),
});
export type TUpsertOnboardingCashbackInput = z.infer<typeof UpsertOnboardingCashbackInputSchema>;

async function upsertOnboardingCashback({ input, session }: { input: TUpsertOnboardingCashbackInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para configurar o cashback.");

	const existing = await db.query.cashbackPrograms.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, organizacaoId),
		columns: { id: true },
	});

	if (existing) {
		await db
			.update(cashbackPrograms)
			.set({ ...input.cashbackProgram, organizacaoId, dataAtualizacao: new Date() })
			.where(and(eq(cashbackPrograms.id, existing.id), eq(cashbackPrograms.organizacaoId, organizacaoId)));

		return { data: { cashbackProgramId: existing.id }, message: "Programa de cashback atualizado." };
	}

	const cashbackProgramId = await db.transaction(async (tx) => {
		const inserted = await tx
			.insert(cashbackPrograms)
			.values({ ...input.cashbackProgram, organizacaoId })
			.returning({ id: cashbackPrograms.id });
		const programId = inserted[0]?.id;
		if (!programId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar programa de cashback.");

		// Initialize empty balances for existing clients (mirrors the standard create flow).
		const clients = await tx.query.clients.findMany({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizacaoId),
			columns: { id: true },
		});
		const BATCH_SIZE = 100;
		for (let i = 0; i < clients.length; i += BATCH_SIZE) {
			const batch = clients.slice(i, i + BATCH_SIZE).map((client) => ({ organizacaoId, clienteId: client.id, programaId: programId }));
			if (batch.length > 0) await tx.insert(cashbackProgramBalances).values(batch);
		}
		return programId;
	});

	return { data: { cashbackProgramId }, message: "Programa de cashback criado." };
}
export type TUpsertOnboardingCashbackOutput = Awaited<ReturnType<typeof upsertOnboardingCashback>>;

async function upsertOnboardingCashbackRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!canConfigureCashback(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para configurar o programa de cashback.");
	const input = UpsertOnboardingCashbackInputSchema.parse(await request.json());
	const result = await upsertOnboardingCashback({ input, session });
	if (session.membership) await reconcileOnboardingCampaigns({ executor: db, organizationId: session.membership.organizacao.id });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: upsertOnboardingCashbackRoute });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { reconcileOnboardingCampaigns } from "@/lib/onboarding/reconcile";
