import "@/utils/scripts/load-next-env";

import { checkSaleFiscalReadiness, emitFiscalDocument } from "@/lib/fiscal/documents";
import { resolveEmissionDocumentType } from "@/lib/fiscal/document-type";
import { loadFiscalOrganization } from "@/lib/fiscal/settings";
import { connection } from "@/services/drizzle";

/**
 * Emite o documento fiscal de uma venda que ainda nao tem nenhum — o caso que
 * retry-fiscal-document.ts nao cobre, porque la sempre existe um documento para reemitir.
 *
 * Roda a pre-verificacao antes de qualquer escrita e recusa a emissao se ela nao passar: emitir
 * para descobrir o bloqueio custa numeracao e deixa uma rejeicao registrada.
 *
 * DRY-RUN por padrao. Uso:
 *   npx tsx --conditions=react-server ./scripts/emit-sale-fiscal-document.ts --org=<id> --venda=<id> [--apply]
 */

function arg(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
	const orgId = arg("org");
	const vendaId = arg("venda");
	const apply = hasFlag("apply");
	if (!orgId || !vendaId) throw new Error("Informe --org=<organizacaoId> e --venda=<vendaId>.");

	const [venda] = await connection`
		select s.id, s.canal, s.entrega_modalidade, s.status_venda, s.valor_total, s.data_venda::date as dia,
			(select e.id from ampmais_accounting_entries e where e.venda_id = s.id order by e.data_insercao limit 1) as lancamento_contabil_id,
			c.cpf_cnpj as cliente_cpf_cnpj,
			(select count(*)::int from ampmais_fiscal_outbound_documents d where d.venda_id = s.id) as documentos
		from ampmais_sales s left join ampmais_clients c on c.id = s.cliente_id
		where s.id = ${vendaId} and s.organizacao_id = ${orgId}`;
	if (!venda) throw new Error("Venda nao encontrada nesta organizacao.");
	if (venda.status_venda !== "CONFIRMADA") throw new Error(`Venda em status ${venda.status_venda}; emissao recusada.`);
	if (Number(venda.documentos) > 0) throw new Error("Venda ja possui documento fiscal; use retry:fiscal-document.");

	const organizacao = await loadFiscalOrganization(orgId);
	if (!organizacao) throw new Error("Organizacao nao encontrada.");
	const tipo = await resolveEmissionDocumentType({
		organizacaoId: orgId,
		operacaoPadraoNfeId: organizacao.fiscalConfiguracao?.operacaoPadraoPorTipo?.NFE ?? null,
		signals: { canal: venda.canal, entregaModalidade: venda.entrega_modalidade, destinatarioCpfCnpj: venda.cliente_cpf_cnpj },
	});

	console.log(`Venda: ${venda.id} | ${venda.dia} | canal=${venda.canal} | modalidade=${venda.entrega_modalidade} | R$ ${venda.valor_total}`);
	console.log(`Documento a emitir: ${tipo}`);

	const input = {
		vendaId: venda.id as string,
		tipo,
		organizacaoId: orgId,
		lancamentoContabilId: venda.lancamento_contabil_id as string | null,
		origem: "MANUAL" as const,
	};
	const readiness = await checkSaleFiscalReadiness(input);
	if (!readiness.pronto) {
		console.log("PRE-VERIFICACAO REPROVADA:");
		for (const problema of readiness.problemas) console.log(`  - ${problema.codigo}: ${problema.mensagem}`);
		throw new Error("Emissao recusada pela pre-verificacao.");
	}
	console.log(
		`Pre-verificacao OK | presenca=${readiness.contexto?.presencaConsumidor} serie=${readiness.contexto?.serie} vNF=${readiness.contexto?.vNF}`,
	);

	if (!apply) {
		console.log("DRY-RUN: nada foi emitido. Repita com --apply.");
		return;
	}

	const result = await emitFiscalDocument(input);
	console.log(
		`Resultado: documento=${result.documentoId} status=${result.statusInterno} numero=${result.numero ?? "-"} chave=${result.chaveAcesso ?? "-"}`,
	);
	if (["REJEITADO", "ERRO"].includes(result.statusInterno)) throw new Error(`Emissao terminou em ${result.statusInterno}.`);
}

main()
	.catch((error) => {
		console.error("[EMIT_SALE_FISCAL] Falha:", error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
