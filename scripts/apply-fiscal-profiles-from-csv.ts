import "dotenv/config";
import { connection } from "@/services/drizzle";
import { readFileSync } from "node:fs";

/**
 * Cria os perfis fiscais de produto a partir da planilha revisada pelo contador
 * (gerada por export-missing-fiscal-profiles.ts).
 *
 * Le `ncm_confirmado` / `cfop_confirmado` / `grupo_tributario_id_confirmado`; quando a coluna
 * confirmada esta vazia, a linha e PULADA — a sugestao so entra com --usar-sugestoes, e mesmo
 * assim apenas para as linhas de confianca ALTA, nunca para NCM indecidivel.
 *
 * DRY-RUN por padrao: sem --commit nada e gravado.
 * Uso: npx tsx ./scripts/apply-fiscal-profiles-from-csv.ts --org=<id> --csv=<arquivo> [--usar-sugestoes] [--commit]
 */

function arg(name: string, fallback?: string) {
	const found = process.argv.find((value) => value.startsWith(`--${name}=`));
	return found ? found.slice(name.length + 3) : fallback;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function parseCsv(content: string): Array<Record<string, string>> {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let index = 0; index < content.length; index++) {
		const char = content[index];
		if (quoted) {
			if (char === '"' && content[index + 1] === '"') {
				cell += '"';
				index++;
			} else if (char === '"') quoted = false;
			else cell += char;
			continue;
		}
		if (char === '"') quoted = true;
		else if (char === ",") {
			row.push(cell);
			cell = "";
		} else if (char === "\n") {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = "";
		} else if (char !== "\r") cell += char;
	}
	if (cell || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}
	const [header, ...body] = rows.filter((entry) => entry.some((value) => value.trim() !== ""));
	return body.map((entry) => Object.fromEntries(header.map((key, index) => [key.trim(), (entry[index] ?? "").trim()])));
}

