import type { TDataConnector } from "../types";
import {
	fetchSqlViewsClients,
	fetchSqlViewsMetadata,
	fetchSqlViewsProducts,
	fetchSqlViewsSaleItems,
	fetchSqlViewsSales,
	withSqlViewsSession,
} from "./client";
import { isSqlViewsAnonymousClient, toCanonicalSqlViewsImportBatch } from "./mappers";
import { SqlViewsConfigSchema } from "./types";

const LOG_PREFIX = "[SQL_VIEWS_SYNC]";

export const sqlViewsDataConnector: TDataConnector = {
	kind: "SQL-VIEWS",
	fetchImportBatch: async ({ organizationId, integrationId, config, window }) => {
		const parsedConfig = SqlViewsConfigSchema.parse(config);
		const startedAt = Date.now();

		// Fases da leitura, em ms desde o início: o tempo total fica em ~6–7 s com 76 ou com 396
		// vendas, então o custo é fixo — conexão (DDNS/TLS) ou avaliação das views no ERP. Medir
		// cada fase separa os dois antes de mexer em janela ou cadência.
		const phases: Record<string, number> = {};
		const mark = (phase: string) => {
			phases[phase] = Date.now() - startedAt;
		};
		const rows = await withSqlViewsSession(parsedConfig, async (session) => {
			mark("conexao");
			const metadata = await fetchSqlViewsMetadata(session);
			mark("metadata");
			const sales = await fetchSqlViewsSales({ session, window, storeId: parsedConfig.storeId });
			mark("vendas");
			if (sales.length === 0) return { metadata, sales, items: [], clients: [], products: [] };

			const items = await fetchSqlViewsSaleItems(
				session,
				sales.map((sale) => sale.venda_id),
			);
			mark("itens");
			const clientIds = sales
				.filter(
					(sale) =>
						!!sale.cliente_id &&
						!isSqlViewsAnonymousClient({
							clientId: sale.cliente_id,
							name: sale.cliente_nome,
							anonymousClientIds: parsedConfig.anonymousClientIds,
						}),
				)
				.map((sale) => sale.cliente_id as string);
			const productIds = items.map((item) => item.produto_id).filter((id): id is string => !!id);
			const [clients, products] = await Promise.all([
				clientIds.length > 0 ? fetchSqlViewsClients(session, clientIds) : [],
				productIds.length > 0 ? fetchSqlViewsProducts(session, productIds) : [],
			]);
			mark("clientesProdutos");
			return { metadata, sales, items, clients, products };
		});
		mark("fim");

		console.log(
			`${LOG_PREFIX} org=${organizationId} integração=${integrationId} loja=${parsedConfig.storeId ?? "*"} sistema="${rows.metadata.sistema_nome ?? "N/A"}" contrato=${rows.metadata.contrato_versao}: ${rows.sales.length} venda(s), ${rows.items.length} item(ns), ${rows.clients.length} cliente(s), ${rows.products.length} produto(s) em ${Date.now() - startedAt}ms.`,
			{ fasesMs: phases },
		);

		return toCanonicalSqlViewsImportBatch({
			organizationId,
			window,
			sales: rows.sales,
			items: rows.items,
			clients: rows.clients,
			products: rows.products,
			anonymousClientIds: parsedConfig.anonymousClientIds,
		});
	},
};
