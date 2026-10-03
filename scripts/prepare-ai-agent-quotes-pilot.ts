import "dotenv/config";
import { ensureOrganizationAgent } from "@/lib/ai/agent/provisioning";
import { parseJsonbWithFallback } from "@/lib/ai/shared/json";
import { getCatalogCommercialReadiness } from "@/lib/products/commercial-readiness";
import { buildSalePriceUpdate } from "@/lib/products/price-snapshot";
import { AiAgentCapabilitiesSchema } from "@/schemas/ai-agents";
import { connection, db } from "@/services/drizzle";
import { aiAgents, organizations, productAddOnReferences, products, productVariants } from "@/services/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

type ScriptArgs = {
	apply: boolean;
	days: number;
	onlyMissing: boolean;
	orgId: string;
	reportLimit: number;
};

type ObservedPrice = {
	produto_id: string;
	produto_variante_id: string | null;
	produto_nome: string;
	variante_nome: string | null;
	preco_atual: number | null;
	preco_observado: number;
	venda_id: string;
	data_venda: Date | string;
};

const LOG = "[AI_AGENT_QUOTES_PILOT]";

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const inlineArg = process.argv.find((argument) => argument.startsWith(prefix));
	if (inlineArg) return inlineArg.slice(prefix.length);

	const index = process.argv.indexOf(`--${name}`);
	if (index >= 0) return process.argv[index + 1] ?? null;
	return null;
}

function hasFlag(name: string) {
	return process.argv.includes(`--${name}`);
}

function printUsage() {
	console.log(`Uso:
  npm run pilot:ai-quotes -- --orgId=<uuid>
  npm run pilot:ai-quotes -- --orgId=<uuid> --days=60 --apply

Opções:
  --orgId        Organização piloto. Obrigatório.
  --days         Janela de vendas considerada. Padrão: 60.
  --reportLimit  Máximo de alterações exibidas na tabela. Padrão: 50.
  --onlyMissing  Preenche somente preços nulos; não substitui preços divergentes.
  --apply        Atualiza os preços e habilita produtos/orçamentos no agente.

Sem --apply, o script é estritamente somente leitura.`);
}

function parseArgs(): ScriptArgs {
	const orgId = getArgValue("orgId");
	const days = Number(getArgValue("days") ?? 60);
	const reportLimit = Number(getArgValue("reportLimit") ?? 50);

	if (!orgId) throw new Error("Informe --orgId=<uuid>.");
	if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("--days deve ser um inteiro entre 1 e 365.");
	if (!Number.isInteger(reportLimit) || reportLimit < 0 || reportLimit > 1000) {
		throw new Error("--reportLimit deve ser um inteiro entre 0 e 1000.");
	}

	return {
		apply: hasFlag("apply"),
		days,
		onlyMissing: hasFlag("onlyMissing"),
		orgId,
		reportLimit,
	};
}

async function findLatestObservedPrices(args: ScriptArgs, cutoff: Date) {
	const rows = (await db.execute(sql`
		WITH ranked_prices AS (
			SELECT
				si.produto_id,
				si.produto_variante_id,
				p.nome AS produto_nome,
				pv.nome AS variante_nome,
				CASE
					WHEN si.produto_variante_id IS NULL THEN p.preco_venda
					ELSE pv.preco_venda
				END AS preco_atual,
				CASE
					WHEN jsonb_typeof(si.metadados->'valorUnitarioBase') = 'number'
						THEN (si.metadados->>'valorUnitarioBase')::double precision
					ELSE si.valor_unitario
				END AS preco_observado,
				si.venda_id,
				s.data_venda,
				ROW_NUMBER() OVER (
					PARTITION BY si.produto_id, si.produto_variante_id
					ORDER BY s.data_venda DESC, si.id DESC
				) AS ordem
			FROM ampmais_sale_items si
			INNER JOIN ampmais_sales s
				ON s.id = si.venda_id
				AND s.organizacao_id = ${args.orgId}
			INNER JOIN ampmais_products p
				ON p.id = si.produto_id
				AND p.organizacao_id = ${args.orgId}
				AND p.ativo IS TRUE
			LEFT JOIN ampmais_product_variants pv
				ON pv.id = si.produto_variante_id
				AND pv.produto_id = p.id
				AND pv.organizacao_id = ${args.orgId}
				AND pv.ativo IS TRUE
			WHERE si.organizacao_id = ${args.orgId}
				AND s.data_venda >= ${cutoff.toISOString()}::timestamptz
				AND (s.status_venda IS NULL OR s.status_venda = 'CONFIRMADA')
				AND (
					si.produto_variante_id IS NULL
					OR pv.id IS NOT NULL
				)
				AND CASE
					WHEN jsonb_typeof(si.metadados->'valorUnitarioBase') = 'number'
						THEN (si.metadados->>'valorUnitarioBase')::double precision
					ELSE si.valor_unitario
				END > 0
		)
		SELECT
			produto_id,
			produto_variante_id,
			produto_nome,
			variante_nome,
			preco_atual,
			preco_observado,
			venda_id,
			data_venda
		FROM ranked_prices
		WHERE ordem = 1
		ORDER BY produto_nome, variante_nome NULLS FIRST
	`)) as unknown as ObservedPrice[];

	return rows.map((row) => ({
		...row,
		preco_atual: row.preco_atual === null ? null : Number(row.preco_atual),
		preco_observado: Number(row.preco_observado),
	}));
}

