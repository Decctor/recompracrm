import { createSimplifiedSearchCondition } from "@/lib/search";
import { db } from "@/services/drizzle";
import { campaigns, clients, interactions, organizationMembers, organizations, sales, users } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, desc, eq, gte, lte, max, or, sql, sum, type SQL } from "drizzle-orm";
import z from "zod";
import { resolveOrganizationScope } from "../organization-scope";
import { PERIOD_DESCRIPTION, PeriodInputSchema, resolvePeriod } from "../period";
import { roundForModel } from "../serialization";
import { defineAgentTool } from "../types";

/**
 * Ferramentas que atravessam organizações. Todas restritas a `modes: ["PLATAFORMA"]` — em modo ORG
 * elas nem aparecem em `tools/list`, e é por isso que uma conexão de lojista não tem como
 * descobrir que a plataforma inteira é consultável.
 */

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;

const SearchOrganizationsInputSchema = z.object({
	termo: z.string({ invalid_type_error: "Tipo inválido para o termo de busca." }).optional().nullable(),
	plano: z.string({ invalid_type_error: "Tipo inválido para o plano." }).optional().nullable(),
	statusAssinatura: z.string({ invalid_type_error: "Tipo inválido para o status da assinatura." }).optional().nullable(),
	semVendaHaDias: z.number({ invalid_type_error: "Tipo inválido para dias sem venda." }).int().positive().optional().nullable(),
	limite: z.number({ invalid_type_error: "Tipo inválido para o limite." }).int().positive().max(MAX_LIMIT).optional().nullable(),
});

export const platformSearchOrganizationsTool = defineAgentTool({
	name: "platform_search_organizations",
	title: "Buscar organizações",
	scopes: ["platform:organizations:read"],
	modes: ["PLATAFORMA"],
	inputSchema: SearchOrganizationsInputSchema,
	describe: () =>
		[
			"Busca organizações da plataforma inteira por nome, slug, plano ou status de assinatura, e permite filtrar por",
			"tempo sem venda — o filtro para trabalho de retenção e risco de churn.",
			"Devolve o slug de cada organização, aceito como `organizacaoId` nas demais ferramentas e mais estável que o UUID.",
			`Devolve no máximo ${MAX_LIMIT} organizações por chamada, com o total encontrado.`,
			"O retrato completo de uma organização está em `platform_get_organization_health`.",
		].join(" "),
	execute: async (input) => {
		const limite = input.limite ?? DEFAULT_LIMIT;
		const conditions: SQL[] = [];

		const termo = input.termo?.trim();
		if (termo && termo.length >= 2) {
			const termCondition = or(createSimplifiedSearchCondition(organizations.nome, termo), createSimplifiedSearchCondition(organizations.slug, termo));
			if (termCondition) conditions.push(termCondition);
		}
		if (input.plano) conditions.push(eq(organizations.assinaturaPlano, input.plano));
		if (input.statusAssinatura) conditions.push(eq(organizations.stripeSubscriptionStatus, input.statusAssinatura));

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		const rows = await db
			.select({
				id: organizations.id,
				nome: organizations.nome,
				slug: organizations.slug,
				plano: organizations.assinaturaPlano,
				statusAssinatura: organizations.stripeSubscriptionStatus,
				periodoPagoFim: organizations.assinaturaPeriodoPagoFim,
				dataInsercao: organizations.dataInsercao,
				ultimaVendaData: max(sales.dataVenda),
			})
			.from(organizations)
			.leftJoin(sales, and(eq(sales.organizacaoId, organizations.id), eq(sales.statusVenda, "CONFIRMADA")))
			.where(where)
			.groupBy(organizations.id)
			.orderBy(desc(organizations.dataInsercao))
			.limit(MAX_LIMIT + 1);

		// O filtro de inatividade roda sobre o agregado (`max(dataVenda)`), então é aplicado depois
		// do GROUP BY — inclusive as organizações que nunca venderam, que são o caso mais crítico.
		const cutoff = input.semVendaHaDias ? dayjs().subtract(input.semVendaHaDias, "days") : null;
		const filtered = cutoff ? rows.filter((row) => !row.ultimaVendaData || dayjs(row.ultimaVendaData).isBefore(cutoff)) : rows;
		const page = filtered.slice(0, limite);

		return {
			total: filtered.length,
			exibindo: page.length,
			truncado: filtered.length > page.length,
			organizacoes: page.map((row) => ({
				id: row.id,
				nome: row.nome,
				slug: row.slug,
				plano: row.plano,
				statusAssinatura: row.statusAssinatura,
				periodoPagoFim: row.periodoPagoFim,
				dataInsercao: row.dataInsercao,
				ultimaVendaData: row.ultimaVendaData,
				diasSemVenda: row.ultimaVendaData ? dayjs().diff(dayjs(row.ultimaVendaData), "days") : undefined,
				// Distinto de `diasSemVenda` ausente por falta de dado: aqui sabemos que nunca houve venda.
				nuncaVendeu: !row.ultimaVendaData,
			})),
		};
	},
});

