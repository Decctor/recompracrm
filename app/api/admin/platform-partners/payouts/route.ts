import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { platformPartnerCommissions, platformPartnerPayouts, platformPartners } from "@/services/drizzle/schema";
import { and, eq, isNull, lte } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { getPayoutDateForEligibility, getPreviousLocalMonthRange } from "@/lib/platform-partnerships/earnings";

const GetAdminPlatformPartnerPayoutsInputSchema = z.object({
	partnerId: z.string({ invalid_type_error: "Tipo invalido para ID do parceiro." }).optional().nullable(),
});
export type TGetAdminPlatformPartnerPayoutsInput = z.infer<typeof GetAdminPlatformPartnerPayoutsInputSchema>;

async function getAdminPlatformPartnerPayouts({ input }: { input: TGetAdminPlatformPartnerPayoutsInput }) {
	const conditions = [];
	if (input.partnerId) conditions.push(eq(platformPartnerPayouts.partnerId, input.partnerId));

	const payouts = await db.query.platformPartnerPayouts.findMany({
		where: and(...conditions),
		with: {
			partner: {
				columns: {
					id: true,
					nome: true,
					codigo: true,
					chavePix: true,
				},
			},
			commissions: {
				with: {
					organizacao: {
						columns: {
							id: true,
							nome: true,
							assinaturaPlano: true,
						},
					},
				},
			},
		},
		orderBy: (fields, { desc }) => desc(fields.dataInsercao),
	});

	return {
		data: {
			payouts,
		},
		message: "Payouts obtidos com sucesso.",
	};
}
export type TGetAdminPlatformPartnerPayoutsOutput = Awaited<ReturnType<typeof getAdminPlatformPartnerPayouts>>;

// Mês anterior no calendário de São Paulo: o mesmo corte que o painel do parceiro usa para o "próximo PIX".
function getPreviousMonthRange() {
	return getPreviousLocalMonthRange(new Date());
}

