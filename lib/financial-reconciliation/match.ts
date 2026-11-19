import { db } from "@/services/drizzle";
import {
	financialReconciliationMatches,
	financialStatementTransactions,
	financialTransactions,
	type TFinancialStatementTransaction,
	type TNewFinancialReconciliationMatch,
} from "@/services/drizzle/schema";
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { gateway, generateText, Output } from "ai";
import { z } from "zod";
import {
	AI_MATCH_CANDIDATES_PER_LINE,
	AI_MATCH_MAX_LINES_PER_CALL,
	AI_MATCH_MIN_CONFIDENCE,
	AI_MATCH_MODEL,
	EXACT_MATCH_DATE_WINDOW_DAYS,
	HEURISTIC_MATCH_DATE_WINDOW_DAYS,
	HEURISTIC_MATCH_MIN_SCORE,
	RECONCILIATION_VALUE_TOLERANCE,
} from "./constants";
import { normalizeStatementDescription } from "./normalize";

/**
 * Motor de matching linha de extrato ↔ transação financeira, em 3 estágios
 * (molde lib/purchase/match-products.ts):
 *  A) exato — mesmo valor (tolerância), mesmo tipo, ≤2 dias, candidato único (ou
 *     provedorReferencia === idExterno) → sugestão AUTOMATICO com confiança 1.0;
 *  B) heurístico — janela ≤7 dias com score de data/descrição/método, incluindo composição
 *     (1 linha ↔ soma de 2..3 transações) → sugestão HEURISTICO;
 *  C) IA — linhas com múltiplos candidatos plausíveis vão numa única chamada barata que
 *     escolhe (ou recusa) por linha → sugestão IA.
 *
 * Nenhum estágio confirma nada: tudo vira match SUGERIDO; a confirmação é sempre humana.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type TCandidateTransaction = {
	id: string;
	titulo: string;
	tipo: "ENTRADA" | "SAIDA";
	valor: number;
	metodo: string;
	contaFinanceiraId: string | null;
	provedorReferencia: string | null;
	dataEfetiva: Date;
	pendente: boolean;
};

type TSuggestion = Pick<TNewFinancialReconciliationMatch, "extratoTransacaoId" | "transacaoFinanceiraId" | "tipo" | "confianca">;

function daysBetween(a: Date, b: Date) {
	return Math.abs(a.getTime() - b.getTime()) / DAY_MS;
}

function valueMatches(a: number, b: number) {
	return Math.abs(a - b) <= RECONCILIATION_VALUE_TOLERANCE;
}

function descriptionSimilarity(a: string, b: string) {
	const tokensA = new Set(
		normalizeStatementDescription(a)
			.split(" ")
			.filter((token) => token.length >= 3),
	);
	const tokensB = new Set(
		normalizeStatementDescription(b)
			.split(" ")
			.filter((token) => token.length >= 3),
	);
	if (tokensA.size === 0 || tokensB.size === 0) return 0;
	let intersection = 0;
	for (const token of tokensA) if (tokensB.has(token)) intersection++;
	return intersection / Math.min(tokensA.size, tokensB.size);
}

function heuristicScore(linha: TFinancialStatementTransaction, candidate: TCandidateTransaction) {
	const dateProximity = Math.max(0, 1 - daysBetween(linha.dataTransacao, candidate.dataEfetiva) / HEURISTIC_MATCH_DATE_WINDOW_DAYS);
	const description = descriptionSimilarity(linha.descricao, candidate.titulo);
	const methodBonus = linha.metodo && candidate.metodo === linha.metodo ? 1 : 0;
	// Valor já é pré-condição de candidatura; o score decide entre candidatos de mesmo valor.
	return 0.5 * dateProximity + 0.35 * description + 0.15 * methodBonus;
}

const AIMatchOutputSchema = z.object({
	matches: z.array(
		z.object({
			linhaIndex: z.number(),
			transacaoId: z.string().nullable(),
			confianca: z.number().min(0).max(1).nullable(),
		}),
	),
});

export async function runStatementMatching({
	organizacaoId,
	contaFinanceiraId,
	linhaIds,
}: {
	organizacaoId: string;
	contaFinanceiraId: string;
	// Quando informado, restringe às linhas recém-importadas; senão, todas as pendentes da conta.
	linhaIds?: string[];
}) {
	const lineConditions = [
		eq(financialStatementTransactions.organizacaoId, organizacaoId),
		eq(financialStatementTransactions.contaFinanceiraId, contaFinanceiraId),
		eq(financialStatementTransactions.status, "PENDENTE"),
	];
	if (linhaIds && linhaIds.length > 0) lineConditions.push(inArray(financialStatementTransactions.id, linhaIds));

	const linhas = await db.query.financialStatementTransactions.findMany({ where: and(...lineConditions) });
	if (linhas.length === 0) return { sugeridas: 0, linhasAnalisadas: 0 };

	// Pares já registrados (qualquer status) não são re-sugeridos: SUGERIDO/CONFIRMADO já existem,
	// REJEITADO é decisão humana que o motor respeita.
	const existingMatches = await db.query.financialReconciliationMatches.findMany({
		where: and(
			eq(financialReconciliationMatches.organizacaoId, organizacaoId),
			inArray(
				financialReconciliationMatches.extratoTransacaoId,
				linhas.map((linha) => linha.id),
			),
		),
		columns: { extratoTransacaoId: true, transacaoFinanceiraId: true, status: true },
	});
	const existingPairs = new Set(existingMatches.map((match) => `${match.extratoTransacaoId}|${match.transacaoFinanceiraId}`));
	const linesWithSuggestion = new Set(existingMatches.filter((match) => match.status !== "REJEITADO").map((match) => match.extratoTransacaoId));

	// Transações já conciliadas (match CONFIRMADO) saem do universo de candidatos.
	const confirmedTransactionRows = await db
		.select({ transacaoFinanceiraId: financialReconciliationMatches.transacaoFinanceiraId })
		.from(financialReconciliationMatches)
		.where(and(eq(financialReconciliationMatches.organizacaoId, organizacaoId), eq(financialReconciliationMatches.status, "CONFIRMADO")));
	const conciliatedTransactionIds = new Set(confirmedTransactionRows.map((row) => row.transacaoFinanceiraId));

	// Universo de candidatos: mesma conta (ou sem conta definida), janela do período das linhas.
	const dates = linhas.map((linha) => linha.dataTransacao.getTime());
	const windowStart = new Date(Math.min(...dates) - HEURISTIC_MATCH_DATE_WINDOW_DAYS * DAY_MS);
	const windowEnd = new Date(Math.max(...dates) + HEURISTIC_MATCH_DATE_WINDOW_DAYS * DAY_MS);

	const candidateRows = await db.query.financialTransactions.findMany({
		where: and(
			eq(financialTransactions.organizacaoId, organizacaoId),
			or(eq(financialTransactions.contaFinanceiraId, contaFinanceiraId), isNull(financialTransactions.contaFinanceiraId)),
			// Parcela cancelada nunca vai aparecer no extrato: não é candidata.
			isNull(financialTransactions.dataCancelamento),
			gte(financialTransactions.dataPrevisao, new Date(windowStart.getTime() - 90 * DAY_MS)),
			lte(financialTransactions.dataPrevisao, windowEnd),
		),
		columns: {
			id: true,
			titulo: true,
			tipo: true,
			valor: true,
			metodo: true,
			contaFinanceiraId: true,
			provedorReferencia: true,
			dataPrevisao: true,
			dataEfetivacao: true,
		},
	});

	const candidates: TCandidateTransaction[] = candidateRows
		.filter((row) => !conciliatedTransactionIds.has(row.id))
		.map((row) => ({
			id: row.id,
			titulo: row.titulo,
			tipo: row.tipo,
			valor: row.valor,
			metodo: row.metodo,
			contaFinanceiraId: row.contaFinanceiraId,
			provedorReferencia: row.provedorReferencia,
			dataEfetiva: row.dataEfetivacao ?? row.dataPrevisao,
			pendente: !row.dataEfetivacao,
		}))
		.filter((candidate) => daysBetween(candidate.dataEfetiva, linhas[0].dataTransacao) < 366); // sanidade

	const suggestions: TSuggestion[] = [];
	const suggestedPairs = new Set<string>();
	// Transações sugeridas com confiança 1.0 não são oferecidas a outras linhas no mesmo run.
	const exactlyTakenTransactionIds = new Set<string>();

	function pushSuggestion(suggestion: TSuggestion) {
		const key = `${suggestion.extratoTransacaoId}|${suggestion.transacaoFinanceiraId}`;
		if (existingPairs.has(key) || suggestedPairs.has(key)) return;
		suggestedPairs.add(key);
		suggestions.push(suggestion);
	}

	type TPendingLine = { linha: TFinancialStatementTransaction; plausible: TCandidateTransaction[] };
	const pendingForAI: TPendingLine[] = [];

	for (const linha of linhas) {
		if (linesWithSuggestion.has(linha.id)) continue;

		const sameValue = candidates.filter(
			(candidate) =>
				candidate.tipo === linha.tipo &&
				valueMatches(candidate.valor, linha.valor) &&
				daysBetween(candidate.dataEfetiva, linha.dataTransacao) <= HEURISTIC_MATCH_DATE_WINDOW_DAYS &&
				!exactlyTakenTransactionIds.has(candidate.id) &&
				!existingPairs.has(`${linha.id}|${candidate.id}`),
		);

		// Estágio A' — referência do provedor: vínculo forte independente de janela curta.
		const byReference = linha.idExterno ? sameValue.find((candidate) => candidate.provedorReferencia === linha.idExterno) : undefined;
		if (byReference) {
			exactlyTakenTransactionIds.add(byReference.id);
			pushSuggestion({ extratoTransacaoId: linha.id, transacaoFinanceiraId: byReference.id, tipo: "AUTOMATICO", confianca: 1 });
			continue;
		}

		// Estágio A — janela curta com candidato único.
		const exactWindow = sameValue.filter((candidate) => daysBetween(candidate.dataEfetiva, linha.dataTransacao) <= EXACT_MATCH_DATE_WINDOW_DAYS);
		if (exactWindow.length === 1) {
			exactlyTakenTransactionIds.add(exactWindow[0].id);
			pushSuggestion({ extratoTransacaoId: linha.id, transacaoFinanceiraId: exactWindow[0].id, tipo: "AUTOMATICO", confianca: 1 });
			continue;
		}

		// Estágio B — janela ampla: um único candidato bem pontuado vira sugestão heurística;
		// múltiplos candidatos plausíveis vão para o estágio C (IA).
		if (sameValue.length === 1) {
			const score = heuristicScore(linha, sameValue[0]);
			if (score >= HEURISTIC_MATCH_MIN_SCORE) {
				pushSuggestion({
					extratoTransacaoId: linha.id,
					transacaoFinanceiraId: sameValue[0].id,
					tipo: "HEURISTICO",
					confianca: Number(score.toFixed(2)),
				});
				continue;
			}
		}
		if (sameValue.length >= 2) {
			const plausible = [...sameValue].sort((a, b) => heuristicScore(linha, b) - heuristicScore(linha, a)).slice(0, AI_MATCH_CANDIDATES_PER_LINE);
			pendingForAI.push({ linha, plausible });
			continue;
		}

		// Estágio B2 — composição: a linha agrupa 2..3 transações (parcelas/repasses agregados).
		const composable = candidates
			.filter(
				(candidate) =>
					candidate.tipo === linha.tipo &&
					candidate.valor < linha.valor &&
					daysBetween(candidate.dataEfetiva, linha.dataTransacao) <= HEURISTIC_MATCH_DATE_WINDOW_DAYS &&
					!exactlyTakenTransactionIds.has(candidate.id),
			)
			.sort((a, b) => b.valor - a.valor)
			.slice(0, 25);
		const group = findCompositionGroup(linha.valor, composable);
		if (group) {
			for (const member of group) {
				pushSuggestion({ extratoTransacaoId: linha.id, transacaoFinanceiraId: member.id, tipo: "HEURISTICO", confianca: 0.7 });
			}
		}
	}

	// Estágio C — IA escolhe entre candidatos de mesmo valor (melhor descrição/contexto), em lote.
	for (let offset = 0; offset < pendingForAI.length; offset += AI_MATCH_MAX_LINES_PER_CALL) {
		const batch = pendingForAI.slice(offset, offset + AI_MATCH_MAX_LINES_PER_CALL);
		try {
			const prompt = batch.map(({ linha, plausible }, index) => ({
				linhaIndex: offset + index,
				extrato: {
					data: linha.dataTransacao.toISOString().slice(0, 10),
					descricao: linha.descricao,
					valor: linha.valor,
					tipo: linha.tipo,
					metodo: linha.metodo,
				},
				candidatos: plausible.map((candidate) => ({
					transacaoId: candidate.id,
					titulo: candidate.titulo,
					data: candidate.dataEfetiva.toISOString().slice(0, 10),
					metodo: candidate.metodo,
					pendente: candidate.pendente,
				})),
			}));

			const { output } = await generateText({
				model: gateway(AI_MATCH_MODEL),
				output: Output.object({ schema: AIMatchOutputSchema }),
				system:
					"Você é um especialista em conciliação bancária. Cada linha de extrato tem candidatos internos com o MESMO valor; " +
					"escolha o transacaoId cujo título, data e método melhor correspondem à descrição da linha do extrato, ou null se nenhum for claramente a mesma transação. " +
					"Seja conservador: em dúvida, retorne null. Responda apenas no schema JSON pedido.",
				prompt: `Concilie as linhas abaixo. Retorne um match por linhaIndex.\n\n${JSON.stringify(prompt)}`,
			});
			const parsed = AIMatchOutputSchema.parse(output);
			for (const match of parsed.matches) {
				const pending = pendingForAI[match.linhaIndex];
				if (!pending || !match.transacaoId) continue;
				const candidate = pending.plausible.find((item) => item.id === match.transacaoId);
				if (!candidate) continue;
				const confidence = match.confianca ?? AI_MATCH_MIN_CONFIDENCE;
				if (confidence < AI_MATCH_MIN_CONFIDENCE) continue;
				pushSuggestion({
					extratoTransacaoId: pending.linha.id,
					transacaoFinanceiraId: candidate.id,
					tipo: "IA",
					confianca: confidence,
				});
			}
		} catch (error) {
			// Best-effort: linhas do lote ficam sem sugestão para resolução manual.
			console.error("[RECONCILIATION_MATCH] Erro no matching por IA, mantendo linhas sem sugestão.", error);
		}
	}

	if (suggestions.length === 0) return { sugeridas: 0, linhasAnalisadas: linhas.length };

	const inserted = await db
		.insert(financialReconciliationMatches)
		.values(
			suggestions.map((suggestion) => ({
				organizacaoId,
				extratoTransacaoId: suggestion.extratoTransacaoId,
				transacaoFinanceiraId: suggestion.transacaoFinanceiraId,
				tipo: suggestion.tipo,
				confianca: suggestion.confianca,
				status: "SUGERIDO" as const,
			})),
		)
		.onConflictDoNothing()
		.returning({ id: financialReconciliationMatches.id });

	return { sugeridas: inserted.length, linhasAnalisadas: linhas.length };
}

/** Subset-sum limitado (pares e trios) para composição — bounded para não explodir. */
function findCompositionGroup(target: number, candidates: TCandidateTransaction[]): TCandidateTransaction[] | null {
	for (let i = 0; i < candidates.length; i++) {
		for (let j = i + 1; j < candidates.length; j++) {
			const pairSum = candidates[i].valor + candidates[j].valor;
			if (valueMatches(pairSum, target)) return [candidates[i], candidates[j]];
			if (pairSum > target + RECONCILIATION_VALUE_TOLERANCE) continue;
			for (let k = j + 1; k < candidates.length; k++) {
				if (valueMatches(pairSum + candidates[k].valor, target)) return [candidates[i], candidates[j], candidates[k]];
			}
		}
	}
	return null;
}
