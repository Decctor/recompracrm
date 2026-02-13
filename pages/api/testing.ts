import { db } from "@/services/drizzle";
import {
	campaignConversions,
	cashbackProgramBalances,
	cashbackProgramTransactions,
	clients,
	interactions,
	organizationMembers,
	sales,
	utils,
} from "@/services/drizzle/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

// Configurações
const CONFIG = {
	BATCH_SIZE: 50, // Quantidade de registros por lote
	MAX_RETRIES: 3, // Número máximo de tentativas por registro
	RETRY_DELAY_MS: 1000, // Delay entre tentativas (em ms)
	CONCURRENT_UPDATES: 10, // Número de updates paralelos dentro de cada lote
	CLIENT_PURCHASE_BATCH_SIZE: 100, // Quantidade de clientes por lote no recálculo de compras
	CLIENT_PURCHASE_BATCH_DELAY_MS: 500, // Delay entre lotes de clientes para aliviar o banco
};

const FULFILLMENT_METHOD_MAP: Record<string, string> = {
	delivery: "ENTREGA",
	takeout: "RETIRADA",
	onsite: "PRESENCIAL",
	closed_table: "COMANDA",
};

// Utilitário para delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Divide array em chunks
function chunkArray<T>(array: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}

// Função de retry com backoff exponencial
async function withRetry<T>(
	fn: () => Promise<T>,
	maxRetries: number,
	baseDelay: number,
	context: string,
): Promise<{ success: true; result: T } | { success: false; error: string }> {
	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const result = await fn();
			return { success: true, result };
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			console.warn(`[WARN] [TESTING] ${context} - Tentativa ${attempt}/${maxRetries} falhou: ${lastError.message}`);

			if (attempt < maxRetries) {
				const delayMs = baseDelay * 2 ** (attempt - 1); // Backoff exponencial
				await delay(delayMs);
			}
		}
	}

	return { success: false, error: lastError?.message ?? "Erro desconhecido" };
}

// Função para atualizar uma única venda
async function updateSale(sale: { id: string; parceiro: string | null; tipo: string | null }) {
	const canal = sale.parceiro;
	const entregaModalidade = sale.tipo ? FULFILLMENT_METHOD_MAP[sale.tipo] : "NÃO DEFINIDO";
	console.log(`[INFO] [TESTING] Atualizando venda ${sale.id} com entregaModalidade ${entregaModalidade} para o tipo ${sale.tipo}`);
	await db
		.update(sales)
		.set({
			entregaModalidade,
		})
		.where(eq(sales.id, sale.id));

	return sale.id;
}

// Processa um lote de vendas com concorrência limitada
async function processBatch(
	batch: Array<{ id: string; parceiro: string | null; tipo: string | null }>,
	batchIndex: number,
	totalBatches: number,
): Promise<{ successful: string[]; failed: Array<{ id: string; error: string }> }> {
	console.log(`[INFO] [TESTING] Processando lote ${batchIndex + 1}/${totalBatches} (${batch.length} registros)...`);

	const successful: string[] = [];
	const failed: Array<{ id: string; error: string }> = [];

	// Processa em sub-lotes para limitar concorrência
	const concurrentChunks = chunkArray(batch, CONFIG.CONCURRENT_UPDATES);

	for (const chunk of concurrentChunks) {
		const results = await Promise.allSettled(
			chunk.map(async (sale) => {
				const result = await withRetry(() => updateSale(sale), CONFIG.MAX_RETRIES, CONFIG.RETRY_DELAY_MS, `Sale ${sale.id}`);

				if (result.success) {
					return { id: sale.id, success: true as const };
				}
				return { id: sale.id, success: false as const, error: result.error };
			}),
		);

		for (const result of results) {
			if (result.status === "fulfilled") {
				if (result.value.success) {
					successful.push(result.value.id);
				} else {
					failed.push({ id: result.value.id, error: result.value.error });
				}
				continue;
			}
			// Promise rejeitada (não deveria acontecer com nosso try-catch, mas por segurança)
			failed.push({ id: "unknown", error: result.reason?.message ?? "Erro desconhecido" });
		}
	}

	console.log(`[INFO] [TESTING] Lote ${batchIndex + 1}/${totalBatches} concluído: ${successful.length} sucesso, ${failed.length} falhas`);
	return { successful, failed };
}

