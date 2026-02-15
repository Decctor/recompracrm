import { AIHintContentSchema, type TAIHintContent, type TAIHintSubject, type TAIHintType } from "@/schemas/ai-hints";
import { db } from "@/services/drizzle";
import { aiHints, organizations } from "@/services/drizzle/schema";
import { generateText, Output, gateway } from "ai";
import dayjs from "dayjs";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { buildContextForSubject, type TOrgContext } from "./context-builders";

// Maps each subject to the hint types that can appear there
const SUBJECT_HINT_TYPES: Record<TAIHintSubject, TAIHintType[]> = {
	dashboard: ["general", "sales-trend", "rfm-action", "campaign-suggestion"],
	campaigns: ["campaign-suggestion", "campaign-optimization", "rfm-action"],
	clients: ["rfm-action", "client-reactivation", "campaign-suggestion"],
	sales: ["sales-trend", "product-insight", "general"],
	sellers: ["seller-performance", "general"],
};

// Default expiration times by hint type (in hours)
const HINT_EXPIRATION_HOURS: Record<TAIHintType, number> = {
	"campaign-suggestion": 168, // 7 days
	"campaign-optimization": 72, // 3 days
	"rfm-action": 168, // 7 days
	"client-reactivation": 72, // 3 days
	"sales-trend": 24, // 1 day (time-sensitive)
	"product-insight": 168, // 7 days
	"seller-performance": 168, // 7 days
	general: 336, // 14 days
};

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface GenerateHintsParams {
	organizacaoId: string;
	assunto: TAIHintSubject;
	contextoAdicional?: string;
}

