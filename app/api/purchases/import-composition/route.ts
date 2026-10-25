import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { TAuthUserSession } from "@/lib/authentication/types";
import { extractCompositionFromFile, IMPORT_COMPOSITION_ALLOWED_MIME_TYPES } from "@/lib/purchase/import";
import { extractCompositionFromNfeXml } from "@/lib/purchase/import-xml";
import { looksLikeFiscalXml, storeFiscalEntryDocument } from "@/lib/fiscal/inbound/entry-files";
import { findPurchasesByAccessKeys, getInboundDocumentXml, registerManualInboundDocument } from "@/lib/fiscal/inbound";
import { matchCompositionItemsToProducts, type TMatchedCompositionItem } from "@/lib/purchase/match-products";
import { resolveEntryLineDisposition } from "@/lib/purchase/entry-rules";
import { inferEntryTaxRegime, resolveEntryTaxTreatment, type TEntryTaxOverrides } from "@/lib/fiscal/entry/presets";
import { computeFiscoComponents, replaceCalculatedFiscoComponents, type TEntryFiscoContext } from "@/lib/fiscal/entry/fisco-components";
import { getUfIcmsParameters } from "@/lib/fiscal/entry/uf-parameters";
import { organizations } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import { describeErrorForLogging } from "@/lib/errors";
import type { TPurchaseImportStageEnum, TPurchaseImportStageStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { NextResponse, type NextRequest } from "next/server";
import z from "zod";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision extraction + AI matching can take tens of seconds per file.
export const maxDuration = 120;

// ~3MB of binary content once base64-decoded; keeps the JSON body under the platform's ~4.5MB limit.
const MAX_FILE_BASE64_LENGTH = 4_200_000;

// Divergência tolerada entre a soma das linhas lidas e o total declarado no documento.
const DOCUMENT_TOTAL_MISMATCH_TOLERANCE = 0.05;

const ImportCompositionFileSchema = z.object({
	dataBase64: z
		.string({
			required_error: "Arquivo não informado.",
			invalid_type_error: "Tipo não válido para o arquivo.",
		})
		.min(1, "Arquivo não informado.")
		.max(MAX_FILE_BASE64_LENGTH, "Arquivo muito grande. O limite é de aproximadamente 3MB por arquivo."),
	mimeType: z.enum(IMPORT_COMPOSITION_ALLOWED_MIME_TYPES, {
		required_error: "Tipo do arquivo não informado.",
		invalid_type_error: "Tipo de arquivo não suportado. Envie XML, PDF ou imagem (PNG, JPEG ou WEBP).",
	}),
	fileName: z.string({ invalid_type_error: "Tipo não válido para o nome do arquivo." }).optional().nullable(),
});

// Duas origens, um pipeline: um arquivo enviado, ou uma nota recebida (DF-e) cujo XML já está no
// catálogo — "Lançar compra" na aba de notas recebidas (ADR-0002, fluxo A).
const ImportPurchaseCompositionInputSchema = z
	.object({
		file: ImportCompositionFileSchema.optional().nullable(),
		inboundId: z.string({ invalid_type_error: "Tipo não válido para o ID da nota recebida." }).optional().nullable(),
	})
	.refine((input) => !!input.file !== !!input.inboundId, { message: "Informe o arquivo ou a nota recebida, não os dois." });
export type TImportPurchaseCompositionInput = z.infer<typeof ImportPurchaseCompositionInputSchema>;

export type TImportPurchaseCompositionStageEvent = {
	type: "stage";
	stage: TPurchaseImportStageEnum;
	status: TPurchaseImportStageStatusEnum;
	detail: string | null;
};
type TOnImportStage = (event: Omit<TImportPurchaseCompositionStageEvent, "type">) => void;

function assertImportIsActive(abortSignal?: AbortSignal) {
	if (abortSignal?.aborted) throw new createHttpError.BadRequest("Leitura cancelada.");
}

function formatBRL(value: number) {
	return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getUserOrgIdForImport(session: TAuthUserSession) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (!session.membership?.permissoes.compras.criar && !session.membership?.permissoes.compras.editar)
		throw new createHttpError.Unauthorized("Você não possui permissão para acessar esse recurso.");
	return userOrgId;
}

type TExtractedComposition = Awaited<ReturnType<typeof extractCompositionFromFile>>;

function getFiscalAccessKey(extracted: TExtractedComposition) {
	const chaveAcesso = extracted.chaveAcesso?.replace(/\D/g, "") || null;
	return extracted.documentoFiscal && chaveAcesso && chaveAcesso.length === 44 ? chaveAcesso : null;
}

/**
 * O que um XML precisa para virar compra desta organização, conferido ANTES de gravar qualquer
 * coisa. Bloqueios são erros 422 com a causa; o que não impede a compra (nota sem protocolo) vira
 * aviso.
 */
async function validateFiscalXml({
	organizationId,
	organizationCnpj,
	extracted,
	avisos,
}: {
	organizationId: string;
	organizationCnpj: string;
	extracted: TExtractedComposition;
	avisos: string[];
}) {
	const fiscal = extracted.documentoFiscal;
	if (!fiscal || !getFiscalAccessKey(extracted)) return;

	const recipientCnpj = fiscal.destinatario.cnpj;
	const ownCnpj = organizationCnpj.replace(/\D/g, "");
	if (recipientCnpj && ownCnpj && recipientCnpj !== ownCnpj)
		throw new createHttpError.UnprocessableEntity(
			`Esta nota foi emitida para o CNPJ ${formatCnpj(recipientCnpj)}, não para a organização (${formatCnpj(ownCnpj)}).`,
		);

	if (!fiscal.protocolo)
		avisos.push("O XML não traz o protocolo de autorização da SEFAZ. Confira se a nota foi autorizada antes de receber a compra.");
	else if (!isAuthorizedProtocol(extracted))
		avisos.push(`O protocolo da nota não indica autorização (cStat ${fiscal.protocolo.codigoStatus ?? "?"}). Confira a situação na SEFAZ.`);

	// Nota complementar (finNFe 2) só faz sentido sobre uma compra que já existe aqui.
	if (fiscal.finalidade === 2) {
		const referenced = await findPurchasesByAccessKeys({ organizationId, chavesAcesso: fiscal.documentosReferenciados });
		if (!referenced.some((doc) => doc.compraId))
			throw new createHttpError.UnprocessableEntity(
				"Esta é uma NF-e complementar, mas a nota que ela complementa não está lançada em nenhuma compra. Lance a nota original primeiro.",
			);
		avisos.push("NF-e complementar: ela ajusta valor ou imposto de uma compra já lançada. O lançamento como compra nova ainda não é suportado.");
	}
}

function isAuthorizedProtocol(extracted: TExtractedComposition) {
	const protocolo = extracted.documentoFiscal?.protocolo;
	return protocolo?.codigoStatus === "100" || (!!protocolo?.numero && !protocolo.codigoStatus);
}

/**
 * Todo XML com chave vira (ou reaproveita) uma linha em `fiscal_inbound_documents` (ADR-0002,
 * decisão 1). O que o DF-e já sabe dessa nota — cancelamento, outra compra — vale aqui também.
 */
async function registerFiscalXml({
	organizationId,
	extracted,
	xmlArquivoId,
}: {
	organizationId: string;
	extracted: TExtractedComposition;
	xmlArquivoId: string;
}) {
	const fiscal = extracted.documentoFiscal;
	const chaveAcesso = getFiscalAccessKey(extracted);
	if (!fiscal || !chaveAcesso) return null;

	const document = await registerManualInboundDocument({
		organizacaoId: organizationId,
		chaveAcesso,
		modelo: "NFE",
		xmlArquivoId,
		emitenteCnpj: fiscal.emitente.cnpj,
		emitenteNome: extracted.fornecedor?.nome ?? null,
		valorTotal: extracted.valorTotalDocumento ?? null,
		dataEmissao: parseIsoDate(extracted.dataEmissao),
		situacao: isAuthorizedProtocol(extracted) ? "AUTORIZADA" : null,
	});
	const label = extracted.numeroDocumento ? `nº ${extracted.numeroDocumento}` : chaveAcesso;
	if (document.situacao === "CANCELADA") throw new createHttpError.UnprocessableEntity(`A nota ${label} consta como cancelada na SEFAZ.`);
	if (document.situacao === "DENEGADA") throw new createHttpError.UnprocessableEntity(`A nota ${label} consta como denegada na SEFAZ.`);
	if (document.compraId) throw new createHttpError.UnprocessableEntity(`A nota ${label} já está lançada em outra compra (${document.compraId}).`);
	return document;
}

type TImportCompositionFile = z.infer<typeof ImportCompositionFileSchema>;

export type TImportedLine = TMatchedCompositionItem & {
	/** Linha que não é aquisição (consignação, remessa, devolução…): fica visível, mas fora da compra. */
	foraDaCompra: string | null;
};

type TEntryTaxContext = {
	regime: ReturnType<typeof inferEntryTaxRegime>;
	contribuinteIpi: boolean;
	overrides: TEntryTaxOverrides;
	crtEmitente: number | null;
	// Contexto do cálculo ao fisco, devolvido ao builder para recalcular quando a destinação muda.
	fisco: TEntryFiscoContext;
};

async function loadEntryTaxContext({
	organizationId,
	crtEmitente,
	ufEmitente,
	dataEmissao,
}: {
	organizationId: string;
	crtEmitente: number | null;
	ufEmitente: string | null;
	dataEmissao: Date | null;
}): Promise<TEntryTaxContext> {
	const organization = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId), columns: { fiscalConfiguracao: true } });
	const fiscal = organization?.fiscalConfiguracao ?? null;
	const regime = fiscal?.entrada?.regimeApuracao ?? inferEntryTaxRegime(fiscal?.regimeTributario);
	const ufOrganizacao = fiscal?.endereco?.uf?.toUpperCase() || null;
	return {
		regime,
		contribuinteIpi: fiscal?.entrada?.contribuinteIpi ?? false,
		overrides: (fiscal?.entrada?.tratamentos ?? {}) as TEntryTaxOverrides,
		crtEmitente,
		fisco: {
			ufOrganizacao,
			ufEmitente: ufEmitente?.toUpperCase() || null,
			// Inscrição estadual = contribuinte de ICMS: é quem deve DIFAL/antecipação na entrada.
			contribuinteIcms: !!fiscal?.inscricaoEstadual?.replace(/\D/g, ""),
			regime,
			antecipacaoParcial: fiscal?.entrada?.antecipacaoParcial ?? false,
			parametrosUf: ufOrganizacao ? getUfIcmsParameters(ufOrganizacao, dataEmissao ?? new Date()) : null,
		},
	};
}

