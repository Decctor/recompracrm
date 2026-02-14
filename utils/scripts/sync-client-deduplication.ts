import { db } from "@/services/drizzle";
import { campaignConversions, cashbackProgramBalances, cashbackProgramTransactions, clients, interactions, sales } from "@/services/drizzle/schema";
import { and, eq, ne, sql } from "drizzle-orm";

const TARGET_ORGANIZATION_ID = "27817d9a-cb04-4704-a1f4-15b81a3610d3";

const CONFIG = {
	BATCH_SIZE: 50,
};

function chunkArray<T>(array: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}

type HandleFixingClientDuplicatesParams = {
	clientsToDeleteIds: string[];
	clientToKeepId: string;
};

async function handleFixingClientDuplicates({ clientsToDeleteIds, clientToKeepId }: HandleFixingClientDuplicatesParams) {
	for (const clientToDeleteId of clientsToDeleteIds) {
		await db.transaction(async (tx) => {
			await tx.update(sales).set({ clienteId: clientToKeepId }).where(eq(sales.clienteId, clientToDeleteId));
			await tx.update(cashbackProgramTransactions).set({ clienteId: clientToKeepId }).where(eq(cashbackProgramTransactions.clienteId, clientToDeleteId));

			const duplicateBalance = await tx.query.cashbackProgramBalances.findFirst({
				where: eq(cashbackProgramBalances.clienteId, clientToDeleteId),
			});

			if (duplicateBalance) {
				const keeperBalance = await tx.query.cashbackProgramBalances.findFirst({
					where: eq(cashbackProgramBalances.clienteId, clientToKeepId),
				});

				if (keeperBalance) {
					await tx
						.update(cashbackProgramBalances)
						.set({
							saldoValorDisponivel: sql`${cashbackProgramBalances.saldoValorDisponivel} + ${duplicateBalance.saldoValorDisponivel}`,
							saldoValorAcumuladoTotal: sql`${cashbackProgramBalances.saldoValorAcumuladoTotal} + ${duplicateBalance.saldoValorAcumuladoTotal}`,
							saldoValorResgatadoTotal: sql`${cashbackProgramBalances.saldoValorResgatadoTotal} + ${duplicateBalance.saldoValorResgatadoTotal}`,
						})
						.where(eq(cashbackProgramBalances.clienteId, clientToKeepId));
				} else {
					await tx.update(cashbackProgramBalances).set({ clienteId: clientToKeepId }).where(eq(cashbackProgramBalances.clienteId, clientToDeleteId));
				}

				if (keeperBalance) {
					await tx.delete(cashbackProgramBalances).where(eq(cashbackProgramBalances.clienteId, clientToDeleteId));
				}
			}

			await tx.update(campaignConversions).set({ clienteId: clientToKeepId }).where(eq(campaignConversions.clienteId, clientToDeleteId));
			await tx.update(interactions).set({ clienteId: clientToKeepId }).where(eq(interactions.clienteId, clientToDeleteId));
			await tx.delete(clients).where(eq(clients.id, clientToDeleteId));
		});

		console.log(`[SYNC-CLIENT-DEDUPLICATION] Finished duplicate ${clientToDeleteId} -> merged into ${clientToKeepId}`);
	}
}

type DuplicateGroup = {
	nome: string | null;
	telefoneBase: string | null;
	clientIds: string[];
	clientToKeepId: string;
	clientsToDeleteIds: string[];
};

