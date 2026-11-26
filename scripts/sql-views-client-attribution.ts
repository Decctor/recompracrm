import "@/utils/scripts/load-next-env";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SALE_CLIENT_REASSIGNMENT_CASHBACK_REASON, accumulateCashbackForClient } from "@/lib/cashback/accumulation";
import { reverseSaleCashback } from "@/lib/cashback/reverse-sale-cashback";
import { recomputeClientDerivedDataSafely } from "@/lib/clients/recompute";
import { fetchSqlViewsClients, withSqlViewsSession } from "@/lib/data-connectors/sql-views/client";
import { mapSqlViewsClient } from "@/lib/data-connectors/sql-views/mappers";
import { SqlViewsConfigSchema, type TSqlViewsClientRow, type TSqlViewsSaleRow } from "@/lib/data-connectors/sql-views/types";
import { formatPhoneAsBase } from "@/lib/formatting";
import { normalizeLocation } from "@/lib/geo/brazilian-locations";
import { isValidCpfCnpj } from "@/lib/validation";
import { connection, db } from "@/services/drizzle";
import { campaignConversions, cashbackPrograms, clients, saleItems, sales } from "@/services/drizzle/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * Vendas do conector SQL-VIEWS atribuídas ao cliente errado: diagnóstico e correção.
 *
 * Por que acontece: o cliente do CRM criado antes do conector não guarda o código do cliente do
 * ERP, então a venda era ligada pelo TELEFONE do cadastro do ERP. Quando dois cadastros do ERP —
 * pessoas diferentes — têm o mesmo telefone (família, o fixo da loja usado como preenchimento, um
 * celular digitado no cadastro errado), as compras de um caíam no outro: entravam no histórico,
 * rendiam pontos e disparavam o pós-venda para quem não comprou. A resolução do conector agora
 * resolve pelo CPF antes do telefone e recusa o telefone quando os CPFs divergem
 * (lib/data-collecting-v2/sync-auxiliary-entities.ts); este script conserta o que já entrou.
 *
 * Diagnóstico (padrão, somente leitura):
 *  1. Pares suspeitos (cliente do CRM × código do ERP das vendas): cliente com mais de um código, ou
 *     código cujas vendas caíram em mais de um cliente.
 *  2. Cadastro ATUAL de cada código no ERP (view `vw_recompra_clientes`).
 *  3. Mesma pessoa? CPF quando os dois têm um válido do mesmo tipo (CPF diferente com nome igual vai
 *     para revisão); senão o nome (primeiro + último, sem acentos e partículas).
 *  4. Para cada par de outra pessoa: destino (cliente com aquele `idExterno`, com o mesmo CPF — com o
 *     desempate do conector entre duplicatas — ou um novo) e o estrago (vendas, valor, mensagens de
 *     campanha, pontos).
 *
 * Correção (--apply): só os pares decididos por CPF (com --incluir-nome, também os decididos pelo
 * nome). Para cada venda, sob lock e na mesma transação — o mesmo que a troca de cliente da tela faz
 * (process-sale-client-reassignment.ts), sem a trava de "venda externa":
 *  - pontos do comprador: estorna do cliente errado e acumula para o certo com a data original
 *    (a validade não se estende) e a mesma base;
 *  - atribuição de campanha zerada e conversões apagadas (foram calculadas contra o cliente errado);
 *  - venda e itens apontam para o cliente certo; a troca fica no log de edição da venda;
 *  - destino achado pelo CPF sem código recebe o código do ERP, como o conector faz.
 * Venda com resgate de pontos vivo é pulada (o resgate gastou saldo do cliente errado: decisão
 * manual). Depois, os derivados dos clientes tocados (métricas de compra, RFM, vínculos) são
 * recalculados. Envios de campanha pendentes dessas vendas são descartados sozinhos no envio
 * (VENDA_INVALIDA: a venda mudou de cliente).
 *
 * PRÉ-REQUISITO do --apply: o conector corrigido em produção. Sem ele, a próxima sincronização de
 * cada venda devolve o cliente errado.
 *
 * Uso:
 *   node --conditions=react-server --import tsx scripts/sql-views-client-attribution.ts \
 *     [--org <id>] [--erp <codigo,codigo>] [--incluir-nome] [--apply]
 *
 * Saída em scripts/output/sql-views-client-attribution/<data>/ (pairs.csv, report.json e, no
 * --apply, apply.csv). Reexecutável: o que já foi movido deixa de aparecer como suspeito.
 */

const DEFAULT_ORGANIZATION_ID = "76e37c1c-927b-4f2c-88e5-104f07aa836a"; // Fran Farma — única org com SQL-VIEWS
const NAME_PARTICLES = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "D"]);
const SCRIPT_ORIGIN = "SCRIPT_SQL_VIEWS_ATRIBUICAO_CLIENTE";

