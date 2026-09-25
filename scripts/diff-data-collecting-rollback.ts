import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { persistCanonicalBatch } from "@/lib/data-collecting-v2";
import { fetchConnectorImportBatch, type TCanonicalImportBatch } from "@/lib/data-connectors";
import { getActiveDataSourceIntegrations } from "@/lib/integrations/data-sources";
import { connection, db, type DBTransaction } from "@/services/drizzle";
import {
	campaignDispatches,
	cashbackProgramTransactions,
	clients,
	organizations,
	partners,
	saleItems,
	sales,
	sellers,
} from "@/services/drizzle/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";

/**
 * Ensaio diferencial da ingestão (data-collecting-v2) sem gravar nada.
 *
 * Para cada integração ativa (exceto iFood, cujo polling tem ACK acoplado), busca o lote real do
 * conector e roda `persistCanonicalBatch` completo — entidades auxiliares, vendas, audiências,
 * efeitos (cashback, campanhas, atribuição). O hook `onPersist` roda DENTRO da transação: é ali que
 * o que seria gravado é fotografado, e em seguida a transação é revertida. Rodar o mesmo script no
 * commit anterior e no atual e comparar as fotografias responde "a ingestão ainda escreve a mesma
 * coisa?".
 *
 * Ids gerados nesta transação (vendas e clientes novos, disparos, transações de cashback) mudam a
 * cada execução; por isso vendas são identificadas pelo idExterno e clientes por
 * idExterno|telefoneBase|nome. Carimbos "agora" ficam de fora.
 *
 * Uso:
 *   npx tsx scripts/diff-data-collecting-rollback.ts --out <dir> [--hours 72] [--org <id>] [--mode TARGETED]
 */

const ROLLBACK = new Error("ROLLBACK");

function readFlag(name: string): string | null {
	const index = process.argv.indexOf(`--${name}`);
	if (index === -1) return null;
	const value = process.argv[index + 1];
	return value && !value.startsWith("--") ? value : null;
}

function normalizeName(value?: string | null) {
	return (value ?? "").trim().toUpperCase();
}

function clientKey(client: { idExterno: string | null; telefoneBase: string | null; nome: string }) {
	return `${client.idExterno ?? ""}|${client.telefoneBase ?? ""}|${normalizeName(client.nome)}`;
}

function minute(value: Date | null | undefined) {
	return value ? new Date(Math.floor(value.getTime() / 60000) * 60000).toISOString() : null;
}