async function getProjectedReadiness(organizacaoId: string, candidates: ObservedPrice[]) {
	const catalog = await db.query.products.findMany({
		where: and(eq(products.organizacaoId, organizacaoId), eq(products.ativo, true)),
		columns: { id: true, precoVenda: true, precoCusto: true },
		with: {
			variantes: {
				where: (variant, { eq: equals }) => equals(variant.ativo, true),
				columns: { id: true, precoVenda: true, precoCusto: true },
			},
		},
	});
	const productIds = catalog.map((product) => product.id);
	const addOnReferences =
		productIds.length === 0
			? []
			: await db
					.select({
						produtoId: productAddOnReferences.produtoId,
						produtoVarianteId: productAddOnReferences.produtoVarianteId,
					})
					.from(productAddOnReferences)
					.where(inArray(productAddOnReferences.produtoId, productIds));
	const projectedPrices = new Map(
		candidates.map((item) => [`${item.produto_id}:${item.produto_variante_id ?? ""}`, item.preco_observado] as const),
	);

	const items = catalog.flatMap((product) =>
		product.variantes.length > 0
			? product.variantes.map((variant) => ({
					preco: projectedPrices.get(`${product.id}:${variant.id}`) ?? variant.precoVenda,
					custo: variant.precoCusto ?? product.precoCusto,
					comAdicionais: addOnReferences.some(
						(reference) =>
							reference.produtoId === product.id &&
							(reference.produtoVarianteId === null || reference.produtoVarianteId === variant.id),
					),
				}))
			: [
					{
						preco: projectedPrices.get(`${product.id}:`) ?? product.precoVenda,
						custo: product.precoCusto,
						comAdicionais: addOnReferences.some(
							(reference) => reference.produtoId === product.id && reference.produtoVarianteId === null,
						),
					},
				],
	);

	return {
		itensAtivos: items.length,
		aptos: items.filter((item) => item.preco != null && !item.comAdicionais).length,
		semPreco: items.filter((item) => item.preco == null).length,
		semCusto: items.filter((item) => item.custo == null).length,
		comAdicionais: items.filter((item) => item.comAdicionais).length,
	};
}