type TVerdict = "MESMA_PESSOA" | "OUTRA_PESSOA" | "INCERTO";
type TVerdictBasis = "CPF" | "CPF_DIVERGE_NOME_IGUAL" | "NOME" | "NOME_PARCIAL" | "SEM_DADOS";

type TPairRow = {
	cliente_id: string;
	erp_cliente_id: string;
	vendas: number;
	vendas_validas: number;
	valor: number;
	primeira: Date;
	ultima: Date;
	venda_ids: string[];
};

type TCrmClient = {
	id: string;
	nome: string;
	cpf_cnpj: string | null;
	telefone_base: string;
	id_externo: string | null;
	data_insercao: Date;
	metadata_total_compras: number | null;
	ultima_compra_data: Date | null;
};

type TArgs = { organizationId: string; erpFilter: Set<string> | null; includeNameVerdicts: boolean; apply: boolean };

function parseArgs(): TArgs {
	const args = process.argv.slice(2);
	const valueOf = (flag: string) => {
		const index = args.indexOf(flag);
		return index >= 0 ? args[index + 1] : undefined;
	};
	const erp = valueOf("--erp");
	return {
		organizationId: valueOf("--org") ?? DEFAULT_ORGANIZATION_ID,
		erpFilter: erp ? new Set(erp.split(",").map((value) => value.trim()).filter(Boolean)) : null,
		includeNameVerdicts: args.includes("--incluir-nome"),
		apply: args.includes("--apply"),
	};
}

function normalizeDocument(value: string | null | undefined) {
	const digits = (value ?? "").replace(/\D/g, "");
	if (!digits) return null;
	return isValidCpfCnpj(digits) ? digits : null;
}

