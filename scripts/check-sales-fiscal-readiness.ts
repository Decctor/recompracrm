import "@/utils/scripts/load-next-env";

import { checkSaleFiscalReadiness } from "@/lib/fiscal/documents";
import { resolveEmissionDocumentType } from "@/lib/fiscal/document-type";
import { loadFiscalOrganization } from "@/lib/fiscal/settings";
import { connection } from "@/services/drizzle";
import { writeFileSync } from "node:fs";

/**
 * Pre-verificacao em lote: quantas vendas de um canal seriam autorizadas hoje, e o que trava o resto.
 *
 * Read-only de ponta a ponta — nenhum rascunho criado, nenhuma numeracao reservada, nenhuma chamada
 * ao provedor. Usa checkSaleFiscalReadiness, que roda as mesmas portas da emissao real.
 *
 * Uso: npx tsx --conditions=react-server ./scripts/check-sales-fiscal-readiness.ts --org=<id>
 *        [--canal=iFood] [--canal-integracao=IFOOD] [--limit=200] [--desde=YYYY-MM-DD] [--out=arquivo.csv]
 */

function arg(name: string, fallback?: string) {
	const found = process.argv.find((value) => value.startsWith(`--${name}=`));
	return found ? found.slice(name.length + 3) : fallback;
}

async function main() {
	const orgId = arg("org");
	if (!orgId) throw new Error("Informe --org=<organizacaoId>.");
	const canal = arg("canal") ?? null;
	// `canal` e rotulo e mistura origens: um pedido vindo do cardapio digital tambem chega como
	// "iFood". A integracao direta e a que grava `integracaoMetadados.canal` — e so ela passa pelo
	// tratamento de canal gerenciado no fiscal.
	const canalIntegracao = arg("canal-integracao") ?? null;
	const limit = Number(arg("limit", "200"));
	const desde = arg("desde") ?? null;
	const outPath = arg("out") ?? null;

	const organizacao = await loadFiscalOrganization(orgId);
	if (!organizacao) throw new Error("Organizacao nao encontrada.");

	// Lancamento contabil e documento entram por subquery, nunca por join: uma venda pode ter mais
	// de um lancamento, e o join multiplicava a mesma venda em varias linhas do relatorio.
	const vendas = await connection`
		select s.id, s.canal, s.entrega_modalidade, s.valor_total, s.data_venda::date as dia,
			(select e.id from ampmais_accounting_entries e where e.venda_id = s.id order by e.data_insercao limit 1) as lancamento_contabil_id,
			c.cpf_cnpj as cliente_cpf_cnpj
		from ampmais_sales s
		left join ampmais_clients c on c.id = s.cliente_id
		where s.organizacao_id = ${orgId} and s.status_venda = 'CONFIRMADA'
			and not exists (select 1 from ampmais_fiscal_outbound_documents d where d.venda_id = s.id)
			${canal ? connection`and s.canal = ${canal}` : connection``}
			${canalIntegracao ? connection`and s.integracao_metadados->>'canal' = ${canalIntegracao}` : connection``}
			${desde ? connection`and s.data_venda >= ${desde}` : connection``}
		order by s.data_venda desc limit ${limit}`;

	const escopo = [canal ? `canal ${canal}` : null, canalIntegracao ? `integracao ${canalIntegracao}` : null].filter(Boolean).join(", ");
	console.log(`Vendas analisadas: ${vendas.length}${escopo ? ` (${escopo})` : ""}\n`);

	const porProblema = new Map<string, { total: number; exemplo: string }>();
	const linhas: string[] = ["venda_id,dia,canal,modalidade,valor,tipo_documento,pronto,problemas"];
	let prontas = 0;

	for (const venda of vendas) {
		const tipo = await resolveEmissionDocumentType({
			organizacaoId: orgId,
			operacaoPadraoNfeId: organizacao.fiscalConfiguracao?.operacaoPadraoPorTipo?.NFE ?? null,
			signals: { canal: venda.canal, entregaModalidade: venda.entrega_modalidade, destinatarioCpfCnpj: venda.cliente_cpf_cnpj },
		});
		const resultado = await checkSaleFiscalReadiness({
			vendaId: venda.id as string,
			tipo,
			organizacaoId: orgId,
			lancamentoContabilId: venda.lancamento_contabil_id as string | null,
			origem: "MANUAL",
		});
		if (resultado.pronto) prontas++;
		const codigos = resultado.problemas.map((problem) => problem.codigo);
		for (const codigo of codigos.length > 0 ? codigos : ["(pronta)"]) {
			const atual = porProblema.get(codigo) ?? { total: 0, exemplo: "" };
			atual.total++;
			if (!atual.exemplo) atual.exemplo = resultado.problemas.find((p) => p.codigo === codigo)?.mensagem ?? "";
			porProblema.set(codigo, atual);
		}
		linhas.push(
			`${venda.id},${venda.dia},${venda.canal},${venda.entrega_modalidade},${venda.valor_total},${tipo},${resultado.pronto},"${codigos.join(" | ")}"`,
		);
	}

	console.log(`=== SERIAM AUTORIZADAS: ${prontas}/${vendas.length} ===\n`);
	console.log("=== BLOQUEIOS ===");
	const ordenado = [...porProblema.entries()].sort((a, b) => b[1].total - a[1].total);
	for (const [codigo, info] of ordenado) console.log(`  ${String(info.total).padStart(4)}  ${codigo}\n        ${info.exemplo.slice(0, 160)}`);

	if (outPath) {
		writeFileSync(outPath, linhas.join("\n"), "utf8");
		console.log(`\nDetalhe por venda: ${outPath}`);
	}
	await connection.end();
}

main().catch(async (error) => {
	console.error("Falha na verificacao:", error instanceof Error ? error.message : error);
	await connection.end();
	process.exit(1);
});
