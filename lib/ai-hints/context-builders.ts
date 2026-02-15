import type { TAIHintSubject } from "@/schemas/ai-hints";
import { db } from "@/services/drizzle";
import { campaigns, clients, organizations, sales, sellers } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, eq, gte, sql, sum } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type TOrgContext = {
	organizacao: {
		nome: string;
		nicho: string | null;
	};
	metricas: {
		totalClientes: number;
		clientesAtivos30d: number;
		vendasUltimos30d: number;
		ticketMedio: number;
		totalVendas30d: number;
	};
	rfm?: {
		distribuicao: Record<string, number>;
		clientesEmRisco: number;
		campeoes: number;
		hibernando: number;
		precisamAtencao: number;
	};
	campanhas?: {
		ativas: number;
		totalConversoes30d: number;
	};
	vendedores?: {
		total: number;
		ranking: Array<{ nome: string; totalVendas: number }>;
	};
	tendencias?: {
		variacao30d: number; // Percentage change compared to previous 30 days
		tendencia: "crescimento" | "estavel" | "queda";
	};
};

// ═══════════════════════════════════════════════════════════════
// MAIN BUILDER
// ═══════════════════════════════════════════════════════════════

export async function buildContextForSubject(organizacaoId: string, assunto: TAIHintSubject): Promise<TOrgContext> {
	// Base context always included
	const baseContext = await getBaseContext(organizacaoId);

	// Add subject-specific context
	switch (assunto) {
		case "dashboard":
			return {
				...baseContext,
				rfm: await getRFMContext(organizacaoId),
				campanhas: await getCampaignsContext(organizacaoId),
				tendencias: await getTrendContext(organizacaoId),
			};
		case "campaigns":
			return {
				...baseContext,
				campanhas: await getCampaignsContext(organizacaoId),
				rfm: await getRFMContext(organizacaoId),
			};
		case "clients":
			return {
				...baseContext,
				rfm: await getRFMContext(organizacaoId),
			};
		case "sales":
			return {
				...baseContext,
				tendencias: await getTrendContext(organizacaoId),
			};
		case "sellers":
			return {
				...baseContext,
				vendedores: await getSellersContext(organizacaoId),
			};
		default:
			return baseContext;
	}
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT BUILDERS
// ═══════════════════════════════════════════════════════════════

async function getBaseContext(organizacaoId: string): Promise<TOrgContext> {
	const thirtyDaysAgoDate = dayjs().subtract(30, "days").toDate();
	const thirtyDaysAgoIso = thirtyDaysAgoDate.toISOString();

	// Parallel queries for efficiency
	const [org, clientStats, salesStats] = await Promise.all([
		db.query.organizations.findFirst({
			where: eq(organizations.id, organizacaoId),
		}),
		db
			.select({
				total: count(),
				ativos: sql<number>`count(*) filter (where ${clients.ultimaCompraData} >= ${thirtyDaysAgoIso}::timestamptz)`,
			})
			.from(clients)
			.where(eq(clients.organizacaoId, organizacaoId)),
		db
			.select({
				total: sum(sales.valorTotal),
				count: count(),
			})
			.from(sales)
			.where(and(eq(sales.organizacaoId, organizacaoId), gte(sales.dataVenda, thirtyDaysAgoDate))),
	]);

	const totalClientes = clientStats[0]?.total || 0;
	const clientesAtivos = Number(clientStats[0]?.ativos) || 0;
	const vendasTotal = Number(salesStats[0]?.total) || 0;
	const vendasCount = salesStats[0]?.count || 0;

	return {
		organizacao: {
			nome: org?.nome || "Organização",
			nicho: org?.atuacaoNicho || null,
		},
		metricas: {
			totalClientes,
			clientesAtivos30d: clientesAtivos,
			vendasUltimos30d: vendasTotal,
			ticketMedio: vendasCount > 0 ? vendasTotal / vendasCount : 0,
			totalVendas30d: vendasCount,
		},
	};
}

async function getRFMContext(organizacaoId: string) {
	const rfmDistribution = await db
		.select({
			segmento: clients.analiseRFMTitulo,
			count: count(),
		})
		.from(clients)
		.where(eq(clients.organizacaoId, organizacaoId))
		.groupBy(clients.analiseRFMTitulo);

	const distribution: Record<string, number> = {};
	let emRisco = 0;
	let campeoes = 0;
	let hibernando = 0;
	let precisamAtencao = 0;

	for (const row of rfmDistribution) {
		if (row.segmento) {
			distribution[row.segmento] = row.count;

			// Classify into categories
			if (row.segmento.includes("RISCO") || row.segmento === "NÃO PODE PERDÊ-LOS") {
				emRisco += row.count;
			}
			if (row.segmento === "CAMPEÕES") {
				campeoes = row.count;
			}
			if (row.segmento === "HIBERNANDO" || row.segmento === "PERDIDOS") {
				hibernando += row.count;
			}
			if (row.segmento === "PRECISAM DE ATENÇÃO" || row.segmento === "PRESTES A DORMIR") {
				precisamAtencao += row.count;
			}
		}
	}

	return { distribuicao: distribution, clientesEmRisco: emRisco, campeoes, hibernando, precisamAtencao };
}

async function getCampaignsContext(organizacaoId: string) {
	const thirtyDaysAgo = dayjs().subtract(30, "days").toDate();

	const [activeCampaigns, conversions] = await Promise.all([
		db
			.select({ count: count() })
			.from(campaigns)
			.where(and(eq(campaigns.organizacaoId, organizacaoId), eq(campaigns.ativo, true))),
		db
			.select({ count: count() })
			.from(sales)
			.where(and(eq(sales.organizacaoId, organizacaoId), eq(sales.atribuicaoAplicavel, true), gte(sales.dataVenda, thirtyDaysAgo))),
	]);

	return {
		ativas: activeCampaigns[0]?.count || 0,
		totalConversoes30d: conversions[0]?.count || 0,
	};
}

async function getSellersContext(organizacaoId: string) {
	const thirtyDaysAgo = dayjs().subtract(30, "days").toDate();

	const [sellerCount, sellerRanking] = await Promise.all([
		db
			.select({ count: count() })
			.from(sellers)
			.where(eq(sellers.organizacaoId, organizacaoId)),
		db
			.select({
				nome: sales.vendedorNome,
				totalVendas: sum(sales.valorTotal),
			})
			.from(sales)
			.where(and(eq(sales.organizacaoId, organizacaoId), gte(sales.dataVenda, thirtyDaysAgo)))
			.groupBy(sales.vendedorNome)
			.orderBy(sql`${sum(sales.valorTotal)} desc`)
			.limit(5),
	]);

	return {
		total: sellerCount[0]?.count || 0,
		ranking: sellerRanking.map((s) => ({
			nome: s.nome || "Desconhecido",
			totalVendas: Number(s.totalVendas) || 0,
		})),
	};
}

async function getTrendContext(organizacaoId: string) {
	const thirtyDaysAgo = dayjs().subtract(30, "days").toDate();
	const sixtyDaysAgo = dayjs().subtract(60, "days").toDate();
	const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

	const [currentPeriod, previousPeriod] = await Promise.all([
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.where(and(eq(sales.organizacaoId, organizacaoId), gte(sales.dataVenda, thirtyDaysAgo))),
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.where(
				and(
					eq(sales.organizacaoId, organizacaoId),
					gte(sales.dataVenda, sixtyDaysAgo),
					sql`${sales.dataVenda} < ${thirtyDaysAgoIso}::timestamptz`,
				),
			),
	]);

	const currentTotal = Number(currentPeriod[0]?.total) || 0;
	const previousTotal = Number(previousPeriod[0]?.total) || 1; // Avoid division by zero

	const variacao = ((currentTotal - previousTotal) / previousTotal) * 100;

	let tendencia: "crescimento" | "estavel" | "queda" = "estavel";
	if (variacao > 5) tendencia = "crescimento";
	else if (variacao < -5) tendencia = "queda";

	return {
		variacao30d: Math.round(variacao * 100) / 100,
		tendencia,
	};
}
