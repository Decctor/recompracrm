import "dotenv/config";
import { connection } from "@/services/drizzle";

// Diagnostico read-only: por que uma venda nao emitiu documento fiscal.
// Avalia, na ordem, as mesmas travas de processSaleAutomaticFiscalEmissionIfEligible.
// Uso: npx tsx ./scripts/diagnose-sale-fiscal-emission.ts <vendaId>

const saleId = process.argv[2];

async function main() {
	if (!saleId) throw new Error("Informe o ID da venda.");

	const [sale] = await connection`
		select s.id, s.organizacao_id, s.status_venda, s.status_atendimento, s.canal, s.modelo,
			s.processamento_origem, s.emissao_fiscal_automatica, s.emissao_fiscal_data_agendamento, s.valor_total, s.descontos_total,
			s.acrescimos_total, s.entrega_modalidade, s.data_venda,
			s.integracao_metadados, s.rascunho_metadados is not null as tem_rascunho_metadados,
			c.cpf_cnpj as cliente_cpf_cnpj,
			o.nome as organizacao_nome, o.fiscal_emissao_automatica, o.fiscal_configuracao
		from ampmais_sales s
		left join ampmais_clients c on c.id = s.cliente_id
		left join ampmais_organizations o on o.id = s.organizacao_id
		where s.id = ${saleId}`;

	if (!sale) {
		console.log("VENDA NAO ENCONTRADA:", saleId);
		return;
	}

	console.log("=== VENDA ===");
	console.log(JSON.stringify(sale, null, 2));

	// Atraso da emissao automatica: com atraso > 0 e sem agendamento, o gatilho ainda nao viu a venda
	// elegivel; com agendamento vigente, a emissao esta em espera (consumer da fila ou cron fiscal-queue).
	const atrasoMinutos = sale.fiscal_configuracao?.emissaoAutomatica?.atrasoMinutos ?? 0;
	console.log("=== ATRASO DA EMISSAO AUTOMATICA ===");
	console.log(JSON.stringify({ atrasoMinutos, emissaoFiscalDataAgendamento: sale.emissao_fiscal_data_agendamento ?? null }, null, 2));

	const documentos = await connection`
		select id, tipo, status_interno, provedor_status, numero, serie, codigo_rejeicao, mensagens, tentativas_envio,
			data_insercao, data_emissao
		from ampmais_fiscal_outbound_documents where venda_id = ${saleId} order by data_insercao`;
	console.log("=== DOCUMENTOS FISCAIS ===");
	console.log(JSON.stringify(documentos, null, 2));

	const lancamentos = await connection`
		select id, valor, data_insercao from ampmais_accounting_entries where venda_id = ${saleId}`;
	console.log("=== LANCAMENTOS CONTABEIS ===");
	console.log(JSON.stringify(lancamentos, null, 2));

	const transacoes = await connection`
		select t.id, t.tipo, t.metodo, t.valor, t.provedor_status, t.data_efetivacao, t.data_previsao
		from ampmais_financial_transactions t
		join ampmais_accounting_entries e on e.id = t.lancamento_contabil_id
		where e.venda_id = ${saleId} order by t.data_insercao`;
	console.log("=== TRANSACOES FINANCEIRAS ===");
	console.log(JSON.stringify(transacoes, null, 2));

	await connection.end();
}

main().catch(async (error) => {
	console.error("Falha no diagnostico:", error);
	await connection.end();
	process.exit(1);
});
