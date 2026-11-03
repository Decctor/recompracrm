import { db } from "@/services/drizzle";
import { fiscalOutboundDocuments, productFiscalProfiles, products, saleItems, sales } from "@/services/drizzle/schema";
import type { TFiscalDocumentTypeEnum } from "@/schemas/enums";
import { and, countDistinct, desc, eq, gte, inArray, isNull, notExists, sql } from "drizzle-orm";
import { FISCAL_DEADLINES } from "./constants";
import { resolveCancellationDeadline } from "./document-actions";
import { resolveFiscalDocumentProblems, type TFiscalProblem, type TFiscalProblemTarget } from "./problems";

const FAILED_DOCUMENTS_LIMIT = 500;
const EXPIRING_DEADLINES_LIMIT = 20;
const PRODUCTS_WITHOUT_PROFILE_LIMIT = 50;
const PRODUCTS_WITHOUT_PROFILE_LOOKBACK_DAYS = 30;

export type TFiscalPendingDocument = {
	id: string;
	tipo: TFiscalDocumentTypeEnum;
	statusInterno: string;
	numero: string | null;
	vendaId: string | null;
	valorVenda: number | null;
	dataVenda: Date | null;
	dataInsercao: Date;
};

export type TFiscalPendingGroup = {
	// Chave estavel para a UI (alvo tipo + id, ou codigo quando nao ha alvo).
	chave: string;
	alvo: TFiscalProblemTarget;
	problema: Pick<TFiscalProblem, "codigo" | "origem" | "categoria" | "mensagem" | "acaoSugerida" | "reenviavel" | "resolvidoAutomaticamente">;
	documentos: TFiscalPendingDocument[];
	valorTravado: number;
};

function groupKey(problem: TFiscalProblem) {
	return problem.alvo.tipo === "NENHUM" || !problem.alvo.id ? `${problem.codigo}` : `${problem.alvo.tipo}:${problem.alvo.id}`;
}

type TFiscalPendingProvider = string | null | undefined;

/**
 * Trabalho fiscal a fazer, agrupado pela causa e nao pelo documento: um perfil fiscal ausente
 * costuma travar dez vendas, e o operador quer resolver o produto uma vez.
 *
 * `provider` aceita a promessa da leitura da organizacao: so a consulta de prazos depende dele,
 * entao as outras tres nao esperam essa ida ao banco.
 */
