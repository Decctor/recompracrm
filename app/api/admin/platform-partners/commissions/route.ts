import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { platformPartnerCommissions } from "@/services/drizzle/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetAdminPlatformPartnerCommissionsInputSchema = z.object({
	partnerId: z.string({ invalid_type_error: "Tipo invalido para ID do parceiro." }).optional().nullable(),
	status: z.string({ invalid_type_error: "Tipo invalido para status." }).optional().nullable(),
});
export type TGetAdminPlatformPartnerCommissionsInput = z.infer<typeof GetAdminPlatformPartnerCommissionsInputSchema>;

async function getAdminPlatformPartnerCommissions({ input }: { input: TGetAdminPlatformPartnerCommissionsInput }) {
	const conditions = [];
	if (input.partnerId) conditions.push(eq(platformPartnerCommissions.partnerId, input.partnerId));
	if (input.status) conditions.push(eq(platformPartnerCommissions.status, input.status as typeof platformPartnerCommissions.$inferSelect.status));

	const commissions = await db.query.platformPartnerCommissions.findMany({
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
			organizacao: {
				columns: {
					id: true,
					nome: true,
					assinaturaPlano: true,
				},
			},
			payout: true,
		},
		orderBy: (fields, { desc }) => desc(fields.dataInsercao),
	});

	return {
		data: {
			commissions,
		},
		message: "Comissoes obtidas com sucesso.",
	};
}
export type TGetAdminPlatformPartnerCommissionsOutput = Awaited<ReturnType<typeof getAdminPlatformPartnerCommissions>>;

const UpdateAdminPlatformPartnerCommissionInputSchema = z.object({
	commissionIds: z
		.array(z.string({ invalid_type_error: "Tipo invalido para ID da comissao." }), { required_error: "Comissões não informadas." })
		.min(1, "Selecione ao menos uma comissão."),
	// PAGA só acontece pelo payout; aqui o admin aprova, cancela ou volta para pendente.
	status: z.enum(["PENDENTE", "APROVADA", "CANCELADA"]),
});
export type TUpdateAdminPlatformPartnerCommissionInput = z.infer<typeof UpdateAdminPlatformPartnerCommissionInputSchema>;

async function updateAdminPlatformPartnerCommission({
	input,
	adminUserId,
}: {
	input: TUpdateAdminPlatformPartnerCommissionInput;
	adminUserId: string;
}) {
	// Comissão paga não muda de status por aqui: já saiu no PIX.
	const updated = await db
		.update(platformPartnerCommissions)
		.set({
			status: input.status,
			dataAprovacao: input.status === "APROVADA" ? new Date() : undefined,
			aprovadoPorId: input.status === "APROVADA" ? adminUserId : undefined,
		})
		.where(and(inArray(platformPartnerCommissions.id, input.commissionIds), ne(platformPartnerCommissions.status, "PAGA")))
		.returning({ id: platformPartnerCommissions.id });
	if (updated.length === 0) throw new createHttpError.NotFound("Nenhuma comissão elegível encontrada.");

	return {
		data: {
			commissionIds: updated.map((commission) => commission.id),
		},
		message: updated.length === 1 ? "Comissão atualizada com sucesso." : `${updated.length} comissões atualizadas com sucesso.`,
	};
}
export type TUpdateAdminPlatformPartnerCommissionOutput = Awaited<ReturnType<typeof updateAdminPlatformPartnerCommission>>;

const CreateAdminPlatformPartnerCommissionAdjustmentInputSchema = z.object({
	commissionId: z.string({ required_error: "ID da comissao original nao informado.", invalid_type_error: "Tipo invalido para ID da comissao." }),
	valorComissaoCentavos: z.number({
		required_error: "Valor do ajuste nao informado.",
		invalid_type_error: "Tipo invalido para valor do ajuste.",
	}),
	ajusteMotivo: z.string({ required_error: "Motivo do ajuste nao informado.", invalid_type_error: "Tipo invalido para motivo do ajuste." }),
});
export type TCreateAdminPlatformPartnerCommissionAdjustmentInput = z.infer<typeof CreateAdminPlatformPartnerCommissionAdjustmentInputSchema>;

async function createAdminPlatformPartnerCommissionAdjustment({ input }: { input: TCreateAdminPlatformPartnerCommissionAdjustmentInput }) {
	const originalCommission = await db.query.platformPartnerCommissions.findFirst({
		where: eq(platformPartnerCommissions.id, input.commissionId),
	});
	if (!originalCommission) throw new createHttpError.NotFound("Comissao original nao encontrada.");

	const [createdAdjustment] = await db
		.insert(platformPartnerCommissions)
		.values({
			partnerId: originalCommission.partnerId,
			referralId: originalCommission.referralId,
			organizacaoId: originalCommission.organizacaoId,
			numeroInvoiceAssinatura: originalCommission.numeroInvoiceAssinatura,
			valorInvoiceBrutoCentavos: 0,
			valorConsultoriaCentavos: 0,
			valorBaseComissionavelCentavos: 0,
			percentualComissaoBps: 0,
			valorComissaoCentavos: input.valorComissaoCentavos,
			regraVersao: "AJUSTE_MANUAL",
			regraSnapshot: {
				origin: "ADMIN_ADJUSTMENT",
			},
			invoiceSnapshot: {},
			ajusteOrigemCommissionId: originalCommission.id,
			ajusteMotivo: input.ajusteMotivo,
			status: "APROVADA",
			dataElegibilidade: new Date(),
			dataAprovacao: new Date(),
		})
		.returning({ id: platformPartnerCommissions.id });
	if (!createdAdjustment) throw new createHttpError.InternalServerError("Erro ao criar ajuste.");

	return {
		data: {
			commissionId: createdAdjustment.id,
		},
		message: "Ajuste criado com sucesso.",
	};
}
export type TCreateAdminPlatformPartnerCommissionAdjustmentOutput = Awaited<ReturnType<typeof createAdminPlatformPartnerCommissionAdjustment>>;

async function getAdminPlatformPartnerCommissionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const input = GetAdminPlatformPartnerCommissionsInputSchema.parse({
		partnerId: request.nextUrl.searchParams.get("partnerId"),
		status: request.nextUrl.searchParams.get("status"),
	});
	const result = await getAdminPlatformPartnerCommissions({ input });
	return NextResponse.json(result);
}

async function updateAdminPlatformPartnerCommissionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateAdminPlatformPartnerCommissionInputSchema.parse(payload);
	const result = await updateAdminPlatformPartnerCommission({ input, adminUserId: session.user.id });
	return NextResponse.json(result);
}

async function createAdminPlatformPartnerCommissionAdjustmentRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateAdminPlatformPartnerCommissionAdjustmentInputSchema.parse(payload);
	const result = await createAdminPlatformPartnerCommissionAdjustment({ input });
	return NextResponse.json(result, { status: 201 });
}

export const GET = appApiHandler({ GET: getAdminPlatformPartnerCommissionsRoute });
export const PUT = appApiHandler({ PUT: updateAdminPlatformPartnerCommissionRoute });
export const POST = appApiHandler({ POST: createAdminPlatformPartnerCommissionAdjustmentRoute });
