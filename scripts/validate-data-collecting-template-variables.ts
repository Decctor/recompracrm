import "@/utils/scripts/load-next-env";
import { buildBasePurchaseInteractionMetadata } from "@/lib/campaigns/interaction-metadata";
import { buildInteractionMessageVariables } from "@/lib/interactions";
import {
	buildMessageTemplateParametersFromContent,
	buildWhatsappTemplateSendPayload,
	convertHtmlToWhatsappText,
	replaceMessageTemplateVariables,
	validateMessageTemplateForWhatsapp,
	type TInteractionContextMetadados,
	type TMessageTemplateVariables,
} from "@/lib/message-templates";
import { connection, db } from "@/services/drizzle";
import { cashbackProgramTransactions, interactions, messageTemplates, sales } from "@/services/drizzle/schema";
import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";

/**
 * Dry run somente leitura. Exemplos:
 * npm run test:data-collecting-template-vars -- --limit=5
 * npm run test:data-collecting-template-vars -- --sale-id=<id> --json
 * npm run test:data-collecting-template-vars -- --interaction-id=<id> --template-id=<id> --json
 */
const SCRIPT_NAME = "VALIDATE-DATA-COLLECTING-TEMPLATE-VARIABLES";
const DEFAULT_ORGANIZATION_ID = "59c2b238-bc21-4710-b47b-db6e2a380079";
const DEFAULT_TEMPLATE_ID = "8c4b18a2-dba2-4ed9-8a6e-7d4f9d7e1877";
const DEFAULT_LIMIT = 10;
const INTERACTION_MATCH_WINDOW_MS = 10 * 60 * 1000;
const PLACEHOLDER_PHONE_NUMBER = "11999999999";

type TScriptOptions = {
	organizationId: string;
	templateId: string;
	saleId?: string;
	interactionId?: string;
	limit: number;
	json: boolean;
	summary: boolean;
};

type TSourceDescriptor = { scope: "client"; field: string } | { scope: "metadata"; field: keyof TInteractionContextMetadados };

const VARIABLE_SOURCES: Partial<Record<keyof TMessageTemplateVariables, TSourceDescriptor>> = {
	clientName: { scope: "client", field: "nome" },
	clientPhoneNumber: { scope: "client", field: "telefone" },
	clientEmail: { scope: "client", field: "email" },
	clientSegmentation: { scope: "client", field: "analiseRFMTitulo" },
	clientFavoriteProduct: { scope: "client", field: "metadataProdutoMaisCompradoId" },
	clientFavoriteProductGroup: { scope: "client", field: "metadataGrupoProdutoMaisComprado" },
	clientSuggestedProduct: { scope: "client", field: "metadataProdutoSugeridoId" },
	purchaseValue: { scope: "metadata", field: "compraValor" },
	purchaseCashbackAccumulated: { scope: "metadata", field: "compraCashbackAcumulado" },
	purchaseCashbackNewBalance: { scope: "metadata", field: "compraCashbackNovoSaldo" },
	purchaseSellerName: { scope: "metadata", field: "compraVendedorNome" },
	cashbackAvailableBalance: { scope: "metadata", field: "cashbackSaldoDisponivel" },
	cashbackLifetimeAccumulated: { scope: "metadata", field: "cashbackTotalAcumuladoVida" },
	cashbackLifetimeRedeemed: { scope: "metadata", field: "cashbackTotalResgatadoVida" },
	cashbackExpiringAmount: { scope: "metadata", field: "cashbackExpirandoValor" },
	cashbackExpiringDate: { scope: "metadata", field: "cashbackExpirandoData" },
	cashbackExpiringWindow: { scope: "metadata", field: "cashbackExpirandoJanela" },
	couponCode: { scope: "metadata", field: "cupomCodigo" },
	couponTitle: { scope: "metadata", field: "cupomTitulo" },
	couponExpirationDate: { scope: "metadata", field: "cupomExpiracaoData" },
};

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
	return process.argv.includes(`--${name}`);
}

function readOptions(): TScriptOptions {
	const limitValue = Number(getArgValue("limit") ?? DEFAULT_LIMIT);
	if (!Number.isInteger(limitValue) || limitValue <= 0 || limitValue > 100) {
		throw new Error("--limit deve ser um número inteiro entre 1 e 100.");
	}

	const saleId = getArgValue("sale-id");
	const interactionId = getArgValue("interaction-id");
	if (saleId && interactionId) {
		throw new Error("Use apenas uma das opções: --sale-id ou --interaction-id.");
	}

	return {
		organizationId: getArgValue("organization-id") ?? DEFAULT_ORGANIZATION_ID,
		templateId: getArgValue("template-id") ?? DEFAULT_TEMPLATE_ID,
		saleId,
		interactionId,
		limit: limitValue,
		json: hasFlag("json"),
		summary: hasFlag("summary"),
	};
}

