import type { TSaleCapiMetadata, TSaleIntegrationMetadata } from "@/schemas/sales";
import { relations, sql } from "drizzle-orm";
import { boolean, doublePrecision, index, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { campaignConversions } from "./campaign-conversions";
import { campaigns } from "./campaigns";
import { cashbackProgramTransactions } from "./cashback-programs";
import { clientLocations, clients } from "./clients";
import { newTable } from "./common";
import { deliveryModeEnum, saleAttendanceStatusEnum, saleProcessingSourceEnum, saleStatusEnum } from "./enums";
import { accountingEntries, fiscalOutboundDocuments } from "./financial";
import { integrations } from "./integrations";
import { interactions } from "./interactions";
import { organizations } from "./organizations";
import { partners } from "./partners";
import { productAddOnOptions, productStockTransactions, productVariants, products } from "./products";
import { salesSessions } from "./sales-sessions";
import { sellers } from "./sellers";
import { tabOrders, tabs } from "./tabs";

export const sales = newTable(
	"sales",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "set null" }), // allow nulls for non-identified clients
		idExterno: text("id_externo").notNull(),
		// Proveniência: de qual conexão de `integrations` esta venda foi importada. Null = venda
		// interna/sem atribuição determinística. RESTRICT: a integração que originou vendas não é
		// apagada fisicamente (soft delete, D9 do plano de migração de fontes de dados).
		integracaoId: varchar("integracao_id", { length: 255 }).references(() => integrations.id, { onDelete: "restrict" }),

		valorTotal: doublePrecision("valor_total").notNull(),

		// value "modifiers"
		descontosTotal: doublePrecision("descontos_total"), // sum of everything that reduces the total "expected" value
		acrescimosTotal: doublePrecision("acrescimos_total"), // sum of everything that increases the total "expected" value

		custoTotal: doublePrecision("custo_total").notNull(),
		vendedorNome: text("vendedor_nome").notNull(),
		vendedorId: varchar("vendedor_id", { length: 255 }).references(() => sellers.id, { onDelete: "set null" }),
		// Partner
		parceiro: text("parceiro").notNull(),
		parceiroId: varchar("parceiro_id", { length: 255 }).references(() => partners.id, { onDelete: "set null" }),
		// Other details
		chave: text("chave").notNull(),
		documento: text("documento").notNull(),
		modelo: text("modelo").notNull(),
		movimento: text("movimento").notNull(),
		natureza: text("natureza").notNull(),
		serie: text("serie").notNull(),
		situacao: text("situacao").notNull(),
		tipo: text("tipo").notNull(),
		canal: text("canal"),

		// Delivery
		entregaModalidade: deliveryModeEnum("entrega_modalidade"),
		entregaLocalizacaoId: varchar("entrega_localizacao_id", { length: 255 }).references(() => clientLocations.id, { onDelete: "set null" }),
		// Conta de atendimento (tab) que agrega esta venda. Uma unica venda ORCAMENTO por tab
		// (partial unique idx_sales_tab_rascunho); 1:N estrutural p/ fechamento parcial futuro.
		tabId: varchar("tab_id", { length: 255 }).references(() => tabs.id, { onDelete: "set null" }),
		comandaNumero: text("comanda_numero"),
		observacoes: text("observacoes"),
		rascunhoMetadados: jsonb("rascunho_metadados"),

		dataVenda: timestamp("data_venda"),
		// Conversion Attribution fields
		atribuicaoProcessada: boolean("atribuicao_processada").default(false),
		atribuicaoCampanhaPrincipalId: varchar("atribuicao_campanha_principal_id", { length: 255 }).references(() => campaigns.id),
		atribuicaoCampanhaConversaoId: varchar("atribuicao_campanha_conversao_id", { length: 255 }),
		atribuicaoInteracaoId: varchar("atribuicao_interacao_id", { length: 255 }).references(() => interactions.id, {
			onDelete: "set null",
		}),
		atribuicaoAplicavel: boolean("atribuicao_aplicavel").default(false),

		// ERP: origem do processamento da venda
		processamentoOrigem: saleProcessingSourceEnum("processamento_origem").default("EXTERNO"),
		// ERP: status comercial da venda (apenas se a venda existe comercialmente e pode gerar efeitos de ERP)
		statusVenda: saleStatusEnum("status_venda"),
		// ERP: status operacional de atendimento/fulfillment da venda
		statusAtendimento: saleAttendanceStatusEnum("status_atendimento").notNull().default("NAO_INICIADO"),
		// Momento em que o `statusAtendimento` ATUAL passou a valer. Reescrito a cada transicao —
		// e so quando o status muda de fato: um re-sync que reafirma o mesmo status nao pode
		// remarcar a venda como recem-concluida. Como ENTREGUE e terminal, numa venda entregue este
		// campo e permanentemente a hora da entrega, e e por ele (nunca por `dataVenda`) que o
		// quadro de atendimento recorta os concluidos recentes. Nas etapas ativas, e a idade do
		// pedido na etapa. Escreva sempre via os helpers de `lib/sales/sale-processing/attendance`.
		// null = venda anterior a coluna e nunca transicionada desde entao (backfill: `data_venda`).
		statusAtendimentoData: timestamp("status_atendimento_data"),
		// ERP: override por venda da emissão fiscal automática. null = herda organizacao.fiscalEmissaoAutomatica;
		// true/false = decisão explícita da venda (respeitada tanto no confirm quanto na entrega).
		emissaoFiscalAutomatica: boolean("emissao_fiscal_automatica"),
		// Sessão de venda que recortou esta venda (nullable). Denormalização p/ relatório/atribuição.
		sessaoVendaId: varchar("sessao_venda_id", { length: 255 }).references(() => salesSessions.id, { onDelete: "set null" }),
		// Estado do envio de conversão (Purchase) ao Conversions API da Meta (dedup/observabilidade/
		// retry). null = ainda não processada pelo cron de CAPI. Sem PII crua — só resumo do envio.
		capiMetadados: jsonb("capi_metadados").$type<TSaleCapiMetadata>(),
		// Detalhamento de venda de canal de integração (frete próprio, descontos por patrocinador,
		// taxas do canal) — insumo do fiscal (fase 5) e da conciliação de repasse (fase 4b).
		// null em vendas internas/conectores sem detalhamento.
		integracaoMetadados: jsonb("integracao_metadados").$type<TSaleIntegrationMetadata>(),
		// Assinatura da última projeção de persistência importada pelo data-collecting (formato
		// "v1:<sha256>"). Assinatura igual = a fonte não mudou = sync pula as escritas da venda.
		// null = venda nunca carimbada (legado ou interna) — tratada como alterada no próximo sync.
		assinaturaExterna: text("assinatura_externa"),
	},
	(table) => ({
		clientIdIdx: index("idx_sales_client_id").on(table.clienteId),
		parceiroIdx: index("idx_sales_parceiro").on(table.parceiro),
		dataVendaIdx: index("idx_sales_data_venda").on(table.dataVenda),
		vendedorIdx: index("idx_sales_vendedor").on(table.vendedorNome),
		naturezaIdx: index("idx_sales_natureza").on(table.natureza),
		valorTotalIdx: index("idx_sales_valor_total").on(table.valorTotal),
		sessaoVendaIdx: index("idx_sales_sessao").on(table.sessaoVendaId),
		// Listagem do histórico e stats sempre filtram por organização e ordenam/filtram por data.
		orgDataVendaIdx: index("idx_sales_org_data_venda").on(table.organizacaoId, table.dataVenda),
		integrationExternalIdUnique: uniqueIndex("idx_sales_org_integration_external_unique")
			.on(table.organizacaoId, table.integracaoId, table.idExterno)
			.where(sql`integracao_id IS NOT NULL`),
		tabIdx: index("idx_sales_tab").on(table.tabId),
		// Recorte do quadro de atendimento: por organizacao, por etapa, ordenado pelo momento da
		// etapa. Cobre tanto a janela dos concluidos recentes quanto a varredura das etapas ativas.
		orgAtendimentoDataIdx: index("idx_sales_org_atendimento_data").on(table.organizacaoId, table.statusAtendimento, table.statusAtendimentoData),
		// Uma unica venda em rascunho por conta de atendimento.
		tabRascunhoIdx: uniqueIndex("idx_sales_tab_rascunho")
			.on(table.tabId)
			.where(sql`status_venda = 'ORCAMENTO' AND tab_id IS NOT NULL`),
	}),
);
export type TSaleEntity = typeof sales.$inferSelect;
export type TNewSaleEntity = typeof sales.$inferInsert;

