import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { notifyPlatformPartnerChangeRequestResolved } from "@/lib/platform-partnerships/notifications";
import { db } from "@/services/drizzle";
import { platformPartners } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const ResolveAdminPlatformPartnerChangeRequestInputSchema = z
	.object({
		partnerId: z.string({ required_error: "ID do parceiro não informado.", invalid_type_error: "Tipo inválido para o ID do parceiro." }),
		aprovar: z.boolean({ required_error: "Decisão não informada.", invalid_type_error: "Tipo inválido para a decisão." }),
		motivoRecusa: z.string({ invalid_type_error: "Tipo inválido para o motivo da recusa." }).trim().max(1000).optional().nullable(),
	})
	.refine((input) => input.aprovar || !!input.motivoRecusa, { message: "Informe o motivo da recusa para o parceiro.", path: ["motivoRecusa"] });
export type TResolveAdminPlatformPartnerChangeRequestInput = z.infer<typeof ResolveAdminPlatformPartnerChangeRequestInputSchema>;

/** Aprova (aplica os campos pedidos) ou recusa (mantém o pedido com o motivo, para o parceiro ver). */
async function resolveAdminPlatformPartnerChangeRequest({ input }: { input: TResolveAdminPlatformPartnerChangeRequestInput }) {
	const partner = await db.query.platformPartners.findFirst({
		where: eq(platformPartners.id, input.partnerId),
		columns: { id: true, nome: true, email: true, arquivos: true, alteracaoSolicitada: true, dataSolicitacaoAlteracao: true },
	});
	if (!partner) throw new createHttpError.NotFound("Parceiro não encontrado.");
	const alteracao = partner.alteracaoSolicitada;
	if (!alteracao || alteracao.motivoRecusa) throw new createHttpError.BadRequest("Este parceiro não tem pedido de alteração em análise.");

	const now = new Date();
	if (input.aprovar) {
		await db
			.update(platformPartners)
			.set({
				...(alteracao.email ? { email: alteracao.email } : {}),
				...(alteracao.telefone ? { telefone: alteracao.telefone } : {}),
				...(alteracao.chavePix
					? {
							chavePix: alteracao.chavePix,
							chavePixTipo: alteracao.chavePixTipo ?? null,
							dataConfirmacaoTitularPix: partner.dataSolicitacaoAlteracao ?? now,
						}
					: {}),
				...(alteracao.arquivos ? { arquivos: { ...partner.arquivos, ...alteracao.arquivos } } : {}),
				alteracaoSolicitada: null,
				dataSolicitacaoAlteracao: null,
				dataAtualizacao: now,
			})
			.where(eq(platformPartners.id, partner.id));
	} else {
		await db
			.update(platformPartners)
			.set({ alteracaoSolicitada: { ...alteracao, motivoRecusa: input.motivoRecusa ?? "" }, dataAtualizacao: now })
			.where(eq(platformPartners.id, partner.id));
	}

	// Com email trocado, o aviso vai para o endereço novo: é o que o parceiro passou a usar.
	notifyPlatformPartnerChangeRequestResolved(
		{ nome: partner.nome, email: input.aprovar && alteracao.email ? alteracao.email : partner.email },
		{ aprovada: input.aprovar, motivoRecusa: input.motivoRecusa },
	);

	return {
		data: { partnerId: partner.id },
		message: input.aprovar ? "Alteração aprovada e aplicada." : "Alteração recusada.",
	};
}
export type TResolveAdminPlatformPartnerChangeRequestOutput = Awaited<ReturnType<typeof resolveAdminPlatformPartnerChangeRequest>>;

async function resolveAdminPlatformPartnerChangeRequestRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");
	const input = ResolveAdminPlatformPartnerChangeRequestInputSchema.parse(await request.json());
	const result = await resolveAdminPlatformPartnerChangeRequest({ input });
	return NextResponse.json(result);
}

export const PUT = appApiHandler({ PUT: resolveAdminPlatformPartnerChangeRequestRoute });
