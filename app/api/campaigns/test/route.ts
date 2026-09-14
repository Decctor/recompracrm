import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { loadPromotionProductCandidates, resolvePromotionMetadataByClientId } from "@/lib/campaigns/promotion-suggestion";
import { processSingleInteractionImmediately } from "@/lib/interactions/process-single-interaction";
import type { TInteractionContextMetadados } from "@/lib/message-templates";
import { db } from "@/services/drizzle";
import { clients, interactions } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const TestCampaignInputSchema = z.object({
	campaignId: z.string({
		required_error: "ID da campanha não informado.",
		invalid_type_error: "Tipo não válido para o ID da campanha.",
	}),
	clientIds: z
		.array(
			z.string({
				required_error: "ID do cliente não informado.",
				invalid_type_error: "Tipo não válido para o ID do cliente.",
			}),
		)
		.min(1, "Selecione pelo menos um cliente para o teste."),
});
export type TTestCampaignInput = z.infer<typeof TestCampaignInputSchema>;

async function testCampaign({
	input,
	userOrgId,
	userId,
}: {
	input: TTestCampaignInput;
	userOrgId: string;
	userId: string;
}) {
	const campaign = await db.query.campaigns.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.campaignId), eq(fields.organizacaoId, userOrgId)),
		with: {
			whatsappTemplate: true,
			whatsappConexaoTelefone: {
				with: {
					conexao: {
						columns: {
							tipoConexao: true,
							token: true,
							gatewaySessaoId: true,
						},
					},
				},
			},
		},
	});

	if (!campaign) throw new createHttpError.NotFound("Campanha não encontrada.");
	if (!campaign.whatsappTemplate) throw new createHttpError.BadRequest("Template de mensagem não encontrado para essa campanha.");

	const whatsappConnection = campaign.whatsappConexaoTelefone?.conexao ?? null;

	const selectedClients = await db.query.clients.findMany({
		where: and(eq(clients.organizacaoId, userOrgId), inArray(clients.id, input.clientIds)),
		columns: {
			id: true,
			nome: true,
			telefone: true,
			email: true,
			analiseRFMTitulo: true,
			metadataProdutoMaisCompradoId: true,
			metadataGrupoProdutoMaisComprado: true,
			metadataProdutoSugeridoId: true,
		},
	});

	if (selectedClients.length === 0) throw new createHttpError.BadRequest("Nenhum cliente válido encontrado.");

	// Campanhas de promoção resolvem o produto sugerido por cliente com o mesmo helper do cron,
	// para que o teste renderize exatamente o que o disparo real renderizaria.
	let promotionMetadataByClientId = new Map<string, TInteractionContextMetadados>();
	if (campaign.gatilhoTipo === "PROMOCAO-PRODUTOS") {
		const promotionCandidates = await loadPromotionProductCandidates({
			organizationId: userOrgId,
			promotionProducts: campaign.gatilhoPromocaoProdutos ?? [],
		});
		if (promotionCandidates.length === 0) {
			throw new createHttpError.BadRequest("Nenhum produto disponível na lista da promoção (produtos removidos ou inativados).");
		}
		promotionMetadataByClientId = await resolvePromotionMetadataByClientId({
			organizationId: userOrgId,
			clientIds: selectedClients.map((client) => client.id),
			candidates: promotionCandidates,
		});
	}

	const results: { clientId: string; clientName: string; success: boolean; error?: string; channelsAttempted: string[]; channelsSkipped: string[]; channelsSent: string[]; channelErrors: Record<string, string> }[] = [];

	for (const client of selectedClients) {
		if (!client.telefone && !client.email) {
			results.push({ clientId: client.id, clientName: client.nome, success: false, error: "Cliente não possui telefone nem e-mail.", channelsAttempted: [], channelsSkipped: ["WHATSAPP: cliente sem telefone", "EMAIL: cliente sem email"], channelsSent: [], channelErrors: {} });
			continue;
		}

		const [insertedInteraction] = await db
			.insert(interactions)
			.values({
				organizacaoId: userOrgId,
				clienteId: client.id,
				campanhaId: campaign.id,
				titulo: `[TESTE] ${campaign.titulo}`,
				descricao: `Envio de teste da campanha "${campaign.titulo}"`,
				tipo: "ENVIO-MENSAGEM",
				autorId: userId,
				agendamentoDataReferencia: new Date().toISOString(),
				agendamentoBlocoReferencia: "09:00",
				metadados: promotionMetadataByClientId.get(client.id) ?? null,
			})
			.returning({ id: interactions.id });

		if (!insertedInteraction) {
			results.push({ clientId: client.id, clientName: client.nome, success: false, error: "Falha ao criar interação de teste.", channelsAttempted: [], channelsSkipped: [], channelsSent: [], channelErrors: {} });
			continue;
		}

		const processingResult = await processSingleInteractionImmediately({
			interactionId: insertedInteraction.id,
			organizationId: userOrgId,
			client: {
				id: client.id,
				nome: client.nome,
				telefone: client.telefone,
				email: client.email,
				analiseRFMTitulo: client.analiseRFMTitulo,
				metadataProdutoMaisCompradoId: client.metadataProdutoMaisCompradoId,
				metadataGrupoProdutoMaisComprado: client.metadataGrupoProdutoMaisComprado,
				metadataProdutoSugeridoId: client.metadataProdutoSugeridoId,
			},
			campaign: {
				autorId: userId,
				whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId ?? null,
				whatsappTemplate: campaign.whatsappTemplate,
			},
			whatsappToken: whatsappConnection?.tipoConexao === "META_CLOUD_API" ? (whatsappConnection.token ?? undefined) : undefined,
			whatsappSessionId: whatsappConnection?.tipoConexao === "INTERNAL_GATEWAY" ? (whatsappConnection.gatewaySessaoId ?? undefined) : undefined,
			contextMetadados: promotionMetadataByClientId.get(client.id),
			weeklyLimitMode: "skip",
		});

		results.push({
			clientId: client.id,
			clientName: client.nome,
			success: processingResult.success,
			error: processingResult.error,
			channelsAttempted: processingResult.channelsAttempted ?? [],
			channelsSkipped: processingResult.channelsSkipped ?? [],
			channelsSent: processingResult.channelsSent ?? [],
			channelErrors: processingResult.channelErrors ?? {},
		});
	}

	const successCount = results.filter((r) => r.success).length;
	const failCount = results.filter((r) => !r.success).length;

	return {
		data: { results },
		message:
			failCount === 0
				? `Teste enviado com sucesso para ${successCount} cliente(s).`
				: `${successCount} enviado(s), ${failCount} falha(s).`,
	};
}
export type TTestCampaignOutput = Awaited<ReturnType<typeof testCampaign>>;

const testCampaignRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const body = await request.json();
	const input = TestCampaignInputSchema.parse(body);
	const result = await testCampaign({ input, userOrgId, userId: session.user.id });

	return NextResponse.json(result);
};

export const POST = appApiHandler({ POST: testCampaignRoute });