function nameTokens(value: string | null | undefined) {
	return (value ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.replace(/[^A-Z ]/g, " ")
		.split(/\s+/)
		.filter((token) => token.length > 0 && !NAME_PARTICLES.has(token));
}

function isPlaceholderName(tokens: string[]) {
	return tokens.length === 0 || (tokens.length === 1 && tokens[0] === "CLIENTE");
}

/** Mesma pessoa? CPF decide quando os dois lados têm um válido do mesmo tipo; senão o nome. */
function comparePeople(
	crm: { nome: string; cpf: string | null },
	erp: { nome: string; cpf: string | null },
): { verdict: TVerdict; basis: TVerdictBasis } {
	const byName = compareNames(crm.nome, erp.nome);
	// CPF contra CNPJ (o MEI da pessoa) não prova nada: decide o nome.
	if (crm.cpf && erp.cpf && crm.cpf.length === erp.cpf.length) {
		if (crm.cpf === erp.cpf) return { verdict: "MESMA_PESSOA", basis: "CPF" };
		// Documento diferente com o mesmo nome: CPF digitado errado num dos lados, ou pai e filho
		// ("JUNIOR"). Não dá para decidir sozinho.
		if (byName.verdict === "MESMA_PESSOA") return { verdict: "INCERTO", basis: "CPF_DIVERGE_NOME_IGUAL" };
		return { verdict: "OUTRA_PESSOA", basis: "CPF" };
	}
	return byName;
}

function compareNames(crmName: string, erpName: string): { verdict: TVerdict; basis: TVerdictBasis } {
	const a = nameTokens(crmName);
	const b = nameTokens(erpName);
	if (isPlaceholderName(a) || isPlaceholderName(b)) return { verdict: "INCERTO", basis: "SEM_DADOS" };
	if (a.join(" ") === b.join(" ")) return { verdict: "MESMA_PESSOA", basis: "NOME" };
	if (a[0] !== b[0]) return { verdict: "OUTRA_PESSOA", basis: "NOME" };
	if (a.length > 1 && b.length > 1 && a[a.length - 1] === b[b.length - 1]) return { verdict: "MESMA_PESSOA", basis: "NOME_PARCIAL" };
	const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
	if (shorter.length >= 2 && shorter.every((token) => longer.includes(token))) return { verdict: "MESMA_PESSOA", basis: "NOME_PARCIAL" };
	// Mesmo primeiro nome, sobrenomes diferentes: pode ser cadastro abreviado ou outra pessoa.
	return { verdict: "INCERTO", basis: "NOME_PARCIAL" };
}

function erpPhoneBases(row: TSqlViewsClientRow | undefined) {
	if (!row) return [];
	return [row.telefone, row.telefone_secundario].map((value) => formatPhoneAsBase(String(value ?? ""))).filter((value) => !!value);
}

function csvCell(value: unknown) {
	if (value === null || value === undefined) return "";
	const text = value instanceof Date ? value.toISOString() : String(value);
	return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file: string, header: string[], rows: unknown[][]) {
	writeFileSync(file, `﻿${[header.join(";"), ...rows.map((row) => row.map(csvCell).join(";"))].join("\n")}`);
}

/**
 * Mesmo desempate do conector (`pickClientByDocument`): o cliente com o telefone do cadastro do ERP,
 * depois o que já carrega um código, depois o de compra mais recente. Escolher igual ao conector
 * evita que a próxima sincronização mova a venda para a outra duplicata.
 */
function pickCanonical(candidates: TCrmClient[], erpPhones: string[]) {
	const samePhone = candidates.filter((candidate) => !!candidate.telefone_base && erpPhones.includes(candidate.telefone_base));
	const byPhone = samePhone.length > 0 ? samePhone : candidates;
	const withCode = byPhone.filter((candidate) => !!candidate.id_externo);
	const pool = withCode.length > 0 ? withCode : byPhone;
	const time = (value: Date | null) => (value ? new Date(value).getTime() : Number.NEGATIVE_INFINITY);
	return [...pool].sort(
		(a, b) =>
			time(b.ultima_compra_data) - time(a.ultima_compra_data) ||
			new Date(b.data_insercao).getTime() - new Date(a.data_insercao).getTime() ||
			b.id.localeCompare(a.id),
	)[0];
}

async function loadSqlViewsConfigs(organizationId: string) {
	// As lojas da Fran Farma compartilham o mesmo banco do ERP (e o mesmo cadastro de clientes):
	// basta uma sessão por banco distinto.
	const integrations = await connection<{ id: string; configuracao: unknown }[]>`
		select id, configuracao from ampmais_integrations
		where organizacao_id = ${organizationId} and tipo = 'SQL-VIEWS'`;
	if (integrations.length === 0) throw new Error("Nenhuma conexão SQL-VIEWS nesta organização.");
	const configs = new Map<string, ReturnType<typeof SqlViewsConfigSchema.parse>>();
	for (const integration of integrations) {
		const config = SqlViewsConfigSchema.parse(integration.configuracao);
		configs.set(`${config.host}:${config.port}/${config.database}/${config.schema}`, config);
	}
	if (configs.size > 1) console.warn(`[ATRIBUICAO] ${configs.size} bancos de ERP distintos: códigos de cliente podem colidir entre eles.`);
	return [...configs.values()];
}

async function diagnose(organizationId: string) {
	const configs = await loadSqlViewsConfigs(organizationId);

	const rawPairs = await connection<TPairRow[]>`
		with v as (
			select s.cliente_id, s.integracao_metadados->'sqlViews'->>'clienteId' as erp_cliente_id, s.id, s.status_venda, s.valor_total, s.data_venda
			from ampmais_sales s
			where s.organizacao_id = ${organizationId}
				and s.integracao_metadados->>'canal' = 'SQL_VIEWS'
				and s.cliente_id is not null
				and s.integracao_metadados->'sqlViews'->>'clienteId' is not null
		), p as (
			select cliente_id, erp_cliente_id from v group by 1, 2
		), suspeitos as (
			-- Além de quem mistura códigos, entra todo par cujo cliente não carrega aquele código:
			-- um cadastro do ERP inteiro casado pelo telefone num cliente sem idExterno não mistura nada,
			-- mas é tão suspeito quanto. Só o par com idExterno igual ao código e sem mistura fica de fora.
			select p.cliente_id, p.erp_cliente_id from p join ampmais_clients c on c.id = p.cliente_id
			where p.cliente_id in (select cliente_id from p group by 1 having count(*) > 1)
				or p.erp_cliente_id in (select erp_cliente_id from p group by 1 having count(*) > 1)
				or c.id_externo is distinct from p.erp_cliente_id
		)
		select v.cliente_id, v.erp_cliente_id,
			count(*)::int as vendas,
			count(*) filter (where v.status_venda is distinct from 'CANCELADA')::int as vendas_validas,
			coalesce(sum(v.valor_total) filter (where v.status_venda is distinct from 'CANCELADA'), 0)::float as valor,
			min(v.data_venda) as primeira, max(v.data_venda) as ultima,
			array_agg(v.id) as venda_ids
		from v join suspeitos using (cliente_id, erp_cliente_id)
		group by 1, 2`;
	// O cliente postgres do projeto devolve timestamps como texto.
	const pairs = rawPairs.map((pair) => ({ ...pair, primeira: new Date(pair.primeira), ultima: new Date(pair.ultima) }));
	console.log(`[ATRIBUICAO] ${pairs.length} pares suspeitos.`);

	const crmClientIds = [...new Set(pairs.map((pair) => pair.cliente_id))];
	const erpClientIds = [...new Set(pairs.map((pair) => pair.erp_cliente_id))];

	const erpById = new Map<string, TSqlViewsClientRow>();
	for (const config of configs) {
		const rows = await withSqlViewsSession(config, (session) => fetchSqlViewsClients(session, erpClientIds));
		for (const row of rows) if (!erpById.has(row.cliente_id)) erpById.set(row.cliente_id, row);
	}
	console.log(`[ATRIBUICAO] ${erpById.size}/${erpClientIds.length} cadastros encontrados no ERP.`);

	// Clientes do CRM: os dos pares e os candidatos a destino (mesmo idExterno ou mesmo CPF).
	const erpDocuments = [...new Set([...erpById.values()].map((row) => normalizeDocument(String(row.cpf_cnpj ?? ""))).filter((v): v is string => !!v))];
	const crmClients = await connection<TCrmClient[]>`
		select id, nome, cpf_cnpj, telefone_base, id_externo, data_insercao, metadata_total_compras, ultima_compra_data
		from ampmais_clients
		where organizacao_id = ${organizationId}
			and (id = any(${crmClientIds}) or id_externo = any(${erpClientIds})
				or regexp_replace(coalesce(cpf_cnpj, ''), '[^0-9]', '', 'g') = any(${erpDocuments}))`;
	const crmById = new Map(crmClients.map((client) => [client.id, client]));
	const crmByExternalId = new Map<string, TCrmClient[]>();
	const crmByDocument = new Map<string, TCrmClient[]>();
	for (const client of crmClients) {
		if (client.id_externo) crmByExternalId.set(client.id_externo, [...(crmByExternalId.get(client.id_externo) ?? []), client]);
		const document = normalizeDocument(client.cpf_cnpj);
		if (document) crmByDocument.set(document, [...(crmByDocument.get(document) ?? []), client]);
	}

	const allSaleIds = pairs.flatMap((pair) => pair.venda_ids);
	const messages = await connection<{ venda_id: string; campanha: string }[]>`
		select r.venda_id, c.titulo as campanha
		from ampmais_campaign_dispatch_recipients r join ampmais_campaigns c on c.id = r.campanha_id
		where r.venda_id = any(${allSaleIds}) and r.status = 'ENVIADA'`;
	const cashback = await connection<{ venda_id: string; cliente_id: string; tipo: string; status: string; valor: number; valor_restante: number }[]>`
		select venda_id, cliente_id, tipo::text, status::text, valor, valor_restante
		from ampmais_cashback_program_transactions
		where venda_id = any(${allSaleIds})`;
	const conversions = await connection<{ venda_id: string }[]>`
		select venda_id from ampmais_campaign_conversions where venda_id = any(${allSaleIds})`;
	const messagesBySale = new Map<string, { venda_id: string; campanha: string }[]>();
	for (const message of messages) messagesBySale.set(message.venda_id, [...(messagesBySale.get(message.venda_id) ?? []), message]);
	const cashbackBySale = new Map<string, (typeof cashback)[number][]>();
	for (const row of cashback) cashbackBySale.set(row.venda_id, [...(cashbackBySale.get(row.venda_id) ?? []), row]);
	const conversionSales = new Set(conversions.map((row) => row.venda_id));

	const results = pairs.map((pair) => {
		const crm = crmById.get(pair.cliente_id);
		const erp = erpById.get(pair.erp_cliente_id);
		const erpName = String(erp?.nome || erp?.nome_fantasia || "");
		const erpDocument = normalizeDocument(String(erp?.cpf_cnpj ?? ""));
		const comparison =
			!crm || !erp
				? { verdict: "INCERTO" as TVerdict, basis: "SEM_DADOS" as TVerdictBasis }
				: comparePeople({ nome: crm.nome, cpf: normalizeDocument(crm.cpf_cnpj) }, { nome: erpName, cpf: erpDocument });

		let destination: "ID_EXTERNO" | "CPF" | "CRIAR_NOVO" | null = null;
		let destinationClient: TCrmClient | null = null;
		if (comparison.verdict === "OUTRA_PESSOA") {
			const byExternalId = (crmByExternalId.get(pair.erp_cliente_id) ?? []).filter((client) => client.id !== pair.cliente_id);
			const byDocument = erpDocument ? (crmByDocument.get(erpDocument) ?? []).filter((client) => client.id !== pair.cliente_id) : [];
			if (byExternalId.length > 0) {
				destination = "ID_EXTERNO";
				destinationClient = pickCanonical(byExternalId, erpPhoneBases(erp));
			} else if (byDocument.length > 0) {
				destination = "CPF";
				destinationClient = pickCanonical(byDocument, erpPhoneBases(erp));
			} else {
				destination = "CRIAR_NOVO";
			}
		}

		const pairMessages = pair.venda_ids.flatMap((id) => messagesBySale.get(id) ?? []);
		const pairCashback = pair.venda_ids.flatMap((id) => cashbackBySale.get(id) ?? []);
		const accrual = pairCashback.filter((row) => row.tipo === "ACÚMULO" && row.cliente_id === pair.cliente_id && row.status !== "EXPIRADO");
		const redemption = pairCashback.filter((row) => row.tipo === "RESGATE" && row.status === "ATIVO");
		return {
			pair,
			crm,
			erp,
			erpName,
			erpDocument,
			verdict: comparison.verdict,
			basis: comparison.basis,
			destination,
			destinationClient,
			// O telefone atual do cadastro do ERP ainda é o do cliente do CRM.
			phoneCollision: !!crm?.telefone_base && erpPhoneBases(erp).includes(crm.telefone_base),
			messagesSent: pairMessages.length,
			messageCampaigns: [...new Set(pairMessages.map((message) => message.campanha))],
			pointsAccrued: accrual.reduce((sum, row) => sum + row.valor, 0),
			pointsAccruedConsumed: accrual.reduce((sum, row) => sum + (row.valor - row.valor_restante), 0),
			redemptions: redemption.length,
			pointsRedeemed: redemption.reduce((sum, row) => sum + row.valor, 0),
			conversions: pair.venda_ids.filter((id) => conversionSales.has(id)).length,
		};
	});

	return { results, crmClientIds, erpClientIds, crmById };
}

type TResult = Awaited<ReturnType<typeof diagnose>>["results"][number];

function writeDiagnosis(outputDir: string, organizationId: string, diagnosis: Awaited<ReturnType<typeof diagnose>>) {
	const { results, crmClientIds, erpClientIds, crmById } = diagnosis;
	// Cliente do CRM sem nenhum código do ERP que seja a própria pessoa: o cadastro do CRM não
	// identifica quem compra por ele (ex.: o fixo da loja como preenchimento).
	const crmWithOwner = new Set(results.filter((result) => result.verdict === "MESMA_PESSOA").map((result) => result.pair.cliente_id));

	writeCsv(
		path.join(outputDir, "pairs.csv"),
		[
			"cliente_crm_id",
			"cliente_crm_nome",
			"cliente_crm_cpf",
			"cliente_crm_telefone",
			"cliente_crm_tem_dono",
			"erp_cliente_id",
			"erp_nome",
			"erp_cpf",
			"erp_telefone",
			"erp_telefone_secundario",
			"veredito",
			"base",
			"telefone_atual_colide",
			"destino",
			"destino_cliente_id",
			"destino_cliente_nome",
			"vendas",
			"vendas_validas",
			"valor",
			"primeira_venda",
			"ultima_venda",
			"mensagens_enviadas",
			"campanhas",
			"pontos_acumulados",
			"pontos_acumulados_consumidos",
			"resgates_vivos",
			"pontos_resgatados",
			"conversoes_campanha",
		],
		[...results]
			.sort((a, b) => a.pair.cliente_id.localeCompare(b.pair.cliente_id) || a.pair.primeira.getTime() - b.pair.primeira.getTime())
			.map((result) => [
				result.pair.cliente_id,
				result.crm?.nome,
				result.crm?.cpf_cnpj,
				result.crm?.telefone_base,
				crmWithOwner.has(result.pair.cliente_id) ? "SIM" : "NAO",
				result.pair.erp_cliente_id,
				result.erpName,
				result.erp?.cpf_cnpj,
				result.erp?.telefone,
				result.erp?.telefone_secundario,
				result.verdict,
				result.basis,
				result.phoneCollision ? "SIM" : "NAO",
				result.destination,
				result.destinationClient?.id,
				result.destinationClient?.nome,
				result.pair.vendas,
				result.pair.vendas_validas,
				result.pair.valor.toFixed(2),
				result.pair.primeira,
				result.pair.ultima,
				result.messagesSent,
				result.messageCampaigns.join(" | "),
				result.pointsAccrued.toFixed(2),
				result.pointsAccruedConsumed.toFixed(2),
				result.redemptions,
				result.pointsRedeemed.toFixed(2),
				result.conversions,
			]),
	);

	const intruders = results.filter((result) => result.verdict === "OUTRA_PESSOA");
	const uncertain = results.filter((result) => result.verdict === "INCERTO");
	const sum = (rows: TResult[], pick: (row: TResult) => number) => rows.reduce((total, row) => total + pick(row), 0);
	const countBy = (rows: TResult[], pick: (row: TResult) => string | null) =>
		rows.reduce<Record<string, number>>((acc, row) => {
			const key = String(pick(row));
			acc[key] = (acc[key] ?? 0) + 1;
			return acc;
		}, {});
	const intrudersByClient = new Map<string, number>();
	for (const row of intruders) intrudersByClient.set(row.pair.cliente_id, (intrudersByClient.get(row.pair.cliente_id) ?? 0) + 1);

	const summary = {
		organizacaoId: organizationId,
		geradoEm: new Date().toISOString(),
		paresSuspeitos: results.length,
		clientesCrmEnvolvidos: crmClientIds.length,
		codigosErpEnvolvidos: erpClientIds.length,
		veredito: countBy(results, (row) => row.verdict),
		vereditoPorBase: countBy(results, (row) => `${row.verdict}/${row.basis}`),
		outraPessoa: {
			pares: intruders.length,
			clientesCrmAfetados: intrudersByClient.size,
			emClienteSemDono: intruders.filter((row) => !crmWithOwner.has(row.pair.cliente_id)).length,
			vendasValidas: sum(intruders, (row) => row.pair.vendas_validas),
			valor: Number(sum(intruders, (row) => row.pair.valor).toFixed(2)),
			colisaoTelefoneAtiva: intruders.filter((row) => row.phoneCollision).length,
			paresComVendaNosUltimos30Dias: intruders.filter((row) => row.pair.ultima.getTime() >= Date.now() - 30 * 86_400_000).length,
			destino: countBy(intruders, (row) => row.destination),
			mensagensEnviadas: sum(intruders, (row) => row.messagesSent),
			pontosAcumulados: Number(sum(intruders, (row) => row.pointsAccrued).toFixed(2)),
			pontosAcumuladosJaConsumidos: Number(sum(intruders, (row) => row.pointsAccruedConsumed).toFixed(2)),
			resgatesVivos: sum(intruders, (row) => row.redemptions),
			vendasComConversaoDeCampanha: sum(intruders, (row) => row.conversions),
		},
		incerto: {
			pares: uncertain.length,
			vendasValidas: sum(uncertain, (row) => row.pair.vendas_validas),
		},
		clientesCrmComMaisPessoas: [...intrudersByClient.entries()]
			.filter(([, count]) => count >= 3)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 20)
			.map(([clientId, count]) => ({ clientId, nome: crmById.get(clientId)?.nome, telefone: crmById.get(clientId)?.telefone_base, outrasPessoas: count })),
	};
	writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(summary, null, 2));
	console.log(JSON.stringify(summary, null, 2));
}