function asMetadata(value: unknown): TInteractionContextMetadados {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as TInteractionContextMetadados) : {};
}

function hasOwn(value: object, key: PropertyKey) {
	return Object.prototype.hasOwnProperty.call(value, key);
}

function renderWhatsappContent(template: Awaited<ReturnType<typeof loadTemplate>>, variables: Record<keyof TMessageTemplateVariables, string>) {
	const header =
		template.conteudo.cabecalho?.tipo === "TEXTO" && template.conteudo.cabecalho.conteudoTexto
			? convertHtmlToWhatsappText(replaceMessageTemplateVariables(template.conteudo.cabecalho.conteudoTexto, variables))
			: "";
	const body = convertHtmlToWhatsappText(replaceMessageTemplateVariables(template.conteudo.corpo.conteudo, variables));
	const footer = template.conteudo.rodape ? convertHtmlToWhatsappText(replaceMessageTemplateVariables(template.conteudo.rodape, variables)) : "";
	return [header, body, footer].filter(Boolean).join("\n\n");
}

async function loadTemplate(options: TScriptOptions) {
	const template = await db.query.messageTemplates.findFirst({
		where: eq(messageTemplates.id, options.templateId),
	});
	if (!template) throw new Error(`Template ${options.templateId} não encontrado.`);
	return template;
}

async function loadSales(options: TScriptOptions) {
	return db.query.sales.findMany({
		where: and(eq(sales.organizacaoId, options.organizationId), isNotNull(sales.clienteId), options.saleId ? eq(sales.id, options.saleId) : undefined),
		orderBy: [desc(sales.dataVenda)],
		limit: options.saleId ? 1 : options.limit,
		with: { cliente: true },
	});
}

async function loadInteraction(options: TScriptOptions, interactionId: string) {
	return db.query.interactions.findFirst({
		where: and(eq(interactions.id, interactionId), eq(interactions.organizacaoId, options.organizationId)),
		with: { cliente: true },
	});
}

async function findInteractionForSale(options: TScriptOptions, sale: Awaited<ReturnType<typeof loadSales>>[number]) {
	if (!sale.clienteId || !sale.dataVenda) return null;
	const start = new Date(sale.dataVenda.getTime() - INTERACTION_MATCH_WINDOW_MS);
	const end = new Date(sale.dataVenda.getTime() + INTERACTION_MATCH_WINDOW_MS);
	const candidates = await db.query.interactions.findMany({
		where: and(
			eq(interactions.organizacaoId, options.organizationId),
			eq(interactions.clienteId, sale.clienteId),
			eq(interactions.tipo, "ENVIO-MENSAGEM"),
			isNotNull(interactions.campanhaId),
			gte(interactions.dataInsercao, start),
			lte(interactions.dataInsercao, end),
		),
		with: { cliente: true },
	});

	return (
		candidates
			.filter((candidate) => hasOwn(asMetadata(candidate.metadados), "compraValor"))
			.sort(
				(left, right) =>
					Math.abs(left.dataInsercao.getTime() - sale.dataVenda!.getTime()) - Math.abs(right.dataInsercao.getTime() - sale.dataVenda!.getTime()),
			)[0] ?? null
	);
}

async function findSaleForInteraction(options: TScriptOptions, interaction: NonNullable<Awaited<ReturnType<typeof loadInteraction>>>) {
	const start = new Date(interaction.dataInsercao.getTime() - INTERACTION_MATCH_WINDOW_MS);
	const end = new Date(interaction.dataInsercao.getTime() + INTERACTION_MATCH_WINDOW_MS);
	const candidates = await db.query.sales.findMany({
		where: and(
			eq(sales.organizacaoId, options.organizationId),
			eq(sales.clienteId, interaction.clienteId),
			gte(sales.dataVenda, start),
			lte(sales.dataVenda, end),
		),
		with: { cliente: true },
	});

	return (
		candidates.sort(
			(left, right) =>
				Math.abs((left.dataVenda?.getTime() ?? 0) - interaction.dataInsercao.getTime()) -
				Math.abs((right.dataVenda?.getTime() ?? 0) - interaction.dataInsercao.getTime()),
		)[0] ?? null
	);
}

