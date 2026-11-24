import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { campaigns, whatsappConnectionPhones, whatsappConnections } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

/**
 * Soft delete de um número da conexão Meta. Desativar mantém a linha — as conversas continuam
 * ligadas ao número no hub — e tira o número da checagem de saúde (sem e-mails de alerta), dos
 * seletores, do canal, da IA e dos envios. Apagar a conexão, ao contrário, derruba todos os
 * números dela e solta as conversas.
 *
 * Reconectar o número na Meta reativa sozinho (callback do OAuth); o DELETE daqui é o desfazer.
 */
const PhoneDeactivationInputSchema = z.object({
	phoneId: z.string({ required_error: "Telefone não informado.", invalid_type_error: "Tipo inválido para o telefone." }),
});
export type TDeactivateWhatsappPhoneInput = z.infer<typeof PhoneDeactivationInputSchema>;
export type TReactivateWhatsappPhoneInput = z.infer<typeof PhoneDeactivationInputSchema>;

async function getOrganizationMetaPhone({ phoneId, organizationId }: { phoneId: string; organizationId: string }) {
	const [phone] = await db
		.select({
			id: whatsappConnectionPhones.id,
			dataDesativacao: whatsappConnectionPhones.dataDesativacao,
			tipoConexao: whatsappConnections.tipoConexao,
		})
		.from(whatsappConnectionPhones)
		.innerJoin(whatsappConnections, eq(whatsappConnections.id, whatsappConnectionPhones.conexaoId))
		.where(and(eq(whatsappConnectionPhones.id, phoneId), eq(whatsappConnections.organizacaoId, organizationId)))
		.limit(1);
	if (!phone) throw new createHttpError.NotFound("Telefone não encontrado nesta organização.");
	if (phone.tipoConexao !== "META_CLOUD_API") {
		throw new createHttpError.BadRequest("Só números da conexão oficial (Meta) podem ser desativados. No Gateway, desconecte a sessão.");
	}
	return phone;
}

async function deactivateWhatsappPhone({ input, session }: { input: TDeactivateWhatsappPhoneInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const phone = await getOrganizationMetaPhone({ phoneId: input.phoneId, organizationId });
	if (phone.dataDesativacao) return { data: { phoneId: phone.id }, message: "Este número já está desativado." };

	// Campanha ativa presa a um número desativado pararia de entregar sem avisar ninguém.
	const activeCampaigns = await db
		.select({ titulo: campaigns.titulo })
		.from(campaigns)
		.where(and(eq(campaigns.organizacaoId, organizationId), eq(campaigns.whatsappConexaoTelefoneId, phone.id), eq(campaigns.ativo, true)));
	if (activeCampaigns.length > 0) {
		const titles = activeCampaigns.map((campaign) => `"${campaign.titulo}"`).join(", ");
		throw new createHttpError.Conflict(
			`Há ${activeCampaigns.length} campanha(s) ativa(s) usando este número: ${titles}. Troque o número delas ou desative-as antes.`,
		);
	}

	await db
		.update(whatsappConnectionPhones)
		.set({ dataDesativacao: new Date(), desativacaoAutorId: session.user.id, permitirAtendimentoIa: false })
		.where(eq(whatsappConnectionPhones.id, phone.id));

	return {
		data: { phoneId: phone.id },
		message: "Número desativado. As conversas continuam no hub e os alertas deste número param.",
	};
}
export type TDeactivateWhatsappPhoneOutput = Awaited<ReturnType<typeof deactivateWhatsappPhone>>;

async function reactivateWhatsappPhone({ input, session }: { input: TReactivateWhatsappPhoneInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const phone = await getOrganizationMetaPhone({ phoneId: input.phoneId, organizationId });
	if (!phone.dataDesativacao) return { data: { phoneId: phone.id }, message: "Este número já está ativo." };

	await db.update(whatsappConnectionPhones).set({ dataDesativacao: null, desativacaoAutorId: null }).where(eq(whatsappConnectionPhones.id, phone.id));

	return {
		data: { phoneId: phone.id },
		message: "Número reativado. Se a Meta ainda recusar o acesso, a próxima checagem avisa para reconectar.",
	};
}
export type TReactivateWhatsappPhoneOutput = Awaited<ReturnType<typeof reactivateWhatsappPhone>>;

async function requireIntegrationManager() {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!session.membership.permissoes.integracoes?.gerenciar) {
		throw new createHttpError.Forbidden("Você não tem permissão para gerenciar integrações.");
	}
	return session;
}

async function deactivateWhatsappPhoneRoute(request: NextRequest) {
	const session = await requireIntegrationManager();
	const input = PhoneDeactivationInputSchema.parse(await request.json());
	const result = await deactivateWhatsappPhone({ input, session });
	return NextResponse.json(result);
}

async function reactivateWhatsappPhoneRoute(request: NextRequest) {
	const session = await requireIntegrationManager();
	const input = PhoneDeactivationInputSchema.parse({ phoneId: request.nextUrl.searchParams.get("phoneId") });
	const result = await reactivateWhatsappPhone({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: deactivateWhatsappPhoneRoute });
export const DELETE = appApiHandler({ DELETE: reactivateWhatsappPhoneRoute });