/** Componentes devidos ao fisco (DIFAL, antecipação), pela destinação sugerida. O builder refaz ao trocá-la. */
function applyFiscoComponents(item: TImportedLine, context: TEntryTaxContext): TImportedLine {
	if (item.foraDaCompra) return item;
	const computed = computeFiscoComponents({
		destinacao: item.destinacaoSugerida,
		valorLinha: item.valorTotal,
		facts: item.tributacao,
		context: context.fisco,
	});
	if (computed.length === 0) return item;
	return { ...item, modificadoresCusto: replaceCalculatedFiscoComponents(item.modificadoresCusto ?? [], computed) };
}

/**
 * Preset/override decide o tratamento de cada tributo ainda pendente (ADR-0002, decisão 7). Um
 * tributo embutido que fica no custo é descartado — ele já está no preço. O que o preset não
 * resolve fica pendente para a pessoa, como antes.
 */
function applyEntryTaxTreatments(item: TImportedLine, context: TEntryTaxContext): TImportedLine {
	const modifiers = (item.modificadoresCusto ?? []).flatMap((modifier) => {
		if (modifier.tratamento !== null) return [modifier];
		const contrapartida = modifier.contrapartida ?? "FORNECEDOR";
		const resolution = resolveEntryTaxTreatment({
			regime: context.regime,
			contribuinteIpi: context.contribuinteIpi,
			overrides: context.overrides,
			destinacao: item.destinacaoSugerida,
			chave: modifier.chave,
			contrapartida,
			crtEmitente: context.crtEmitente,
		});
		if (!resolution.tratamento) return [modifier];
		if (contrapartida === "INCLUSO_NO_VALOR" && resolution.tratamento === "CUSTO_ESTOQUE") return [];
		return [{ ...modifier, tratamento: resolution.tratamento, descricao: `${modifier.descricao ?? modifier.chave} — ${resolution.motivo}` }];
	});
	return { ...item, modificadoresCusto: modifiers };
}

