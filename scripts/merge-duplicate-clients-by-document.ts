import "@/utils/scripts/load-next-env";

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalizeClientDocument } from "@/lib/data-collecting-v2/client-document";
import { mergeClients } from "@/lib/clients/merge";
import {
	recomputeClientProductReferences,
	recomputeClientPurchaseMetadata,
	recomputeClientRFM,
	recomputeClientSellerReferences,
	rerankProductClientReferences,
} from "@/lib/clients/recompute";
import { connection, db } from "@/services/drizzle";
import { compareNamesForSameDocument, isPlaceholderName, nameTokens } from "./lib/person-names";

/**
 * Unifica clientes duplicados pelo mesmo CPF/CNPJ numa organização, com `mergeClients` (o mesmo
 * merge da tela de duplicatas: vendas, pontos, chats, tags, campanhas e log de auditoria).
 *
 * Regras:
 * - Grupo = clientes com o mesmo documento válido (dígitos; "123.456.789-09" e "12345678909" juntos).
 * - Principal (keeper): quem tem `idExterno` (o vínculo com o ERP); depois a compra mais recente;
 *   depois mais compras; depois o cadastro mais antigo. Entre vários com código, vale a mesma ordem.
 * - Só entra no merge quem tem nome compatível com o principal (mesmo nome, ou nome parcial com o
 *   mesmo sobrenome/os mesmos tokens) ou nome vazio/"CLIENTE". Primeiro nome diferente, ou mesmo
 *   primeiro nome com sobrenomes diferentes, fica de fora e vai para revisão (`grupos.csv`).
 * - No merge, o principal vence nos campos preenchidos; os vazios vêm do duplicado (ver merge.ts).
 *
 * Uso:
 *   node --conditions=react-server --import tsx scripts/merge-duplicate-clients-by-document.ts \
 *     [--org <id>] [--documentos <cpf,cpf>] [--limite <n>] [--paralelo <n>] [--apply]
 *
 * Desempenho: as unificações correm em paralelo (`--paralelo`, padrão 6) sem recalcular o
 * principal a cada merge; no fim, cada principal é recalculado uma vez e o ranking produto ×
 * cliente é refeito uma vez por produto tocado (era ~80% do tempo quando feito a cada merge).
 *
 * Sem --apply só simula. Saída em scripts/output/merge-duplicate-clients-by-document/<stamp>/
 * (fora do git: tem dados pessoais). Reexecutável: o que já foi unificado deixa de ser duplicata.
 */

const DEFAULT_ORGANIZATION_ID = "76e37c1c-927b-4f2c-88e5-104f07aa836a"; // Fran Farma

type TClientRow = {
	id: string;
	nome: string;
	cpf_cnpj: string;
	telefone: string | null;
	id_externo: string | null;
	data_insercao: string | null;
	ultima_compra_data: string | null;
	metadata_total_compras: number | null;
	saldo: number | null;
};

type TMemberDecision = {
	client: TClientRow;
	decision: "MESCLAR" | "REVISAR";
	basis: string;
};

type TGroup = { document: string; keeper: TClientRow; members: TMemberDecision[] };

function parseArgs() {
	const args = process.argv.slice(2);
	const valueOf = (flag: string) => {
		const index = args.indexOf(flag);
		return index >= 0 ? args[index + 1] : undefined;
	};
	const documents = valueOf("--documentos");
	const limit = valueOf("--limite");
	const concurrency = valueOf("--paralelo");
	return {
		organizationId: valueOf("--org") ?? DEFAULT_ORGANIZATION_ID,
		documentFilter: documents
			? new Set(
					documents
						.split(",")
						.map((value) => normalizeClientDocument(value))
						.filter((value): value is string => !!value),
				)
			: null,
		limit: limit ? Number(limit) : null,
		// O pool do projeto tem 10 conexões; 6 deixa folga para a transação de cada merge.
		concurrency: concurrency ? Math.max(1, Math.min(8, Number(concurrency))) : 6,
		apply: args.includes("--apply"),
	};
}

function time(value: string | null) {
	return value ? new Date(value).getTime() : 0;
}

/** Ordem de preferência do principal: código do ERP → compra mais recente → mais compras → mais antigo. */
function compareKeeperPreference(a: TClientRow, b: TClientRow) {
	if (!!a.id_externo !== !!b.id_externo) return a.id_externo ? -1 : 1;
	if (time(a.ultima_compra_data) !== time(b.ultima_compra_data)) return time(b.ultima_compra_data) - time(a.ultima_compra_data);
	if ((a.metadata_total_compras ?? 0) !== (b.metadata_total_compras ?? 0)) return (b.metadata_total_compras ?? 0) - (a.metadata_total_compras ?? 0);
	return time(a.data_insercao) - time(b.data_insercao);
}

function decideMember(keeper: TClientRow, member: TClientRow): TMemberDecision {
	// O documento é o mesmo; o nome só barra quando aponta outra pessoa ou é ambíguo.
	const byName = compareNamesForSameDocument(keeper.nome, member.nome);
	return { client: member, decision: byName.compatible ? "MESCLAR" : "REVISAR", basis: byName.basis };
}