function sortBy<T>(values: T[], key: (value: T) => string) {
	return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

async function captureSnapshot(tx: DBTransaction, batch: TCanonicalImportBatch, summary: unknown) {
	const organizationId = batch.organizationId;
	const sourceSaleIds = batch.sales.map((sale) => sale.sourceSaleId);

	const saleRows =
		sourceSaleIds.length > 0
			? await tx.query.sales.findMany({
					where: and(eq(sales.organizacaoId, organizationId), eq(sales.integracaoId, batch.integrationId), inArray(sales.idExterno, sourceSaleIds)),
					with: { itens: { with: { produto: { columns: { codigo: true } }, adicionais: true } } },
				})
			: [];
	const saleIdToExternal = new Map(saleRows.map((row) => [row.id, row.idExterno]));
	const saleIds = saleRows.map((row) => row.id);

	const canonicalClients = batch.sales.map((sale) => sale.client).filter((client): client is NonNullable<typeof client> => !!client);
	const externalIds = Array.from(new Set(canonicalClients.map((client) => client.externalId).filter((value): value is string => !!value)));
	const basePhones = Array.from(new Set(canonicalClients.map((client) => client.basePhone).filter(Boolean)));
	const names = Array.from(new Set(canonicalClients.map((client) => normalizeName(client.name)).filter(Boolean)));
	const referencedClientIds = Array.from(new Set(saleRows.map((row) => row.clienteId).filter((value): value is string => !!value)));
	const clientMatchers = [
		...(externalIds.length ? [inArray(clients.idExterno, externalIds)] : []),
		...(basePhones.length ? [inArray(clients.telefoneBase, basePhones)] : []),
		...(names.length ? [inArray(sql`upper(btrim(${clients.nome}))`, names)] : []),
		...(referencedClientIds.length ? [inArray(clients.id, referencedClientIds)] : []),
	];
	const clientRows =
		clientMatchers.length > 0
			? await tx.query.clients.findMany({
					where: and(eq(clients.organizacaoId, organizationId), or(...clientMatchers)),
					with: { autorVendedor: { columns: { identificador: true, nome: true } } },
				})
			: [];
	const clientIdToKey = new Map(clientRows.map((row) => [row.id, clientKey(row)]));

	const sellerRows = await tx.query.sellers.findMany({
		where: eq(sellers.organizacaoId, organizationId),
		columns: { id: true, identificador: true, nome: true },
	});
	const sellerIdToKey = new Map(sellerRows.map((row) => [row.id, row.identificador || row.nome]));
	const partnerRows = await tx.query.partners.findMany({
		where: eq(partners.organizacaoId, organizationId),
		columns: { id: true, identificador: true },
	});
	const partnerIdToKey = new Map(partnerRows.map((row) => [row.id, row.identificador]));

	const cashbackRows =
		saleIds.length > 0 ? await tx.query.cashbackProgramTransactions.findMany({ where: inArray(cashbackProgramTransactions.vendaId, saleIds) }) : [];

	const dispatchRows =
		saleIds.length > 0
			? await tx.query.campaignDispatches.findMany({
					where: and(
						eq(campaignDispatches.organizacaoId, organizationId),
						inArray(
							campaignDispatches.janelaReferencia,
							saleIds.map((id) => `venda:${id}`),
						),
					),
					with: { campanha: { columns: { titulo: true, gatilhoTipo: true } }, destinatarios: true },
				})
			: [];

	// Itens de vendas do lote (para contagem/valores por venda) — evita depender do id do item.
	void saleItems;

	return {
		summary,
		sales: sortBy(
			saleRows.map((row) => ({
				idExterno: row.idExterno,
				cliente: row.clienteId ? (clientIdToKey.get(row.clienteId) ?? row.clienteId) : null,
				vendedor: row.vendedorId ? (sellerIdToKey.get(row.vendedorId) ?? row.vendedorId) : null,
				parceiro: row.parceiroId ? (partnerIdToKey.get(row.parceiroId) ?? row.parceiroId) : null,
				valorTotal: row.valorTotal,
				statusVenda: row.statusVenda,
				statusAtendimento: row.statusAtendimento,
				canal: row.canal,
				dataVenda: row.dataVenda?.toISOString() ?? null,
				assinaturaExterna: row.assinaturaExterna,
				itens: sortBy(
					row.itens.map((item) => ({
						produto: item.produto?.codigo ?? item.produtoId,
						variante: item.produtoVarianteId,
						quantidade: item.quantidade,
						liquido: item.valorVendaTotalLiquido,
						adicionais: item.adicionais.length,
					})),
					(item) => `${item.produto}|${item.variante}|${item.quantidade}|${item.liquido}`,
				),
			})),
			(row) => row.idExterno,
		),
		clients: sortBy(
			clientRows.map((row) => ({
				chave: clientKey(row),
				metadataTotalCompras: row.metadataTotalCompras,
				metadataValorTotalCompras: row.metadataValorTotalCompras,
				primeiraCompra: row.primeiraCompraId ? (saleIdToExternal.get(row.primeiraCompraId) ?? row.primeiraCompraId) : null,
				ultimaCompra: row.ultimaCompraId ? (saleIdToExternal.get(row.ultimaCompraId) ?? row.ultimaCompraId) : null,
				primeiraCompraData: row.primeiraCompraData?.toISOString() ?? null,
				ultimaCompraData: row.ultimaCompraData?.toISOString() ?? null,
				analiseRFMTitulo: row.analiseRFMTitulo,
				autorVendedor: row.autorVendedor ? row.autorVendedor.identificador || row.autorVendedor.nome : null,
				telefone: row.telefone,
				localizacao: [row.localizacaoEstado, row.localizacaoCidade],
			})),
			(row) => row.chave,
		),
		cashback: sortBy(
			cashbackRows.map((row) => ({
				venda: row.vendaId ? (saleIdToExternal.get(row.vendaId) ?? row.vendaId) : null,
				cliente: clientIdToKey.get(row.clienteId) ?? row.clienteId,
				tipo: row.tipo,
				status: row.status,
				valor: row.valor,
				valorRestante: row.valorRestante,
				saldoAnterior: row.saldoValorAnterior,
				saldoPosterior: row.saldoValorPosterior,
				ator: (row.metadados as { ator?: string } | null)?.ator ?? null,
			})),
			(row) => `${row.venda}|${row.cliente}|${row.tipo}|${row.ator}`,
		),
		dispatches: sortBy(
			dispatchRows.map((row) => ({
				campanha: row.campanha.titulo,
				gatilho: row.campanha.gatilhoTipo,
				venda: saleIdToExternal.get(row.janelaReferencia.replace(/^venda:/, "")) ?? row.janelaReferencia,
				status: row.status,
				dataAgendada: minute(row.dataAgendada),
				destinatarios: sortBy(
					row.destinatarios.map((recipient) => ({
						cliente: clientIdToKey.get(recipient.clienteId) ?? recipient.clienteId,
						status: recipient.status,
						motivoPulo: recipient.motivoPulo,
						contexto: recipient.contexto,
					})),
					(recipient) => recipient.cliente,
				),
			})),
			(row) => `${row.campanha}|${row.venda}`,
		),
	};
}

async function main() {
	const outDir = readFlag("out");
	if (!outDir) throw new Error("Informe --out <dir>.");
	mkdirSync(outDir, { recursive: true });
	const hours = Number(readFlag("hours") ?? 72);
	const organizationId = readFlag("org");
	const mode = readFlag("mode");
	if (mode) process.env.DATA_COLLECTING_AUX_LOAD_MODE = mode;

	const window = { startDate: new Date(Date.now() - hours * 3600 * 1000), endDate: new Date() };
	const integrationsForImport = (await getActiveDataSourceIntegrations({ executor: db })).filter(
		(integration) => integration.configuracao.tipo !== "IFOOD" && (!organizationId || integration.organizacaoId === organizationId),
	);

	for (const integration of integrationsForImport) {
		const organization = await db.query.organizations.findFirst({
			where: eq(organizations.id, integration.organizacaoId),
			columns: { configuracao: true },
		});
		let batch: TCanonicalImportBatch;
		try {
			batch = await fetchConnectorImportBatch({
				organizationId: integration.organizacaoId,
				integrationId: integration.id,
				config: integration.configuracao,
				window,
			});
		} catch (error) {
			console.error(`[FETCH-FAIL] ${integration.tipo} ${integration.id}:`, error instanceof Error ? error.message : error);
			continue;
		}

		let snapshot: unknown = null;
		try {
			await persistCanonicalBatch({
				integration,
				organizationConfiguration: organization?.configuracao ?? null,
				batch,
				effects: { processCashback: true, processCampaigns: true, processConversionAttribution: true },
				mode: "CONTINUA",
				publishDispatches: false,
				onPersist: async (tx, summary) => {
					snapshot = await captureSnapshot(tx, batch, summary);
					throw ROLLBACK;
				},
			});
		} catch (error) {
			if (error !== ROLLBACK) {
				console.error(`[PERSIST-FAIL] ${integration.tipo} ${integration.id}:`, error);
				snapshot = { error: error instanceof Error ? error.message : String(error) };
			}
		}

		const file = join(outDir, `${integration.tipo}-${integration.id}.json`);
		writeFileSync(file, JSON.stringify({ integration: integration.id, tipo: integration.tipo, sales: batch.sales.length, snapshot }, null, 2));
		console.log(`[SNAPSHOT] ${integration.tipo} ${integration.id}: ${batch.sales.length} venda(s) no lote → ${file}`);
	}

	await connection.end();
}

main().catch(async (error) => {
	console.error(error);
	await connection.end();
	process.exit(1);
});