async function buildSyntheticInteractionForSale({
	options,
	sale,
	terminology,
}: {
	options: TScriptOptions;
	sale: Awaited<ReturnType<typeof loadSales>>[number];
	terminology: "DINHEIRO" | "PONTOS";
}) {
	if (!sale.clienteId || !sale.cliente) throw new Error(`Venda ${sale.id} não possui cliente para simulação.`);
	const transactions = await db.query.cashbackProgramTransactions.findMany({
		where: and(
			eq(cashbackProgramTransactions.organizacaoId, options.organizationId),
			eq(cashbackProgramTransactions.vendaId, sale.id),
			eq(cashbackProgramTransactions.clienteId, sale.clienteId),
		),
		orderBy: [desc(cashbackProgramTransactions.dataInsercao)],
		columns: {
			tipo: true,
			status: true,
			valor: true,
			saldoValorPosterior: true,
			campanhaId: true,
		},
	});
	const activeAccumulations = transactions.filter(
		(transaction) => transaction.tipo === "ACÚMULO" && transaction.status === "ATIVO" && !transaction.campanhaId,
	);
	const accumulatedInPurchase = activeAccumulations.reduce((total, transaction) => total + transaction.valor, 0);
	const metadata = buildBasePurchaseInteractionMetadata({
		terminologia: terminology,
		saleValue: sale.valorTotal,
		saleId: sale.id,
		saleDate: sale.dataVenda?.toISOString(),
		transactionAccumulatedCashback: accumulatedInPurchase,
		availableBalance: activeAccumulations[0]?.saldoValorPosterior ?? 0,
		accumulatedTotal: 0,
		sellerName: sale.vendedorNome,
	});

	return {
		id: `dry-run-sale-${sale.id}`,
		organizacaoId: options.organizationId,
		clienteId: sale.clienteId,
		campanhaId: null,
		dataInsercao: sale.dataVenda ?? new Date(0),
		metadados: metadata,
		cliente: sale.cliente,
		synthetic: true,
	} as unknown as NonNullable<Awaited<ReturnType<typeof loadInteraction>>> & { synthetic: true };
}

async function resolveProductNames(client: NonNullable<Awaited<ReturnType<typeof loadInteraction>>>["cliente"]) {
	const ids = [client.metadataProdutoMaisCompradoId, client.metadataProdutoSugeridoId].filter(Boolean) as string[];
	const products = ids.length
		? await db.query.products.findMany({
				where: (fields, { inArray }) => inArray(fields.id, ids),
				columns: { id: true, nome: true },
			})
		: [];
	return new Map(products.map((product) => [product.id, product.nome]));
}