/** O principal vence nos campos; o nome só vem do duplicado quando o do principal é vazio ("....."). */
function mergeFieldChoices(keeper: TClientRow, source: TClientRow) {
	return isPlaceholderName(nameTokens(keeper.nome)) && !isPlaceholderName(nameTokens(source.nome)) ? { nome: "source" as const } : null;
}

function csvCell(value: unknown) {
	if (value === null || value === undefined) return "";
	const text = String(value);
	return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath: string, header: string[], rows: unknown[][]) {
	writeFileSync(filePath, `﻿${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n")}\n`, "utf8");
}

async function loadGroups(organizationId: string, documentFilter: Set<string> | null) {
	const rows = await connection<TClientRow[]>`
		select c.id, c.nome, c.cpf_cnpj, c.telefone, c.id_externo, c.data_insercao, c.ultima_compra_data, c.metadata_total_compras,
			(select sum(b.saldo_valor_disponivel) from ampmais_cashback_program_balances b where b.cliente_id = c.id)::float as saldo
		from ampmais_clients c
		where c.organizacao_id = ${organizationId}
			and coalesce(c.cpf_cnpj, '') <> ''`;

	const byDocument = new Map<string, TClientRow[]>();
	for (const row of rows) {
		const document = normalizeClientDocument(row.cpf_cnpj);
		if (!document || (documentFilter && !documentFilter.has(document))) continue;
		byDocument.set(document, [...(byDocument.get(document) ?? []), row]);
	}

	const groups: TGroup[] = [];
	for (const [document, members] of byDocument) {
		if (members.length < 2) continue;
		const [keeper, ...others] = [...members].sort(compareKeeperPreference);
		groups.push({ document, keeper, members: others.map((member) => decideMember(keeper, member)) });
	}
	return { totalClientsWithDocument: rows.length, groups };
}