type HandleFixingClientDuplicatesParams = {
	clientsToDeleteIds: string[];
	clientToKeepId: string;
};
async function handleFixingClientDuplicates({ clientsToDeleteIds, clientToKeepId }: HandleFixingClientDuplicatesParams) {
	for (const clientToDeleteId of clientsToDeleteIds) {
		await db.transaction(async (tx) => {
			// First, moving all sales to the client to keep
			await tx.update(sales).set({ clienteId: clientToKeepId }).where(eq(sales.clienteId, clientToDeleteId));
			// Then, moving all cashback program transactions to the client to keep
			await tx.update(cashbackProgramTransactions).set({ clienteId: clientToKeepId }).where(eq(cashbackProgramTransactions.clienteId, clientToDeleteId));
			// Then, moving the cashback program balance to the client to keep
			const duplicateBalance = await tx.query.cashbackProgramBalances.findFirst({
				where: eq(cashbackProgramBalances.clienteId, clientToDeleteId),
			});
			if (duplicateBalance) {
				// Check if client to keep has a balance
				const keeperBalance = await tx.query.cashbackProgramBalances.findFirst({
					where: eq(cashbackProgramBalances.clienteId, clientToKeepId),
				});

				if (keeperBalance) {
					// Merge balances: add duplicate's balance to keeper's balance
					await tx
						.update(cashbackProgramBalances)
						.set({
							saldoValorDisponivel: sql`${cashbackProgramBalances.saldoValorDisponivel} + ${duplicateBalance.saldoValorDisponivel}`,
							saldoValorAcumuladoTotal: sql`${cashbackProgramBalances.saldoValorAcumuladoTotal} + ${duplicateBalance.saldoValorAcumuladoTotal}`,
							saldoValorResgatadoTotal: sql`${cashbackProgramBalances.saldoValorResgatadoTotal} + ${duplicateBalance.saldoValorResgatadoTotal}`,
						})
						.where(eq(cashbackProgramBalances.clienteId, clientToKeepId));
				} else {
					// Transfer balance: just update clienteId to the keeper
					await tx.update(cashbackProgramBalances).set({ clienteId: clientToKeepId }).where(eq(cashbackProgramBalances.clienteId, clientToDeleteId));
				}

				// Only delete if we merged (not transferred)
				if (keeperBalance) {
					await tx.delete(cashbackProgramBalances).where(eq(cashbackProgramBalances.clienteId, clientToDeleteId));
				}
			}
			// Updating all campaign conversions to the client to keep
			await tx.update(campaignConversions).set({ clienteId: clientToKeepId }).where(eq(campaignConversions.clienteId, clientToDeleteId));
			// Updating all campaign interactions to the client to keep
			await tx.update(interactions).set({ clienteId: clientToKeepId }).where(eq(interactions.clienteId, clientToDeleteId));
			// Deleting the client to delete
			await tx.delete(clients).where(eq(clients.id, clientToDeleteId));
		});
		console.log(`[INFO] Finished processing duplicate client ${clientToDeleteId} -> merged into ${clientToKeepId}`);
	}
}

type DuplicateGroup = {
	nome: string | null;
	telefoneBase: string | null;
	clientIds: string[];
	clientToKeepId: string;
	clientsToDeleteIds: string[];
};

async function findDuplicateClients(organizacaoId: string): Promise<DuplicateGroup[]> {
	// First, find all clients for this organization
	const allClients = await db.query.clients.findMany({
		where: and(eq(clients.organizacaoId, organizacaoId), ne(clients.telefoneBase, "")),
		columns: {
			id: true,
			nome: true,
			telefoneBase: true,
			dataInsercao: true,
		},
		orderBy: (fields, { asc }) => [asc(fields.dataInsercao)],
	});

	// Group by nome + telefoneBase
	const groupedClients = new Map<string, typeof allClients>();
	for (const client of allClients) {
		const key = client.telefoneBase ?? "";
		const existing = groupedClients.get(key);
		if (existing) {
			existing.push(client);
		} else {
			groupedClients.set(key, [client]);
		}
	}

	// Filter only groups with duplicates (more than 1 client)
	const duplicateGroups: DuplicateGroup[] = [];
	for (const [key, clientsInGroup] of groupedClients) {
		if (clientsInGroup.length > 1) {
			// The first one (oldest) is the one to keep
			const [clientToKeep, ...clientsToDelete] = clientsInGroup;
			duplicateGroups.push({
				nome: clientToKeep.nome,
				telefoneBase: clientToKeep.telefoneBase,
				clientIds: clientsInGroup.map((c) => c.id),
				clientToKeepId: clientToKeep.id,
				clientsToDeleteIds: clientsToDelete.map((c) => c.id),
			});
		}
	}

	return duplicateGroups;
}