async function buildCaseReport({
	options,
	template,
	sale,
	interaction,
}: {
	options: TScriptOptions;
	template: Awaited<ReturnType<typeof loadTemplate>>;
	sale: Awaited<ReturnType<typeof loadSales>>[number] | null;
	interaction: NonNullable<Awaited<ReturnType<typeof loadInteraction>>>;
}) {
	const metadata = asMetadata(interaction.metadados);
	const cashbackTransactions = sale
		? await db.query.cashbackProgramTransactions.findMany({
				where: and(
					eq(cashbackProgramTransactions.organizacaoId, options.organizationId),
					eq(cashbackProgramTransactions.vendaId, sale.id),
					eq(cashbackProgramTransactions.clienteId, interaction.clienteId),
				),
				columns: {
					id: true,
					tipo: true,
					status: true,
					valor: true,
					vendaValor: true,
					campanhaId: true,
					dataInsercao: true,
				},
			})
		: [];
	const productNames = await resolveProductNames(interaction.cliente);
	const variables = buildInteractionMessageVariables({
		client: {
			nome: interaction.cliente.nome,
			telefone: PLACEHOLDER_PHONE_NUMBER,
			email: interaction.cliente.email,
			analiseRFMTitulo: interaction.cliente.analiseRFMTitulo,
			metadataGrupoProdutoMaisComprado: interaction.cliente.metadataGrupoProdutoMaisComprado,
			metadataProdutoMaisCompradoNome: interaction.cliente.metadataProdutoMaisCompradoId
				? (productNames.get(interaction.cliente.metadataProdutoMaisCompradoId) ?? "")
				: "",
			metadataProdutoSugeridoNome: interaction.cliente.metadataProdutoSugeridoId
				? (productNames.get(interaction.cliente.metadataProdutoSugeridoId) ?? "")
				: "",
		},
		contextMetadados: metadata,
	});
	const configuredParameters = template.conteudo.corpo.parametros;
	const detectedParameters = buildMessageTemplateParametersFromContent(template.conteudo);
	const parameterConfigurationIssues: string[] = [];
	for (const detected of detectedParameters) {
		if (!configuredParameters.some((configured) => configured.identificadorInterno === detected.identificadorInterno)) {
			parameterConfigurationIssues.push(`Variável ${detected.identificadorInterno} aparece no conteúdo, mas não está em conteudo.corpo.parametros.`);
		}
	}

	const requiredVariables = configuredParameters.map((parameter) => {
		const identifier = parameter.identificadorInterno as keyof TMessageTemplateVariables;
		const source = VARIABLE_SOURCES[identifier];
		const clientRecord = interaction.cliente as unknown as Record<string, unknown>;
		const sourcePresent = source
			? source.scope === "metadata"
				? hasOwn(metadata, source.field)
				: hasOwn(clientRecord, source.field) && clientRecord[source.field] !== null && clientRecord[source.field] !== ""
			: false;
		const value = variables[identifier];
		return {
			identifier,
			externalId: parameter.identificadorExterno,
			source: source ? `${source.scope}.${String(source.field)}` : null,
			sourcePresent,
			value,
			valid: sourcePresent && value.trim().length > 0,
		};
	});

	const consistencyIssues: string[] = [];
	if (sale && metadata.compraValor !== undefined && Math.abs(metadata.compraValor - sale.valorTotal) > 0.001) {
		consistencyIssues.push(`compraValor (${metadata.compraValor}) diverge de sales.valorTotal (${sale.valorTotal}).`);
	}
	if (sale && metadata.compraVendedorNome !== undefined && metadata.compraVendedorNome !== sale.vendedorNome) {
		consistencyIssues.push(`compraVendedorNome (${metadata.compraVendedorNome}) diverge de sales.vendedorNome (${sale.vendedorNome}).`);
	}
	for (const transaction of cashbackTransactions) {
		if (sale && Math.abs(transaction.vendaValor - sale.valorTotal) > 0.001) {
			consistencyIssues.push(
				`Transação de cashback ${transaction.id} usou vendaValor ${transaction.vendaValor}, mas sales.valorTotal é ${sale.valorTotal}.`,
			);
		}
	}
	const activeAccumulationTotal = cashbackTransactions
		.filter((transaction) => transaction.tipo === "ACÚMULO" && transaction.status === "ATIVO" && !transaction.campanhaId)
		.reduce((total, transaction) => total + transaction.valor, 0);
	if (
		metadata.compraCashbackAcumulado !== undefined &&
		cashbackTransactions.length > 0 &&
		Math.abs(metadata.compraCashbackAcumulado - activeAccumulationTotal) > 0.001
	) {
		consistencyIssues.push(
			`compraCashbackAcumulado (${metadata.compraCashbackAcumulado}) diverge do total de transações de acúmulo ativas (${activeAccumulationTotal}).`,
		);
	}

	const runtimeContext = {
		origin: "",
		organizacaoId: options.organizationId,
		clienteId: interaction.clienteId,
		interactionId: interaction.id,
		variaveis: variables,
		cabecalhoMidiaUrl: template.conteudo.cabecalho?.tipo === "IMAGEM_DINAMICA" ? undefined : template.conteudo.cabecalho?.conteudoMidiaUrl,
	};

	return {
		valid: requiredVariables.every((variable) => variable.valid) && consistencyIssues.length === 0 && parameterConfigurationIssues.length === 0,
		sale: sale
			? {
					id: sale.id,
					externalId: sale.idExterno,
					value: sale.valorTotal,
					soldAt: sale.dataVenda,
				}
			: null,
		interaction: {
			id: interaction.id,
			campaignId: interaction.campanhaId,
			createdAt: interaction.dataInsercao,
			metadata,
			synthetic: "synthetic" in interaction && interaction.synthetic === true,
		},
		cashbackTransactions,
		requiredVariables,
		consistencyIssues,
		parameterConfigurationIssues,
		renderedWhatsappContent: renderWhatsappContent(template, variables),
		whatsappPayload: buildWhatsappTemplateSendPayload({
			template,
			toPhoneNumber: PLACEHOLDER_PHONE_NUMBER,
			runtimeContext,
		}),
	};
}

