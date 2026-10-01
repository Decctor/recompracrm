import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { createSignedPrivateFileUrl } from "@/lib/files-storage/private";
import { db } from "@/services/drizzle";
import { platformPartners } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetAdminPlatformPartnerDocumentInputSchema = z.object({
	partnerId: z.string({ required_error: "ID do parceiro não informado.", invalid_type_error: "Tipo inválido para o ID do parceiro." }),
	tipo: z.enum(["cpf", "cnpj"], { required_error: "Tipo do documento não informado.", invalid_type_error: "Tipo do documento inválido." }),
	// true: documento do pedido de alteração em análise, e não o do cadastro.
	pedido: z
		.string({ invalid_type_error: "Tipo inválido para pedido." })
		.optional()
		.nullable()
		.transform((value) => value === "true"),
});
export type TGetAdminPlatformPartnerDocumentInput = z.infer<typeof GetAdminPlatformPartnerDocumentInputSchema>;

async function getAdminPlatformPartnerDocument({ input }: { input: TGetAdminPlatformPartnerDocumentInput }) {
	const partner = await db.query.platformPartners.findFirst({
		where: eq(platformPartners.id, input.partnerId),
		columns: { arquivos: true, alteracaoSolicitada: true },
	});
	if (!partner) throw new createHttpError.NotFound("Parceiro não encontrado.");
	const path = input.pedido ? partner.alteracaoSolicitada?.arquivos?.[input.tipo] : partner.arquivos[input.tipo];
	if (!path) throw new createHttpError.NotFound("Documento não enviado.");

	// Validade curta: o link é aberto na hora pelo admin, não compartilhado.
	const url = await createSignedPrivateFileUrl({ path, expiresInSeconds: 5 * 60 });
	return {
		data: { url },
		message: "Documento obtido com sucesso.",
	};
}
export type TGetAdminPlatformPartnerDocumentOutput = Awaited<ReturnType<typeof getAdminPlatformPartnerDocument>>;

async function getAdminPlatformPartnerDocumentRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const input = GetAdminPlatformPartnerDocumentInputSchema.parse({
		partnerId: request.nextUrl.searchParams.get("partnerId"),
		tipo: request.nextUrl.searchParams.get("tipo"),
		pedido: request.nextUrl.searchParams.get("pedido"),
	});
	const result = await getAdminPlatformPartnerDocument({ input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getAdminPlatformPartnerDocumentRoute });