async function fixAllDuplicates(organizacaoId: string) {
	console.log(`[INFO] Starting duplicate fix for organization ${organizacaoId}...`);

	const duplicateGroups = await findDuplicateClients(organizacaoId);
	console.log(`[INFO] Found ${duplicateGroups.length} duplicate groups to fix`);

	if (duplicateGroups.length === 0) {
		return { totalGroups: 0, totalClientsDeleted: 0, errors: [] };
	}

	const errors: Array<{ group: DuplicateGroup; error: string }> = [];
	let totalClientsDeleted = 0;

	// Process in batches to avoid overwhelming the database
	const batches = chunkArray(duplicateGroups, CONFIG.BATCH_SIZE);
	console.log(`[INFO] Processing ${batches.length} batches of up to ${CONFIG.BATCH_SIZE} groups each`);

	for (const [batchIndex, batch] of batches.entries()) {
		console.log(`[INFO] Processing batch ${batchIndex + 1}/${batches.length}...`);

		for (const group of batch) {
			try {
				await handleFixingClientDuplicates({
					clientsToDeleteIds: group.clientsToDeleteIds,
					clientToKeepId: group.clientToKeepId,
				});
				totalClientsDeleted += group.clientsToDeleteIds.length;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error(`[ERROR] Failed to fix group ${group.nome}|${group.telefoneBase}: ${errorMessage}`);
				errors.push({ group, error: errorMessage });
			}
		}

		console.log(`[INFO] Batch ${batchIndex + 1}/${batches.length} completed`);
	}

	console.log(`[INFO] Duplicate fix completed. Deleted ${totalClientsDeleted} clients with ${errors.length} errors`);
	return { totalGroups: duplicateGroups.length, totalClientsDeleted, errors };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const organizacaoId = "27817d9a-cb04-4704-a1f4-15b81a3610d3";
	// Query param to switch between preview and fix mode
	const mode = req.query.mode as string | undefined;
	if (mode === "fix") {
		// Actually fix the duplicates
		const startTime = Date.now();
		try {
			const result = await fixAllDuplicates(organizacaoId);
			const durationMs = Date.now() - startTime;
			return res.status(200).json({
				message: result.errors.length === 0 ? "Todos os duplicados corrigidos com sucesso" : "Processo concluído com alguns erros",
				stats: {
					totalGroups: result.totalGroups,
					totalClientsDeleted: result.totalClientsDeleted,
					errorsCount: result.errors.length,
				},
				errors: result.errors.length > 0 ? result.errors.map((e) => ({ nome: e.group.nome, telefone: e.group.telefoneBase, error: e.error })) : undefined,
				durationMs,
				durationSeconds: `${(durationMs / 1000).toFixed(2)}s`,
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return res.status(500).json({ message: "Erro fatal", error: errorMessage });
		}
	}
	// Default: preview mode - just show the duplicates
	const duplicateGroups = await findDuplicateClients(organizacaoId);
	return res.status(200).json({
		message: "Preview dos duplicados encontrados. Use ?mode=fix para corrigir.",
		totalGroups: duplicateGroups.length,
		totalClientsToDelete: duplicateGroups.reduce((acc, g) => acc + g.clientsToDeleteIds.length, 0),
		duplicates: duplicateGroups.map((g) => ({
			nome: g.nome,
			telefoneBase: g.telefoneBase,
			totalClients: g.clientIds.length,
			clientToKeepId: g.clientToKeepId,
			clientToDeleteIds: g.clientsToDeleteIds,
		})),
	});
	try {
		console.log("[INFO] [TESTING] Iniciando processo de correção de vendas...");
		// Busca registros que precisam ser corrigidos
		const salesToFix = await db.query.sales.findMany({
			where: (fields, { and, eq, isNull }) =>
				and(eq(fields.organizacaoId, "27817d9a-cb04-4704-a1f4-15b81a3610d3"), eq(fields.entregaModalidade, "NÃO DEFINIDO")),
			columns: {
				id: true,
				parceiro: true,
				tipo: true,
			},
		});
		if (salesToFix.length === 0) {
			console.log("[INFO] [TESTING] Nenhuma venda encontrada para corrigir.");
			return res.status(200).json({
				message: "Nenhuma venda encontrada para corrigir",
				stats: { total: 0, successful: 0, failed: 0 },
				durationMs: Date.now() - startTime,
			});
		}
		console.log(`[INFO] [TESTING] Encontradas ${salesToFix.length} vendas para corrigir`);
		// Divide em lotes
		const batches = chunkArray(salesToFix, CONFIG.BATCH_SIZE);
		console.log(`[INFO] [TESTING] Dividido em ${batches.length} lotes de até ${CONFIG.BATCH_SIZE} registros`);
		// Métricas
		const allSuccessful: string[] = [];
		const allFailed: Array<{ id: string; error: string }> = [];
		// Processa cada lote
		for (const [batchIndex, batch] of batches.entries()) {
			const { successful, failed } = await processBatch(batch, batchIndex, batches.length);
			allSuccessful.push(...successful);
			allFailed.push(...failed);
		}
		const durationMs = Date.now() - startTime;
		const durationSeconds = (durationMs / 1000).toFixed(2);
		console.log(`[INFO] [TESTING] Processo concluído em ${durationSeconds}s`);
		console.log(`[INFO] [TESTING] Total: ${salesToFix.length} | Sucesso: ${allSuccessful.length} | Falhas: ${allFailed.length}`);
		if (allFailed.length > 0) {
			console.error("[ERROR] [TESTING] IDs com falha:", allFailed.map((f) => f.id).join(", "));
		}
		return res.status(200).json({
			message: allFailed.length === 0 ? "Todas as vendas atualizadas com sucesso" : "Processo concluído com algumas falhas",
			stats: {
				total: salesToFix.length,
				successful: allSuccessful.length,
				failed: allFailed.length,
			},
			failedIds: allFailed.length > 0 ? allFailed : undefined,
			durationMs,
			durationSeconds: `${durationSeconds}s`,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error("[ERROR] [TESTING] Erro fatal no processo:", errorMessage);
		return res.status(500).json({
			message: "Erro fatal no processo de atualização",
			error: errorMessage,
			durationMs: Date.now() - startTime,
		});
	}
}