async function run(options: TScriptOptions) {
	const template = await loadTemplate(options);
	const cashbackProgram = await db.query.cashbackPrograms.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, options.organizationId),
		columns: { terminologia: true },
	});
	const terminology = cashbackProgram?.terminologia ?? "DINHEIRO";
	const templateValidation = validateMessageTemplateForWhatsapp(template.conteudo);
	const cases: Awaited<ReturnType<typeof buildCaseReport>>[] = [];
	const unmatchedSales: Array<{ id: string; externalId: string; soldAt: Date | null }> = [];

	if (options.interactionId) {
		const interaction = await loadInteraction(options, options.interactionId);
		if (!interaction) throw new Error(`Interação ${options.interactionId} não encontrada na organização informada.`);
		const sale = await findSaleForInteraction(options, interaction);
		cases.push(await buildCaseReport({ options, template, sale, interaction }));
	} else {
		const selectedSales = await loadSales(options);
		if (options.saleId && selectedSales.length === 0) {
			throw new Error(`Venda ${options.saleId} não encontrada na organização informada.`);
		}
		for (const sale of selectedSales) {
			const interaction = (await findInteractionForSale(options, sale)) ?? (await buildSyntheticInteractionForSale({ options, sale, terminology }));
			cases.push(await buildCaseReport({ options, template, sale, interaction }));
		}
	}

	const report = {
		valid: templateValidation.valid && cases.length > 0 && cases.every((item) => item.valid),
		dryRun: true,
		channelsCalled: [],
		organizationId: options.organizationId,
		template: {
			id: template.id,
			organizationId: template.organizacaoId,
			crossOrganization: template.organizacaoId !== options.organizationId,
			name: template.nome,
			status: template.status,
			validation: templateValidation,
		},
		cases,
		unmatchedSales,
	};
	const summary = {
		valid: report.valid,
		dryRun: report.dryRun,
		channelsCalled: report.channelsCalled,
		organizationId: report.organizationId,
		template: report.template,
		salesAnalyzed: cases.length + unmatchedSales.length,
		matchedInteractions: cases.filter((item) => !item.interaction.synthetic).length,
		syntheticCases: cases.filter((item) => item.interaction.synthetic).length,
		validCases: cases.filter((item) => item.valid).length,
		baseCashbackAccumulation: {
			casesWithActiveTransaction: cases.filter((item) =>
				item.cashbackTransactions.some((transaction) => transaction.tipo === "ACÚMULO" && transaction.status === "ATIVO" && !transaction.campanhaId),
			).length,
			casesWithoutActiveTransaction: cases.filter(
				(item) =>
					!item.cashbackTransactions.some((transaction) => transaction.tipo === "ACÚMULO" && transaction.status === "ATIVO" && !transaction.campanhaId),
			).length,
			totalAccumulated: cases.reduce(
				(total, item) =>
					total +
					item.cashbackTransactions
						.filter((transaction) => transaction.tipo === "ACÚMULO" && transaction.status === "ATIVO" && !transaction.campanhaId)
						.reduce((subtotal, transaction) => subtotal + transaction.valor, 0),
				0,
			),
		},
		campaignBonuses: {
			casesWithActiveTransaction: cases.filter((item) =>
				item.cashbackTransactions.some((transaction) => transaction.tipo === "ACÚMULO" && transaction.status === "ATIVO" && !!transaction.campanhaId),
			).length,
			totalAccumulated: cases.reduce(
				(total, item) =>
					total +
					item.cashbackTransactions
						.filter((transaction) => transaction.tipo === "ACÚMULO" && transaction.status === "ATIVO" && !!transaction.campanhaId)
						.reduce((subtotal, transaction) => subtotal + transaction.valor, 0),
				0,
			),
		},
		invalidCases: cases
			.filter((item) => !item.valid)
			.map((item) => ({
				saleId: item.sale?.id ?? null,
				interactionId: item.interaction.id,
				invalidVariables: item.requiredVariables.filter((variable) => !variable.valid),
				consistencyIssues: item.consistencyIssues,
				parameterConfigurationIssues: item.parameterConfigurationIssues,
			})),
		unmatchedSales,
	};

	if (options.json || options.summary) {
		console.log(JSON.stringify(options.summary ? summary : report, null, 2));
	} else {
		console.dir(report, { depth: null, colors: true });
	}

	if (!report.valid) process.exitCode = 1;
}

void run(readOptions())
	.catch((error) => {
		console.error(`[${SCRIPT_NAME}] Erro:`, error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end().catch(() => undefined);
		process.exit(process.exitCode ?? 0);
	});