export const salesRelations = relations(sales, ({ one, many }) => ({
	cliente: one(clients, {
		fields: [sales.clienteId],
		references: [clients.id],
	}),
	vendedor: one(sellers, {
		fields: [sales.vendedorId],
		references: [sellers.id],
	}),
	parceiro: one(partners, {
		fields: [sales.parceiroId],
		references: [partners.id],
	}),
	atribuicaoCampanhaPrincipal: one(campaigns, {
		fields: [sales.atribuicaoCampanhaPrincipalId],
		references: [campaigns.id],
	}),
	atribuicaoInteracao: one(interactions, {
		fields: [sales.atribuicaoInteracaoId],
		references: [interactions.id],
	}),
	atribuicaoCampanhaConversao: one(campaignConversions, {
		fields: [sales.atribuicaoCampanhaConversaoId],
		references: [campaignConversions.id],
	}),
	itens: many(saleItems),
	transacoesCashback: many(cashbackProgramTransactions),
	entregaLocalizacao: one(clientLocations, {
		fields: [sales.entregaLocalizacaoId],
		references: [clientLocations.id],
	}),
	sessao: one(salesSessions, {
		fields: [sales.sessaoVendaId],
		references: [salesSessions.id],
	}),
	tab: one(tabs, {
		fields: [sales.tabId],
		references: [tabs.id],
	}),
	integracao: one(integrations, {
		fields: [sales.integracaoId],
		references: [integrations.id],
	}),
	// ERP back-relations
	lancamentosContabeis: many(accountingEntries),
	documentosFiscais: many(fiscalOutboundDocuments),
	movimentacoesEstoque: many(productStockTransactions),
}));