const OrganizationHealthInputSchema = z.object({
	organizacaoId: z.string({
		required_error: "Informe o id ou slug da organização.",
		invalid_type_error: "Tipo inválido para o id da organização.",
	}),
	periodo: PeriodInputSchema,
});

export const platformOrganizationHealthTool = defineAgentTool({
	name: "platform_get_organization_health",
	title: "Saúde da organização",
	scopes: ["platform:organizations:read"],
	modes: ["PLATAFORMA"],
	inputSchema: OrganizationHealthInputSchema,
	describe: () =>
		[
			"Retrato de conta de uma organização: assinatura e plano, quando o período pago termina, quantos usuários tem,",
			"e o uso no período — vendas e faturamento, clientes cadastrados, campanhas ativas e interações enviadas.",
			"Responde se a conta está saudável, para retenção e expansão.",
			"Os números comerciais completos da organização estão em `get_commercial_results` com o mesmo `organizacaoId`.",
			PERIOD_DESCRIPTION,
		].join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const periodo = resolvePeriod(input.periodo);

		const organization = await db.query.organizations.findFirst({
			where: eq(organizations.id, organizacaoId),
			columns: {
				id: true,
				nome: true,
				slug: true,
				assinaturaPlano: true,
				stripeSubscriptionStatus: true,
				assinaturaPeriodoPagoFim: true,
				assinaturaAcessoProvisorioFim: true,
				dataOnboardingConclusao: true,
				dataInsercao: true,
				atuacaoNicho: true,
				dealId: true,
			},
		});
		if (!organization) throw new Error("Organização não encontrada.");

		const [salesRow, clientRow, memberRow, campaignRow, interactionRow, lastSaleRow] = await Promise.all([
			db
				.select({ total: count(), valor: sum(sales.valorTotal) })
				.from(sales)
				.where(
					and(
						eq(sales.organizacaoId, organizacaoId),
						eq(sales.statusVenda, "CONFIRMADA"),
						gte(sales.dataVenda, periodo.after),
						lte(sales.dataVenda, periodo.before),
					),
				),
			db.select({ total: count() }).from(clients).where(eq(clients.organizacaoId, organizacaoId)),
			db.select({ total: count() }).from(organizationMembers).where(eq(organizationMembers.organizacaoId, organizacaoId)),
			db
				.select({ total: count() })
				.from(campaigns)
				.where(and(eq(campaigns.organizacaoId, organizacaoId), eq(campaigns.ativo, true))),
			db
				.select({ total: count() })
				.from(interactions)
				.where(
					and(
						eq(interactions.organizacaoId, organizacaoId),
						gte(interactions.dataInsercao, periodo.after),
						lte(interactions.dataInsercao, periodo.before),
					),
				),
			db
				.select({ ultima: max(sales.dataVenda) })
				.from(sales)
				.where(and(eq(sales.organizacaoId, organizacaoId), eq(sales.statusVenda, "CONFIRMADA"))),
		]);

		const ultimaVendaData = lastSaleRow[0]?.ultima ?? null;

		return {
			periodo: { inicio: periodo.inicio, fim: periodo.fim },
			organizacao: {
				id: organization.id,
				nome: organization.nome,
				slug: organization.slug,
				nicho: organization.atuacaoNicho,
				dataInsercao: organization.dataInsercao,
				onboardingConcluidoEm: organization.dataOnboardingConclusao,
			},
			assinatura: {
				plano: organization.assinaturaPlano,
				status: organization.stripeSubscriptionStatus,
				periodoPagoFim: organization.assinaturaPeriodoPagoFim,
				acessoProvisorioFim: organization.assinaturaAcessoProvisorioFim,
				// Assinatura governada por deal B2B não tem status do Stripe: sem esta marca, um
				// `status` ausente pareceria conta sem assinatura, que é o oposto do caso.
				viaDeal: Boolean(organization.dealId),
			},
			uso: {
				qtdeUsuarios: memberRow[0]?.total ?? 0,
				qtdeClientes: clientRow[0]?.total ?? 0,
				campanhasAtivas: campaignRow[0]?.total ?? 0,
				vendasNoPeriodo: salesRow[0]?.total ?? 0,
				faturamentoNoPeriodo: roundForModel(salesRow[0]?.valor ? Number(salesRow[0].valor) : 0),
				interacoesNoPeriodo: interactionRow[0]?.total ?? 0,
				ultimaVendaData,
				diasSemVenda: ultimaVendaData ? dayjs().diff(dayjs(ultimaVendaData), "days") : undefined,
				nuncaVendeu: !ultimaVendaData,
			},
		};
	},
});