async function main() {
	const args = parseArgs();
	console.log(`[UNIFICACAO] Organização ${args.organizationId}${args.apply ? " — APLICANDO" : " — simulação"}`);
	const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
	const outputDir = path.join("scripts", "output", "merge-duplicate-clients-by-document", stamp);
	mkdirSync(outputDir, { recursive: true });

	const { totalClientsWithDocument, groups } = await loadGroups(args.organizationId, args.documentFilter);
	const selectedGroups = args.limit ? groups.slice(0, args.limit) : groups;

	writeCsv(
		path.join(outputDir, "grupos.csv"),
		[
			"documento",
			"decisao",
			"base",
			"principal_id",
			"principal_nome",
			"principal_telefone",
			"principal_id_externo",
			"principal_compras",
			"principal_saldo",
			"duplicado_id",
			"duplicado_nome",
			"duplicado_telefone",
			"duplicado_id_externo",
			"duplicado_compras",
			"duplicado_saldo",
		],
		selectedGroups.flatMap((group) =>
			group.members.map((member) => [
				group.document,
				member.decision,
				member.basis,
				group.keeper.id,
				group.keeper.nome,
				group.keeper.telefone,
				group.keeper.id_externo,
				group.keeper.metadata_total_compras,
				group.keeper.saldo,
				member.client.id,
				member.client.nome,
				member.client.telefone,
				member.client.id_externo,
				member.client.metadata_total_compras,
				member.client.saldo,
			]),
		),
	);

	const merges = selectedGroups.flatMap((group) =>
		group.members.filter((member) => member.decision === "MESCLAR").map((member) => ({ document: group.document, keeper: group.keeper, source: member.client })),
	);
	const review = selectedGroups.flatMap((group) => group.members.filter((member) => member.decision === "REVISAR"));
	const basisCount = selectedGroups
		.flatMap((group) => group.members)
		.reduce<Record<string, number>>((acc, member) => {
			const key = `${member.decision}/${member.basis}`;
			acc[key] = (acc[key] ?? 0) + 1;
			return acc;
		}, {});
	const summary = {
		organizacaoId: args.organizationId,
		geradoEm: new Date().toISOString(),
		clientesComDocumento: totalClientsWithDocument,
		documentosDuplicados: selectedGroups.length,
		clientesNosGrupos: selectedGroups.reduce((total, group) => total + 1 + group.members.length, 0),
		mesclagens: merges.length,
		paraRevisar: review.length,
		porBase: basisCount,
		principalComCodigoErp: selectedGroups.filter((group) => !!group.keeper.id_externo).length,
		duplicadoComOutroCodigoErp: merges.filter((merge) => merge.source.id_externo && merge.keeper.id_externo && merge.source.id_externo !== merge.keeper.id_externo).length,
		saldoNosDuplicados: Number(merges.reduce((total, merge) => total + (merge.source.saldo ?? 0), 0).toFixed(2)),
	};
	writeFileSync(path.join(outputDir, "resumo.json"), JSON.stringify(summary, null, 2), "utf8");
	console.log(JSON.stringify(summary, null, 2));

	if (!args.apply) {
		console.log("[UNIFICACAO] Nada alterado. Rode com --apply para unificar.");
		console.log(`[UNIFICACAO] Saída em ${outputDir}`);
		await connection.end();
		return;
	}

	// Uma fila por principal: as unificações do mesmo grupo vão em sequência (travam o mesmo
	// cliente); grupos diferentes correm em paralelo. O recálculo fica para depois, uma vez por principal.
	const queue = selectedGroups
		.map((group) => ({ group, merges: merges.filter((merge) => merge.keeper.id === group.keeper.id) }))
		.filter((entry) => entry.merges.length > 0);
	const resultsPath = path.join(outputDir, "unificacoes.csv");
	writeCsv(resultsPath, ["documento", "principal_id", "duplicado_id", "status", "detalhe"], []);
	const appendResult = (row: unknown[]) => appendFileSync(resultsPath, `${row.map(csvCell).join(";")}
`, "utf8");

	const statusCount: Record<string, number> = {};
	const mergedKeepers = new Set<string>();
	let done = 0;
	const startedAt = Date.now();
	await runWithConcurrency(queue, args.concurrency, async ({ group, merges: groupMerges }) => {
		for (const merge of groupMerges) {
			try {
				const result = await mergeClients({
					db,
					organizacaoId: args.organizationId,
					keeperId: merge.keeper.id,
					sourceId: merge.source.id,
					fieldChoices: mergeFieldChoices(merge.keeper, merge.source),
					autorId: null,
					recomputeKeeper: false,
				});
				mergedKeepers.add(group.keeper.id);
				statusCount.UNIFICADO = (statusCount.UNIFICADO ?? 0) + 1;
				appendResult([merge.document, merge.keeper.id, merge.source.id, "UNIFICADO", JSON.stringify(result.registrosMovidos)]);
			} catch (error) {
				statusCount.ERRO = (statusCount.ERRO ?? 0) + 1;
				appendResult([merge.document, merge.keeper.id, merge.source.id, "ERRO", error instanceof Error ? error.message : String(error)]);
			}
			done += 1;
			if (done % 200 === 0) console.log(`[UNIFICACAO] ${done}/${merges.length} unificações (${elapsed(startedAt)}).`);
		}
	});
	console.log(`[UNIFICACAO] Unificações: ${JSON.stringify(statusCount)} em ${elapsed(startedAt)}.`);

	// Recálculo: metadados de compra, RFM e vínculos de cada principal; o ranking produto × cliente é
	// por produto, então re-rankeia uma vez só os produtos tocados, em blocos.
	const keepers = [...mergedKeepers];
	const touchedProducts = new Set<string>();
	let recomputed = 0;
	let recomputeErrors = 0;
	const recomputeStartedAt = Date.now();
	await runWithConcurrency(keepers, args.concurrency, async (clienteId) => {
		try {
			await db.transaction(async (tx) => {
				await recomputeClientPurchaseMetadata({ tx, organizacaoId: args.organizationId, clienteId });
				await recomputeClientRFM({ tx, organizacaoId: args.organizationId, clienteId });
				await recomputeClientSellerReferences({ tx, organizacaoId: args.organizationId, clienteId });
				const productIds = await recomputeClientProductReferences({ tx, organizacaoId: args.organizationId, clienteId, rerank: false });
				for (const productId of productIds ?? []) touchedProducts.add(productId);
			});
		} catch (error) {
			recomputeErrors += 1;
			console.error(`[UNIFICACAO] Falha ao recalcular ${clienteId}:`, error instanceof Error ? error.message : error);
		}
		recomputed += 1;
		if (recomputed % 250 === 0) console.log(`[UNIFICACAO] ${recomputed}/${keepers.length} principais recalculados (${elapsed(recomputeStartedAt)}).`);
	});
	const productIds = [...touchedProducts];
	for (let index = 0; index < productIds.length; index += 500) {
		await db.transaction((tx) => rerankProductClientReferences({ tx, organizacaoId: args.organizationId, productIds: productIds.slice(index, index + 500) }));
	}
	console.log(
		`[UNIFICACAO] Recalculados ${recomputed} principais (${recomputeErrors} falhas) e o ranking de ${productIds.length} produtos em ${elapsed(recomputeStartedAt)}.`,
	);
	console.log(`[UNIFICACAO] Saída em ${outputDir}`);
	await connection.end();
}

function elapsed(startedAt: number) {
	const seconds = Math.round((Date.now() - startedAt) / 1000);
	return `${Math.floor(seconds / 60)}min${String(seconds % 60).padStart(2, "0")}s`;
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, async () => {
			while (next < items.length) {
				const item = items[next];
				next += 1;
				await worker(item);
			}
		}),
	);
}

main().catch(async (error) => {
	console.error(error);
	await connection.end();
	process.exit(1);
});
