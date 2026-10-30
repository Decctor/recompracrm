/** Sincronização pontual de cadastro. Sem --apply, somente leitura e relatórios locais. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { connection, db, type DBTransaction } from "@/services/drizzle";
import {
	products,
	productVariants,
	productOptions,
	productOptionValues,
	productVariantOptionValues,
	productChannelSettings,
	salesChannels,
	organizations,
	integrations,
} from "@/services/drizzle/schema";
import { buildSalePriceUpdate } from "@/lib/products/price-snapshot";
import { withProductUpdateStamp } from "@/lib/products/update-stamp";
import { loadExternalIdentities, registerExternalIdentity } from "@/lib/products/external-identities";
import { partitionProtectedPhiboCatalog } from "@/lib/products/phibo-identity-protection";
import {
	assertCatalog,
	catalogHash,
	catalogId,
	catalogName,
	parsePhiboCatalog,
	planPhiboCatalog,
	type TPhiboAppCatalog,
	type TPhiboCatalogPlan,
} from "@/lib/products/phibo-catalog";

const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let index = 0; index < args.length; index++) {
	const key = args[index];
	assertCatalog(!options.has(key), `Argumento repetido: ${key}.`);
	if (key === "--apply" || key === "--dry-run") options.set(key, "true");
	else {
		assertCatalog(
			["--organization-id", "--input", "--output", "--expected-plan-hash"].includes(key) && args[index + 1] && !args[index + 1].startsWith("--"),
			`Argumento inválido: ${key}.`,
		);
		options.set(key, args[++index]);
	}
}
const apply = options.has("--apply");
assertCatalog(!(apply && options.has("--dry-run")), "Escolha prévia ou aplicação.");
const organizationId = options.get("--organization-id");
assertCatalog(organizationId, "Informe --organization-id explicitamente.");
assertCatalog(!apply || options.get("--expected-plan-hash"), "Aplicação exige --expected-plan-hash da prévia.");
const sourcePath = path.resolve(options.get("--input") ?? "../recompracrm-tmpworks/phibo/phibo-catalogo-completo-2026-10-27.json");
const outputPath = path.resolve(options.get("--output") ?? `../recompracrm-tmpworks/phibo/sync-catalogo-${apply ? "resultado" : "previa"}-2026-10-27.json`);
assertCatalog(sourcePath.toLowerCase() !== outputPath.toLowerCase(), "Relatório não pode sobrescrever a fonte.");

async function snapshot(tx: DBTransaction, orgId: string): Promise<TPhiboAppCatalog> {
	const produtos = await tx.select().from(products).where(eq(products.organizacaoId, orgId)).orderBy(products.id);
	const variantes = await tx.select().from(productVariants).where(eq(productVariants.organizacaoId, orgId)).orderBy(productVariants.id);
	const opcoes = await tx.select().from(productOptions).where(eq(productOptions.organizacaoId, orgId)).orderBy(productOptions.id);
	const valores = await tx.select().from(productOptionValues).where(eq(productOptionValues.organizacaoId, orgId)).orderBy(productOptionValues.id);
	const combinacoes = await tx
		.select()
		.from(productVariantOptionValues)
		.where(eq(productVariantOptionValues.organizacaoId, orgId))
		.orderBy(productVariantOptionValues.id);
	return { produtos, variantes, opcoes, valores, combinacoes };
}
function chunks<T>(values: T[], count = 300) {
	return Array.from({ length: Math.ceil(values.length / count) }, (_, i) => values.slice(i * count, (i + 1) * count));
}
function different(current: Record<string, unknown>, next: Record<string, unknown>) {
	return Object.entries(next).some(
		([key, value]) =>
			value !== undefined && (value instanceof Date ? new Date(String(current[key])).getTime() !== value.getTime() : current[key] !== value),
	);
}
function parentValues(group: TPhiboCatalogPlan["grupos"][number]) {
	const rows = group.variacoes.map((v) => v.origem);
	const first = rows[0];
	const current = group.existente;
	const prices = rows.filter((r) => r.status === 1).map((r) => r.vlrVendaUn);
	return {
		nome: first.produtoDesc.trim(),
		unidade: first.unCom,
		ncm: first.codNcm,
		tipo: current?.tipo || "PRODUTO",
		grupo: first.grupoEstoqDescricao,
		ativo: group.ativo,
		vendavel: group.ativo,
		precoVenda: Math.min(...(prices.length ? prices : rows.map((r) => r.vlrVendaUn))),
		...(first.fotoUrl ? { imagemCapaUrl: first.fotoUrl } : {}),
	};
}
function variantValues(item: TPhiboCatalogPlan["grupos"][number]["variacoes"][number]) {
	return {
		nome: `${item.origem.corDescricao.trim()} / ${item.origem.gradeTamanho.trim()}`,
		codigoBarras: item.origem.produtoEan,
		ativo: item.origem.status === 1,
		precoVenda: item.origem.vlrVendaUn,
		...(item.origem.vlrUnCusto !== null ? { precoCusto: item.origem.vlrUnCusto } : {}),
		...(item.origem.fotoUrl ? { imagemCapaUrl: item.origem.fotoUrl } : {}),
	};
}
function changeCounts(plan: TPhiboCatalogPlan) {
	return {
		produtosAtualizar: plan.grupos.filter((g) => g.existente && different(g.existente, parentValues(g))).length,
		variantesAtualizar: plan.grupos.flatMap((g) => g.variacoes).filter((v) => v.existente && different(v.existente, variantValues(v))).length,
		paisReativar: plan.grupos.filter((g) => g.existente && g.ativo && (!g.existente.ativo || !g.existente.vendavel)).length,
	};
}

async function persist(tx: DBTransaction, plan: TPhiboCatalogPlan, app: TPhiboAppCatalog) {
	const orgId = plan.organizacaoId;
	const now = new Date();
	const result = {
		produtosCriados: 0,
		variantesCriadas: 0,
		produtosAtualizados: 0,
		variantesAtualizadas: 0,
		eixosCriados: 0,
		valoresCriados: 0,
		vinculosCriados: 0,
	};
	const newProducts = plan.grupos
		.filter((g) => !g.existente)
		.map((g) => ({
			id: g.produtoId,
			organizacaoId: orgId,
			codigo: `PHIBO-MODELO-${g.modeloPhiboId}`,
			...parentValues(g),
			quantidade: 0,
			rastreamentoEstoqueAtivo: false,
		}));
	for (const batch of chunks(newProducts)) {
		await tx.insert(products).values(batch);
		result.produtosCriados += batch.length;
	}
	for (const group of plan.grupos.filter((g) => g.existente)) {
		const values = parentValues(group);
		if (!different(group.existente!, values)) continue;
		await tx
			.update(products)
			.set(withProductUpdateStamp({ ...values, ...buildSalePriceUpdate({ current: group.existente!, next: { precoVenda: values.precoVenda }, now }) }))
			.where(and(eq(products.organizacaoId, orgId), eq(products.id, group.produtoId)));
		result.produtosAtualizados++;
	}
	const axisRows: (typeof productOptions.$inferInsert)[] = [];
	const valueRows: (typeof productOptionValues.$inferInsert)[] = [];
	const assignmentRows: (typeof productVariantOptionValues.$inferInsert)[] = [];
	const variantRows: (typeof productVariants.$inferInsert)[] = [];
	const plannedValues = new Map<string, string>();
	for (const group of plan.grupos) {
		for (const [name, type, id, order] of [
			["Cor", "COR", group.opcoesIds.cor, 0],
			["Tamanho", "TEXTO", group.opcoesIds.tamanho, 1],
		] as const) {
			const existing = app.opcoes.find((o) => o.id === id);
			if (!existing) axisRows.push({ id, organizacaoId: orgId, produtoId: group.produtoId, nome: name, tipo: type, ordem: order });
			else if (existing.nome !== name)
				await tx
					.update(productOptions)
					.set({ nome: name })
					.where(and(eq(productOptions.organizacaoId, orgId), eq(productOptions.id, id)));
		}
		for (const item of group.variacoes) {
			if (!item.existente)
				variantRows.push({
					id: item.varianteId,
					organizacaoId: orgId,
					produtoId: group.produtoId,
					codigo: item.origem.produtoEan,
					idExterno: `phibo:estoque:${item.origem.estoqueId}`,
					...variantValues(item),
					precoCusto: item.origem.vlrUnCusto,
					quantidade: 0,
					rastreamentoEstoqueAtivo: false,
				});
			else if (different(item.existente, variantValues(item))) {
				await tx
					.update(productVariants)
					.set({ ...variantValues(item), ...buildSalePriceUpdate({ current: item.existente, next: { precoVenda: item.origem.vlrVendaUn }, now }) })
					.where(and(eq(productVariants.organizacaoId, orgId), eq(productVariants.id, item.varianteId), eq(productVariants.produtoId, group.produtoId)));
				result.variantesAtualizadas++;
			}
			for (const [optionId, name, auxiliary] of [
				[group.opcoesIds.cor, item.origem.corDescricao.trim(), item.origem.corCodigoHexa],
				[group.opcoesIds.tamanho, item.origem.gradeTamanho.trim(), null],
			] as const) {
				const key = `${optionId}:${catalogName(name)}`;
				const existingValue = app.valores.find((v) => v.opcaoId === optionId && catalogName(v.nome) === catalogName(name));
				const valueId = existingValue?.id ?? plannedValues.get(key) ?? catalogId(orgId, "valor", key);
				if (!existingValue && !plannedValues.has(key)) {
					valueRows.push({
						id: valueId,
						organizacaoId: orgId,
						opcaoId: optionId,
						nome: name,
						valorAuxiliar: auxiliary,
						ordem:
							Math.max(-1, ...app.valores.filter((v) => v.opcaoId === optionId).map((v) => v.ordem)) +
							1 +
							valueRows.filter((v) => v.opcaoId === optionId).length,
					});
					plannedValues.set(key, valueId);
				}
				const existingAssignment = app.combinacoes.find((c) => c.produtoVarianteId === item.varianteId && c.opcaoId === optionId);
				if (existingAssignment) assertCatalog(existingAssignment.opcaoValorId === valueId, "Variante já aponta para valor diferente do esperado.");
				else
					assignmentRows.push({
						id: catalogId(orgId, "combinacao", `${item.varianteId}:${optionId}`),
						organizacaoId: orgId,
						produtoVarianteId: item.varianteId,
						opcaoId: optionId,
						opcaoValorId: valueId,
					});
			}
		}
	}
	for (const batch of chunks(axisRows)) {
		await tx.insert(productOptions).values(batch);
		result.eixosCriados += batch.length;
	}
	for (const batch of chunks(valueRows)) {
		await tx.insert(productOptionValues).values(batch);
		result.valoresCriados += batch.length;
	}
	for (const batch of chunks(variantRows)) {
		await tx.insert(productVariants).values(batch);
		result.variantesCriadas += batch.length;
	}
	for (const batch of chunks(assignmentRows)) {
		await tx.insert(productVariantOptionValues).values(batch);
		result.vinculosCriados += batch.length;
	}
	// Tornar disponível no PDV não implica publicar novos cadastros no e-commerce.
	const channels = await tx.select().from(salesChannels).where(eq(salesChannels.organizacaoId, orgId));
	const privateChannels = channels.filter((c) => c.canal === "SHOP" || c.canal === "COMANDA");
	const settings = await tx.select().from(productChannelSettings).where(eq(productChannelSettings.organizacaoId, orgId));
	const channelRows: (typeof productChannelSettings.$inferInsert)[] = [];
	for (const group of plan.grupos.filter((g) => !g.existente || !g.existente.ativo || !g.existente.vendavel))
		for (const channel of privateChannels) {
			if (!settings.some((s) => s.canalVendaId === channel.id && s.produtoId === group.produtoId && !s.produtoVarianteId))
				channelRows.push({
					id: catalogId(orgId, "canal", `${channel.id}:${group.produtoId}`),
					organizacaoId: orgId,
					canalVendaId: channel.id,
					produtoId: group.produtoId,
					produtoVarianteId: null,
					disponivel: false,
				});
		}
	for (const batch of chunks(channelRows)) await tx.insert(productChannelSettings).values(batch);
	return result;
}

async function verify(tx: DBTransaction, plan: TPhiboCatalogPlan, before: TPhiboAppCatalog) {
	const after = await snapshot(tx, plan.organizacaoId);
	const pMap = new Map(after.produtos.map((p) => [p.id, p]));
	const vMap = new Map(after.variantes.map((v) => [v.id, v]));
	for (const group of plan.grupos) {
		const parent = pMap.get(group.produtoId);
		assertCatalog(parent && !different(parent, parentValues(group)), "Produto não reconciliado.");
		for (const item of group.variacoes) {
			const variant = vMap.get(item.varianteId);
			assertCatalog(variant && variant.produtoId === group.produtoId && !different(variant, variantValues(item)), "Variante não reconciliada.");
			assertCatalog(
				after.combinacoes.filter((c) => c.produtoVarianteId === item.varianteId && [group.opcoesIds.cor, group.opcoesIds.tamanho].includes(c.opcaoId))
					.length === 2,
				"Cor/tamanho não reconciliados.",
			);
			const active = after.variantes.filter((v) => v.ativo && (v.codigo === item.origem.produtoEan || v.codigoBarras === item.origem.produtoEan));
			assertCatalog(item.origem.status === 0 || active.length === 1, "EAN ativo duplicado.");
		}
	}
	// Preservar IDs, referências e saldos de TODOS os nós que já existiam; não tocar históricos avulsos.
	for (const old of before.produtos) {
		const current = pMap.get(old.id);
		assertCatalog(
			current && current.quantidade === old.quantidade && current.rastreamentoEstoqueAtivo === old.rastreamentoEstoqueAtivo,
			"Saldo/rastreamento de produto existente alterado.",
		);
		if (plan.aliasesHistoricos.some((a) => a.produtoHistoricoId === old.id))
			assertCatalog(JSON.stringify(current) === JSON.stringify(old), "Histórico avulso foi alterado.");
	}
	for (const old of before.variantes) {
		const current = vMap.get(old.id);
		assertCatalog(
			current &&
				current.produtoId === old.produtoId &&
				current.quantidade === old.quantidade &&
				current.rastreamentoEstoqueAtivo === old.rastreamentoEstoqueAtivo,
			"Identidade/saldo de variante existente alterado.",
		);
	}
	return {
		modelos: plan.grupos.length,
		variacoes: plan.grupos.reduce((n, g) => n + g.variacoes.length, 0),
		aliasesPreservados: plan.aliasesHistoricos.length,
		saldosAlterados: 0,
		referenciasMovidas: 0,
	};
}

async function main() {
	const sourceText = await readFile(sourcePath, "utf8");
	const sourceHash = catalogHash(sourceText);
	const rows = parsePhiboCatalog(JSON.parse(sourceText));
	await mkdir(path.dirname(outputPath), { recursive: true });
	const report = await db.transaction(async (tx) => {
		if (!apply) await tx.execute(sql`set transaction isolation level repeatable read read only`);
		await tx.execute(sql`set local lock_timeout = '5s'`);
		await tx.execute(sql`set local statement_timeout = '30s'`);
		if (apply)
			await tx.execute(
				sql`lock table ampmais_products, ampmais_product_variants, ampmais_product_options, ampmais_product_option_values, ampmais_product_variant_option_values, ampmais_product_channel_settings in share row exclusive mode`,
			);
		const [org] = await tx.select({ id: organizations.id, nome: organizations.nome }).from(organizations).where(eq(organizations.id, organizationId!));
		assertCatalog(org, "Organização não encontrada.");
		const before = await snapshot(tx, org.id);
		const sources = await tx
			.select({ id: integrations.id })
			.from(integrations)
			.where(and(eq(integrations.organizacaoId, org.id), eq(integrations.tipo, "PHIBO")));
		assertCatalog(sources.length === 1, "É necessária uma única integração Phibo para identificar a origem do catálogo.");
		const integrationId = sources[0].id;
		const identities = await loadExternalIdentities(tx, org.id, integrationId);
		const protection = partitionProtectedPhiboCatalog(rows, identities);
		const plan = planPhiboCatalog(protection.rows, before, org.id);
		const changes = changeCounts(plan);
		const hash = catalogHash(`${sourceHash}:${plan.hash}:${JSON.stringify({ protegidos: protection.protegidos, pendentes: protection.pendentes })}`);
		const base = {
			modo: apply ? "aplicado" : "previa",
			organizacao: org,
			fonteSha256: sourceHash,
			hash,
			plano: plan,
			alteracoes: changes,
			protecao: { protegidos: protection.protegidos, pendentes: protection.pendentes },
		};
		if (!apply) return base;
		assertCatalog(hash === options.get("--expected-plan-hash"), "Plano mudou desde a prévia. Nenhuma gravação executada.");
		await writeFile(
			outputPath.replace(/\.json$/i, "") + "-backup.json",
			JSON.stringify({ organizacao: org, fonteSha256: sourceHash, hash, catalogo: before }, null, 2),
		);
		const applied = await persist(tx, plan, before);
		const checked = await verify(tx, plan, before);
		for (const group of plan.grupos) {
			await registerExternalIdentity(
				tx,
				org.id,
				integrationId,
				{ tipo: "PRODUTO", valor: String(group.modeloPhiboId) },
				{ produtoId: group.produtoId, protegido: true },
			);
			for (const item of group.variacoes) {
				for (const key of [
					{ tipo: "EAN", valor: item.origem.produtoEan },
					{ tipo: "ESTOQUE", valor: item.origem.estoqueId },
				] as const)
					await registerExternalIdentity(tx, org.id, integrationId, key, { produtoVarianteId: item.varianteId, protegido: true });
			}
		}
		return { ...base, executado: applied, verificacao: checked };
	});
	await writeFile(outputPath, JSON.stringify({ ...report, geradoEm: new Date().toISOString(), fonte: sourcePath }, null, 2));
	console.log(
		JSON.stringify(
			{
				modo: report.modo,
				organizacao: report.organizacao,
				resumo: report.plano.resumo,
				alteracoes: report.alteracoes,
				protecao: { modelosPreservados: report.protecao.protegidos.length, modelosPendentes: report.protecao.pendentes.length },
				hash: report.hash,
				relatorio: outputPath,
				...("executado" in report ? { executado: report.executado, verificacao: report.verificacao } : {}),
			},
			null,
			2,
		),
	);
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : "Falha ao sincronizar.");
		process.exitCode = 1;
	})
	.finally(() => connection.end());