async function main() {
	const orgId = arg("org");
	const csvPath = arg("csv");
	if (!orgId || !csvPath) throw new Error("Informe --org=<organizacaoId> e --csv=<arquivo>.");
	const useSuggestions = hasFlag("usar-sugestoes");
	const commit = hasFlag("commit");

	const rows = parseCsv(readFileSync(csvPath, "utf8"));
	const gruposValidos = new Set(
		(await connection`select id from ampmais_fiscal_tax_groups where organizacao_id = ${orgId}`).map((group) => group.id as string),
	);
	const [orgRow] = await connection`
		select fiscal_configuracao -> 'endereco' ->> 'uf' as uf from ampmais_organizations where id = ${orgId}`;
	const uf = ((arg("uf") ?? (orgRow?.uf as string | undefined) ?? "") as string).toUpperCase();
	// NCM valido = NCM que existe na tabela IBPT da UF. Sem isso um digito trocado so aparece
	// como rejeicao da SEFAZ, depois de a venda ja ter acontecido.
	const ncmsValidos = new Set(
		uf ? (await connection`select distinct ncm from ampmais_fiscal_ibpt_rates where uf = ${uf}`).map((rate) => rate.ncm as string) : [],
	);
	if (ncmsValidos.size === 0) console.warn(`Aviso: sem tabela IBPT para a UF "${uf}" — os NCMs nao serao validados.`);

	const jaComPerfil = new Set(
		(
			await connection`
				select produto_id from ampmais_product_fiscal_profiles
				where organizacao_id = ${orgId} and produto_variante_id is null and ativo`
		).map((profile) => profile.produto_id as string),
	);

	const planned: Array<{
		produtoId: string;
		nome: string;
		ncm: string;
		cfop: string;
		cest: string;
		grupoTributarioId: string;
		origem: string;
	}> = [];
	const skipped: string[] = [];

	for (const row of rows) {
		const nome = row.produto_nome ?? row.produto_id;
		const confirmedNcm = row.ncm_confirmado ?? "";
		const usingSuggestion = !confirmedNcm && useSuggestions && row.confianca === "ALTA";
		const ncm = (confirmedNcm || (usingSuggestion ? row.ncm_sugerido : "")).replace(/\D/g, "");
		const cfop = (row.cfop_confirmado || (usingSuggestion ? row.cfop_sugerido : "")).replace(/\D/g, "");
		const grupoTributarioId = row.grupo_tributario_id_confirmado || (usingSuggestion ? row.grupo_tributario_id_sugerido : "");

		if (!ncm) {
			skipped.push(`${nome}: sem ncm_confirmado`);
			continue;
		}
		if (ncm.length !== 8) {
			skipped.push(`${nome}: NCM "${ncm}" nao tem 8 digitos`);
			continue;
		}
		if (ncmsValidos.size > 0 && !ncmsValidos.has(ncm)) {
			skipped.push(`${nome}: NCM ${ncm} nao existe na tabela IBPT de ${uf}`);
			continue;
		}
		if (cfop && cfop.length !== 4) {
			skipped.push(`${nome}: CFOP "${cfop}" nao tem 4 digitos`);
			continue;
		}
		// CEST vem da planilha, nunca do resto da organizacao: a SEFAZ cruza NCM x CEST e recusa a
		// combinacao invalida (rejeicao 815), assim como recusa CEST em produto fora da ST. Copiar o
		// CEST mais comum da org carimbava 23.001.00 (sorvete) em qualquer NCM novo.
		const cest = (row.cest ?? "").replace(/\D/g, "");
		if (cest && cest.length !== 7) {
			skipped.push(`${nome}: CEST "${cest}" nao tem 7 digitos`);
			continue;
		}
		if (!grupoTributarioId || !gruposValidos.has(grupoTributarioId)) {
			skipped.push(`${nome}: grupo tributario "${grupoTributarioId}" inexistente na organizacao`);
			continue;
		}
		if (jaComPerfil.has(row.produto_id)) {
			skipped.push(`${nome}: ja possui perfil ativo`);
			continue;
		}

		planned.push({ produtoId: row.produto_id, nome, ncm, cfop, cest, grupoTributarioId, origem: usingSuggestion ? "SUGESTAO" : "CONFIRMADO" });
	}

	console.log(`=== ${commit ? "APLICANDO" : "DRY-RUN (use --commit para gravar)"} ===`);
	for (const item of planned)
		console.log(`  + ${item.nome} -> NCM ${item.ncm} / CFOP ${item.cfop || "-"} / CEST ${item.cest || "-"} [${item.origem}]`);
	if (skipped.length > 0) {
		console.log(`\n=== PULADOS (${skipped.length}) ===`);
		for (const reason of skipped) console.log(`  - ${reason}`);
	}
	console.log(`\nA criar: ${planned.length} | Pulados: ${skipped.length}`);

	if (!commit || planned.length === 0) {
		await connection.end();
		return;
	}

	const [{ unidade_comercial, origem_mercadoria }] = await connection`
		select mode() within group (order by unidade_comercial) as unidade_comercial,
			mode() within group (order by origem_mercadoria) as origem_mercadoria
		from ampmais_product_fiscal_profiles where organizacao_id = ${orgId} and produto_variante_id is null and ativo`;

	let created = 0;
	for (const item of planned) {
		await connection`
			insert into ampmais_product_fiscal_profiles
				(id, organizacao_id, produto_id, produto_variante_id, grupo_tributario_id, origem_mercadoria,
				 ncm, cest, cfop_padrao, unidade_comercial, ativo)
			values (gen_random_uuid(), ${orgId}, ${item.produtoId}, null, ${item.grupoTributarioId}, ${origem_mercadoria},
				${item.ncm}, ${item.cest || null}, ${item.cfop || null}, ${unidade_comercial}, true)
			on conflict do nothing`;
		created++;
	}
	console.log(`Perfis criados: ${created}`);
	await connection.end();
}

main().catch(async (error) => {
	console.error("Falha ao aplicar perfis:", error.message ?? error);
	await connection.end();
	process.exit(1);
});
