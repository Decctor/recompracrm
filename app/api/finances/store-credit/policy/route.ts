import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { requiresStoreCreditRelease } from "@/lib/finances/store-credit/policy";
import { getStoreCreditPreApprovalCandidates, updateStoreCreditPolicy } from "@/lib/finances/store-credit/release";
import { canGrantStoreCredit, canViewFinances } from "@/lib/permissions/finances";
import { db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

/**
 * Política de fiado da organização: exigir ou não liberação por cliente. Ao ligar, mostra antes e
 * aplica junto a pré-liberação de quem já compra fiado (lib/finances/store-credit/release.ts) —
 * sem isso o primeiro cliente de sempre seria barrado no balcão no dia seguinte.
 */

// ---------------------------------------------------------------- GET

async function getStoreCreditPolicy({ session }: { session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const organization = await db.query.organizations.findFirst({ where: eq(organizations.id, organizacaoId), columns: { configuracao: true } });
	const exigeLiberacao = requiresStoreCreditRelease(organization?.configuracao);
	// A prévia só interessa a quem ainda vai ligar a exigência.
	const candidates = exigeLiberacao ? [] : await db.transaction((tx) => getStoreCreditPreApprovalCandidates({ tx, organizacaoId }));

	return {
		data: {
			exigeLiberacao,
			preApproval: {
				clientCount: candidates.length,
				totalLimit: Math.round(candidates.reduce((sum, candidate) => sum + candidate.fiadoLimite, 0) * 100) / 100,
			},
			canManage: canGrantStoreCredit(session.membership?.permissoes),
		},
		message: "Política de fiado encontrada.",
	};
}
export type TGetStoreCreditPolicyOutput = Awaited<ReturnType<typeof getStoreCreditPolicy>>;

async function getStoreCreditPolicyRoute() {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canViewFinances(session.membership.permissoes)) {
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar o módulo financeiro.");
	}
	return NextResponse.json(await getStoreCreditPolicy({ session }));
}

// ---------------------------------------------------------------- PUT

const UpdateStoreCreditPolicyInputSchema = z.object({
	exigeLiberacao: z.boolean({
		required_error: "Exigência de liberação de fiado não informada.",
		invalid_type_error: "Tipo inválido para a exigência de liberação de fiado.",
	}),
	preApproveExisting: z
		.boolean({ invalid_type_error: "Tipo inválido para a pré-liberação de clientes." })
		.optional()
		.default(false),
});
export type TUpdateStoreCreditPolicyInput = z.input<typeof UpdateStoreCreditPolicyInputSchema>;

async function updateStoreCreditPolicyService({
	input,
	session,
}: {
	input: z.output<typeof UpdateStoreCreditPolicyInputSchema>;
	session: TAuthUserSession;
}) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { preApprovedCount } = await db.transaction((tx) =>
		updateStoreCreditPolicy({
			tx,
			organizacaoId,
			userId: session.user.id,
			exigeLiberacao: input.exigeLiberacao,
			preApproveExisting: input.preApproveExisting,
		}),
	);

	return {
		data: { exigeLiberacao: input.exigeLiberacao, preApprovedCount },
		message: input.exigeLiberacao
			? preApprovedCount > 0
				? `Liberação de fiado exigida. ${preApprovedCount} ${preApprovedCount === 1 ? "cliente foi pré-liberado" : "clientes foram pré-liberados"}.`
				: "Liberação de fiado exigida."
			: "Fiado liberado para qualquer cliente identificado.",
	};
}
export type TUpdateStoreCreditPolicyOutput = Awaited<ReturnType<typeof updateStoreCreditPolicyService>>;

async function updateStoreCreditPolicyRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canGrantStoreCredit(session.membership.permissoes)) {
		throw new createHttpError.Forbidden("Você não possui permissão para alterar a política de fiado.");
	}
	const input = UpdateStoreCreditPolicyInputSchema.parse(await request.json());
	return NextResponse.json(await updateStoreCreditPolicyService({ input, session }));
}

export const GET = appApiHandler({ GET: getStoreCreditPolicyRoute });
export const PUT = appApiHandler({ PUT: updateStoreCreditPolicyRoute });
