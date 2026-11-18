import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanManageClientBase } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { DEFAULT_SEGMENT_CADENCES, getEffectiveSegmentCadences } from "@/lib/client-portfolios/cadence";
import { db } from "@/services/drizzle";
import { segmentCadences } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// GET — cadências efetivas da organização (defaults + overrides)
// ============================================================================

async function getSegmentCadences({ session }: { session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const effective = await getEffectiveSegmentCadences(organizacaoId);
	const defaultsBySegment = new Map(DEFAULT_SEGMENT_CADENCES.map((cadence) => [cadence.segmento, cadence]));

	const cadences = [...effective.values()].map((cadence) => ({
		...cadence,
		isDefault:
			defaultsBySegment.get(cadence.segmento)?.diasIdealEntreContatos === cadence.diasIdealEntreContatos &&
			defaultsBySegment.get(cadence.segmento)?.diasMinimoEntreContatos === cadence.diasMinimoEntreContatos &&
			defaultsBySegment.get(cadence.segmento)?.ativo === cadence.ativo,
	}));

	return { data: { cadences }, message: "Cadências carregadas com sucesso." };
}
export type TGetSegmentCadencesOutput = Awaited<ReturnType<typeof getSegmentCadences>>;

async function getSegmentCadencesRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!session.membership.organizacao.configuracao.preferencias.carteirasClientes?.habilitado)
		throw new createHttpError.Forbidden("O módulo de carteira de clientes não está habilitado para esta organização.");

	const result = await getSegmentCadences({ session });
	return NextResponse.json(result, { status: 200 });
}

// ============================================================================
// PUT — sobrescrever cadências por segmento
// ============================================================================

const UpdateSegmentCadencesInputSchema = z.object({
	cadences: z.array(
		z.object({
			segmento: z.string({
				required_error: "Segmento não informado.",
				invalid_type_error: "Tipo inválido para o segmento.",
			}),
			diasIdealEntreContatos: z
				.number({
					required_error: "Dias ideais entre contatos não informados.",
					invalid_type_error: "Tipo inválido para os dias ideais entre contatos.",
				})
				.int()
				.min(1, "A cadência ideal deve ser de pelo menos 1 dia.")
				.max(365, "A cadência ideal deve ser de no máximo 365 dias."),
			diasMinimoEntreContatos: z
				.number({
					required_error: "Dias mínimos entre contatos não informados.",
					invalid_type_error: "Tipo inválido para os dias mínimos entre contatos.",
				})
				.int()
				.min(0, "O mínimo entre contatos não pode ser negativo.")
				.max(90, "O mínimo entre contatos deve ser de no máximo 90 dias."),
			ativo: z.boolean({ invalid_type_error: "Tipo inválido para o indicador de ativo." }).default(true),
		}),
	),
});
export type TUpdateSegmentCadencesInput = z.infer<typeof UpdateSegmentCadencesInputSchema>;

async function updateSegmentCadences({ input, session }: { input: TUpdateSegmentCadencesInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const invalid = input.cadences.find((cadence) => cadence.diasMinimoEntreContatos >= cadence.diasIdealEntreContatos);
	if (invalid) {
		throw new createHttpError.BadRequest(`O mínimo entre contatos do segmento ${invalid.segmento} deve ser menor que a cadência ideal.`);
	}

	await db.transaction(async (tx) => {
		for (const cadence of input.cadences) {
			const existing = await tx.query.segmentCadences.findFirst({
				where: and(eq(segmentCadences.organizacaoId, organizacaoId), eq(segmentCadences.segmento, cadence.segmento)),
				columns: { id: true },
			});
			if (existing) {
				await tx
					.update(segmentCadences)
					.set({
						diasIdealEntreContatos: cadence.diasIdealEntreContatos,
						diasMinimoEntreContatos: cadence.diasMinimoEntreContatos,
						ativo: cadence.ativo,
					})
					.where(eq(segmentCadences.id, existing.id));
			} else {
				await tx.insert(segmentCadences).values({
					organizacaoId,
					segmento: cadence.segmento,
					diasIdealEntreContatos: cadence.diasIdealEntreContatos,
					diasMinimoEntreContatos: cadence.diasMinimoEntreContatos,
					ativo: cadence.ativo,
				});
			}
		}
	});

	return { data: { updated: input.cadences.length }, message: "Cadências atualizadas com sucesso." };
}
export type TUpdateSegmentCadencesOutput = Awaited<ReturnType<typeof updateSegmentCadences>>;

async function updateSegmentCadencesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!session.membership.organizacao.configuracao.preferencias.carteirasClientes?.habilitado)
		throw new createHttpError.Forbidden("O módulo de carteira de clientes não está habilitado para esta organização.");
	// Cadências valem para todas as carteiras: gestão da base (clientes.gerenciarBase).
	assertCanManageClientBase(session);

	const body = await request.json();
	const input = UpdateSegmentCadencesInputSchema.parse(body);
	const result = await updateSegmentCadences({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getSegmentCadencesRoute });
export const PUT = appApiHandler({ PUT: updateSegmentCadencesRoute });