const CreateAdminPlatformPartnerPayoutInputSchema = z.object({
	partnerId: z.string({ required_error: "ID do parceiro nao informado.", invalid_type_error: "Tipo invalido para ID do parceiro." }),
	competenciaInicio: z
		.string({ invalid_type_error: "Tipo invalido para inicio da competencia." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	competenciaFim: z
		.string({ invalid_type_error: "Tipo invalido para fim da competencia." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	dataPrevista: z
		.string({ invalid_type_error: "Tipo invalido para data prevista." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
});
export type TCreateAdminPlatformPartnerPayoutInput = z.infer<typeof CreateAdminPlatformPartnerPayoutInputSchema>;

async function createAdminPlatformPartnerPayout({ input, adminUserId }: { input: TCreateAdminPlatformPartnerPayoutInput; adminUserId: string }) {
	const partner = await db.query.platformPartners.findFirst({
		where: eq(platformPartners.id, input.partnerId),
	});
	if (!partner) throw new createHttpError.NotFound("Parceiro nao encontrado.");

	const defaultRange = getPreviousMonthRange();
	const competenciaInicio = input.competenciaInicio ?? defaultRange.start;
	const competenciaFim = input.competenciaFim ?? defaultRange.end;

	const eligibleCommissions = await db.query.platformPartnerCommissions.findMany({
		where: and(
			eq(platformPartnerCommissions.partnerId, input.partnerId),
			eq(platformPartnerCommissions.status, "APROVADA"),
			isNull(platformPartnerCommissions.payoutId),
			lte(platformPartnerCommissions.dataElegibilidade, competenciaFim),
		),
	});
	if (eligibleCommissions.length === 0) throw new createHttpError.BadRequest("Nenhuma comissao elegivel para payout.");

	const valorTotalCentavos = eligibleCommissions.reduce((total, commission) => total + commission.valorComissaoCentavos, 0);

	const createdPayout = await db.transaction(async (tx) => {
		const [payout] = await tx
			.insert(platformPartnerPayouts)
			.values({
				partnerId: input.partnerId,
				status: "APROVADO",
				competenciaInicio,
				competenciaFim,
				valorTotalCentavos,
				metodo: "PIX",
				chavePixSnapshot: partner.chavePix,
				// Padrão: o dia de PIX que paga a competência (dia 10 do mês seguinte) — o mesmo que o painel do parceiro mostra.
				dataPrevista: input.dataPrevista ?? getPayoutDateForEligibility(competenciaFim),
				autorId: adminUserId,
			})
			.returning({ id: platformPartnerPayouts.id });
		if (!payout) throw new createHttpError.InternalServerError("Erro ao criar payout.");

		for (const commission of eligibleCommissions) {
			await tx.update(platformPartnerCommissions).set({ payoutId: payout.id }).where(eq(platformPartnerCommissions.id, commission.id));
		}

		return payout;
	});

	return {
		data: {
			payoutId: createdPayout.id,
			commissionsCount: eligibleCommissions.length,
			valorTotalCentavos,
		},
		message: "Payout criado com sucesso.",
	};
}
export type TCreateAdminPlatformPartnerPayoutOutput = Awaited<ReturnType<typeof createAdminPlatformPartnerPayout>>;

const UpdateAdminPlatformPartnerPayoutInputSchema = z.object({
	payoutId: z.string({ required_error: "ID do payout nao informado.", invalid_type_error: "Tipo invalido para ID do payout." }),
	status: z.enum(["RASCUNHO", "APROVADO", "PAGO", "CANCELADO"]),
	comprovanteUrl: z.string({ invalid_type_error: "Tipo invalido para comprovante." }).optional().nullable(),
	dataPagamento: z
		.string({ invalid_type_error: "Tipo invalido para data de pagamento." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	observacoes: z.string({ invalid_type_error: "Tipo invalido para observacoes." }).optional().nullable(),
});
export type TUpdateAdminPlatformPartnerPayoutInput = z.infer<typeof UpdateAdminPlatformPartnerPayoutInputSchema>;

async function updateAdminPlatformPartnerPayout({ input }: { input: TUpdateAdminPlatformPartnerPayoutInput }) {
	const payout = await db.query.platformPartnerPayouts.findFirst({
		where: eq(platformPartnerPayouts.id, input.payoutId),
		with: {
			commissions: true,
		},
	});
	if (!payout) throw new createHttpError.NotFound("Payout nao encontrado.");
	if (payout.status === "PAGO" && input.status !== "PAGO") throw new createHttpError.BadRequest("Payout já pago não volta de status.");
	if (input.status === "PAGO" && payout.status !== "APROVADO" && payout.status !== "PAGO") {
		throw new createHttpError.BadRequest("Só um payout aprovado pode ser marcado como pago.");
	}

	await db.transaction(async (tx) => {
		await tx
			.update(platformPartnerPayouts)
			.set({
				status: input.status,
				comprovanteUrl: input.comprovanteUrl ?? payout.comprovanteUrl,
				dataPagamento: input.status === "PAGO" ? (input.dataPagamento ?? new Date()) : input.dataPagamento,
				observacoes: input.observacoes ?? payout.observacoes,
				dataAtualizacao: new Date(),
			})
			.where(eq(platformPartnerPayouts.id, input.payoutId));

		if (input.status === "PAGO") {
			for (const commission of payout.commissions) {
				await tx.update(platformPartnerCommissions).set({ status: "PAGA" }).where(eq(platformPartnerCommissions.id, commission.id));
			}
		}
	});

	return {
		data: {
			payoutId: input.payoutId,
		},
		message: "Payout atualizado com sucesso.",
	};
}
export type TUpdateAdminPlatformPartnerPayoutOutput = Awaited<ReturnType<typeof updateAdminPlatformPartnerPayout>>;

async function getAdminPlatformPartnerPayoutsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const input = GetAdminPlatformPartnerPayoutsInputSchema.parse({
		partnerId: request.nextUrl.searchParams.get("partnerId"),
	});
	const result = await getAdminPlatformPartnerPayouts({ input });
	return NextResponse.json(result);
}

async function createAdminPlatformPartnerPayoutRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateAdminPlatformPartnerPayoutInputSchema.parse(payload);
	const result = await createAdminPlatformPartnerPayout({ input, adminUserId: session.user.id });
	return NextResponse.json(result, { status: 201 });
}

async function updateAdminPlatformPartnerPayoutRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateAdminPlatformPartnerPayoutInputSchema.parse(payload);
	const result = await updateAdminPlatformPartnerPayout({ input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getAdminPlatformPartnerPayoutsRoute });
export const POST = appApiHandler({ POST: createAdminPlatformPartnerPayoutRoute });
export const PUT = appApiHandler({ PUT: updateAdminPlatformPartnerPayoutRoute });