/**
 * O CFOP do emitente decide a linha, na hora (ADR-0002, decisão 3): compra entra; bonificação entra
 * com um componente que zera custo e dívida (desconto incondicional de 100%, CPC 16); o resto não
 * vira item de compra.
 */
function applyLineDisposition(item: TMatchedCompositionItem): TImportedLine {
	const disposition = resolveEntryLineDisposition({ cfop: item.cfop });
	if (disposition.tipo === "FORA") return { ...item, foraDaCompra: disposition.motivo };
	if (disposition.tipo === "BONIFICACAO") {
		const modifiers = [...(item.modificadoresCusto ?? [])];
		// O que a nota já descontou na linha não é bonificado de novo.
		const discountedCents = modifiers
			.filter((modifier) => modifier.chave === "DESCONTO")
			.reduce((total, modifier) => total + modifier.valorCentavos, 0);
		const bonusCents = Math.round(item.valorTotal * 100) - discountedCents;
		if (bonusCents > 0)
			modifiers.push({
				chave: "BONIFICACAO",
				valorCentavos: bonusCents,
				efeito: "REDUCAO",
				tratamento: "CUSTO_ESTOQUE",
				descricao: `Bonificação (CFOP ${item.cfop}): entra no estoque a custo zero e não gera valor a pagar`,
			});
		return { ...item, modificadoresCusto: modifiers, foraDaCompra: null };
	}
	return { ...item, foraDaCompra: null };
}