async function main() {
	if (hasFlag("help") || process.argv.includes("-h")) {
		printUsage();
		return;
	}

	const args = parseArgs();
	const cutoff = new Date();
	cutoff.setUTCDate(cutoff.getUTCDate() - args.days);

	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.id, args.orgId),
		columns: { id: true, nome: true, configuracao: true },
	});
	if (!organization) throw new Error(`Organização ${args.orgId} não encontrada.`);

	const [operationTable] = (await db.execute(
		sql`SELECT to_regclass('public.ampmais_ai_agent_operations') AS table_name`,
	)) as unknown as Array<{ table_name: string | null }>;
	const operationMigrationApplied = operationTable?.table_name != null;

	const agent = await db.query.aiAgents.findFirst({
		where: eq(aiAgents.organizacaoId, args.orgId),
		columns: { id: true, status: true, capacidades: true },
	});
	const currentCapabilities = parseJsonbWithFallback(AiAgentCapabilitiesSchema, agent?.capacidades);
	const nextCapabilities = AiAgentCapabilitiesSchema.parse({
		...currentCapabilities,
		ferramentas: {
			...currentCapabilities.ferramentas,
			"produtos.consultar": { habilitada: true },
			"orcamentos.criar": { habilitada: true },
			...(currentCapabilities.comercial.orcamentos.bloqueio === "TRANSFERIR"
				? { "atendimento.transferir_para_humano": { habilitada: true } }
				: {}),
		},
		comercial: {
			...currentCapabilities.comercial,
			precos: { ...currentCapabilities.comercial.precos, visiveis: true },
		},
	});

	const observedPrices = await findLatestObservedPrices(args, cutoff);
	const candidates = observedPrices.filter(
		(item) =>
			(!args.onlyMissing || item.preco_atual === null) &&
			(item.preco_atual === null || Math.abs(item.preco_atual - item.preco_observado) > 0.000_001),
	);
	const unchanged = observedPrices.length - candidates.length;
	const missingPrices = candidates.filter((item) => item.preco_atual === null);
	const changedPrices = candidates.filter((item) => item.preco_atual !== null);
	const currentReadiness = await getCatalogCommercialReadiness({ db, organizacaoId: args.orgId });
	const projectedReadiness = await getProjectedReadiness(args.orgId, candidates);

	console.log(`${LOG} Modo: ${args.apply ? "APPLY" : "DRY-RUN"}`);
	console.log(`${LOG} Organização: ${organization.nome} (${organization.id})`);
	console.log(`${LOG} Janela: ${args.days} dias, desde ${cutoff.toISOString()}`);
	console.log(`${LOG} Migration de operações aplicada: ${operationMigrationApplied ? "SIM" : "NÃO"}`);
	console.log(
		`${LOG} Acesso ao recurso de IA no plano: ${organization.configuracao?.recursos?.iaAtendimento?.acesso ? "SIM" : "NÃO"}`,
	);
	console.log(`${LOG} Agente: ${agent ? `${agent.id} (${agent.status})` : "ainda não provisionado"}`);
	console.log(
		`${LOG} Orçamentos atualmente habilitados: ${currentCapabilities.ferramentas["orcamentos.criar"]?.habilitada ? "SIM" : "NÃO"}`,
	);
	console.log(`${LOG} SKUs com preço observado: ${observedPrices.length}`);
	console.log(`${LOG} SKUs que seriam atualizados: ${candidates.length}`);
	console.log(`${LOG}   - preenchimentos de preço ausente: ${missingPrices.length}`);
	console.log(`${LOG}   - substituições de preço existente: ${changedPrices.length}`);
	console.log(`${LOG} SKUs já iguais ou preservados: ${unchanged}`);
	console.log(
		`${LOG} Catálogo atual: ${currentReadiness.aptos}/${currentReadiness.itensAtivos} aptos; ${currentReadiness.semPreco} sem preço; ${currentReadiness.semCusto} sem custo; ${currentReadiness.comAdicionais} com adicionais.`,
	);
	console.log(
		`${LOG} Após preços: ${projectedReadiness.aptos}/${projectedReadiness.itensAtivos} aptos; ${projectedReadiness.semPreco} sem preço; ${projectedReadiness.semCusto} sem custo; ${projectedReadiness.comAdicionais} com adicionais.`,
	);

	if (candidates.length > 0 && args.reportLimit > 0) {
		console.table(
			candidates.slice(0, args.reportLimit).map((item) => ({
				produto: item.produto_nome,
				variante: item.variante_nome ?? "—",
				precoAtual: item.preco_atual ?? "—",
				novoPreco: item.preco_observado,
				dataVenda: new Date(item.data_venda).toISOString(),
				vendaId: item.venda_id,
			})),
		);
		if (candidates.length > args.reportLimit) {
			console.log(`${LOG} ... e mais ${candidates.length - args.reportLimit} alteração(ões) não exibida(s).`);
		}
	}

	if (!args.apply) {
		console.log(`${LOG} Capacidades que seriam garantidas: produtos.consultar, orcamentos.criar e comercial.precos.visiveis.`);
		console.log(`${LOG} Dry-run concluído sem alterações.`);
		return;
	}

	if (!operationMigrationApplied) {
		throw new Error("A migration drizzle/0056_ai_agent_operations.sql precisa ser aplicada antes de habilitar o piloto.");
	}
	if (!organization.configuracao?.recursos?.iaAtendimento?.acesso) {
		throw new Error("A organização não possui acesso ao recurso iaAtendimento no plano.");
	}
	if (projectedReadiness.aptos === 0) throw new Error("Nenhum SKU ficaria apto após atualizar os preços de venda.");

	await db.transaction(async (tx) => {
		for (const item of candidates) {
			if (item.produto_variante_id) {
				const variantWhere = and(
					eq(productVariants.id, item.produto_variante_id),
					eq(productVariants.produtoId, item.produto_id),
					eq(productVariants.organizacaoId, args.orgId),
				);
				const [current] = await tx
					.select({ precoVenda: productVariants.precoVenda, precoVendaAnterior: productVariants.precoVendaAnterior })
					.from(productVariants)
					.where(variantWhere)
					.for("update");
				if (!current) continue;
				await tx
					.update(productVariants)
					.set(buildSalePriceUpdate({ current: current, next: { precoVenda: item.preco_observado } }))
					.where(variantWhere);
			} else {
				const productWhere = and(eq(products.id, item.produto_id), eq(products.organizacaoId, args.orgId));
				const [current] = await tx
					.select({ precoVenda: products.precoVenda, precoVendaAnterior: products.precoVendaAnterior })
					.from(products)
					.where(productWhere)
					.for("update");
				if (!current) continue;
				await tx.update(products).set(buildSalePriceUpdate({ current: current, next: { precoVenda: item.preco_observado } })).where(productWhere);
			}
		}

		const provisionedAgent = await ensureOrganizationAgent(tx, args.orgId);
		await tx
			.update(aiAgents)
			.set({ capacidades: nextCapabilities })
			.where(and(eq(aiAgents.id, provisionedAgent.id), eq(aiAgents.organizacaoId, args.orgId)));
	});

	console.log(`${LOG} ${candidates.length} preço(s) atualizado(s) e piloto habilitado.`);
}

main()
	.catch((error) => {
		console.error(`${LOG} Falha:`, error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
