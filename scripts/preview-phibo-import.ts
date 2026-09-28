/** Prévia somente leitura da importação histórica do Phibo. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { formatPhoneAsBase } from "@/lib/formatting";

const args = process.argv.slice(2);
const getArg = (name: string) => {
	const index = args.indexOf(name);
	return index < 0 ? null : args[index + 1] ?? null;
};
const input = path.resolve(getArg("--input") ?? ".local-analysis/phibo/vendas-raw-2026-06-28-a-2026-09-28.json");
const output = path.resolve(getArg("--output") ?? ".local-analysis/phibo/import-preview-2026-06-28-a-2026-09-28.json");
const mappingPath = path.resolve(getArg("--mapping") ?? ".local-analysis/phibo/import-mapping.json");
const requestedOrgId = getArg("--organization-id");

type Decision = { acao: "vincular"; destinoId: string; motivo: string } | { acao: "criar" | "revisar"; motivo: string };
type Mapping = {
	organizacaoId: string;
	periodo: { de: string; ate: string };
	padrao: { clienteSemTelefone: "criar" | "revisar"; produtoSemCodigo: "criar" | "revisar"; vendedorSemIdentificador: "criar" | "revisar" };
	clientes: Record<string, Decision>;
	produtos: Record<string, Decision>;
	vendedores: Record<string, Decision>;
};

function validateMapping(mapping: Mapping, organizationId: string, period: Extracted["periodo"], keys: { phones: Set<string>; eans: Set<string>; sellers: Set<string> }) {
	if (mapping.organizacaoId !== organizationId) throw new Error("Organização do de-para diferente da organização selecionada.");
	if (mapping.periodo?.de !== period.de || mapping.periodo?.ate !== period.ate) throw new Error("Período do de-para diferente da extração.");
	for (const [kind, entries, validKeys] of [
		["clientes", mapping.clientes, keys.phones],
		["produtos", mapping.produtos, keys.eans],
		["vendedores", mapping.vendedores, keys.sellers],
	] as const) {
		if (!entries || typeof entries !== "object") throw new Error(`De-para sem seção ${kind}.`);
		for (const [key, decision] of Object.entries(entries)) {
			if (!validKeys.has(key)) throw new Error(`Chave desconhecida em ${kind}: ${key}.`);
			if (!decision || !["vincular", "criar", "revisar"].includes(decision.acao) || !decision.motivo?.trim()) throw new Error(`Decisão inválida em ${kind}: ${key}.`);
			if (decision.acao === "vincular" && !decision.destinoId?.trim()) throw new Error(`Vínculo sem destino em ${kind}: ${key}.`);
		}
	}
	if (!mapping.padrao || ![mapping.padrao.clienteSemTelefone, mapping.padrao.produtoSemCodigo, mapping.padrao.vendedorSemIdentificador].every((action) => action === "criar" || action === "revisar")) throw new Error("Ações padrão inválidas no de-para.");
}

function classify(key: string, entries: Record<string, Decision>, fallback: "criar" | "revisar", exactId?: string) {
	const decision = entries[key];
	if (decision) return { acao: decision.acao, destinoId: decision.acao === "vincular" ? decision.destinoId : null, manual: true };
	if (exactId) return { acao: "vincular" as const, destinoId: exactId, manual: false };
	return { acao: fallback, destinoId: null, manual: false };
}

type PhiboSale = {
	vendasUuid: string;
	clienteNome: string;
	clienteFone: string;
	nfeNumero: number;
	nfeStatus: string;
	origemVenda: string;
	valorDesconto: number;
	valorCupom: number;
	valorFrete: number;
	itens: Array<{ produtoEan: string; produtoDesc: string; gradeTamanho: string; corDescricao: string }>;
	detalhamento: {
		vendedorNomeAbreviado: string | null;
		itensVenda: Array<{ ean: string; qtde: number; subTotal: number; desconto: number; frete: number; valorTotal: number }>;
		formasPagamento: Array<{ descricao: string; parcelas: Array<{ valorParcela: number }> }>;
	};
};
type Extracted = { periodo: { de: string; ate: string }; dias: Record<string, { quantidade: number; vendas: PhiboSale[] }>; falhas: Record<string, string> };

async function main() {
const extracted = JSON.parse(await readFile(input, "utf8")) as Extracted;
const mapping = JSON.parse(await readFile(mappingPath, "utf8")) as Mapping;
const days = Object.entries(extracted.dias).sort(([left], [right]) => left.localeCompare(right));
const sales = days.flatMap(([, day]) => day.vendas);
const sum = <T>(values: T[], value: (item: T) => number) => values.reduce((total, item) => total + value(item), 0);
const cents = (value: number) => Math.round(value * 100);
const errors: string[] = [];
if (Object.keys(extracted.falhas).length) errors.push(`${Object.keys(extracted.falhas).length} dia(s) com falha de extração.`);
if (days.some(([, day]) => day.quantidade !== day.vendas.length)) errors.push("Contador de venda divergente em pelo menos um dia.");
const saleIds = sales.map((sale) => sale.vendasUuid);
if (new Set(saleIds).size !== saleIds.length) errors.push("IDs de venda repetidos no arquivo.");
for (const sale of sales) {
	if (!sale.vendasUuid || !sale.clienteNome?.trim() || !sale.clienteFone?.trim() || !sale.itens?.length || !sale.detalhamento?.itensVenda?.length) {
		errors.push(`Venda ${sale.vendasUuid || "sem ID"} incompleta.`);
		continue;
	}
	const itemsTotal = cents(sum(sale.detalhamento.itensVenda, (item) => Number(item.valorTotal) || 0));
	const paymentsTotal = cents(sum(sale.detalhamento.formasPagamento.flatMap((payment) => payment.parcelas), (installment) => Number(installment.valorParcela) || 0));
	const freightTotal = cents(sum(sale.detalhamento.itensVenda, (item) => Number(item.frete) || 0));
	const discountTotal = cents(sum(sale.detalhamento.itensVenda, (item) => Number(item.desconto) || 0));
	if (Math.abs(itemsTotal - paymentsTotal) > 2) errors.push(`Pagamento divergente na venda ${sale.vendasUuid}.`);
	if (Math.abs(freightTotal - cents(Number(sale.valorFrete) || 0)) > 2) errors.push(`Frete divergente na venda ${sale.vendasUuid}.`);
	if (Math.abs(discountTotal - cents((Number(sale.valorDesconto) || 0) + (Number(sale.valorCupom) || 0))) > 2) errors.push(`Desconto divergente na venda ${sale.vendasUuid}.`);
}

const sourcePhones = new Set(sales.map((sale) => formatPhoneAsBase(sale.clienteFone)).filter(Boolean));
const invalidPhoneSales = sales.filter((sale) => !formatPhoneAsBase(sale.clienteFone)).length;
const sourceEans = new Set(sales.flatMap((sale) => sale.itens.map((item) => item.produtoEan?.trim()).filter(Boolean)));
const missingEanItems = sales.flatMap((sale) => sale.itens).filter((item) => !item.produtoEan?.trim()).length;
const sourceSellers = new Set(sales.map((sale) => sale.detalhamento.vendedorNomeAbreviado?.trim()).filter((value): value is string => !!value));
const normalizeName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const sourceNamesByPhone = new Map(sales.map((sale) => [formatPhoneAsBase(sale.clienteFone), normalizeName(sale.clienteNome)]));
const sourceItemsByEan = new Map(sales.flatMap((sale) => sale.itens.map((item) => [item.produtoEan?.trim(), item] as const)));

if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL não configurada. Execute com --env-file=.env.");
const sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false });
try {
	const report = await sql.begin(async (tx) => {
		await tx`set transaction read only`;
		const orgs = requestedOrgId
			? await tx`select id, nome from ampmais_organizations where id = ${requestedOrgId}`
			: await tx`select id, nome from ampmais_organizations where lower(nome) = ${"use e abluse"}`;
		if (orgs.length !== 1) throw new Error(`Esperava uma única organização de destino; encontrei ${orgs.length}. Informe --organization-id.`);
		const organization = orgs[0];
		validateMapping(mapping, organization.id, extracted.periodo, { phones: sourcePhones, eans: sourceEans, sellers: sourceSellers });
		const [clients, products, variants, sellers, existingSales] = await Promise.all([
			tx`select id, nome, telefone_base, id_externo from ampmais_clients where organizacao_id = ${organization.id} order by ultima_compra_data asc nulls first, data_insercao asc, id asc`,
			tx`select id, codigo, nome from ampmais_products where organizacao_id = ${organization.id} order by data_ultima_sincronizacao asc nulls first, id asc`,
			tx`select id, produto_id, codigo from ampmais_product_variants where organizacao_id = ${organization.id} order by id asc`,
			tx`select id, nome, identificador from ampmais_sellers where organizacao_id = ${organization.id} order by data_insercao asc, id asc`,
			tx`select id, id_externo, integracao_id from ampmais_sales where organizacao_id = ${organization.id} and id_externo = any(${saleIds})`,
		]);
		const existingPhoneCounts = new Map<string, number>();
		const clientsByPhone = new Map<string, string>();
		for (const client of clients) {
			if (!client.telefone_base) continue;
			existingPhoneCounts.set(client.telefone_base, (existingPhoneCounts.get(client.telefone_base) ?? 0) + 1);
			clientsByPhone.set(client.telefone_base, client.id);
		}
		for (const [kind, entries, ids] of [
			["clientes", mapping.clientes, new Set(clients.map((client) => client.id))],
			["produtos", mapping.produtos, new Set(products.map((product) => product.id))],
			["vendedores", mapping.vendedores, new Set(sellers.map((seller) => seller.id))],
		] as const) {
			for (const [key, decision] of Object.entries(entries)) {
				if (decision.acao === "vincular" && !ids.has(decision.destinoId)) throw new Error(`Destino inexistente ou de outra organização em ${kind}: ${key}.`);
			}
		}
		const productsByCode = new Map(products.map((product) => [product.codigo, product.id]));
		for (const variant of variants) if (variant.codigo && !productsByCode.has(variant.codigo)) productsByCode.set(variant.codigo, variant.produto_id);
		const sellersByIdentifier = new Map(sellers.map((seller) => [seller.identificador || seller.nome, seller.id]));
		for (const [kind, entries, exact] of [
			["clientes", mapping.clientes, clientsByPhone],
			["produtos", mapping.produtos, productsByCode],
			["vendedores", mapping.vendedores, sellersByIdentifier],
		] as const) {
			for (const [key, decision] of Object.entries(entries)) {
				const exactId = exact.get(key);
				if (exactId && decision.acao === "criar") throw new Error(`De-para tenta criar ${kind} que já existe pela chave exata: ${key}.`);
				if (exactId && decision.acao === "vincular" && exactId !== decision.destinoId) throw new Error(`De-para conflita com vínculo exato em ${kind}: ${key}.`);
			}
		}
		const clientDecisions = [...sourcePhones].sort().map((key) => ({ chave: key, nome: sourceNamesByPhone.get(key), ...classify(key, mapping.clientes, mapping.padrao.clienteSemTelefone, clientsByPhone.get(key)) }));
		const productDecisions = [...sourceEans].sort().map((key) => ({ chave: key, descricao: sourceItemsByEan.get(key)?.produtoDesc, cor: sourceItemsByEan.get(key)?.corDescricao, tamanho: sourceItemsByEan.get(key)?.gradeTamanho, ...classify(key, mapping.produtos, mapping.padrao.produtoSemCodigo, productsByCode.get(key)) }));
		const sellerDecisions = [...sourceSellers].sort().map((key) => ({ chave: key, ...classify(key, mapping.vendedores, mapping.padrao.vendedorSemIdentificador, sellersByIdentifier.get(key)) }));
		const clientNames = new Set(clients.map((client) => normalizeName(client.nome)));
		const productNames = new Set(products.map((product) => normalizeName(product.nome)));
		const sellerNames = sellers.map((seller) => normalizeName(seller.nome));
		const missingProductNames = productDecisions.filter((decision) => !decision.destinoId).map((decision) => sourceItemsByEan.get(decision.chave)).filter((item): item is NonNullable<typeof item> => !!item);
		const exactProductNameCandidates = missingProductNames.filter((item) => productNames.has(normalizeName(`${item.produtoDesc} - ${item.corDescricao} - ${item.gradeTamanho}`))).length;
		const productDescriptionCandidates = missingProductNames.filter((item) => [...productNames].some((name) => name === normalizeName(item.produtoDesc) || name.startsWith(`${normalizeName(item.produtoDesc)} `))).length;
		const sellerNameCandidates = [...sourceSellers].filter((seller) => sellerNames.some((name) => name.startsWith(normalizeName(seller)) || normalizeName(seller).startsWith(name))).length;
		return {
			organization,
			periodo: extracted.periodo,
			dePara: {
				arquivo: mappingPath,
				clientes: clientDecisions,
				produtos: productDecisions,
				vendedores: sellerDecisions,
				pendencias: {
					clientes: clientDecisions.filter((decision) => decision.acao === "revisar").length,
					produtos: productDecisions.filter((decision) => decision.acao === "revisar").length,
					vendedores: sellerDecisions.filter((decision) => decision.acao === "revisar").length,
				},
			},
			fonte: { dias: days.length, vendas: sales.length, itens: sum(sales, (sale) => sale.itens.length), clientesPorTelefone: sourcePhones.size, eans: sourceEans.size, vendedores: sourceSellers.size },
			clientes: {
				existentesNaOrganizacao: clients.length,
				vinculados: clientDecisions.filter((decision) => decision.acao === "vincular").length,
				vinculadosManualmente: clientDecisions.filter((decision) => decision.acao === "vincular" && decision.manual).length,
				seriamCriados: clientDecisions.filter((decision) => decision.acao === "criar").length,
				aRevisar: clientDecisions.filter((decision) => decision.acao === "revisar").length,
				vendasComTelefoneInvalido: invalidPhoneSales,
				telefonesComMultiplosCadastrosExistentes: [...sourcePhones].filter((phone) => (existingPhoneCounts.get(phone) ?? 0) > 1).length,
				telefonesNovosComNomeJaCadastrado: clientDecisions.filter((decision) => !clientsByPhone.has(decision.chave) && clientNames.has(decision.nome ?? "")).length,
			},
			produtos: {
				existentesNaOrganizacao: products.length,
				variantesExistentes: variants.length,
				vinculados: productDecisions.filter((decision) => decision.acao === "vincular").length,
				vinculadosManualmente: productDecisions.filter((decision) => decision.acao === "vincular" && decision.manual).length,
				seriamCriadosComoProdutosMinimos: productDecisions.filter((decision) => decision.acao === "criar").length,
				aRevisar: productDecisions.filter((decision) => decision.acao === "revisar").length,
				itensSemEan: missingEanItems,
				candidatosPorNomeExatoCorTamanho: exactProductNameCandidates,
				candidatosPorPrefixoDescricao: productDescriptionCandidates,
			},
			vendedores: {
				existentesNaOrganizacao: sellers.length,
				vinculados: sellerDecisions.filter((decision) => decision.acao === "vincular").length,
				vinculadosManualmente: sellerDecisions.filter((decision) => decision.acao === "vincular" && decision.manual).length,
				seriamCriados: sellerDecisions.filter((decision) => decision.acao === "criar").length,
				aRevisar: sellerDecisions.filter((decision) => decision.acao === "revisar").length,
				candidatosPorNomeAbreviado: sellerNameCandidates,
			},
			vendas: { jaExistentesPorIdExterno: existingSales.length, candidatasACriacao: sales.length - existingSales.length, colisaoDeOrigemPotencial: existingSales.filter((sale) => sale.integracao_id).length },
			valores: {
				totalCentavos: sum(sales, (sale) => cents(sum(sale.detalhamento.itensVenda, (item) => Number(item.valorTotal) || 0))),
				freteCentavos: sum(sales, (sale) => cents(Number(sale.valorFrete) || 0)),
				descontosCentavos: sum(sales, (sale) => cents((Number(sale.valorDesconto) || 0) + (Number(sale.valorCupom) || 0))),
			},
			validacao: {
				erros: errors,
				dadosConsistentes: errors.length === 0 && invalidPhoneSales === 0 && missingEanItems === 0 && existingSales.length === 0,
				deParaCompleto: [clientDecisions, productDecisions, sellerDecisions].every((decisions) => decisions.every((decision) => decision.acao !== "revisar")),
			},
			observacao: "Prévia somente leitura. Decisões de criar/vincular/revisar vêm do de-para; pendências impedem a importação posterior.",
		};
	});
	await writeFile(output, JSON.stringify(report, null, 2), "utf8");
	console.log(JSON.stringify({ organization: report.organization, periodo: report.periodo, fonte: report.fonte, clientes: report.clientes, produtos: report.produtos, vendedores: report.vendedores, vendas: report.vendas, valores: report.valores, validacao: report.validacao, relatorio: output }, null, 2));
} finally {
	await sql.end();
}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
