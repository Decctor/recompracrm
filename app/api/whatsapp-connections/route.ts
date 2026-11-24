import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { removeMessageTemplatePhoneMetadata } from "@/lib/db-utils";
import { db } from "@/services/drizzle";
import { whatsappConnectionPhones, whatsappConnections } from "@/services/drizzle/schema/whatsapp-connections";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function getWhatsappConnection({ session }: { session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização para conectar o WhatsApp.");

	const whatsappConnectionsResults = await db.query.whatsappConnections.findMany({
		where: (fields, { eq }) => eq(fields.organizacaoId, userOrgId),
		with: {
			telefones: true,
		},
	});
	// `telefones` são só os ativos — é o que seletores, campanhas e templates enxergam. Os
	// desativados vêm à parte, para as configurações (reativar) e os filtros do hub (histórico).
	const connections = whatsappConnectionsResults.map(({ telefones, ...connection }) => ({
		...connection,
		telefones: telefones.filter((phone) => !phone.dataDesativacao),
		telefonesDesativados: telefones.filter((phone) => !!phone.dataDesativacao),
	}));
	return {
		data: connections,
		message: "Conexão do WhatsApp encontrada com sucesso.",
	};
}

export type TGetWhatsappConnectionsOutput = Awaited<ReturnType<typeof getWhatsappConnection>>;

async function getWhatsappConnectionRoute(_req: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const result = await getWhatsappConnection({ session });
	return NextResponse.json(result, { status: 200 });
}

async function deleteWhatsappConnection({ input, session }: { input: string; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;

	if (!userOrgId) throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização para deletar a conexão do WhatsApp.");
	const deletedWhatsappConnectionId = await db.transaction(async (tx) => {
		const connection = await tx
			.select({ id: whatsappConnections.id })
			.from(whatsappConnections)
			.where(and(eq(whatsappConnections.id, input), eq(whatsappConnections.organizacaoId, userOrgId)))
			.limit(1);
		if (!connection[0]) throw new createHttpError.NotFound("Conexão do WhatsApp não encontrada.");

		const phones = await tx
			.select({ id: whatsappConnectionPhones.id })
			.from(whatsappConnectionPhones)
			.where(eq(whatsappConnectionPhones.conexaoId, connection[0].id));

		const deletedWhatsappConnection = await tx
			.delete(whatsappConnections)
			.where(and(eq(whatsappConnections.id, connection[0].id), eq(whatsappConnections.organizacaoId, userOrgId)))
			.returning({ id: whatsappConnections.id });
		const deletedId = deletedWhatsappConnection[0]?.id;
		if (!deletedId) throw new createHttpError.NotFound("Conexão do WhatsApp não encontrada.");

		await removeMessageTemplatePhoneMetadata({
			trx: tx,
			organizationId: userOrgId,
			phoneIds: phones.map((phone) => phone.id),
		});
		return deletedId;
	});
	return {
		data: {
			deletedId: deletedWhatsappConnectionId,
		},
		message: "Conexão do WhatsApp deletada com sucesso.",
	};
}
export type TDeleteWhatsappConnectionOutput = Awaited<ReturnType<typeof deleteWhatsappConnection>>;
async function deleteWhatsappConnectionRoute(req: NextRequest) {
	console.log("REQ:", req);
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	console.log("PARAMS:", req.nextUrl.searchParams);
	const input = z
		.string({
			required_error: "ID da conexão do WhatsApp não informado.",
			invalid_type_error: "Tipo inválido para ID da conexão do WhatsApp.",
		})
		.parse(req.nextUrl.searchParams.get("id"));
	if (!input) throw new createHttpError.BadRequest("ID da conexão do WhatsApp não informado.");
	const result = await deleteWhatsappConnection({ input, session });
	await reconcileOnboardingCampaigns({ executor: db, organizationId: session.membership!.organizacao.id });
	return NextResponse.json(result, { status: 200 });
}

// ============================================================================
// ATENDIMENTO COM IA POR TELEFONE
// ============================================================================

const UpdateConnectionPhoneAiServiceInputSchema = z.object({
	phoneId: z.string({
		required_error: "ID do telefone da conexão não informado.",
		invalid_type_error: "Tipo inválido para o ID do telefone da conexão.",
	}),
	permitirAtendimentoIa: z.boolean({
		required_error: "Permissão de atendimento com IA não informada.",
		invalid_type_error: "Tipo inválido para a permissão de atendimento com IA.",
	}),
});
export type TUpdateConnectionPhoneAiServiceInput = z.infer<typeof UpdateConnectionPhoneAiServiceInputSchema>;

/**
 * Liga/desliga o atendimento por IA em um número.
 *
 * É o gate mais externo do agente (os webhooks checam antes de tudo). Até aqui só era
 * editável direto no banco.
 */
async function updateConnectionPhoneAiService({ input, session }: { input: TUpdateConnectionPhoneAiServiceInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização.");

	// O telefone precisa pertencer a uma conexão da organização da sessão.
	const phone = await db.query.whatsappConnectionPhones.findFirst({
		where: eq(whatsappConnectionPhones.id, input.phoneId),
		with: { conexao: { columns: { organizacaoId: true } } },
	});
	if (!phone || phone.conexao?.organizacaoId !== userOrgId) {
		throw new createHttpError.NotFound("Telefone de conexão não encontrado.");
	}

	await db
		.update(whatsappConnectionPhones)
		.set({ permitirAtendimentoIa: input.permitirAtendimentoIa })
		.where(eq(whatsappConnectionPhones.id, input.phoneId));

	return {
		data: { phoneId: input.phoneId, permitirAtendimentoIa: input.permitirAtendimentoIa },
		message: input.permitirAtendimentoIa ? "Atendimento com IA ativado para o número." : "Atendimento com IA desativado para o número.",
	};
}
export type TUpdateConnectionPhoneAiServiceOutput = Awaited<ReturnType<typeof updateConnectionPhoneAiService>>;

async function updateConnectionPhoneAiServiceRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!session.membership.permissoes.integracoes?.gerenciar) {
		throw new createHttpError.Forbidden("Você não tem permissão para gerenciar integrações.");
	}

	const input = UpdateConnectionPhoneAiServiceInputSchema.parse(await req.json());
	const result = await updateConnectionPhoneAiService({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({
	GET: getWhatsappConnectionRoute,
});

export const DELETE = appApiHandler({
	DELETE: deleteWhatsappConnectionRoute,
});

export const PATCH = appApiHandler({
	PATCH: updateConnectionPhoneAiServiceRoute,
});
import { reconcileOnboardingCampaigns } from "@/lib/onboarding/reconcile";
