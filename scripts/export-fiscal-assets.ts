import "@/utils/scripts/load-next-env";

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { FISCAL_LIFECYCLE_STATUS_LABELS } from "@/app/dashboard/fiscal/_module/shared/fiscal-labels";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { listFiscalDocumentAssetsForExport } from "@/lib/fiscal/asset-export";
import { formatDateTimeInOperationTimezone } from "@/lib/operation-timezone";
import { FISCAL_DOCUMENT_TYPE_LABELS } from "@/lib/sales/export-summaries";
import { connection, db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import { eq, ilike, or } from "drizzle-orm";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

/**
 * Exporta o ZIP de XML (ou DANFE) das notas de uma organização num mês — o mesmo ZIP que o botão
 * "Exportar XML" do módulo fiscal monta no navegador, gerado aqui direto em disco.
 *
 * Passa pela mesma `listFiscalDocumentAssetsForExport` da rota: mesmos status (autorizadas e
 * canceladas), mesmo período sobre a data de emissão, mesmos caminhos (`NFCE/2026-10/{chave}.xml`)
 * e o mesmo `_RELATORIO.csv`, com uma linha por documento e o motivo de qualquer ausência.
 *
 * Atenção: assim como o app, um documento sem arquivo guardado é buscado no provedor e gravado no
 * storage (e o caminho, no documento). É a única escrita que o script faz.
 *
 * Uso:
 *   npm run export:fiscal-assets -- --org=<id|slug|nome> --month=2026-10 [--asset=xml|pdf] [--out=<pasta>]
 */

const DOWNLOAD_CONCURRENCY = 6;
const EXPIRED_URL_STATUSES = new Set([400, 401, 403]);
// Brasil sem horário de verão desde 2019: o mês local é [01 00:00, próximo 01 00:00) em -03:00.
const OPERATION_UTC_OFFSET = "-03:00";

function arg(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

type TEntry = Awaited<ReturnType<typeof listFiscalDocumentAssetsForExport>>["arquivos"][number];
type TDownloadResult = { ok: true; data: Uint8Array } | { ok: false; motivo: string; retryable: boolean };

async function resolveOrganization(query: string) {
	const matches = await db
		.select({ id: organizations.id, nome: organizations.nome, slug: organizations.slug })
		.from(organizations)
		.where(or(eq(organizations.id, query), eq(organizations.slug, query), ilike(organizations.nome, `%${query}%`)));
	const exact = matches.find((org) => org.id === query || org.slug === query);
	if (exact) return exact;
	if (matches.length === 1) return matches[0];
	if (matches.length === 0) throw new Error(`Nenhuma organização encontrada para "${query}".`);
	throw new Error(`"${query}" é ambíguo:\n${matches.map((org) => `  ${org.id}  ${org.slug}  ${org.nome}`).join("\n")}`);
}

function resolveMonth(month: string) {
	const match = /^(\d{4})-(\d{2})$/.exec(month);
	if (!match) throw new Error("Informe --month=AAAA-MM.");
	const year = Number(match[1]);
	const monthIndex = Number(match[2]);
	const next = monthIndex === 12 ? `${year + 1}-01` : `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
	const periodAfter = new Date(`${month}-01T00:00:00.000${OPERATION_UTC_OFFSET}`);
	// O filtro é `<=`; um milissegundo antes do mês seguinte fecha o intervalo como o seletor de datas do app.
	const periodBefore = new Date(new Date(`${next}-01T00:00:00.000${OPERATION_UTC_OFFSET}`).getTime() - 1);
	return { periodAfter, periodBefore };
}

async function download(entry: TEntry): Promise<TDownloadResult> {
	if (!entry.url) return { ok: false, motivo: entry.motivo ?? "Arquivo indisponível.", retryable: false };
	try {
		const response = await fetch(entry.url);
		if (!response.ok) {
			return { ok: false, motivo: `Falha ao baixar o arquivo (HTTP ${response.status}).`, retryable: EXPIRED_URL_STATUSES.has(response.status) };
		}
		return { ok: true, data: new Uint8Array(await response.arrayBuffer()) };
	} catch (error) {
		return { ok: false, motivo: `Falha ao baixar o arquivo: ${error instanceof Error ? error.message : "erro de rede"}.`, retryable: true };
	}
}

function escapeCsvCell(value: string) {
	return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Mesmo layout do `_RELATORIO.csv` do app (`lib/fiscal/asset-zip-export.ts`): `;` e BOM para o Excel. */
function buildReportCsv(lines: { entry: TEntry; situacao: string }[]) {
	const header = ["TIPO", "SÉRIE", "NÚMERO", "CHAVE DE ACESSO", "STATUS", "DATA DE EMISSÃO", "ARQUIVO NO ZIP", "SITUAÇÃO"];
	const rows = lines.map(({ entry, situacao }) => [
		FISCAL_DOCUMENT_TYPE_LABELS[entry.tipo] ?? entry.tipo,
		entry.serie ?? "",
		entry.numero ?? "",
		entry.chaveAcesso ?? "",
		FISCAL_LIFECYCLE_STATUS_LABELS[entry.statusInterno] ?? entry.statusInterno,
		formatDateTimeInOperationTimezone(entry.dataEmissao) ?? "",
		situacao === "INCLUÍDO" ? entry.caminhoNoZip : "",
		situacao,
	]);
	const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(";")).join("\r\n");
	return new TextEncoder().encode(`﻿${csv}`);
}

async function main() {
	const orgQuery = arg("org");
	const month = arg("month");
	const asset = (arg("asset") ?? "xml") as "xml" | "pdf";
	if (!orgQuery || !month) throw new Error("Informe --org=<id|slug|nome> e --month=AAAA-MM.");
	if (asset !== "xml" && asset !== "pdf") throw new Error("--asset deve ser xml ou pdf.");

	const organization = await resolveOrganization(orgQuery);
	const { periodAfter, periodBefore } = resolveMonth(month);
	const outDir = path.resolve(arg("out") ?? path.join(process.cwd(), "..", "recompracrm-tmpworks", "fiscal-exports"));
	await mkdir(outDir, { recursive: true });
	const zipPath = path.join(outDir, `notas-fiscais-${asset}-${organization.slug}-${month}.zip`);

	console.log(`Organização: ${organization.nome} (${organization.id})`);
	console.log(`Período: ${periodAfter.toISOString()} → ${periodBefore.toISOString()} | arquivo: ${asset}`);

	const filters = { search: null, statusInterno: [], tipos: [], ambiente: null, periodAfter, periodBefore };
	const fetchPage = (page: number) => listFiscalDocumentAssetsForExport({ organizationId: organization.id, filters, asset, page });

	const output = createWriteStream(zipPath);
	const outputClosed = new Promise<void>((resolve, reject) => {
		output.on("finish", resolve);
		output.on("error", reject);
	});
	let zipError: Error | null = null;
	const zip = new Zip((error, chunk, final) => {
		if (error) {
			zipError = error;
			return;
		}
		output.write(chunk);
		if (final) output.end();
	});
	// Síncrono: o fflate comprime no push, então arquivos de downloads concorrentes não se intercalam.
	const addFile = (filePath: string, data: Uint8Array, compress: boolean) => {
		const file = compress ? new ZipDeflate(filePath, { level: 6 }) : new ZipPassThrough(filePath);
		zip.add(file);
		file.push(data, true);
	};

	const report: { entry: TEntry; situacao: string }[] = [];
	let totalPages: number | null = null;
	let matched: number | null = null;
	let included = 0;

	for (let page = 1; totalPages === null || page <= totalPages; page++) {
		const result = await fetchPage(page);
		if (page === 1) {
			totalPages = result.totalPages ?? 0;
			matched = result.documentsMatched ?? 0;
			console.log(`Documentos no recorte: ${matched} (${totalPages} página(s))`);
		}
		const rows = result.arquivos;
		if (rows.length === 0) break;

		const results = await mapWithConcurrency(rows, DOWNLOAD_CONCURRENCY, download);

		// URL vencida ou falha de rede: repede a página uma vez, com URLs novas.
		const retryIndexes = results.flatMap((r, index) => (!r.ok && r.retryable ? [index] : []));
		if (retryIndexes.length > 0) {
			const fresh = await fetchPage(page);
			const freshById = new Map(fresh.arquivos.map((entry) => [entry.documentoId, entry]));
			await mapWithConcurrency(retryIndexes, DOWNLOAD_CONCURRENCY, async (index) => {
				const freshEntry = freshById.get(rows[index].documentoId);
				if (freshEntry) results[index] = await download(freshEntry);
			});
		}

		rows.forEach((entry, index) => {
			const r = results[index];
			if (r.ok) {
				// XML comprime ~10x; PDF já vem comprimido.
				addFile(entry.caminhoNoZip, r.data, asset === "xml");
				included += 1;
			}
			report.push({ entry, situacao: r.ok ? "INCLUÍDO" : r.motivo });
		});
		console.log(`Página ${page}/${totalPages}: ${rows.length} documento(s), ${results.filter((r) => r.ok).length} incluído(s)`);
	}

	addFile("_RELATORIO.csv", buildReportCsv(report), true);
	zip.end();
	await outputClosed;
	if (zipError) throw zipError;

	const failures = report.filter((line) => line.situacao !== "INCLUÍDO");
	console.log(`\nZIP: ${zipPath}`);
	console.log(`Incluídos: ${included} de ${report.length}${failures.length > 0 ? ` | ${failures.length} sem arquivo (ver _RELATORIO.csv)` : ""}`);
	for (const { entry, situacao } of failures.slice(0, 20)) {
		console.log(`  ${entry.tipo} ${entry.serie ?? "-"}/${entry.numero ?? "-"} ${entry.chaveAcesso ?? entry.documentoId}: ${situacao}`);
	}
	if (failures.length > 20) console.log(`  ... e mais ${failures.length - 20}`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
