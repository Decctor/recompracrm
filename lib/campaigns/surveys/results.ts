import { CAMPAIGN_SENT_INTERACTION_STATUSES } from "@/lib/campaigns/utils";
import { getSurveyButtons } from "@/lib/message-templates/surveys";
import type { TSurveyReplySourceEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { campaigns, interactions } from "@/services/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";

/**
 * Resultados de uma pesquisa (docs/dev-planning/survey-campaigns-plan.md §8.1), agregados sobre
 * as interações da campanha: as respostas vivem em `metadados.pesquisaRespostas`, ao lado do
 * rastreio de entrega do próprio envio. Sem sessão/request aqui: a organização entra por parâmetro.
 */

export const GetCampaignSurveyResultsInputSchema = z.object({
	campaignId: z.string({
		required_error: "ID da campanha não informado.",
		invalid_type_error: "Tipo inválido para ID da campanha.",
	}),
});
export type TGetCampaignSurveyResultsInput = z.infer<typeof GetCampaignSurveyResultsInputSchema>;

const RECENT_REPLIES_LIMIT = 30;

type TOptionRow = { valor: string; respondentes: number };
type TSourceRow = { origem: TSurveyReplySourceEnum; respostas: number };
type TRecentRow = { clienteId: string; clienteNome: string | null; opcaoValor: string; opcaoTitulo: string; origem: TSurveyReplySourceEnum; data: string };

export async function getCampaignSurveyResults({ input, organizationId }: { input: TGetCampaignSurveyResultsInput; organizationId: string }) {
	const campaign = await db.query.campaigns.findFirst({
		where: and(eq(campaigns.id, input.campaignId), eq(campaigns.organizacaoId, organizationId)),
		columns: { id: true, titulo: true, gatilhoTipo: true, gatilhoPesquisaDataReferencia: true },
		with: {
			pesquisaCampo: { columns: { id: true, titulo: true, tipo: true, opcoes: true, ativo: true } },
			whatsappTemplate: { columns: { conteudo: true } },
		},
	});
	if (!campaign) throw new createHttpError.NotFound("Campanha não encontrada.");
	if (campaign.gatilhoTipo !== "PESQUISA") throw new createHttpError.BadRequest("Esta campanha não é uma pesquisa.");

	const field = campaign.pesquisaCampo;
	const isMultiple = field?.tipo === "ESCOLHA_MULTIPLA";

	// Envios de teste ficam fora de tudo: não contam como enviados nem como respostas.
	const notTest = sql`(${interactions.metadados}->>'teste') IS DISTINCT FROM 'true'`;
	const hasReplies = sql`${interactions.metadados} ? 'pesquisaRespostas'`;
	const baseWhere = and(eq(interactions.organizacaoId, organizationId), eq(interactions.campanhaId, campaign.id), eq(interactions.tipo, "ENVIO-MENSAGEM"), notTest);

	const [[totals], optionRows, sourceRows, recentRows] = await Promise.all([
		db
			.select({
				enviados: sql<number>`count(*) filter (where ${inArray(interactions.statusEnvio, [...CAMPAIGN_SENT_INTERACTION_STATUSES])})`.mapWith(Number),
				entregues: sql<number>`count(*) filter (where ${inArray(interactions.statusEnvio, ["ENTREGUE", "LIDO"])})`.mapWith(Number),
				respondentes: sql<number>`count(distinct ${interactions.clienteId}) filter (where ${hasReplies})`.mapWith(Number),
				respostas: sql<number>`coalesce(sum(jsonb_array_length(${interactions.metadados}->'pesquisaRespostas')) filter (where ${hasReplies}), 0)`.mapWith(Number),
			})
			.from(interactions)
			.where(baseWhere),
		// ESCOLHA_UNICA conta só a última entrada de cada envio (o cliente mudou de ideia = uma
		// resposta); ESCOLHA_MULTIPLA conta cada opção distinta que o cliente tocou.
		isMultiple
			? db.execute<TOptionRow>(sql`
				select r->>'opcaoValor' as valor, count(distinct i.cliente_id)::int as respondentes
				from ${interactions} i
				cross join lateral jsonb_array_elements(i.metadados->'pesquisaRespostas') as r
				where i.organizacao_id = ${organizationId} and i.campanha_id = ${campaign.id} and i.tipo = 'ENVIO-MENSAGEM'
					and (i.metadados->>'teste') is distinct from 'true' and i.metadados ? 'pesquisaRespostas'
				group by 1
			`)
			: db.execute<TOptionRow>(sql`
				select i.metadados->'pesquisaRespostas'->-1->>'opcaoValor' as valor, count(distinct i.cliente_id)::int as respondentes
				from ${interactions} i
				where i.organizacao_id = ${organizationId} and i.campanha_id = ${campaign.id} and i.tipo = 'ENVIO-MENSAGEM'
					and (i.metadados->>'teste') is distinct from 'true' and i.metadados ? 'pesquisaRespostas'
				group by 1
			`),
		db.execute<TSourceRow>(sql`
			select r->>'origem' as origem, count(*)::int as respostas
			from ${interactions} i
			cross join lateral jsonb_array_elements(i.metadados->'pesquisaRespostas') as r
			where i.organizacao_id = ${organizationId} and i.campanha_id = ${campaign.id} and i.tipo = 'ENVIO-MENSAGEM'
				and (i.metadados->>'teste') is distinct from 'true' and i.metadados ? 'pesquisaRespostas'
			group by 1
		`),
		db.execute<TRecentRow>(sql`
			select i.cliente_id as "clienteId", c.nome as "clienteNome", r->>'opcaoValor' as "opcaoValor", r->>'opcaoTitulo' as "opcaoTitulo",
				r->>'origem' as origem, r->>'data' as data
			from ${interactions} i
			cross join lateral jsonb_array_elements(i.metadados->'pesquisaRespostas') as r
			left join ampmais_clients c on c.id = i.cliente_id
			where i.organizacao_id = ${organizationId} and i.campanha_id = ${campaign.id} and i.tipo = 'ENVIO-MENSAGEM'
				and (i.metadados->>'teste') is distinct from 'true' and i.metadados ? 'pesquisaRespostas'
			order by r->>'data' desc
			limit ${RECENT_REPLIES_LIMIT}
		`),
	]);

	const respondentesByValue = new Map(optionRows.map((row) => [row.valor, Number(row.respondentes)]));
	const surveyButtons = campaign.whatsappTemplate ? getSurveyButtons(campaign.whatsappTemplate.conteudo) : [];
	// Opções na ordem dos botões do template (a ordem que o cliente viu), depois as opções do campo
	// que não viraram botão, depois valores só presentes nas respostas (opção removida depois).
	const orderedValues = Array.from(
		new Set([...surveyButtons.map((button) => button.opcaoValor), ...(field?.opcoes ?? []).map((option) => option.valor), ...respondentesByValue.keys()]),
	);
	const titlesByValue = new Map<string, string>();
	for (const button of surveyButtons) titlesByValue.set(button.opcaoValor, button.texto);
	for (const option of field?.opcoes ?? []) titlesByValue.set(option.valor, option.titulo);

	const respondentes = Number(totals?.respondentes ?? 0);
	const enviados = Number(totals?.enviados ?? 0);
	const opcoes = orderedValues.map((valor) => {
		const count = respondentesByValue.get(valor) ?? 0;
		return {
			valor,
			titulo: titlesByValue.get(valor) ?? valor,
			respondentes: count,
			percentual: respondentes > 0 ? (count / respondentes) * 100 : 0,
			ehBotao: surveyButtons.some((button) => button.opcaoValor === valor),
		};
	});

	const porOrigem: Record<TSurveyReplySourceEnum, number> = { PAYLOAD: 0, CONTEXTO: 0, TEXTO: 0 };
	for (const row of sourceRows) if (row.origem in porOrigem) porOrigem[row.origem] = Number(row.respostas);

	return {
		data: {
			campanha: { id: campaign.id, titulo: campaign.titulo, gatilhoPesquisaDataReferencia: campaign.gatilhoPesquisaDataReferencia },
			campo: field ? { id: field.id, titulo: field.titulo, tipo: field.tipo, ativo: field.ativo } : null,
			totais: {
				enviados,
				entregues: Number(totals?.entregues ?? 0),
				respondentes,
				respostas: Number(totals?.respostas ?? 0),
				taxaResposta: enviados > 0 ? (respondentes / enviados) * 100 : 0,
			},
			opcoes,
			porOrigem,
			ultimasRespostas: recentRows.map((row) => ({
				clienteId: row.clienteId,
				clienteNome: row.clienteNome,
				opcaoValor: row.opcaoValor,
				opcaoTitulo: row.opcaoTitulo,
				origem: row.origem,
				data: row.data,
			})),
		},
		message: "Resultados da pesquisa encontrados com sucesso.",
	};
}
export type TGetCampaignSurveyResultsOutput = Awaited<ReturnType<typeof getCampaignSurveyResults>>;