async function findDuplicateClients(organizationId: string): Promise<DuplicateGroup[]> {
	const allClients = await db.query.clients.findMany({
		where: and(eq(clients.organizacaoId, organizationId), ne(clients.telefoneBase, "")),
		columns: {
			id: true,
			nome: true,
			telefoneBase: true,
			dataInsercao: true,
		},
		orderBy: (fields, { asc }) => [asc(fields.dataInsercao)],
	});

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

	const duplicateGroups: DuplicateGroup[] = [];
	for (const [, clientsInGroup] of groupedClients) {
		if (clientsInGroup.length > 1) {
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

async function fixAllDuplicates(organizationId: string) {
	console.log(`[SYNC-CLIENT-DEDUPLICATION] Starting duplicate fix for organization ${organizationId}...`);

	const duplicateGroups = await findDuplicateClients(organizationId);
	console.log(`[SYNC-CLIENT-DEDUPLICATION] Found ${duplicateGroups.length} duplicate groups`);

	if (duplicateGroups.length === 0) {
		return { totalGroups: 0, totalClientsDeleted: 0, errors: [] as Array<{ group: DuplicateGroup; error: string }> };
	}

	const errors: Array<{ group: DuplicateGroup; error: string }> = [];
	let totalClientsDeleted = 0;

	const batches = chunkArray(duplicateGroups, CONFIG.BATCH_SIZE);
	console.log(`[SYNC-CLIENT-DEDUPLICATION] Processing ${batches.length} batches`);

	for (const [batchIndex, batch] of batches.entries()) {
		console.log(`[SYNC-CLIENT-DEDUPLICATION] Processing batch ${batchIndex + 1}/${batches.length}...`);

		for (const group of batch) {
			try {
				await handleFixingClientDuplicates({
					clientsToDeleteIds: group.clientsToDeleteIds,
					clientToKeepId: group.clientToKeepId,
				});
				totalClientsDeleted += group.clientsToDeleteIds.length;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error(`[SYNC-CLIENT-DEDUPLICATION] Failed group ${group.nome}|${group.telefoneBase}: ${errorMessage}`);
				errors.push({ group, error: errorMessage });
			}
		}
	}

	return { totalGroups: duplicateGroups.length, totalClientsDeleted, errors };
}

export async function syncClientDeduplication(mode: "preview" | "fix" = "preview") {
	const startTime = Date.now();

	if (mode === "fix") {
		const result = await fixAllDuplicates(TARGET_ORGANIZATION_ID);
		const durationMs = Date.now() - startTime;
		const payload = {
			message: result.errors.length === 0 ? "Todos os duplicados corrigidos com sucesso" : "Processo concluído com alguns erros",
			stats: {
				totalGroups: result.totalGroups,
				totalClientsDeleted: result.totalClientsDeleted,
				errorsCount: result.errors.length,
			},
			errors: result.errors.map((e) => ({ nome: e.group.nome, telefone: e.group.telefoneBase, error: e.error })),
			durationMs,
			durationSeconds: `${(durationMs / 1000).toFixed(2)}s`,
		};

		console.log("[SYNC-CLIENT-DEDUPLICATION] Fix mode finished:", payload.stats);
		return payload;
	}

	const duplicateGroups = await findDuplicateClients(TARGET_ORGANIZATION_ID);
	const payload = {
		message: "Preview dos duplicados encontrados. Use --mode=fix para corrigir.",
		totalGroups: duplicateGroups.length,
		totalClientsToDelete: duplicateGroups.reduce((acc, g) => acc + g.clientsToDeleteIds.length, 0),
		duplicates: duplicateGroups.map((g) => ({
			nome: g.nome,
			telefoneBase: g.telefoneBase,
			totalClients: g.clientIds.length,
			clientToKeepId: g.clientToKeepId,
			clientToDeleteIds: g.clientsToDeleteIds,
		})),
	};

	console.log("[SYNC-CLIENT-DEDUPLICATION] Preview mode finished:", {
		totalGroups: payload.totalGroups,
		totalClientsToDelete: payload.totalClientsToDelete,
	});

	return payload;
}

function readModeFromArgs(): "preview" | "fix" {
	const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
	if (!modeArg) return "preview";
	const modeValue = modeArg.split("=")[1];
	return modeValue === "fix" ? "fix" : "preview";
}

void syncClientDeduplication(readModeFromArgs())
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("[SYNC-CLIENT-DEDUPLICATION] Error:", error);
		process.exit(1);
	});