type TApplyRow = {
	vendaId: string;
	erpClienteId: string;
	de: string;
	para: string | null;
	status: "MOVIDA" | "PULADA_JA_MOVIDA" | "PULADA_RESGATE_VIVO" | "ERRO";
	pontosEstornados: number;
	pontosAcumulados: number;
	pontosOriginais: number;
	detalhe: string;
};

async function createClientFromErp({ organizationId, erp }: { organizationId: string; erp: TSqlViewsClientRow }) {
	// Mesmo mapeamento do conector: telefone pelas mesmas regras, documento e endereço normalizados.
	const { client } = mapSqlViewsClient({
		sale: { cliente_id: erp.cliente_id, cliente_nome: null, cliente_telefone: null, cliente_cpf_cnpj: null } as unknown as TSqlViewsSaleRow,
		client: erp,
		anonymousClientIds: [],
	});
	if (!client) throw new Error(`Cadastro ${erp.cliente_id} do ERP é anônimo.`);
	const location = normalizeLocation({ estado: client.location?.state, cidade: client.location?.city });
	const [inserted] = await db
		.insert(clients)
		.values({
			organizacaoId: organizationId,
			idExterno: client.externalId,
			nome: client.name,
			cpfCnpj: client.cpfCnpj,
			inscricaoEstadual: client.stateRegistration,
			telefone: client.phone,
			telefoneBase: client.basePhone,
			email: client.email,
			dataNascimento: client.birthDate ?? null,
			localizacaoCep: client.location?.cep,
			localizacaoEstado: location.estado,
			localizacaoCidade: location.cidade,
			localizacaoBairro: client.location?.neighborhood,
			localizacaoLogradouro: client.location?.street,
			localizacaoNumero: client.location?.number,
			localizacaoComplemento: client.location?.complement,
			analiseRFMTitulo: "CLIENTES RECENTES",
		})
		.returning({ id: clients.id });
	return inserted.id;
}