/** XML de uma nota recebida, lido do catálogo (ou do provedor, se ainda não cacheado). */
async function loadInboundSource({ organizationId, inboundId }: { organizationId: string; inboundId: string }) {
	const document = await db.query.fiscalInboundDocuments.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizationId), eq(fields.id, inboundId)),
		columns: { id: true, chaveAcesso: true, completo: true, compraId: true, situacao: true },
	});
	if (!document) throw new createHttpError.NotFound("Nota recebida não encontrada.");
	if (document.compraId) throw new createHttpError.UnprocessableEntity(`Esta nota já está lançada na compra ${document.compraId}.`);
	if (!document.completo)
		throw new createHttpError.UnprocessableEntity(
			"O XML completo desta nota ainda não foi liberado pela SEFAZ. Manifeste ciência e aguarde a sincronização.",
		);
	const { buffer } = await getInboundDocumentXml({ organizationId, inboundId });
	const file: TImportCompositionFile = {
		dataBase64: Buffer.from(buffer).toString("base64"),
		mimeType: "application/xml",
		fileName: `${document.chaveAcesso}.xml`,
	};
	return { document, file };
}

async function importPurchaseComposition({
	input,
	session,
	onStage = () => {},
	abortSignal,
}: {
	input: TImportPurchaseCompositionInput;
	session: TAuthUserSession;
	onStage?: TOnImportStage;
	abortSignal?: AbortSignal;
}) {
	const userOrgId = getUserOrgIdForImport(session);

	const source = input.inboundId ? await loadInboundSource({ organizationId: userOrgId, inboundId: input.inboundId }) : null;
	const file: TImportCompositionFile = source?.file ?? input.file!;
	const fileBuffer = Buffer.from(file.dataBase64, "base64");
	const contentLooksLikeXml = looksLikeFiscalXml(fileBuffer.subarray(0, 512).toString("utf8"));
	const isXml =
		file.mimeType === "application/xml" ||
		file.mimeType === "text/xml" ||
		file.fileName?.toLowerCase().endsWith(".xml") === true ||
		contentLooksLikeXml;
	let extracted: Awaited<ReturnType<typeof extractCompositionFromFile>>;
	onStage({ stage: "LEITURA", status: "INICIADO", detail: isXml ? "Lendo o XML da NF-e…" : "Extraindo texto e tabelas com IA…" });
	try {
		extracted = isXml
			? extractCompositionFromNfeXml(fileBuffer.toString("utf8"))
			: await extractCompositionFromFile({ dataBase64: file.dataBase64, mimeType: file.mimeType, abortSignal });
	} catch (error) {
		assertImportIsActive(abortSignal);
		console.error(`[PURCHASE_IMPORT] Erro na extração ${isXml ? "do XML" : "por IA"}.`, error);
		if (isXml)
			throw new createHttpError.UnprocessableEntity(error instanceof Error ? error.message : "Não foi possível interpretar o XML da nota fiscal.");
		throw new createHttpError.BadGateway("Não foi possível ler o documento. Tente novamente ou envie um arquivo mais legível.");
	}

	if (extracted.itens.length === 0)
		throw new createHttpError.UnprocessableEntity(
			"Nenhum item foi identificado no documento. Verifique se o arquivo é uma nota/cupom de compra legível.",
		);
	onStage({
		stage: "LEITURA",
		status: "CONCLUIDO",
		detail: isXml ? "XML de NF-e válido · leitura exata" : `${file.mimeType === "application/pdf" ? "PDF" : "Imagem"} lido com IA`,
	});
	assertImportIsActive(abortSignal);

	// Supplier resolution is lookup-only here: creation happens with the purchase itself (POST /api/purchases),
	// so abandoning the purchase never leaves an orphan supplier behind.
	onStage({ stage: "FORNECEDOR", status: "INICIADO", detail: "Procurando CNPJ e razão social…" });
	const extractedCnpj = (extracted.fornecedor?.cnpj ?? "").replace(/\D/g, "");
	const existingSupplier = extractedCnpj
		? ((await db.query.suppliers.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.organizacaoId, userOrgId), eq(fields.cpfCnpj, extractedCnpj)),
				columns: { id: true, nome: true, cpfCnpj: true, telefone: true, email: true },
			})) ?? null)
		: null;
	const supplierName = existingSupplier?.nome ?? extracted.fornecedor?.nome ?? null;
	onStage({
		stage: "FORNECEDOR",
		status: "CONCLUIDO",
		detail: supplierName
			? `${supplierName}${extractedCnpj ? ` · CNPJ ${formatCnpj(extractedCnpj)}` : ""}${existingSupplier ? " · já cadastrado" : ""}`
			: "Fornecedor não identificado no documento",
	});

	const documentTotalForDetail = extracted.valorTotalDocumento && extracted.valorTotalDocumento > 0 ? extracted.valorTotalDocumento : null;
	const installmentCount = extracted.duplicatas?.length ?? 0;
	onStage({
		stage: "ITENS",
		status: "CONCLUIDO",
		detail: [
			`${extracted.itens.length} ${extracted.itens.length === 1 ? "linha" : "linhas"}`,
			documentTotalForDetail !== null ? formatBRL(documentTotalForDetail) : null,
			installmentCount > 0 ? `${installmentCount} ${installmentCount === 1 ? "duplicata" : "duplicatas"}` : null,
		]
			.filter(Boolean)
			.join(" · "),
	});
	assertImportIsActive(abortSignal);

	onStage({ stage: "CATALOGO", status: "INICIADO", detail: "Procurando por EAN, código e nome…" });
	const entryTaxContext = await loadEntryTaxContext({
		organizationId: userOrgId,
		crtEmitente: extracted.documentoFiscal?.emitente.crt ?? null,
		ufEmitente: extracted.documentoFiscal?.emitente.uf ?? null,
		dataEmissao: parseIsoDate(extracted.dataEmissao),
	});
	const itens: TImportedLine[] = (
		await matchCompositionItemsToProducts({
			organizacaoId: userOrgId,
			fornecedorId: existingSupplier?.id ?? null,
			itens: extracted.itens,
			abortSignal,
		})
	)
		.map(applyLineDisposition)
		.map((item) => applyEntryTaxTreatments(item, entryTaxContext))
		.map((item) => applyFiscoComponents(item, entryTaxContext));
	assertImportIsActive(abortSignal);
	const matchedCount = itens.filter((item) => item.matchTipo === "MAPEADO" || item.matchTipo === "CODIGO").length;
	const reviewCount = itens.length - matchedCount;
	onStage({
		stage: "CATALOGO",
		status: "CONCLUIDO",
		detail: `${matchedCount} ${matchedCount === 1 ? "vinculado" : "vinculados"} · ${reviewCount} para você revisar`,
	});

	// Cabeçalho: o total do documento alimenta o lançamento contábil da compra, e a divergência
	// contra a soma das linhas é o sinal de que a leitura pode ter pulado item ou página.
	// Linhas fora da compra não entram na soma; a bonificação entra pelo valor da nota (o vNF a inclui)
	// mesmo que o item vá para o estoque a custo zero.
	const purchaseLines = itens.filter((item) => !item.foraDaCompra);
	const somaItensBase = roundToCents(purchaseLines.reduce((total, item) => total + item.quantidade * item.valorUnitario - (item.desconto ?? 0), 0));
	const somaItens =
		extracted.origem === "XML"
			? roundToCents(
					purchaseLines.reduce(
						(total, item) =>
							total +
							item.valorTotal +
							(item.modificadoresCusto ?? [])
								.filter((modifier) => modifier.chave !== "BONIFICACAO" && (!modifier.contrapartida || modifier.contrapartida === "FORNECEDOR"))
								.reduce((modifierTotal, modifier) => modifierTotal + (modifier.efeito === "REDUCAO" ? -1 : 1) * (modifier.valorCentavos / 100), 0),
						0,
					),
				)
			: somaItensBase;
	const valorTotalDocumento = extracted.valorTotalDocumento && extracted.valorTotalDocumento > 0 ? roundToCents(extracted.valorTotalDocumento) : null;
	const valorFrete = extracted.valorFrete && extracted.valorFrete > 0 ? roundToCents(extracted.valorFrete) : null;
	const valorDesconto = extracted.valorDesconto && extracted.valorDesconto > 0 ? roundToCents(extracted.valorDesconto) : null;
	const dataEmissao = parseIsoDate(extracted.dataEmissao);

	const avisos: string[] = [];
	if (valorTotalDocumento !== null) {
		// Frete e desconto gerais não são itens: entram na conta antes de comparar.
		const esperado = extracted.origem === "XML" ? somaItens : roundToCents(somaItens + (valorFrete ?? 0) - (valorDesconto ?? 0));
		if (Math.abs(esperado - valorTotalDocumento) > DOCUMENT_TOTAL_MISMATCH_TOLERANCE)
			avisos.push(
				`A soma dos itens lidos (R$ ${esperado.toFixed(2)}) diverge do total declarado no documento (R$ ${valorTotalDocumento.toFixed(2)}). A leitura pode estar incompleta.`,
			);
	} else {
		avisos.push("O documento não declara um valor total legível. Confira o valor efetivo da compra antes de salvar.");
	}
	if (valorFrete !== null && extracted.origem !== "XML")
		avisos.push(`O documento destaca R$ ${valorFrete.toFixed(2)} de frete, que entra no valor total mas não aparece como item da composição.`);
	const foraDaCompra = itens.filter((item) => item.foraDaCompra).length;
	if (foraDaCompra > 0)
		avisos.push(
			`${foraDaCompra} ${foraDaCompra === 1 ? "linha da nota não é aquisição" : "linhas da nota não são aquisição"} (consignação, remessa ou devolução) e ${foraDaCompra === 1 ? "ficou" : "ficaram"} fora da compra.`,
		);
	const bonificadas = itens.filter((item) => (item.modificadoresCusto ?? []).some((modifier) => modifier.chave === "BONIFICACAO")).length;
	if (bonificadas > 0)
		avisos.push(
			`${bonificadas} ${bonificadas === 1 ? "linha bonificada entra" : "linhas bonificadas entram"} no estoque a custo zero, sem valor a pagar.`,
		);
	const obrigacoesFisco = itens.flatMap((item) => (item.modificadoresCusto ?? []).filter((modifier) => modifier.contrapartida === "FISCO"));
	if (obrigacoesFisco.length > 0)
		avisos.push(
			`Compra interestadual: ${formatBRL(obrigacoesFisco.reduce((total, modifier) => total + modifier.valorCentavos / 100, 0))} de ICMS a recolher à SEFAZ (DIFAL/antecipação), fora do valor do fornecedor. Confira na etapa Financeiro.`,
		);
	const impostosPendentes = itens.reduce(
		(total, item) => total + (item.modificadoresCusto ?? []).filter((modifier) => modifier.tratamento === null).length,
		0,
	);
	if (impostosPendentes > 0)
		avisos.push(
			`${impostosPendentes} ${impostosPendentes === 1 ? "imposto exige" : "impostos exigem"} revisão do tratamento contábil.${
				entryTaxContext.regime ? "" : " Defina o regime de apuração em Fiscal › Entrada de compras para que isso seja automático."
			}`,
		);

	assertImportIsActive(abortSignal);
	const documentReference = randomUUID();
	// O nome é metadado, não endereço: o arquivo vive no catálogo `files` e é resolvido por id com
	// checagem de organização, então nada no payload escolhe onde ler ou escrever.
	const originalFileName = (file.fileName?.split(/[\\/]/).pop() || `documento-${documentReference}`)
		.normalize("NFKD")
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.slice(0, 120);
	if (isXml) await validateFiscalXml({ organizationId: userOrgId, organizationCnpj: session.membership?.organizacao.cnpj ?? "", extracted, avisos });
	const { arquivo } = await storeFiscalEntryDocument({ organizacaoId: userOrgId, buffer: fileBuffer, nomeOriginal: originalFileName });
	const fiscalDocument = isXml ? await registerFiscalXml({ organizationId: userOrgId, extracted, xmlArquivoId: arquivo.id }) : null;
	const importedDocumentOrigin: "XML" | "PDF" | "IMAGEM" | "DFE" = source
		? "DFE"
		: extracted.origem === "XML"
			? "XML"
			: file.mimeType === "application/pdf"
				? "PDF"
				: "IMAGEM";

	return {
		data: {
			fornecedor: {
				existente: existingSupplier,
				extraido: extracted.fornecedor
					? {
							nome: extracted.fornecedor.nome,
							cnpj: extractedCnpj || null,
							inscricaoEstadual: extracted.fornecedor.inscricaoEstadual?.replace(/\D/g, "") || null,
							telefone: extracted.fornecedor.telefone?.trim() || null,
							email: extracted.fornecedor.email?.trim() || null,
							cidade: extracted.fornecedor.cidade?.trim() || null,
						}
					: null,
			},
			documento: {
				origem: extracted.origem ?? "IA",
				// Contexto do cálculo ao fisco: o builder recalcula DIFAL/antecipação ao trocar a destinação.
				fiscalEntrada: entryTaxContext.fisco,
				numero: extracted.numeroDocumento?.trim() || null,
				serie: extracted.serieDocumento?.trim() || null,
				chaveAcesso: extracted.chaveAcesso?.trim() || null,
				dataEmissao,
				valorTotal: valorTotalDocumento,
				valorFrete,
				valorDesconto,
				somaItens,
				totaisOriginais: extracted.totaisOriginais ?? null,
				duplicatas: (extracted.duplicatas ?? [])
					.filter((installment) => installment.valor > 0)
					.map((installment) => ({
						numero: installment.numero?.trim() || null,
						dataVencimento: parseIsoDate(installment.dataVencimento),
						valor: roundToCents(installment.valor),
					})),
				modalidadeFrete: extracted.modalidadeFrete ?? null,
				transportadora:
					extracted.transportadora && (extracted.transportadora.nome || extracted.transportadora.cnpj)
						? { nome: extracted.transportadora.nome?.trim() || null, cnpj: extracted.transportadora.cnpj?.replace(/\D/g, "") || null }
						: null,
				importado: {
					referencia: documentReference,
					origem: importedDocumentOrigin,
					documentoFiscalId: fiscalDocument?.id ?? null,
					arquivoId: arquivo.id,
					chaveAcesso: extracted.chaveAcesso?.trim() || null,
					numero: extracted.numeroDocumento?.trim() || null,
					serie: extracted.serieDocumento?.trim() || null,
					dataEmissao: extracted.dataEmissao ?? null,
					arquivo: {
						nomeOriginal: originalFileName,
						sha256: arquivo.sha256,
						mimeType: arquivo.mimeType,
						tamanhoBytes: arquivo.tamanhoBytes,
					},
					totaisOriginais: extracted.totaisOriginais ?? null,
				},
			},
			itens,
			avisos,
		},
		message: `${itens.length} ${itens.length === 1 ? "item identificado" : "itens identificados"} no documento.`,
	};
}

