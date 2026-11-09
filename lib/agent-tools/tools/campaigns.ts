import { createSimplifiedSearchCondition } from "@/lib/search";
import { db } from "@/services/drizzle";
import { campaigns } from "@/services/drizzle/schema";
import { CampaignTriggerTypeEnum } from "@/schemas/enums";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import z from "zod";
import { resolveOrganizationScope } from "../organization-scope";
import { defineAgentTool } from "../types";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;

const ListCampaignsInputSchema = z.object({
	termo: z.string({ invalid_type_error: "Tipo inválido para o termo de busca." }).optional().nullable(),
	gatilhoTipo: CampaignTriggerTypeEnum.optional().nullable(),
	apenasAtivas: z.boolean({ invalid_type_error: "Tipo inválido para apenas ativas." }).optional().nullable(),
	limite: z.number({ invalid_type_error: "Tipo inválido para o limite." }).int().positive().max(MAX_LIMIT).optional().nullable(),
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

export const listCampaignsTool = defineAgentTool({
	name: "list_campaigns",
	title: "Listar campanhas",
	scopes: ["agent:campaigns:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: ListCampaignsInputSchema,
	describe: (actor) =>
		[
			"Lista as campanhas cadastradas na organização: o que dispara cada uma, se está ativa, qual template de WhatsApp usa,",
			"quantas segmentações alcança e se gera cashback.",
			"É o índice das campanhas — devolve a configuração de cada uma, não os resultados de envio e conversão.",
			`Devolve no máximo ${MAX_LIMIT} campanhas por chamada, acompanhadas do total encontrado.`,
			actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const limite = input.limite ?? DEFAULT_LIMIT;

		const conditions: SQL[] = [eq(campaigns.organizacaoId, organizacaoId)];

		const termo = input.termo?.trim();
		if (termo && termo.length >= 2) conditions.push(createSimplifiedSearchCondition(campaigns.titulo, termo));
		if (input.gatilhoTipo) conditions.push(eq(campaigns.gatilhoTipo, input.gatilhoTipo));
		if (input.apenasAtivas) conditions.push(eq(campaigns.ativo, true));

		const where = and(...conditions);

		const [rows, totalResult] = await Promise.all([
			db.query.campaigns.findMany({
				where,
				orderBy: [desc(campaigns.dataInsercao)],
				limit: limite,
				columns: {
					id: true,
					titulo: true,
					descricao: true,
					ativo: true,
					gatilhoTipo: true,
					execucaoAgendadaValor: true,
					execucaoAgendadaMedida: true,
					execucaoAgendadaDirecao: true,
					permitirRecorrencia: true,
					cashbackGeracaoAtivo: true,
					cashbackGeracaoTipo: true,
					cashbackGeracaoValor: true,
					dataInsercao: true,
				},
				with: {
					segmentacoes: { columns: { id: true } },
					whatsappTemplate: { columns: { nome: true } },
				},
			}),
			db.select({ total: count() }).from(campaigns).where(where),
		]);

		const total = totalResult[0]?.total ?? 0;

		return {
			total,
			exibindo: rows.length,
			truncado: total > rows.length,
			campanhas: rows.map((campaign) => ({
				id: campaign.id,
				titulo: campaign.titulo,
				descricao: campaign.descricao,
				ativo: campaign.ativo,
				gatilhoTipo: campaign.gatilhoTipo,
				agendamento: {
					valor: campaign.execucaoAgendadaValor,
					medida: campaign.execucaoAgendadaMedida,
					direcao: campaign.execucaoAgendadaDirecao,
				},
				permitirRecorrencia: campaign.permitirRecorrencia,
				templateWhatsapp: campaign.whatsappTemplate?.nome,
				qtdeSegmentacoes: campaign.segmentacoes?.length ?? 0,
				cashback: campaign.cashbackGeracaoAtivo ? { tipo: campaign.cashbackGeracaoTipo, valor: campaign.cashbackGeracaoValor } : undefined,
				dataInsercao: campaign.dataInsercao,
			})),
		};
	},
});
