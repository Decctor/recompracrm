import "@/utils/scripts/load-next-env";

import { connection } from "@/services/drizzle";

/**
 * Liga as notas recebidas às compras que já importaram o mesmo XML antes de o vínculo existir
 * (`fiscal_inbound_documents.compra_id` nunca era gravado). A partir daqui, criar ou editar a compra
 * mantém o vínculo (`lib/fiscal/inbound/purchase-link.ts`); este script só cobre o passado.
 *
 * Uso:
 *   npm run backfill:inbound-purchase-links            # mostra o que seria ligado
 *   npm run backfill:inbound-purchase-links -- --apply # grava
 */

const CANDIDATES_SQL = `
	select distinct on (f.id) f.id as inbound_id, p.id as purchase_id, f.organizacao_id, f.chave_acesso, p.titulo
	from ampmais_fiscal_inbound_documents f
	join ampmais_purchases p on p.organizacao_id = f.organizacao_id and p.status <> 'CANCELADA'
	cross join lateral jsonb_array_elements(coalesce(p.documentos_importados -> 'documentos', '[]'::jsonb)) as doc
	where f.compra_id is null
		and regexp_replace(coalesce(doc ->> 'chaveAcesso', ''), '[^0-9]', '', 'g') = f.chave_acesso
	order by f.id, p.data_insercao asc
`;

async function main() {
	const apply = process.argv.includes("--apply");
	const candidates =
		await connection.unsafe<{ inbound_id: string; purchase_id: string; organizacao_id: string; chave_acesso: string; titulo: string }[]>(
			CANDIDATES_SQL,
		);
	console.log(`${candidates.length} nota(s) recebida(s) com compra correspondente e sem vínculo.`);
	for (const row of candidates.slice(0, 50)) console.log(`  org ${row.organizacao_id} · ${row.chave_acesso} → ${row.titulo} (${row.purchase_id})`);
	if (candidates.length > 50) console.log(`  … e mais ${candidates.length - 50}.`);

	if (!apply) {
		console.log("\nNada gravado. Rode com --apply para ligar.");
		return;
	}
	const updated = await connection.unsafe(`
		update ampmais_fiscal_inbound_documents f
		set compra_id = c.purchase_id, data_atualizacao = now()
		from (${CANDIDATES_SQL}) c
		where f.id = c.inbound_id and f.compra_id is null
	`);
	console.log(`\n${updated.count} nota(s) ligada(s).`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