interface GenerateHintsResult {
	hints: Array<{ id: string; tipo: string }>;
	tokensUsados: number;
	limiteAtingido: boolean;
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

export async function generateHintsForSubject({ organizacaoId, assunto, contextoAdicional }: GenerateHintsParams): Promise<GenerateHintsResult> {
	// 1. Check if feature is enabled and quota
	const org = await db.query.organizations.findFirst({
		where: eq(organizations.id, organizacaoId),
	});

	if (!org) {
		throw new Error("Organização não encontrada.");
	}

	const config = org.configuracao;
	const hasAccess = config?.recursos?.iaDicas?.acesso ?? false;

	if (!hasAccess) {
		return { hints: [], tokensUsados: 0, limiteAtingido: true };
	}

	const weeklyLimit = config?.recursos?.iaDicas?.limiteSemanal ?? 10;

	// Count hints generated this week
	const weekStart = dayjs().startOf("week").toDate();
	const [hintsThisWeek] = await db
		.select({ count: count() })
		.from(aiHints)
		.where(and(eq(aiHints.organizacaoId, organizacaoId), gte(aiHints.dataInsercao, weekStart)));

	if (hintsThisWeek.count >= weeklyLimit) {
		return { hints: [], tokensUsados: 0, limiteAtingido: true };
	}

	// 2. Build context for the subject
	const context = await buildContextForSubject(organizacaoId, assunto);

	// 3. Get allowed hint types for this subject
	const allowedTypes = SUBJECT_HINT_TYPES[assunto];

	// 4. Get existing active hints to avoid duplicates
	const existingHints = await db.query.aiHints.findMany({
		where: and(eq(aiHints.organizacaoId, organizacaoId), eq(aiHints.assunto, assunto), eq(aiHints.status, "active")),
	});

	const existingTypes = existingHints.map((h) => h.tipo);

	// 5. Build the prompt
	const systemPrompt = buildSystemPrompt(assunto, allowedTypes, existingTypes);
	const userPrompt = buildUserPrompt(context, contextoAdicional);

	// 6. Generate hints using AI SDK with Vercel AI Gateway
	const { output: generatedHints, usage } = await generateText({
		model: gateway("openai/gpt-4o"),
		output: Output.object({
			schema: z.object({
				hints: z.array(AIHintContentSchema).max(3),
			}),
		}),
		system: systemPrompt,
		prompt: userPrompt,
	});

	// 7. Filter duplicates
	const uniqueHints = filterDuplicateHints(generatedHints.hints, existingHints);

	// 8. Store hints in database
	const insertedHints = await Promise.all(
		uniqueHints.map(async (hint) => {
			const expirationHours = HINT_EXPIRATION_HOURS[hint.tipo];
			const dataExpiracao = dayjs().add(expirationHours, "hours").toDate();

			const [inserted] = await db
				.insert(aiHints)
				.values({
					organizacaoId,
					assunto,
					tipo: hint.tipo,
					conteudo: hint,
					modeloUtilizado: "openai/gpt-4o",
					tokensUtilizados: Math.floor(usage.totalTokens / Math.max(uniqueHints.length, 1)),
					relevancia: calculateRelevance(hint),
					dataExpiracao,
				})
				.returning({ id: aiHints.id, tipo: aiHints.tipo });

			return inserted;
		}),
	);

	return {
		hints: insertedHints,
		tokensUsados: usage.totalTokens,
		limiteAtingido: false,
	};
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function buildSystemPrompt(assunto: TAIHintSubject, allowedTypes: TAIHintType[], existingTypes: string[]): string {
	const subjectDescriptions: Record<TAIHintSubject, string> = {
		dashboard: "visão geral do negócio",
		campaigns: "campanhas de marketing e fidelização",
		clients: "base de clientes e segmentação RFM",
		sales: "vendas e performance comercial",
		sellers: "desempenho de vendedores",
	};

	return `Você é um consultor de negócios especializado em varejo, fidelização de clientes e CRM.
Sua tarefa é analisar os dados do negócio e gerar insights acionáveis e estratégicos.

CONTEXTO DA PÁGINA: ${subjectDescriptions[assunto]}
TIPOS DE HINT PERMITIDOS: ${allowedTypes.join(", ")}
${existingTypes.length > 0 ? `TIPOS JÁ EXISTENTES (evitar duplicar): ${existingTypes.join(", ")}` : ""}

REGRAS CRÍTICAS:
- Gere no máximo 3 hints relevantes e distintos
- Cada hint deve ser ACIONÁVEL e ESPECÍFICO
- Use dados concretos quando disponíveis (números, percentuais)
- Priorize insights de ALTO IMPACTO para o negócio
- Seja conciso mas informativo
- Escreva em português brasileiro
- NÃO repita tipos de hint que já existem

FORMATO OBRIGATÓRIO:
- titulo: Curto e impactante (máx 100 caracteres)
- descricao: Explicação clara do insight com dados (máx 500 caracteres)
- acaoSugerida: CTA claro e direto (ex: "Ver clientes em risco", "Criar campanha")
- urlAcao: URL relativa para a ação (ex: "/dashboard/commercial/clients")
- dados: Campos específicos do tipo de hint conforme o schema

EXEMPLOS DE BONS HINTS:
- "42 clientes em risco de churn precisam de atenção imediata"
- "Vendas caíram 15% nos últimos 30 dias - hora de agir"
- "Segmento 'Campeões' representa 60% do faturamento - mantenha-os engajados"`;
}

function buildUserPrompt(context: TOrgContext, extra?: string): string {
	return `Analise os seguintes dados do negócio e gere insights estratégicos:

### DADOS DA ORGANIZAÇÃO
${JSON.stringify(context, null, 2)}

${extra ? `### CONTEXTO ADICIONAL DO USUÁRIO\n${extra}` : ""}

Gere hints relevantes e acionáveis baseados nesses dados. Foque em oportunidades de alto impacto.`;
}

function calculateRelevance(hint: TAIHintContent): number {
	let score = 0.5;

	// RFM urgency boosts relevance
	if (hint.tipo === "rfm-action") {
		if (hint.dados.urgencia === "critica") score = 0.95;
		else if (hint.dados.urgencia === "alta") score = 0.85;
		else if (hint.dados.urgencia === "media") score = 0.7;
	}

	// Sales trend issues are high priority
	if (hint.tipo === "sales-trend") {
		if (hint.dados.tendencia === "queda") score = 0.9;
		else if (hint.dados.tendencia === "crescimento") score = 0.6;
	}

	// Campaign optimization is moderately important
	if (hint.tipo === "campaign-optimization") {
		score = 0.75;
	}

	// General hints with high priority
	if (hint.tipo === "general") {
		if (hint.dados.prioridade === "alta") score = 0.8;
		else if (hint.dados.prioridade === "media") score = 0.6;
	}

	return score;
}

function filterDuplicateHints(newHints: TAIHintContent[], existingHints: Array<{ tipo: string; conteudo: unknown }>): TAIHintContent[] {
	return newHints.filter((newHint) => {
		// Check if a hint of the same type with similar key data already exists
		const isDuplicate = existingHints.some((existing) => {
			if (existing.tipo !== newHint.tipo) return false;

			const existingContent = existing.conteudo as TAIHintContent;

			// Type-specific duplicate detection
			switch (newHint.tipo) {
				case "rfm-action":
					return existingContent.tipo === "rfm-action" && existingContent.dados.segmento === newHint.dados.segmento;
				case "campaign-optimization":
					return existingContent.tipo === "campaign-optimization" && existingContent.dados.campanhaId === newHint.dados.campanhaId;
				case "sales-trend":
					return existingContent.tipo === "sales-trend" && existingContent.dados.tendencia === newHint.dados.tendencia;
				case "seller-performance":
					return existingContent.tipo === "seller-performance" && existingContent.dados.vendedorId === newHint.dados.vendedorId;
				default:
					// For other types, just check the title similarity
					return existingContent.titulo === newHint.titulo;
			}
		});

		return !isDuplicate;
	});
}
