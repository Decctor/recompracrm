import "@/utils/scripts/load-next-env";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalizeClientDocument } from "@/lib/data-collecting-v2/client-document";
import { mergeClients } from "@/lib/clients/merge";
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
 *     [--org <id>] [--documentos <cpf,cpf>] [--limite <n>] [--apply]
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

	type TMergeRow = { documento: string; principal: string; duplicado: string; status: "UNIFICADO" | "ERRO"; detalhe: string };
	const results: TMergeRow[] = [];
	// O recálculo do principal loga a cada cliente; em milhares de merges isso afoga a saída.
	const originalLog = console.log;
	console.log = (...logArgs: unknown[]) => {
		if (typeof logArgs[0] === "string" && /^\[(CASHBACK|RFM|RECOMPUTE|CLIENT)/.test(logArgs[0])) return;
		originalLog(...logArgs);
	};
	try {
		for (const merge of merges) {
			try {
				const result = await mergeClients({
					db,
					organizacaoId: args.organizationId,
					keeperId: merge.keeper.id,
					sourceId: merge.source.id,
					fieldChoices: mergeFieldChoices(merge.keeper, merge.source),
					autorId: null,
				});
				results.push({
					documento: merge.document,
					principal: merge.keeper.id,
					duplicado: merge.source.id,
					status: "UNIFICADO",
					detalhe: JSON.stringify(result.registrosMovidos),
				});
			} catch (error) {
				results.push({
					documento: merge.document,
					principal: merge.keeper.id,
					duplicado: merge.source.id,
					status: "ERRO",
					detalhe: error instanceof Error ? error.message : String(error),
				});
			}
			if (results.length % 100 === 0) originalLog(`[UNIFICACAO] ${results.length}/${merges.length} unificações.`);
		}
	} finally {
		console.log = originalLog;
		writeCsv(
			path.join(outputDir, "unificacoes.csv"),
			["documento", "principal_id", "duplicado_id", "status", "detalhe"],
			results.map((row) => [row.documento, row.principal, row.duplicado, row.status, row.detalhe]),
		);
	}

	const statusCount = results.reduce<Record<string, number>>((acc, row) => {
		acc[row.status] = (acc[row.status] ?? 0) + 1;
		return acc;
	}, {});
	console.log(JSON.stringify({ unificacoes: statusCount }, null, 2));
	console.log(`[UNIFICACAO] Saída em ${outputDir}`);
	await connection.end();
}

main().catch(async (error) => {
	console.error(error);
	await connection.end();
	process.exit(1);
});