const AggregateMetricsInputSchema = z.object({
	periodo: PeriodInputSchema,
});

export const platformAggregateMetricsTool = defineAgentTool({
	name: "platform_get_aggregate_metrics",
	title: "Métricas da plataforma",
	scopes: ["platform:metrics:read"],
	modes: ["PLATAFORMA"],
	inputSchema: AggregateMetricsInputSchema,
	describe: () =>
		[
			"Números agregados da plataforma inteira: total de organizações e usuários, organizações criadas no período,",
			"quantas estão ativas (venderam no período), a distribuição por plano e por status de assinatura,",
			"e o volume total transacionado.",
			"É a visão de topo; contas específicas são encontradas por `platform_search_organizations`.",
			PERIOD_DESCRIPTION,
		].join(" "),
	execute: async (input) => {
		const periodo = resolvePeriod(input.periodo);

		const [orgTotal, userTotal, newOrgs, activeOrgs, byPlan, bySubscription, volume] = await Promise.all([
			db.select({ total: count() }).from(organizations),
			db.select({ total: count() }).from(users),
			db
				.select({ total: count() })
				.from(organizations)
				.where(and(gte(organizations.dataInsercao, periodo.after), lte(organizations.dataInsercao, periodo.before))),
			db
				.select({ total: sql<number>`count(distinct ${sales.organizacaoId})::int` })
				.from(sales)
				.where(and(eq(sales.statusVenda, "CONFIRMADA"), gte(sales.dataVenda, periodo.after), lte(sales.dataVenda, periodo.before))),
			db.select({ plano: organizations.assinaturaPlano, total: count() }).from(organizations).groupBy(organizations.assinaturaPlano),
			db.select({ status: organizations.stripeSubscriptionStatus, total: count() }).from(organizations).groupBy(organizations.stripeSubscriptionStatus),
			db
				.select({ total: count(), valor: sum(sales.valorTotal) })
				.from(sales)
				.where(and(eq(sales.statusVenda, "CONFIRMADA"), gte(sales.dataVenda, periodo.after), lte(sales.dataVenda, periodo.before))),
		]);

		const totalOrganizacoes = orgTotal[0]?.total ?? 0;
		const organizacoesAtivas = activeOrgs[0]?.total ?? 0;

		return {
			periodo: { inicio: periodo.inicio, fim: periodo.fim },
			totalOrganizacoes,
			totalUsuarios: userTotal[0]?.total ?? 0,
			organizacoesNovasNoPeriodo: newOrgs[0]?.total ?? 0,
			// "Ativa" aqui quer dizer exatamente uma coisa: registrou venda confirmada no período.
			// Nomear o critério evita que o modelo o confunda com assinatura ativa.
			organizacoesComVendaNoPeriodo: organizacoesAtivas,
			percentualAtivas: totalOrganizacoes > 0 ? roundForModel((organizacoesAtivas / totalOrganizacoes) * 100) : undefined,
			porPlano: byPlan.map((row) => ({ plano: row.plano, qtdeOrganizacoes: row.total })),
			porStatusAssinatura: bySubscription.map((row) => ({ status: row.status, qtdeOrganizacoes: row.total })),
			volumeTransacionado: {
				qtdeVendas: volume[0]?.total ?? 0,
				valorTotal: roundForModel(volume[0]?.valor ? Number(volume[0].valor) : 0),
			},
		};
	},
});
