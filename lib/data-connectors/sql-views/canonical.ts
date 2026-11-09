import type { TDataConnector } from "../types";
import {
	fetchSqlViewsClients,
	fetchSqlViewsMetadata,
	fetchSqlViewsProducts,
	fetchSqlViewsSaleItems,
	fetchSqlViewsSalePayments,
	fetchSqlViewsSales,
	sqlViewsViewExists,
	withSqlViewsSession,
} from "./client";
import { isSqlViewsAnonymousClient, toCanonicalSqlViewsImportBatch } from "./mappers";
import { SQL_VIEWS, SqlViewsConfigSchema } from "./types";

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
			if (sales.length === 0) return { metadata, sales, items: [], clients: [], products: [], payments: null };

			const saleIds = sales.map((sale) => sale.venda_id);
			const items = await fetchSqlViewsSaleItems(session, saleIds);
			mark("itens");
			// View opcional: fonte sem pagamentos segue com `payments = null` (acúmulo pelo total).
			const payments = (await sqlViewsViewExists(session, SQL_VIEWS.salePayments)) ? await fetchSqlViewsSalePayments(session, saleIds) : null;
			mark("pagamentos");
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
			return { metadata, sales, items, clients, products, payments };
		});
		mark("fim");

		console.log(
			`${LOG_PREFIX} org=${organizationId} integração=${integrationId} loja=${parsedConfig.storeId ?? "*"} sistema="${rows.metadata.sistema_nome ?? "N/A"}" contrato=${rows.metadata.contrato_versao}: ${rows.sales.length} venda(s), ${rows.items.length} item(ns), ${rows.payments ? `${rows.payments.length} pagamento(s)` : "sem view de pagamentos"}, ${rows.clients.length} cliente(s), ${rows.products.length} produto(s) em ${Date.now() - startedAt}ms.`,
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
			payments: rows.payments,
			paymentMethodMapping: parsedConfig.paymentMethodMapping,
		});
	},
};
