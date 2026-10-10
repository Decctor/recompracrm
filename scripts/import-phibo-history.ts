/** Importação histórica local do Phibo via pipeline canônico. Execute --dry-run antes de --apply. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { connection, db } from "@/services/drizzle";
import { withProductUpdateStamp } from "@/lib/products/update-stamp";
import { clients, integrations, organizations, products, sales, sellers } from "@/services/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { formatPhoneAsBase } from "@/lib/formatting";
import { persistCanonicalBatch } from "@/lib/data-collecting-v2";
import { recomputeClientMetricsForOrganization } from "@/lib/clients/recompute-metrics";
import type { TCanonicalImportBatch, TCanonicalProduct, TCanonicalSale } from "@/lib/data-connectors";
import type { TDataSourceIntegration } from "@/lib/integrations/data-sources";
import { SaleIntegrationMetadataSchema } from "@/schemas/sales";

const organizationId = "b75a88a2-ef7c-4ff5-a53c-4e227791cad3";
const sourcePath = path.resolve(".local-analysis/phibo/vendas-raw-2026-06-28-a-2026-09-28.json");
const mappingPath = path.resolve(".local-analysis/phibo/import-mapping.json");
const reportPath = path.resolve(".local-analysis/phibo/import-result-2026-06-28-a-2026-09-28.json");
const integrationRef = "phibo-historico";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
if (apply === args.includes("--dry-run")) throw new Error("Informe exatamente --dry-run ou --apply.");

type Decision = { acao: "vincular"; destinoId: string; motivo: string } | { acao: "criar" | "revisar"; motivo: string };
type Mapping = {
	organizacaoId: string;
	periodo: { de: string; ate: string };
	padrao: { clienteSemTelefone: "criar" | "revisar"; produtoSemCodigo: "criar" | "revisar"; vendedorSemIdentificador: "criar" | "revisar" };
	clientes: Record<string, Decision>;
	produtos: Record<string, Decision>;
	vendedores: Record<string, Decision>;
};
type SourceItem = { produtoEan: string; produtoDesc: string; gradeTamanho: string; corDescricao: string; corHexa?: string };
type DetailItem = { ean: string; descricao: string; grade: string; qtde: number; subTotal: number; desconto: number; frete: number; valorTotal: number };
type SourceSale = {
	vendasUuid: string; cupomTrocaId: number | null; origemVenda: string; dataHora: string;
	clienteNome: string; clienteFone: string; clienteEmail: string | null;
	nfeStatus: string; nfeChaveAcesso: string; nfeModelo: number; nfeNumero: number; nfeSerie: number;
	valorDesconto: number; valorCupom: number; valorFrete: number;
	itens: SourceItem[];
	detalhamento: {
		vendedorNomeAbreviado: string | null;
		itensVenda: DetailItem[];
		formasPagamento: Array<{ descricao: string; parcelas: Array<{ parcelaNumero: number; dataVencto: string; valorParcela: number; valorRecebido: number; situacao: string }> }>;
	};
};
type Source = { periodo: { de: string; ate: string }; falhas: Record<string, string>; dias: Record<string, { quantidade: number; vendas: SourceSale[] }> };

const cents = (value: number) => Math.round(value * 100);
const money = (value: number) => cents(value) / 100;
function requireCondition(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

async function main() {
	const source = JSON.parse(await readFile(sourcePath, "utf8")) as Source;
	const mapping = JSON.parse(await readFile(mappingPath, "utf8")) as Mapping;
	requireCondition(mapping.organizacaoId === organizationId, "Organização do de-para divergente.");
	requireCondition(source.periodo.de === mapping.periodo.de && source.periodo.ate === mapping.periodo.ate, "Período do de-para divergente.");
	requireCondition(!Object.keys(source.falhas).length, "Extração tem dias com falha.");
	const sourceSales = Object.entries(source.dias).sort(([a], [b]) => a.localeCompare(b)).flatMap(([, day]) => {
		requireCondition(day.quantidade === day.vendas.length, "Quantidade de vendas de um dia divergente.");
		return day.vendas;
	}).sort((a, b) => a.dataHora.localeCompare(b.dataHora) || a.vendasUuid.localeCompare(b.vendasUuid));
	requireCondition(sourceSales.length === 422, "Quantidade de vendas da fonte mudou; refaça a prévia.");
	requireCondition(new Set(sourceSales.map((sale) => sale.vendasUuid)).size === sourceSales.length, "Há IDs de venda repetidos.");
	const sourceItems = sourceSales.flatMap((sale) => sale.itens);
	requireCondition(sourceItems.length === 721, "Quantidade de itens da fonte mudou; refaça a prévia.");
	const eans = new Set(sourceItems.map((item) => item.produtoEan));
	requireCondition(eans.size === 370 && Object.keys(mapping.produtos).length === eans.size, "De-para de produtos incompleto.");
	for (const ean of eans) requireCondition(mapping.produtos[ean]?.acao !== "revisar" && !!mapping.produtos[ean], `Produto ${ean} sem decisão final.`);
	for (const [ean, decision] of Object.entries(mapping.produtos)) requireCondition(eans.has(ean) && !!decision.motivo?.trim(), `Produto ${ean} inválido no de-para.`);

	const [organization] = await db.select({ id: organizations.id, nome: organizations.nome }).from(organizations).where(eq(organizations.id, organizationId));
	requireCondition(organization?.nome?.toLowerCase() === "use e abluse", "Organização de destino inesperada.");
	const [existingClients, existingProducts, existingSellers] = await Promise.all([
		db.select({ id: clients.id, nome: clients.nome, telefoneBase: clients.telefoneBase, idExterno: clients.idExterno }).from(clients).where(eq(clients.organizacaoId, organizationId)),
		db.select({ id: products.id, codigo: products.codigo, nome: products.nome, grupo: products.grupo }).from(products).where(eq(products.organizacaoId, organizationId)),
		db.select({ id: sellers.id, nome: sellers.nome, identificador: sellers.identificador }).from(sellers).where(eq(sellers.organizacaoId, organizationId)),
	]);
	const clientsById = new Map(existingClients.map((client) => [client.id, client]));
	const clientsByPhone = new Map(existingClients.filter((client) => client.telefoneBase).map((client) => [client.telefoneBase, client]));
	const productsById = new Map(existingProducts.map((product) => [product.id, product]));
	const productsByCode = new Map(existingProducts.map((product) => [product.codigo, product]));
	const sellersById = new Map(existingSellers.map((seller) => [seller.id, seller]));
	const createdProductSamples = new Map<string, SourceItem>();
	const createdProducts: TCanonicalProduct[] = [];
	for (const item of sourceItems) {
		const decision = mapping.produtos[item.produtoEan];
		if (decision.acao !== "criar" || createdProductSamples.has(item.produtoEan)) continue;
		const existingByEan = productsByCode.get(item.produtoEan);
		requireCondition(!existingByEan || existingByEan.grupo === "PHIBO-HISTORICO", `Produto de outra origem já existe pelo EAN ${item.produtoEan}.`);
		createdProductSamples.set(item.produtoEan, item);
		createdProducts.push({ externalId: null, code: item.produtoEan, description: `${item.produtoDesc} - ${item.corDescricao} - ${item.gradeTamanho}`, unit: "UN", group: "PHIBO-HISTORICO", ncm: "N/A", type: "PRODUTO" });
	}
	const sellerNames = new Set(sourceSales.map((sale) => sale.detalhamento.vendedorNomeAbreviado?.trim()).filter((value): value is string => !!value));
	const createdSellers = [...sellerNames].filter((name) => mapping.vendedores[name]?.acao === "criar").map((name) => ({ identifier: name, name }));
	const canonicalSales: TCanonicalSale[] = [];
	for (const sale of sourceSales) {
		requireCondition(sale.origemVenda === "PDV" && sale.nfeStatus === "Emitida" && sale.nfeModelo === 65, `Status inesperado na venda ${sale.vendasUuid}.`);
		const occurredAt = new Date(sale.dataHora);
		requireCondition(!Number.isNaN(occurredAt.getTime()), `Data inválida na venda ${sale.vendasUuid}.`);
		const basePhone = formatPhoneAsBase(sale.clienteFone);
		requireCondition(!!basePhone, `Telefone inválido na venda ${sale.vendasUuid}.`);
		const clientDecision = mapping.clientes[basePhone] ?? (clientsByPhone.has(basePhone) ? { acao: "vincular", destinoId: clientsByPhone.get(basePhone)!.id, motivo: "Telefone igual." } : { acao: mapping.padrao.clienteSemTelefone, motivo: "Telefone novo." });
		requireCondition(clientDecision.acao !== "revisar", `Cliente ${basePhone} sem decisão final.`);
		const matchedClient = clientDecision.acao === "vincular" ? clientsById.get(clientDecision.destinoId) : null;
		if (clientDecision.acao === "vincular") requireCondition(!!matchedClient, `Cliente ${basePhone} não encontrado nesta organização.`);
		const externalClientId = matchedClient && matchedClient.telefoneBase !== basePhone ? matchedClient.idExterno : null;
		if (matchedClient && matchedClient.telefoneBase !== basePhone) {
			requireCondition(!!externalClientId && existingClients.filter((client) => client.idExterno === externalClientId).length === 1, `Vínculo manual do cliente ${basePhone} sem ID externo único.`);
		}
		const sellerName = sale.detalhamento.vendedorNomeAbreviado?.trim() ?? "";
		const sellerDecision = sellerName ? mapping.vendedores[sellerName] : null;
		requireCondition(!sellerName || (sellerDecision && sellerDecision.acao !== "revisar"), `Vendedor ${sellerName} sem decisão final.`);
		const matchedSeller = sellerDecision?.acao === "vincular" ? sellersById.get(sellerDecision.destinoId) : null;
		if (sellerDecision?.acao === "vincular") requireCondition(!!matchedSeller, `Vendedor ${sellerName} não encontrado nesta organização.`);
		const canonicalSeller = sellerName ? { identifier: matchedSeller ? (matchedSeller.identificador || matchedSeller.nome) : sellerName, name: matchedSeller?.nome || sellerName } : null;
		const itemByEan = new Map(sale.itens.map((item) => [item.produtoEan, item]));
		requireCondition(sale.itens.length === sale.detalhamento.itensVenda.length && sale.detalhamento.itensVenda.every((item) => itemByEan.has(item.ean)), `Itens do detalhe divergentes na venda ${sale.vendasUuid}.`);
		const items = sale.detalhamento.itensVenda.map((detail) => {
			const sourceItem = itemByEan.get(detail.ean)!;
			const decision = mapping.produtos[detail.ean];
			const matchedProduct = decision.acao === "vincular" ? productsById.get(decision.destinoId) : null;
			if (decision.acao === "vincular") requireCondition(!!matchedProduct, `Produto ${detail.ean} não encontrado nesta organização.`);
			requireCondition(detail.qtde > 0 && Number.isFinite(detail.valorTotal), `Quantidade/valor inválido no item ${detail.ean}.`);
			requireCondition(Math.abs(cents(detail.subTotal - detail.desconto + detail.frete) - cents(detail.valorTotal)) <= 1, `Valores divergentes no item ${detail.ean}.`);
			return {
				productExternalId: null,
				productCode: matchedProduct?.codigo ?? detail.ean,
				quantity: detail.qtde,
				unitSaleValue: money(detail.subTotal / detail.qtde),
				unitCostValue: 0,
				grossSaleValue: money(detail.subTotal),
				discountValue: money(detail.desconto),
				netSaleValue: money(detail.valorTotal),
				totalCostValue: 0,
				metadata: { phiboEan: detail.ean, descricao: sourceItem.produtoDesc, cor: sourceItem.corDescricao, tamanho: sourceItem.gradeTamanho, frete: money(detail.frete) },
			};
		});
		const totalValue = money(items.reduce((total, item) => total + item.netSaleValue, 0));
		const totalPayments = money(sale.detalhamento.formasPagamento.flatMap((payment) => payment.parcelas).reduce((total, installment) => total + installment.valorParcela, 0));
		requireCondition(Math.abs(cents(totalValue) - cents(totalPayments)) <= 2, `Pagamentos divergentes na venda ${sale.vendasUuid}.`);
		requireCondition(Math.abs(cents(items.reduce((total, item) => total + item.discountValue, 0)) - cents(sale.valorDesconto + sale.valorCupom)) <= 2, `Descontos divergentes na venda ${sale.vendasUuid}.`);
		const integrationMetadata = SaleIntegrationMetadataSchema.parse({
			versao: 1, canal: "PHIBO", entrega: { realizadaPor: null, valorFrete: money(sale.valorFrete) },
			descontos: { loja: money(sale.valorDesconto + sale.valorCupom), patrocinados: [] }, taxasCanal: [],
			phibo: { cupomTrocaId: sale.cupomTrocaId, nfeNumero: sale.nfeNumero, formasPagamento: sale.detalhamento.formasPagamento },
		});
		canonicalSales.push({
			sourceSaleId: sale.vendasUuid, displayId: String(sale.nfeNumero), totalValue, totalCost: 0,
			totalDiscount: money(sale.valorDesconto + sale.valorCupom), totalSurcharge: money(sale.valorFrete),
			sellerName: sellerName, channel: sale.origemVenda, deliveryMode: null, partnerIdentifier: null,
			key: sale.nfeChaveAcesso, document: String(sale.nfeNumero), model: String(sale.nfeModelo), movement: "VENDA", nature: "SN01", series: String(sale.nfeSerie), statusText: sale.nfeStatus, type: "VENDA", occurredAt,
			client: { externalId: externalClientId, name: sale.clienteNome.trim(), phone: sale.clienteFone, basePhone, email: sale.clienteEmail?.trim() || null },
			seller: canonicalSeller, partner: null, items, isValidSale: true, isCanceled: false,
			payments: null, integrationMetadata,
		});
	}
	const clientesSemTelefoneCorrespondenteAgora = new Set(sourceSales.map((sale) => formatPhoneAsBase(sale.clienteFone)).filter((phone) => !clientsByPhone.has(phone))).size;
	const expected = { vendas: canonicalSales.length, itens: canonicalSales.reduce((total, sale) => total + sale.items.length, 0), clientesCriar: 213, produtosCriar: createdProducts.length, vendedoresCriar: createdSellers.length, valorCentavos: canonicalSales.reduce((total, sale) => total + cents(sale.totalValue), 0) };
	requireCondition(expected.vendas === 422 && expected.itens === 721 && expected.produtosCriar === 302 && expected.vendedoresCriar === 1 && expected.valorCentavos === 8799460, "Contagens/total diferem da prévia final.");
	const existingSales = await db.select({ id: sales.id, idExterno: sales.idExterno, integracaoId: sales.integracaoId }).from(sales).where(and(eq(sales.organizacaoId, organizationId), inArray(sales.idExterno, canonicalSales.map((sale) => sale.sourceSaleId))));
	if (existingSales.length === 0) requireCondition(clientesSemTelefoneCorrespondenteAgora === expected.clientesCriar, "Contagem de clientes novos difere da prévia inicial.");
	requireCondition(existingSales.every((sale) => sale.integracaoId !== null), "Uma venda existente por ID externo não tem integração; possível colisão.");
	const existingIntegration = await db.query.integrations.findFirst({ where: and(eq(integrations.organizacaoId, organizationId), eq(integrations.tipo, "PHIBO"), eq(integrations.refExterno, integrationRef)) });
	if (existingSales.length) requireCondition(!!existingIntegration && existingSales.every((sale) => sale.integracaoId === existingIntegration.id), "IDs de venda existentes pertencem a outra origem.");
	console.log(JSON.stringify({ modo: apply ? "APLICAR" : "DRY_RUN", organizacao: organization, periodo: source.periodo, esperado: expected, clientesSemTelefoneCorrespondenteAgora, vendasJaImportadas: existingSales.length }, null, 2));
	if (!apply) return;

	let integration = existingIntegration;
	if (!integration) {
		const [inserted] = await db.insert(integrations).values({ organizacaoId: organizationId, tipo: "PHIBO", ativo: false, apelido: "Phibo (histórico)", refExterno: integrationRef, configuracao: { tipo: "PHIBO", modo: "HISTORICO" } }).returning();
		integration = inserted;
	}
	requireCondition(integration.ativo === false && integration.configuracao?.tipo === "PHIBO", "A integração Phibo deve estar inativa e com configuração histórica.");
	const summaries = [];
	for (let offset = 0; offset < canonicalSales.length; offset += 40) {
		const salesChunk = canonicalSales.slice(offset, offset + 40);
		const batch: TCanonicalImportBatch = {
			source: "PHIBO", organizationId, integrationId: integration.id,
			window: { startDate: salesChunk[0].occurredAt, endDate: salesChunk[salesChunk.length - 1].occurredAt },
			policies: { saleItemRewritePolicy: "INSERT_ONLY_FOR_NEW_SALES", clientResolutionStrategy: "EXTERNAL_ID_THEN_PHONE" },
			sales: salesChunk, products: offset === 0 ? createdProducts : [], sellers: offset === 0 ? createdSellers : [], partners: [], productAddOns: [], productAddOnOptions: [],
		};
		const { summary } = await persistCanonicalBatch({ integration: integration as TDataSourceIntegration, organizationConfiguration: null, batch, effects: { processCashback: false, processCampaigns: false, processConversionAttribution: false }, mode: "HISTORICO" });
		requireCondition(summary.saleIdCollisionsCount === 0, `Colisão de venda no lote ${offset}.`);
		summaries.push(summary);
		console.log(`[PHIBO] ${Math.min(offset + 40, canonicalSales.length)}/${canonicalSales.length} vendas processadas; ${summary.createdSalesCount} criadas no lote.`);
	}
	await recomputeClientMetricsForOrganization({ organizationId });
	// Itens criados apenas para referenciar o histórico não devem virar ofertas no futuro ERP.
	await db.update(products).set(withProductUpdateStamp({ ativo: false, vendavel: false })).where(and(eq(products.organizacaoId, organizationId), eq(products.grupo, "PHIBO-HISTORICO"), inArray(products.codigo, createdProducts.map((product) => product.code))));
	const [dbSales, dbItems, dbProducts] = await Promise.all([
		db.select({ quantidade: sql<number>`count(*)::integer`, valorCentavos: sql<number>`round(sum(${sales.valorTotal}) * 100)::integer` }).from(sales).where(and(eq(sales.organizacaoId, organizationId), eq(sales.integracaoId, integration.id))),
		db.execute(sql`select count(*)::integer as quantidade from ampmais_sale_items i join ampmais_sales v on v.id = i.venda_id where v.organizacao_id = ${organizationId} and v.integracao_id = ${integration.id}`),
		db.select({ quantidade: sql<number>`count(*)::integer` }).from(products).where(and(eq(products.organizacaoId, organizationId), inArray(products.codigo, createdProducts.map((product) => product.code)))),
	]);
	const persisted = { vendas: dbSales[0]?.quantidade ?? 0, itens: Number(dbItems[0]?.quantidade ?? 0), produtosPorEan: dbProducts[0]?.quantidade ?? 0, valorCentavos: dbSales[0]?.valorCentavos ?? 0 };
	requireCondition(persisted.vendas === expected.vendas && persisted.itens === expected.itens && persisted.produtosPorEan === expected.produtosCriar && persisted.valorCentavos === expected.valorCentavos, `Reconciliação pós-importação divergente: ${JSON.stringify(persisted)}.`);
	const totals = summaries.reduce((total, current) => ({ vendasCriadas: total.vendasCriadas + current.createdSalesCount, vendasInalteradas: total.vendasInalteradas + current.unchangedSalesCount, clientesCriados: total.clientesCriados + current.createdClientsCount, produtosCriados: total.produtosCriados + current.createdProductsCount, vendedoresCriados: total.vendedoresCriados + current.createdSellersCount }), { vendasCriadas: 0, vendasInalteradas: 0, clientesCriados: 0, produtosCriados: 0, vendedoresCriados: 0 });
	const result = { organizacao: organization, periodo: source.periodo, integracaoId: integration.id, esperado: expected, processado: totals, persistido: persisted, efeitos: "HISTORICO: sem estoque, financeiro, fiscal, cashback ou campanhas" };
	await writeFile(reportPath, JSON.stringify(result, null, 2), "utf8");
	console.log(JSON.stringify({ ...result, relatorio: reportPath }, null, 2));
}

main().then(() => connection.end()).catch(async (error) => { console.error(error); process.exitCode = 1; await connection.end(); });