async function moveSale({
	organizationId,
	saleId,
	erpClientId,
	fromClientId,
	toClientId,
	program,
}: {
	organizationId: string;
	saleId: string;
	erpClientId: string;
	fromClientId: string;
	toClientId: string;
	program: typeof cashbackPrograms.$inferSelect | null;
}): Promise<TApplyRow> {
	const base = { vendaId: saleId, erpClienteId: erpClientId, de: fromClientId, para: toClientId, pontosEstornados: 0, pontosAcumulados: 0, pontosOriginais: 0, detalhe: "" };
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT id FROM ampmais_sales WHERE id = ${saleId} AND organizacao_id = ${organizationId} FOR UPDATE`);
		const sale = await tx.query.sales.findFirst({
			where: and(eq(sales.id, saleId), eq(sales.organizacaoId, organizationId)),
			columns: { id: true, clienteId: true, valorTotal: true, rascunhoMetadados: true },
			with: {
				transacoesCashback: {
					columns: { id: true, tipo: true, status: true, clienteId: true, valor: true, metadados: true, dataInsercao: true },
				},
			},
		});
		if (!sale || sale.clienteId !== fromClientId) return { ...base, status: "PULADA_JA_MOVIDA" as const, detalhe: `cliente atual ${sale?.clienteId ?? "-"}` };

		// Resgate vivo nesta venda gastou saldo do cliente errado: devolver ou não é decisão comercial.
		if (sale.transacoesCashback.some((row) => row.tipo === "RESGATE" && row.status === "ATIVO")) {
			return { ...base, status: "PULADA_RESGATE_VIVO" as const };
		}

		const buyerAccruals = sale.transacoesCashback.filter(
			(row) => row.tipo === "ACÚMULO" && row.clienteId === fromClientId && (row.status === "ATIVO" || row.status === "CONSUMIDO"),
		);
		let pontosEstornados = 0;
		let pontosAcumulados = 0;
		const pontosOriginais = buyerAccruals.reduce((total, row) => total + row.valor, 0);
		if (buyerAccruals.length > 0) {
			const reversal = await reverseSaleCashback({
				tx,
				saleId,
				clientId: fromClientId,
				organizationId,
				reason: SALE_CLIENT_REASSIGNMENT_CASHBACK_REASON,
				scope: "buyer-accumulations",
			});
			pontosEstornados = reversal.totalReversedAmount;
			if (program) {
				for (const original of buyerAccruals) {
					// Mesma base e mesma data do acúmulo original: o valor não muda e a validade não se estende.
					const metadata = (original.metadados ?? {}) as Record<string, unknown>;
					const paymentRules = metadata.regrasPagamento as { base?: unknown } | undefined;
					const accumulation = await accumulateCashbackForClient({
						tx,
						orgId: organizationId,
						clientId: toClientId,
						saleId,
						saleValue: sale.valorTotal,
						accrualBase: typeof paymentRules?.base === "number" ? paymentRules.base : null,
						program,
						createdAt: original.dataInsercao,
						metadata: { ...metadata, reatribuicao: { origem: SCRIPT_ORIGIN, clienteAnteriorId: fromClientId, transacaoOriginalId: original.id } },
					});
					pontosAcumulados += accumulation.accumulatedValue;
				}
			}
		}

		// Atribuição calculada contra as interações do cliente errado. Zera; não reprocessa.
		await tx.delete(campaignConversions).where(and(eq(campaignConversions.vendaId, saleId), eq(campaignConversions.organizacaoId, organizationId)));

		const draftMetadata =
			sale.rascunhoMetadados && typeof sale.rascunhoMetadados === "object" && !Array.isArray(sale.rascunhoMetadados)
				? (sale.rascunhoMetadados as Record<string, unknown>)
				: {};
		const editions = Array.isArray(draftMetadata.edicoes) ? draftMetadata.edicoes : [];
		await tx
			.update(sales)
			.set({
				clienteId: toClientId,
				atribuicaoProcessada: false,
				atribuicaoAplicavel: false,
				atribuicaoCampanhaPrincipalId: null,
				atribuicaoCampanhaConversaoId: null,
				atribuicaoInteracaoId: null,
				rascunhoMetadados: {
					...draftMetadata,
					edicoes: [
						...editions,
						{
							tipo: "CLIENTE",
							data: new Date().toISOString(),
							autorId: null,
							origem: SCRIPT_ORIGIN,
							motivo: `Cadastro ${erpClientId} do ERP é outra pessoa (CPF diferente) que compartilha o telefone do cliente anterior.`,
							clienteAnteriorId: fromClientId,
							clienteNovoId: toClientId,
							cashbackEstornado: pontosEstornados,
							cashbackAcumulado: pontosAcumulados,
						},
					],
				},
			})
			.where(and(eq(sales.id, saleId), eq(sales.organizacaoId, organizationId)));
		await tx.update(saleItems).set({ clienteId: toClientId }).where(and(eq(saleItems.vendaId, saleId), eq(saleItems.organizacaoId, organizationId)));

		const detalhe = Math.abs(pontosAcumulados - pontosOriginais) > 0.01 ? `acúmulo novo difere do original (${pontosOriginais})` : "";
		return { ...base, status: "MOVIDA" as const, pontosEstornados, pontosAcumulados, pontosOriginais, detalhe };
	});
}

async function applyCorrections({
	outputDir,
	organizationId,
	results,
	includeNameVerdicts,
	erpFilter,
	apply,
}: {
	outputDir: string;
	organizationId: string;
	results: TResult[];
	includeNameVerdicts: boolean;
	erpFilter: Set<string> | null;
	apply: boolean;
}) {
	const eligible = results.filter(
		(result) =>
			result.verdict === "OUTRA_PESSOA" &&
			(result.basis === "CPF" || (includeNameVerdicts && result.basis === "NOME")) &&
			(!erpFilter || erpFilter.has(result.pair.erp_cliente_id)),
	);
	const byErp = new Map<string, TResult[]>();
	for (const result of eligible) byErp.set(result.pair.erp_cliente_id, [...(byErp.get(result.pair.erp_cliente_id) ?? []), result]);

	const plannedSales = eligible.reduce((total, result) => total + result.pair.vendas, 0);
	const plannedNewClients = [...byErp.values()].filter((group) => group[0].destination === "CRIAR_NOVO").length;
	console.log(
		`[ATRIBUICAO] Correção ${apply ? "" : "(simulação) "}: ${eligible.length} pares, ${byErp.size} cadastros do ERP, ${plannedSales} vendas, ${plannedNewClients} clientes novos.`,
	);
	if (!apply) {
		console.log("[ATRIBUICAO] Nada alterado. Rode com --apply para mover (depois do conector corrigido em produção).");
		return;
	}

	const program = (await db.query.cashbackPrograms.findFirst({ where: eq(cashbackPrograms.organizacaoId, organizationId) })) ?? null;
	const rows: TApplyRow[] = [];
	const touchedClients = new Set<string>();
	// A reversão e o acúmulo logam cada transação; em milhares de vendas isso afoga a saída.
	const originalLog = console.log;
	console.log = (...args: unknown[]) => {
		if (typeof args[0] === "string" && args[0].startsWith("[CASHBACK")) return;
		originalLog(...args);
	};

	let processedErp = 0;
	try {
		for (const [erpClientId, group] of byErp) {
			processedErp += 1;
			const first = group[0];
			let toClientId = first.destinationClient?.id ?? null;
			// Como o conector faz ao casar pelo CPF: o código do ERP passa a apontar para este cliente.
			if (toClientId && first.destination === "CPF" && !first.destinationClient?.id_externo) {
				await db
					.update(clients)
					.set({ idExterno: erpClientId })
					.where(and(eq(clients.id, toClientId), eq(clients.organizacaoId, organizationId), isNull(clients.idExterno)));
			}
			if (!toClientId) {
				if (!first.erp) throw new Error(`Cadastro ${erpClientId} não veio do ERP.`);
				// Reexecução: um cliente criado numa rodada anterior já tem este idExterno.
				const existing = await db.query.clients.findFirst({
					where: and(eq(clients.organizacaoId, organizationId), eq(clients.idExterno, erpClientId)),
					columns: { id: true },
				});
				toClientId = existing?.id ?? (await createClientFromErp({ organizationId, erp: first.erp }));
			}
			touchedClients.add(toClientId);

			for (const result of group) {
				touchedClients.add(result.pair.cliente_id);
				for (const saleId of result.pair.venda_ids) {
					try {
						rows.push(await moveSale({ organizationId, saleId, erpClientId, fromClientId: result.pair.cliente_id, toClientId, program }));
					} catch (error) {
						rows.push({
							vendaId: saleId,
							erpClienteId: erpClientId,
							de: result.pair.cliente_id,
							para: toClientId,
							status: "ERRO",
							pontosEstornados: 0,
							pontosAcumulados: 0,
							pontosOriginais: 0,
							detalhe: error instanceof Error ? error.message : String(error),
						});
					}
				}
			}
			if (processedErp % 25 === 0) originalLog(`[ATRIBUICAO] ${processedErp}/${byErp.size} cadastros, ${rows.length} vendas.`);
		}
	} finally {
		console.log = originalLog;
		writeCsv(
			path.join(outputDir, "apply.csv"),
			["venda_id", "erp_cliente_id", "cliente_de", "cliente_para", "status", "pontos_estornados", "pontos_acumulados", "pontos_originais", "detalhe"],
			rows.map((row) => [row.vendaId, row.erpClienteId, row.de, row.para, row.status, row.pontosEstornados, row.pontosAcumulados, row.pontosOriginais, row.detalhe]),
		);
	}

	console.log(`[ATRIBUICAO] Recalculando derivados de ${touchedClients.size} clientes...`);
	let recomputed = 0;
	for (const clienteId of touchedClients) {
		await recomputeClientDerivedDataSafely({ organizacaoId: organizationId, clienteId });
		recomputed += 1;
		if (recomputed % 100 === 0) console.log(`[ATRIBUICAO] ${recomputed}/${touchedClients.size} clientes recalculados.`);
	}

	const statusCount = rows.reduce<Record<string, number>>((acc, row) => {
		acc[row.status] = (acc[row.status] ?? 0) + 1;
		return acc;
	}, {});
	console.log(
		JSON.stringify(
			{
				vendas: statusCount,
				pontosEstornados: Number(rows.reduce((total, row) => total + row.pontosEstornados, 0).toFixed(2)),
				pontosAcumulados: Number(rows.reduce((total, row) => total + row.pontosAcumulados, 0).toFixed(2)),
				acumulosDivergentes: rows.filter((row) => row.detalhe.startsWith("acúmulo")).length,
				clientesRecalculados: touchedClients.size,
			},
			null,
			2,
		),
	);
}

async function main() {
	const args = parseArgs();
	console.log(`[ATRIBUICAO] Organização ${args.organizationId}${args.apply ? " — APLICANDO" : " — simulação"}`);
	const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
	const outputDir = path.join("scripts", "output", "sql-views-client-attribution", stamp);
	mkdirSync(outputDir, { recursive: true });

	const diagnosis = await diagnose(args.organizationId);
	writeDiagnosis(outputDir, args.organizationId, diagnosis);
	await applyCorrections({
		outputDir,
		organizationId: args.organizationId,
		results: diagnosis.results,
		includeNameVerdicts: args.includeNameVerdicts,
		erpFilter: args.erpFilter,
		apply: args.apply,
	});
	console.log(`[ATRIBUICAO] Saída em ${outputDir}`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