function formatCnpj(digits: string) {
	return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : digits;
}

function roundToCents(value: number) {
	return Math.round(value * 100) / 100;
}

function parseIsoDate(value?: string | null) {
	if (!value) return null;
	const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!match) return null;
	const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}
export type TImportPurchaseCompositionOutput = Awaited<ReturnType<typeof importPurchaseComposition>>;

/**
 * The response is NDJSON: one `stage` event per processing step, then a single `result` (with the
 * same `{ data, message }` envelope as before) or `error`. Validation and auth failures happen
 * before the stream opens, so they still come back as regular JSON errors with an HTTP status.
 */
export type TImportPurchaseCompositionStreamEvent =
	| TImportPurchaseCompositionStageEvent
	| ({ type: "result" } & TImportPurchaseCompositionOutput)
	| { type: "error"; message: string };

async function importPurchaseCompositionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	getUserOrgIdForImport(session);
	const body = await request.json();
	const input = ImportPurchaseCompositionInputSchema.parse(body);

	const encoder = new TextEncoder();
	const abortSignal = request.signal;
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (event: TImportPurchaseCompositionStreamEvent) => {
				if (abortSignal.aborted) return;
				try {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				} catch {
					// The client went away: nothing left to deliver.
				}
			};
			try {
				const result = await importPurchaseComposition({
					input,
					session,
					abortSignal,
					onStage: (event) => send({ type: "stage", ...event }),
				});
				send({ type: "result", ...result });
			} catch (error) {
				if (!abortSignal.aborted) console.error("[PURCHASE_IMPORT] Erro na leitura do documento.", describeErrorForLogging(error));
				const message =
					createHttpError.isHttpError(error) && error.expose
						? error.message
						: "Não foi possível ler o documento. Tente novamente ou envie um arquivo mais legível.";
				send({ type: "error", message });
			} finally {
				try {
					controller.close();
				} catch {
					// Already closed by a client abort.
				}
			}
		},
	});

	return new NextResponse(stream, {
		headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
	});
}

export const POST = appApiHandler({
	POST: importPurchaseCompositionRoute,
});