export async function getFiscalPendingSummary({
	organizationId,
	provider,
	now = new Date(),
}: {
	organizationId: string;
	provider: TFiscalPendingProvider | PromiseLike<TFiscalPendingProvider>;
	now?: Date;
}) {
	const lookbackStart = new Date(now.getTime() - PRODUCTS_WITHOUT_PROFILE_LOOKBACK_DAYS * 86_400_000);
	// Janela mais larga entre os tipos: a NF-e tem 24h. Documentos mais antigos nao podem mais expirar.
	const widestWindowStart = new Date(now.getTime() - FISCAL_DEADLINES.nfeCancellationHours * 3_600_000);

	const [failedDocuments, authorizedRecently, productsWithoutProfile, [salesWithoutDocument]] = await Promise.all([
		db.query.fiscalOutboundDocuments.findMany({
			where: and(eq(fiscalOutboundDocuments.organizacaoId, organizationId), inArray(fiscalOutboundDocuments.statusInterno, ["ERRO", "REJEITADO"])),
			columns: {
				id: true,
				tipo: true,
				statusInterno: true,
				numero: true,
				vendaId: true,
				problemas: true,
				codigoRejeicao: true,
				mensagens: true,
				dataInsercao: true,
			},
			with: { venda: { columns: { valorTotal: true, dataVenda: true } } },
			orderBy: desc(fiscalOutboundDocuments.dataInsercao),
			limit: FAILED_DOCUMENTS_LIMIT,
		}),
		Promise.resolve(provider).then((resolvedProvider) =>
			resolvedProvider === "MANUAL"
				? []
				: db.query.fiscalOutboundDocuments.findMany({
						where: and(
							eq(fiscalOutboundDocuments.organizacaoId, organizationId),
							eq(fiscalOutboundDocuments.statusInterno, "AUTORIZADO"),
							gte(fiscalOutboundDocuments.dataAutorizacao, widestWindowStart),
						),
						columns: { id: true, tipo: true, numero: true, vendaId: true, dataAutorizacao: true },
						with: { venda: { columns: { valorTotal: true } } },
					}),
		),
		db
			.select({
				produtoId: products.id,
				nome: products.nome,
				vendasRecentes: countDistinct(saleItems.vendaId),
			})
			.from(saleItems)
			.innerJoin(sales, eq(saleItems.vendaId, sales.id))
			.innerJoin(products, eq(saleItems.produtoId, products.id))
			.where(
				and(
					eq(sales.organizacaoId, organizationId),
					eq(sales.statusVenda, "CONFIRMADA"),
					gte(sales.dataVenda, lookbackStart),
					eq(products.ativo, true),
					notExists(
						db
							.select({ id: productFiscalProfiles.id })
							.from(productFiscalProfiles)
							.where(
								and(
									eq(productFiscalProfiles.organizacaoId, organizationId),
									eq(productFiscalProfiles.produtoId, products.id),
									isNull(productFiscalProfiles.produtoVarianteId),
									eq(productFiscalProfiles.ativo, true),
								),
							),
					),
				),
			)
			.groupBy(products.id, products.nome)
			.orderBy(desc(countDistinct(saleItems.vendaId)))
			.limit(PRODUCTS_WITHOUT_PROFILE_LIMIT),
		db
			.select({ qtde: sql<number>`count(*)::int` })
			.from(sales)
			.where(
				and(
					eq(sales.organizacaoId, organizationId),
					eq(sales.statusVenda, "CONFIRMADA"),
					gte(sales.dataVenda, lookbackStart),
					notExists(db.select({ id: fiscalOutboundDocuments.id }).from(fiscalOutboundDocuments).where(eq(fiscalOutboundDocuments.vendaId, sales.id))),
				),
			),
	]);

	const groups = new Map<string, TFiscalPendingGroup>();
	let valorTravado = 0;
	for (const document of failedDocuments) {
		const problems = resolveFiscalDocumentProblems(document).filter((problem) => !problem.resolvidoAutomaticamente);
		if (problems.length === 0) continue;
		const valorVenda = document.venda?.valorTotal ?? null;
		valorTravado += valorVenda ?? 0;
		const pendingDocument: TFiscalPendingDocument = {
			id: document.id,
			tipo: document.tipo,
			statusInterno: document.statusInterno,
			numero: document.numero,
			vendaId: document.vendaId,
			valorVenda,
			dataVenda: document.venda?.dataVenda ?? null,
			dataInsercao: document.dataInsercao,
		};
		for (const problem of problems) {
			const key = groupKey(problem);
			const group = groups.get(key) ?? {
				chave: key,
				alvo: problem.alvo,
				problema: {
					codigo: problem.codigo,
					origem: problem.origem,
					categoria: problem.categoria,
					mensagem: problem.mensagem,
					acaoSugerida: problem.acaoSugerida,
					reenviavel: problem.reenviavel,
					resolvidoAutomaticamente: problem.resolvidoAutomaticamente,
				},
				documentos: [],
				valorTravado: 0,
			};
			if (!group.documentos.some((item) => item.id === pendingDocument.id)) {
				group.documentos.push(pendingDocument);
				group.valorTravado += valorVenda ?? 0;
			}
			groups.set(key, group);
		}
	}

	const prazosExpirando = authorizedRecently
		.map((document) => {
			const prazoLimite = resolveCancellationDeadline({ tipo: document.tipo, dataAutorizacao: document.dataAutorizacao });
			return prazoLimite && prazoLimite.getTime() > now.getTime()
				? {
						documentoId: document.id,
						tipo: document.tipo,
						numero: document.numero,
						vendaId: document.vendaId,
						valorVenda: document.venda?.valorTotal ?? null,
						acao: "CANCELAR" as const,
						prazoLimite,
					}
				: null;
		})
		.filter((item): item is NonNullable<typeof item> => item !== null)
		.sort((a, b) => a.prazoLimite.getTime() - b.prazoLimite.getTime())
		.slice(0, EXPIRING_DEADLINES_LIMIT);

	const porAlvo = [...groups.values()].sort((a, b) => b.documentos.length - a.documentos.length || b.valorTravado - a.valorTravado);
	const documentosComPendencia = new Set(porAlvo.flatMap((group) => group.documentos.map((document) => document.id))).size;

	return {
		resumo: {
			documentos: documentosComPendencia,
			causas: porAlvo.length,
			valorTravado,
			prazosExpirando: prazosExpirando.length,
			produtosSemPerfil: productsWithoutProfile.length,
			vendasSemDocumento: salesWithoutDocument?.qtde ?? 0,
			// Total que a sidebar exibe: o que exige acao humana now.
			total: documentosComPendencia + prazosExpirando.length + productsWithoutProfile.length,
		},
		porAlvo,
		prazosExpirando,
		produtosSemPerfil: productsWithoutProfile.map((product) => ({
			produtoId: product.produtoId,
			nome: product.nome,
			vendasRecentes: Number(product.vendasRecentes),
		})),
	};
}

export type TFiscalPendingSummary = Awaited<ReturnType<typeof getFiscalPendingSummary>>;
