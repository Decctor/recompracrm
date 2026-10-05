import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { normalizeProductBarcode } from "@/lib/products/barcode";

// Dry-run por padrão. Preenche somente campos vazios com o código exato do produto.
const args = process.argv.slice(2);
const arg = (name: string) => args[args.indexOf(name) + 1];
const organizationId = args.includes("--organization-id") ? arg("--organization-id") : null;
const expectedName = args.includes("--expected-name") ? arg("--expected-name") : null;
const apply = args.includes("--apply");

async function main() {
	assert.ok(organizationId && expectedName, "Informe --organization-id e --expected-name.");
	assert.ok(process.env.SUPABASE_DB_URL, "SUPABASE_DB_URL ausente.");
	const sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false, max: 1 });
	try {
		await sql.begin(async (tx) => {
			if (!apply) await tx`set transaction read only`;
			const [organization] = await tx<{ id: string; nome: string }[]>`select id, nome from ampmais_organizations where id=${organizationId}`;
			assert.equal(organization?.nome.toLowerCase(), expectedName.toLowerCase(), "Organização diferente da esperada.");
			const query = tx<{ id: string; nome: string; codigo: string; codigo_barras: string | null }[]>`
				select id, nome, codigo, codigo_barras from ampmais_products
				where organizacao_id=${organizationId} and (codigo_barras is null or btrim(codigo_barras)='')
				order by id`;
			const rows = apply ? await tx`${query} for update` : await query;
			assert.ok(
				rows.every((row) => normalizeProductBarcode(row.codigo) != null),
				"Há código vazio ou não suportado; nada foi atualizado.",
			);
			console.log(JSON.stringify({ organizacao: organization.nome, pendentes: rows.length, aplicar: apply }));
			if (!apply || !rows.length) return;
			const backupPath = path.resolve(".local-analysis/barcodes", `${organizationId}-${Date.now()}.json`);
			await mkdir(path.dirname(backupPath), { recursive: true });
			await writeFile(backupPath, JSON.stringify({ organizacaoId: organizationId, data: new Date().toISOString(), produtos: rows }, null, 2), {
				flag: "wx",
			});
			const updated = await tx<{ id: string }[]>`
				update ampmais_products set codigo_barras=codigo
				where organizacao_id=${organizationId} and id in ${tx(rows.map((row) => row.id))}
				and (codigo_barras is null or btrim(codigo_barras)='') returning id`;
			assert.equal(updated.length, rows.length, "Contagem divergente; transação revertida.");
			const [verification] = await tx<{ quantidade: number }[]>`
				select count(*)::integer as quantidade from ampmais_products
				where organizacao_id=${organizationId} and id in ${tx(rows.map((row) => row.id))} and codigo_barras=codigo`;
			assert.equal(verification.quantidade, rows.length, "Verificação divergente; transação revertida.");
			console.log(JSON.stringify({ atualizados: updated.length, backup: backupPath }));
		});
	} finally {
		await sql.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
