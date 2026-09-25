import "dotenv/config";
import type { TCanonicalImportBatch, TCanonicalSale } from "@/lib/data-connectors";
import { syncAuxiliaryEntities } from "@/lib/data-collecting-v2/sync-auxiliary-entities";
import { connection, db } from "@/services/drizzle";
import { integrations, sales } from "@/services/drizzle/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";

/**
 * Ensaio do modo sombra de `syncAuxiliaryEntities` sem depender dos conectores.
 *
 * Para cada integração ativa, reconstrói um lote canônico a partir das últimas vendas
 * persistidas dessa integração (cliente, itens, vendedor, parceiro) e roda o sync em SHADOW dentro
 * de uma transação que é sempre revertida. O que interessa é a linha `[AUX_SHADOW]` de cada lote:
 * ela compara, chave a chave, o carregamento completo contra o direcionado.
 *
 * Uso:
 *   npx tsx scripts/verify-auxiliary-load-shadow.ts [--org <id>] [--sales 200]
 */

const ROLLBACK = new Error("ROLLBACK");

function readFlag(name: string): string | null {
	const index = process.argv.indexOf(`--${name}`);
	if (index === -1) return null;
	const value = process.argv[index + 1];
	return value && !value.startsWith("--") ? value : null;
}

async function buildBatchFromPersistedSales(
	integration: { id: string; organizacaoId: string; tipo: string },
	limit: number,
): Promise<TCanonicalImportBatch | null> {
	const rows = await db.query.sales.findMany({
		where: and(eq(sales.organizacaoId, integration.organizacaoId), eq(sales.integracaoId, integration.id), isNotNull(sales.clienteId)),
		orderBy: desc(sales.dataVenda),
		limit,
		columns: { id: true, idExterno: true, valorTotal: true, dataVenda: true, parceiro: true, vendedorNome: true },
		with: {
			cliente: { columns: { idExterno: true, nome: true, telefone: true, telefoneBase: true } },
			vendedor: { columns: { identificador: true, nome: true } },
			itens: { columns: { produtoId: true }, with: { produto: { columns: { codigo: true } } } },
		},
	});
	if (rows.length === 0) return null;

	const canonicalSales: TCanonicalSale[] = rows.map((row) => ({
		sourceSaleId: row.idExterno,
		totalValue: row.valorTotal,
		totalCost: 0,
		totalDiscount: 0,
		totalSurcharge: 0,
		sellerName: row.vendedorNome ?? "",
		channel: null,
		deliveryMode: "RETIRADA",
		partnerIdentifier: row.parceiro && row.parceiro !== "N/A" ? row.parceiro : null,
		key: "",
		document: "",
		model: "",
		movement: "",
		nature: "",
		series: "",
		statusText: "",
		type: "",
		occurredAt: row.dataVenda,
		client: row.cliente
			? { externalId: row.cliente.idExterno, name: row.cliente.nome, phone: row.cliente.telefone ?? "", basePhone: row.cliente.telefoneBase ?? "" }
			: null,
		seller: row.vendedor ? { identifier: row.vendedor.identificador || row.vendedor.nome, name: row.vendedor.nome } : null,
		partner: null,
		items: row.itens
			.filter((item) => item.produto?.codigo)
			.map((item) => ({
				productExternalId: null,
				productCode: item.produto!.codigo,
				quantity: 1,
				unitSaleValue: 0,
				unitCostValue: 0,
				grossSaleValue: 0,
				discountValue: 0,
				netSaleValue: 0,
				totalCostValue: 0,
			})),
		isValidSale: true,
		isCanceled: false,
	})) as TCanonicalSale[];

	return {
		organizationId: integration.organizacaoId,
		integrationId: integration.id,
		source: integration.tipo,
		window: { startDate: new Date(0), endDate: new Date() },
		policies: { clientResolutionStrategy: "EXTERNAL_ID_THEN_PHONE", saleItemRewritePolicy: "REPLACE_ON_EVERY_SYNC" },
		sales: canonicalSales,
		products: [],
		sellers: [],
		partners: [],
		productAddOns: [],
		productAddOnOptions: [],
	} as unknown as TCanonicalImportBatch;
}

async function main() {
	process.env.DATA_COLLECTING_AUX_LOAD_MODE = "SHADOW";
	const organizationId = readFlag("org");
	const limit = Number(readFlag("sales") ?? 200);

	const activeIntegrations = await db.query.integrations.findMany({
		where: organizationId ? eq(integrations.organizacaoId, organizationId) : undefined,
		columns: { id: true, organizacaoId: true, tipo: true },
	});

	for (const integration of activeIntegrations) {
		const batch = await buildBatchFromPersistedSales(integration, limit);
		if (!batch) {
			console.log(`[SKIP] ${integration.tipo} ${integration.id}: sem vendas persistidas.`);
			continue;
		}
		console.log(`[RUN] ${integration.tipo} ${integration.id} org=${integration.organizacaoId}: ${batch.sales.length} venda(s) reconstruída(s).`);
		try {
			await db.transaction(async (tx) => {
				await syncAuxiliaryEntities({ tx, batch });
				throw ROLLBACK;
			});
		} catch (error) {
			if (error !== ROLLBACK) throw error;
		}
	}

	await connection.end();
}

main().catch(async (error) => {
	console.error(error);
	await connection.end();
	process.exit(1);
});