export const saleItems = newTable(
	"sale_items",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		vendaId: varchar("venda_id", { length: 255 })
			.references(() => sales.id, { onDelete: "cascade" })
			.notNull(),
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "cascade" }),
		produtoId: varchar("produto_id", { length: 255 })
			.references(() => products.id)
			.notNull(),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id),
		quantidade: doublePrecision("quantidade").notNull(),
		// NOTE: This unit price should be the (Variant Price + Sum of Modifiers)
		valorVendaUnitario: doublePrecision("valor_unitario").notNull(), // valor de venda unitário do produto
		valorCustoUnitario: doublePrecision("valor_custo_unitario").notNull(), // valor de custo unitário do produto
		valorVendaTotalBruto: doublePrecision("valor_venda_total_bruto").notNull(), // valor total do produto (sem desconto) (quantidade * valorUnitario)
		valorTotalDesconto: doublePrecision("valor_total_desconto").notNull(), // valor total em desconto
		valorVendaTotalLiquido: doublePrecision("valor_venda_total_liquido").notNull(), // valor total do produto na venda (com desconto) (quantidade * valorUnitario - valorTotalDesconto)
		valorCustoTotal: doublePrecision("valor_custo_total").notNull(), // valor total de custos,
		// Rastreabilidade operacional minima por item (fulfillment)
		quantidadeReservada: doublePrecision("quantidade_reservada").notNull().default(0), // quantidade reservada (sem baixa fisica)
		quantidadeSeparada: doublePrecision("quantidade_separada").notNull().default(0), // quantidade separada para entrega/retirada
		quantidadeEntregue: doublePrecision("quantidade_entregue").notNull().default(0), // quantidade efetivamente entregue (baixa fisica)
		quantidadeCancelada: doublePrecision("quantidade_cancelada").notNull().default(0), // quantidade cancelada do item
		// Pedido/rodada da conta de atendimento ao qual o item pertence (nullable — vendas comuns nao tem rodada).
		tabOrderId: varchar("tab_order_id", { length: 255 }).references(() => tabOrders.id, { onDelete: "set null" }),
		// Observação livre do item ("sem cebola", "ponto mal passado"). Coluna e nao chave em
		// `metadados` porque a cozinha/impressao precisa consultar isto, nao so reidratar o carrinho.
		observacoes: text("observacoes"),
		metadados: jsonb("metadados"), // metadados do produto (JSONB)
	},
	(table) => ({
		vendaIdIdx: index("idx_sale_items_venda_id").on(table.vendaId),
		tabOrderIdx: index("idx_sale_items_tab_order").on(table.tabOrderId),
		produtoIdIdx: index("idx_sale_items_produto_id").on(table.produtoId),
		clienteIdIdx: index("idx_sale_items_cliente_id").on(table.clienteId),
		valoresIdx: index("idx_sale_items_valores").on(table.valorVendaTotalLiquido, table.valorCustoTotal),
		// Agregações por organização (stats de produtos, filtros de produto no histórico de vendas) sem
		// varrer os itens de todas as organizações.
		orgProdutoIdx: index("idx_sale_items_org_produto").on(table.organizacaoId, table.produtoId),
	}),
);
export const saleItemsRelations = relations(saleItems, ({ one, many }) => ({
	produto: one(products, {
		fields: [saleItems.produtoId],
		references: [products.id],
	}),
	tabOrder: one(tabOrders, {
		fields: [saleItems.tabOrderId],
		references: [tabOrders.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [saleItems.produtoVarianteId],
		references: [productVariants.id],
	}),
	venda: one(sales, {
		fields: [saleItems.vendaId],
		references: [sales.id],
	}),
	adicionais: many(saleItemModifiers),
}));
export type TSaleItemEntity = typeof saleItems.$inferSelect;
export type TNewSaleItemEntity = typeof saleItems.$inferInsert;

export const saleItemModifiers = newTable("sale_item_modifiers", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),

	// Links to the specific line item (e.g., The "Burger" on line 3)
	itemVendaId: varchar("item_venda_id", { length: 255 })
		.references(() => saleItems.id, { onDelete: "cascade" })
		.notNull(),

	// Link to the definition (for inventory/reporting: "How much Bacon did we sell?")
	opcaoId: varchar("opcao_id", { length: 255 }).references(() => productAddOnOptions.id, { onDelete: "set null" }),

	// SNAPSHOT DATA (History preservation)
	nome: text("nome").notNull(), // "Extra Bacon"

	quantidade: doublePrecision("quantidade").default(1.0).notNull(),
	valorUnitario: doublePrecision("valor_unitario").notNull(), // Price at moment of sale
	valorTotal: doublePrecision("valor_total").notNull(), // Qty * UnitPrice
});

export const saleItemModifiersRelations = relations(saleItemModifiers, ({ one }) => ({
	itemVenda: one(saleItems, {
		fields: [saleItemModifiers.itemVendaId],
		references: [saleItems.id],
	}),
	opcao: one(productAddOnOptions, {
		fields: [saleItemModifiers.opcaoId],
		references: [productAddOnOptions.id],
	}),
}));
