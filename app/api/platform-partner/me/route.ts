import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { platformPartners } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

async function getPlatformPartnerMe({ userId }: { userId: string }) {
	const partner = await db.query.platformPartners.findFirst({
		where: eq(platformPartners.usuarioId, userId),
		columns: {
			id: true,
			status: true,
			codigo: true,
			nome: true,
			email: true,
			telefone: true,
			tipoPessoa: true,
			cpfCnpj: true,
			chavePix: true,
			chavePixTipo: true,
			dataConfirmacaoTitularPix: true,
			arquivos: true,
			aceiteTermos: true,
			dataAceiteTermos: true,
			mensagemDivulgacao: true,
			dataCartaoVisualizado: true,
			dataAprovacao: true,
			dataInsercao: true,
		},
	});

	return {
		data: {
			partner,
		},
		message: partner ? "Parceiro encontrado com sucesso." : "Cadastro de parceiro não encontrado.",
	};
}
export type TGetPlatformPartnerMeOutput = Awaited<ReturnType<typeof getPlatformPartnerMe>>;

async function getPlatformPartnerMeRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const result = await getPlatformPartnerMe({ userId: session.user.id });
	return NextResponse.json(result);
}

const UpdatePlatformPartnerMeInputSchema = z.object({
	// null volta para a mensagem padrão do kit de divulgação.
	mensagemDivulgacao: z
		.string({ invalid_type_error: "Tipo inválido para a mensagem de divulgação." })
		.trim()
		.max(1000, "A mensagem de divulgação pode ter até 1000 caracteres.")
		.optional()
		.nullable()
		.transform((value) => (value ? value : value === undefined ? undefined : null)),
	markCardAsSeen: z.boolean({ invalid_type_error: "Tipo inválido para a visualização do cartão." }).optional(),
});
export type TUpdatePlatformPartnerMeInput = z.infer<typeof UpdatePlatformPartnerMeInputSchema>;

async function updatePlatformPartnerMe({ input, userId }: { input: TUpdatePlatformPartnerMeInput; userId: string }) {
	const partner = await db.query.platformPartners.findFirst({
		where: eq(platformPartners.usuarioId, userId),
		columns: { id: true, status: true, dataCartaoVisualizado: true },
	});
	if (!partner) throw new createHttpError.NotFound("Cadastro de parceiro não encontrado.");
	if (partner.status !== "ATIVO") throw new createHttpError.Forbidden("Cadastro de parceiro ainda não está ativo.");

	await db
		.update(platformPartners)
		.set({
			...(input.mensagemDivulgacao !== undefined ? { mensagemDivulgacao: input.mensagemDivulgacao } : {}),
			// Só a primeira visualização conta: reabrir não move a data.
			...(input.markCardAsSeen && !partner.dataCartaoVisualizado ? { dataCartaoVisualizado: new Date() } : {}),
			dataAtualizacao: new Date(),
		})
		.where(eq(platformPartners.id, partner.id));

	return {
		data: { partnerId: partner.id },
		message: "Cadastro de parceiro atualizado com sucesso.",
	};
}
export type TUpdatePlatformPartnerMeOutput = Awaited<ReturnType<typeof updatePlatformPartnerMe>>;

async function updatePlatformPartnerMeRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = UpdatePlatformPartnerMeInputSchema.parse(await request.json());
	const result = await updatePlatformPartnerMe({ input, userId: session.user.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({
	GET: getPlatformPartnerMeRoute,
});

export const PUT = appApiHandler({
	PUT: updatePlatformPartnerMeRoute,
});
