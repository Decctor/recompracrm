import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { isPlatformPartnerDocumentPathOwnedBy } from "@/lib/platform-partnerships/documents";
import { PlatformPartnerPixKeyTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { platformPartners } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

/**
 * Pedido de alteração de dados de um parceiro ativo. Chave PIX, contato e documento mudam com
 * aprovação do financeiro — trocar a chave sem ninguém ver é o golpe clássico de desvio de PIX.
 * Nome e CPF/CNPJ não mudam por aqui: são a identidade do cadastro.
 */
const CreatePlatformPartnerChangeRequestInputSchema = z
	.object({
		email: z.string({ invalid_type_error: "Tipo inválido para o email." }).trim().email("Email inválido.").optional().nullable(),
		telefone: z.string({ invalid_type_error: "Tipo inválido para o telefone." }).trim().min(14, "Informe um telefone com DDD.").optional().nullable(),
		chavePix: z.string({ invalid_type_error: "Tipo inválido para a chave PIX." }).trim().min(1, "Informe a nova chave PIX.").optional().nullable(),
		chavePixTipo: PlatformPartnerPixKeyTypeEnum.optional().nullable(),
		titularPixConfirmado: z.boolean({ invalid_type_error: "Tipo inválido para a confirmação do titular." }).optional().nullable(),
		documento: z.string({ invalid_type_error: "Tipo inválido para o documento." }).optional().nullable(),
		motivo: z
			.string({ invalid_type_error: "Tipo inválido para o motivo." })
			.trim()
			.max(500, "O motivo pode ter até 500 caracteres.")
			.optional()
			.nullable(),
	})
	.superRefine((input, ctx) => {
		if (input.chavePix && !input.chavePixTipo)
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["chavePixTipo"], message: "Informe o tipo da nova chave PIX." });
		if (input.chavePix && input.titularPixConfirmado !== true)
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["titularPixConfirmado"], message: "Confirme que a nova chave PIX está no seu nome." });
	});
export type TCreatePlatformPartnerChangeRequestInput = z.infer<typeof CreatePlatformPartnerChangeRequestInputSchema>;

async function getActivePartner(userId: string) {
	const partner = await db.query.platformPartners.findFirst({
		where: eq(platformPartners.usuarioId, userId),
		columns: { id: true, status: true, email: true, telefone: true, chavePix: true, tipoPessoa: true, alteracaoSolicitada: true },
	});
	if (!partner || partner.status !== "ATIVO") throw new createHttpError.NotFound("Cadastro de parceiro ativo não encontrado.");
	return partner;
}

async function createPlatformPartnerChangeRequest({ input, userId }: { input: TCreatePlatformPartnerChangeRequestInput; userId: string }) {
	const partner = await getActivePartner(userId);
	if (partner.alteracaoSolicitada && !partner.alteracaoSolicitada.motivoRecusa) {
		throw new createHttpError.Conflict("Você já tem um pedido de alteração em análise. Cancele-o para enviar outro.");
	}
	if (input.documento && !isPlatformPartnerDocumentPathOwnedBy({ path: input.documento, userId })) {
		throw new createHttpError.BadRequest("Documento inválido. Envie o arquivo novamente.");
	}

	const alteracao = {
		...(input.email && input.email !== partner.email ? { email: input.email } : {}),
		...(input.telefone && input.telefone !== partner.telefone ? { telefone: input.telefone } : {}),
		...(input.chavePix && input.chavePix !== partner.chavePix ? { chavePix: input.chavePix, chavePixTipo: input.chavePixTipo ?? undefined } : {}),
		...(input.documento ? { arquivos: partner.tipoPessoa === "PESSOA_JURIDICA" ? { cnpj: input.documento } : { cpf: input.documento } } : {}),
	};
	if (Object.keys(alteracao).length === 0) throw new createHttpError.BadRequest("Nenhuma alteração em relação aos dados atuais.");

	await db
		.update(platformPartners)
		.set({
			alteracaoSolicitada: { ...alteracao, ...(input.motivo ? { motivo: input.motivo } : {}) },
			dataSolicitacaoAlteracao: new Date(),
			dataAtualizacao: new Date(),
		})
		.where(eq(platformPartners.id, partner.id));

	return {
		data: { partnerId: partner.id },
		message: "Pedido de alteração enviado. O financeiro avisa por email quando analisar.",
	};
}
export type TCreatePlatformPartnerChangeRequestOutput = Awaited<ReturnType<typeof createPlatformPartnerChangeRequest>>;

/** Cancela o pedido em análise ou dispensa o aviso de pedido recusado. */
async function deletePlatformPartnerChangeRequest({ userId }: { userId: string }) {
	const partner = await getActivePartner(userId);
	if (!partner.alteracaoSolicitada) throw new createHttpError.NotFound("Nenhum pedido de alteração encontrado.");
	await db
		.update(platformPartners)
		.set({ alteracaoSolicitada: null, dataSolicitacaoAlteracao: null, dataAtualizacao: new Date() })
		.where(eq(platformPartners.id, partner.id));
	return { data: { partnerId: partner.id }, message: "Pedido de alteração cancelado." };
}
export type TDeletePlatformPartnerChangeRequestOutput = Awaited<ReturnType<typeof deletePlatformPartnerChangeRequest>>;

async function createPlatformPartnerChangeRequestRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = CreatePlatformPartnerChangeRequestInputSchema.parse(await request.json());
	const result = await createPlatformPartnerChangeRequest({ input, userId: session.user.id });
	return NextResponse.json(result, { status: 201 });
}

async function deletePlatformPartnerChangeRequestRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const result = await deletePlatformPartnerChangeRequest({ userId: session.user.id });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: createPlatformPartnerChangeRequestRoute });
export const DELETE = appApiHandler({ DELETE: deletePlatformPartnerChangeRequestRoute });
