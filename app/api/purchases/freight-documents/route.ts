import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { inferEntryTaxRegime, resolveEntryTaxTreatment, type TEntryTaxOverrides } from "@/lib/fiscal/entry/presets";
import { storeFiscalEntryDocument } from "@/lib/fiscal/inbound/entry-files";
import { findPurchasesByAccessKeys, getInboundDocumentXml, linkInboundDocumentsToPurchase, registerManualInboundDocument } from "@/lib/fiscal/inbound";
import { resolvePurchaseAccountingAccountIds, resolvePurchaseDestinationAccountIds } from "@/lib/purchase/accounting-accounts";
import { syncPurchaseCarrierEntries } from "@/lib/purchase/carrier-entry";
import { allocatePurchaseCostModifier, appendPurchaseCostModifiers } from "@/lib/purchase/costing";
import { CTE_TAKER_LABELS, extractCteFromXml, type TExtractedCte } from "@/lib/purchase/import-cte";
import { normalizePurchaseItemCostValues } from "@/lib/purchase-processing/process-purchase-item-stock";
import type { TAcquisitionNatureEnum, TPurchaseCostTreatmentEnum } from "@/schemas/enums";
import { PurchaseImportedDocumentsSnapshotSchema, type TPurchaseCostModifier, type TPurchaseImportedDocument } from "@/schemas/purchases";
import { db } from "@/services/drizzle";
import { fiscalInboundDocuments, organizations, purchaseItems, purchases } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import z from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BASE64_LENGTH = 4_200_000;

/**
 * Anexa um CT-e (frete) a uma compra — ADR-0002, fluxo E. O CT-e vira linha em
 * `fiscal_inbound_documents` (modelo CTE), entra no snapshot de documentos da compra e gera a dívida
 * com a transportadora. A compra é encontrada pelas chaves das NF-e transportadas; quando o CT-e não
 * as traz, ou cobre mais de uma compra, `purchaseId` decide (1:1 nesta fase).
 *
 * - Compra ainda não recebida: o frete (líquido do ICMS creditável) vira componente FRETE nos itens,
 *   rateado por valor, e o lançamento da transportadora nasce no recebimento.
 * - Compra já recebida: o custo do estoque não muda em silêncio (ADR-0001). O frete vai para despesa
 *   do período (menos o crédito de ICMS) e o lançamento nasce agora.
 */

const AttachFreightDocumentInputSchema = z
	.object({
		file: z
			.object({
				dataBase64: z.string({ required_error: "Arquivo não informado." }).min(1, "Arquivo não informado.").max(MAX_FILE_BASE64_LENGTH, "Arquivo muito grande."),
				fileName: z.string().optional().nullable(),
			})
			.optional()
			.nullable(),
		inboundId: z.string({ invalid_type_error: "Tipo não válido para o ID do documento recebido." }).optional().nullable(),
		purchaseId: z.string({ invalid_type_error: "Tipo não válido para o ID da compra." }).optional().nullable(),
	})
	.refine((input) => !!input.file !== !!input.inboundId, { message: "Informe o arquivo ou o documento recebido, não os dois." });
export type TAttachFreightDocumentInput = z.infer<typeof AttachFreightDocumentInputSchema>;

function formatCnpj(digits: string) {
	return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function parseIsoDate(value: string | null | undefined) {
	if (!value) return null;
	const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function validateCte({ cte, organizationCnpj, avisos }: { cte: TExtractedCte; organizationCnpj: string; avisos: string[] }) {
	if (cte.tipo != null && cte.tipo !== 0) {
		const kinds: Record<number, string> = { 1: "de complemento de valores", 2: "de anulação", 3: "substituto" };
		throw new createHttpError.UnprocessableEntity(`Este é um CT-e ${kinds[cte.tipo] ?? "especial"}; só o CT-e normal vira frete de compra nesta fase.`);
	}
	const ownCnpj = organizationCnpj.replace(/\D/g, "");
	if (cte.tomador.cnpj && ownCnpj && cte.tomador.cnpj !== ownCnpj) {
		const who = cte.tomador.codigo != null ? CTE_TAKER_LABELS[cte.tomador.codigo] ?? "outro" : "outro";
		throw new createHttpError.UnprocessableEntity(
			`O tomador deste CT-e é o ${who} (CNPJ ${formatCnpj(cte.tomador.cnpj)}), não a organização: o frete não é uma dívida sua.`,
		);
	}
	if (!cte.tomador.cnpj) avisos.push("O CT-e não identifica o tomador do serviço. Confira se o frete é mesmo devido pela organização.");
	if (!cte.protocolo) avisos.push("O XML não traz o protocolo de autorização da SEFAZ. Confira se o CT-e foi autorizado.");
	else if (cte.protocolo.codigoStatus && cte.protocolo.codigoStatus !== "100")
		avisos.push(`O protocolo do CT-e não indica autorização (cStat ${cte.protocolo.codigoStatus}). Confira a situação na SEFAZ.`);
	if (cte.valorReceberCentavos != null && cte.valorReceberCentavos !== cte.valorPrestacaoCentavos)
		avisos.push("O valor a receber do CT-e difere do total da prestação; a dívida registrada é o total da prestação.");
}

async function resolveTargetPurchase({ organizationId, cte, purchaseId }: { organizationId: string; cte: TExtractedCte; purchaseId: string | null }) {
	const linked = await findPurchasesByAccessKeys({ organizationId, chavesAcesso: cte.chavesNfe });
	const candidateIds = [...new Set(linked.map((doc) => doc.compraId).filter((id): id is string => !!id))];
	if (purchaseId) {
		if (candidateIds.length > 0 && !candidateIds.includes(purchaseId))
			throw new createHttpError.UnprocessableEntity("As NF-e deste CT-e estão lançadas em outra compra, não na informada.");
		return { purchaseId, inferred: false };
	}
	if (candidateIds.length === 1) return { purchaseId: candidateIds[0], inferred: true };
	if (candidateIds.length === 0)
		throw new createHttpError.UnprocessableEntity(
			cte.chavesNfe.length === 0
				? "O CT-e não informa as NF-e transportadas. Anexe-o a partir da compra para indicar a qual ela pertence."
				: "Nenhuma compra lançada corresponde às NF-e deste CT-e. Lance a compra primeiro ou anexe o CT-e a partir dela.",
		);
	throw new createHttpError.Conflict("Este CT-e cobre NF-e de mais de uma compra. Anexe-o a partir da compra que deve carregar o frete (1:1 nesta fase).");
}

async function attachFreightDocument({ input, session }: { input: TAttachFreightDocumentInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (!session.membership?.permissoes.compras.editar) throw new createHttpError.Forbidden("Você não possui permissão para editar compras.");
	const avisos: string[] = [];

	// 1. Bytes: arquivo enviado ou XML da nota recebida (DF-e).
	let buffer: Buffer;
	let fileName: string;
	if (input.inboundId) {
		const xml = await getInboundDocumentXml({ organizationId, inboundId: input.inboundId });
		buffer = Buffer.from(xml.buffer);
		fileName = `cte-${input.inboundId}.xml`;
	} else {
		buffer = Buffer.from(input.file!.dataBase64, "base64");
		fileName = (input.file!.fileName?.split(/[\\/]/).pop() || "cte.xml").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
	}

	// 2. Leitura e validação antes de gravar qualquer coisa.
	let cte: TExtractedCte;
	try {
		cte = extractCteFromXml(buffer.toString("utf8"));
	} catch (error) {
		throw new createHttpError.UnprocessableEntity(error instanceof Error ? error.message : "Não foi possível interpretar o XML do CT-e.");
	}
	validateCte({ cte, organizationCnpj: session.membership.organizacao.cnpj ?? "", avisos });
	const target = await resolveTargetPurchase({ organizationId, cte, purchaseId: input.purchaseId ?? null });

	// 3. Documento como primitivo: arquivo no catálogo e linha em fiscal_inbound_documents.
	const { arquivo } = await storeFiscalEntryDocument({ organizacaoId: organizationId, buffer, nomeOriginal: fileName });
	const inbound = await registerManualInboundDocument({
		organizacaoId: organizationId,
		chaveAcesso: cte.chaveAcesso,
		modelo: "CTE",
		xmlArquivoId: arquivo.id,
		emitenteCnpj: cte.emitente.cnpj,
		emitenteNome: cte.emitente.nome,
		valorTotal: cte.valorPrestacaoCentavos / 100,
		dataEmissao: parseIsoDate(cte.dataEmissao),
		situacao: cte.protocolo?.codigoStatus === "100" || (!!cte.protocolo?.numero && !cte.protocolo.codigoStatus) ? "AUTORIZADA" : null,
	});
	if (inbound.modelo !== "CTE") await db.update(fiscalInboundDocuments).set({ modelo: "CTE" }).where(eq(fiscalInboundDocuments.id, inbound.id));
	const label = cte.numero ? `CT-e nº ${cte.numero}` : "CT-e";
	if (inbound.situacao === "CANCELADA") throw new createHttpError.UnprocessableEntity(`O ${label} consta como cancelado na SEFAZ.`);
	if (inbound.situacao === "DENEGADA") throw new createHttpError.UnprocessableEntity(`O ${label} consta como denegado na SEFAZ.`);
	if (inbound.compraId && inbound.compraId !== target.purchaseId)
		throw new createHttpError.Conflict(`O ${label} já está vinculado a outra compra (${inbound.compraId}).`);

	// 4. Tratamento do ICMS do frete pelo preset da organização.
	const organization = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId), columns: { fiscalConfiguracao: true } });
	const fiscal = organization?.fiscalConfiguracao ?? null;
	const regime = fiscal?.entrada?.regimeApuracao ?? inferEntryTaxRegime(fiscal?.regimeTributario);
	const overrides = (fiscal?.entrada?.tratamentos ?? {}) as TEntryTaxOverrides;
	const resolveIcmsTreatment = (destinacao: TAcquisitionNatureEnum): TPurchaseCostTreatmentEnum => {
		const resolution = resolveEntryTaxTreatment({
			regime,
			contribuinteIpi: fiscal?.entrada?.contribuinteIpi ?? false,
			overrides,
			destinacao,
			chave: "IMPOSTOS_ICMS",
			contrapartida: "TRANSPORTADORA",
			crtEmitente: cte.emitente.crt,
		});
		// Sem regime configurado, o ICMS do frete fica no custo: é o resultado conservador e reversível.
		return resolution.tratamento ?? "CUSTO_ESTOQUE";
	};

	const result = await db.transaction(async (tx) => {
		const [locked] = await tx
			.select({ id: purchases.id })
			.from(purchases)
			.where(and(eq(purchases.id, target.purchaseId), eq(purchases.organizacaoId, organizationId)))
			.for("update");
		if (!locked) throw new createHttpError.NotFound("Compra não encontrada.");
		const purchase = await tx.query.purchases.findFirst({
			where: and(eq(purchases.id, target.purchaseId), eq(purchases.organizacaoId, organizationId)),
			with: { itens: true, lancamentoContabil: { columns: { id: true, dataCompetencia: true } } },
		});
		if (!purchase) throw new createHttpError.NotFound("Compra não encontrada.");
		if (purchase.status === "CANCELADA") throw new createHttpError.BadRequest("A compra está cancelada: o frete não tem onde entrar.");
		const existingDocuments = purchase.documentosImportados ? PurchaseImportedDocumentsSnapshotSchema.parse(purchase.documentosImportados).documentos : [];
		if (existingDocuments.some((document) => document.chaveAcesso === cte.chaveAcesso))
			throw new createHttpError.Conflict(`O ${label} já está anexado a esta compra.`);
		const isReceived = purchase.status === "RECEBIDA" && !!purchase.entregaDataRecebimentoEfetivacao;
		const activeItems = purchase.itens.filter((item) => item.valorTotalBruto > 0);
		if (activeItems.length === 0) throw new createHttpError.BadRequest("A compra não tem itens com valor para receber o frete.");

		// Rateio por valor: frete líquido do ICMS e o próprio ICMS, cada um com seu tratamento por item.
		const documentReference = randomUUID();
		const icmsCentavos = Math.min(cte.icms.valorCentavos, cte.valorPrestacaoCentavos);
		const freightNetCentavos = cte.valorPrestacaoCentavos - icmsCentavos;
		const allocationItems = activeItems.map((item) => ({ referencia: item.id, valorBaseCentavos: Math.round(item.valorTotalBruto * 100), quantidade: item.quantidade }));
		const baseModifier = {
			efeito: "ACRESCIMO" as const,
			contrapartida: "TRANSPORTADORA" as const,
			origem: "XML" as const,
			documentoRef: documentReference,
		};
		const freightShares =
			freightNetCentavos > 0
				? allocatePurchaseCostModifier({
						modifier: { ...baseModifier, chave: "FRETE", valorCentavos: freightNetCentavos, tratamento: "CUSTO_ESTOQUE", descricao: `Frete do ${label} rateado por valor` },
						items: allocationItems,
						method: "PROPORCIONAL_VALOR",
					})
				: [];
		const icmsShares =
			icmsCentavos > 0
				? allocatePurchaseCostModifier({
						modifier: {
							...baseModifier,
							chave: "IMPOSTOS_ICMS",
							valorCentavos: icmsCentavos,
							tratamento: "CUSTO_ESTOQUE",
							descricao: `ICMS do ${label} rateado por valor`,
							memoriaCalculo: { base: cte.icms.baseCentavos != null ? cte.icms.baseCentavos / 100 : null, aliquota: cte.icms.aliquota, metodo: "CT-e", uf: cte.emitente.uf },
						},
						items: allocationItems,
						method: "PROPORCIONAL_VALOR",
					})
				: [];
		let icmsCreditoCentavos = 0;
		const modifiersByItem = new Map<string, TPurchaseCostModifier[]>();
		for (const item of activeItems) {
			const destination = item.destinacao ?? "REVENDA";
			const treatment = resolveIcmsTreatment(destination);
			const modifiers: TPurchaseCostModifier[] = [];
			const freight = freightShares.find((share) => share.referenciaItem === item.id);
			if (freight && freight.modificador.valorCentavos > 0) modifiers.push(freight.modificador);
			const icms = icmsShares.find((share) => share.referenciaItem === item.id);
			if (icms && icms.modificador.valorCentavos > 0) {
				modifiers.push({ ...icms.modificador, tratamento: treatment });
				if (treatment === "CREDITO_TRIBUTARIO") icmsCreditoCentavos += icms.modificador.valorCentavos;
			}
			modifiersByItem.set(item.id, modifiers);
		}

		if (!isReceived) {
			for (const item of activeItems) {
				const modifiers = modifiersByItem.get(item.id) ?? [];
				if (modifiers.length === 0) continue;
				let normalized: ReturnType<typeof normalizePurchaseItemCostValues<typeof item>>;
				try {
					normalized = normalizePurchaseItemCostValues({ ...item, modificadoresCusto: appendPurchaseCostModifiers(item.modificadoresCusto, modifiers) });
				} catch (error) {
					throw new createHttpError.BadRequest(error instanceof Error ? error.message : "O frete não fecha com a composição dos itens.");
				}
				await tx
					.update(purchaseItems)
					.set({
						modificadoresCusto: normalized.modificadoresCusto,
						descontosTotal: normalized.descontosTotal,
						acrescimosTotal: normalized.acrescimosTotal,
						valorTotalLiquido: normalized.valorTotalLiquido,
						valorUnitarioLiquido: normalized.valorUnitarioLiquido,
						valorTotalCusto: normalized.valorTotalCusto,
						valorUnitarioCusto: normalized.valorUnitarioCusto,
					})
					.where(eq(purchaseItems.id, item.id));
			}
		} else {
			avisos.push("A compra já estava recebida: o frete foi lançado como despesa do período, sem alterar o custo do estoque.");
		}

		const document: TPurchaseImportedDocument = {
			referencia: documentReference,
			origem: input.inboundId ? "DFE" : "XML",
			modelo: "CTE",
			documentoFiscalId: inbound.id,
			arquivoId: arquivo.id,
			chaveAcesso: cte.chaveAcesso,
			numero: cte.numero,
			serie: cte.serie,
			dataEmissao: cte.dataEmissao,
			arquivo: { nomeOriginal: fileName, sha256: arquivo.sha256, mimeType: arquivo.mimeType, tamanhoBytes: arquivo.tamanhoBytes },
			totaisOriginais: { freteCentavos: cte.valorPrestacaoCentavos, documentoCentavos: cte.valorPrestacaoCentavos },
			frete: {
				valorCentavos: cte.valorPrestacaoCentavos,
				icmsCentavos,
				icmsAliquota: cte.icms.aliquota,
				icmsCreditoCentavos,
				capitalizado: !isReceived,
				transportadoraFornecedorId: inbound.fornecedorId ?? null,
				transportadoraNome: cte.emitente.nome,
				chavesNfe: cte.chavesNfe,
			},
		};
		const documents = [...existingDocuments, document];
		await tx
			.update(purchases)
			.set({
				documentosImportados: { versao: 1, documentos: documents },
				transporteTransportadoraNome: purchase.transporteTransportadoraNome ?? cte.emitente.nome,
				transporteTransportadoraCnpj: purchase.transporteTransportadoraCnpj ?? (cte.emitente.cnpj ? formatCnpj(cte.emitente.cnpj) : null),
				dataUltimaAtualizacao: new Date(),
			})
			.where(eq(purchases.id, purchase.id));
		await linkInboundDocumentsToPurchase({ trx: tx, organizationId, purchaseId: purchase.id, documentIds: [inbound.id] });

		// Lançamento da transportadora: agora (compra recebida) ou no recebimento (capitalizado).
		const { debitAccountId, creditAccountId } = await resolvePurchaseAccountingAccountIds({ trx: tx, orgId: organizationId });
		const organizationDefaults = await tx.query.organizations.findFirst({ where: eq(organizations.id, organizationId), columns: { configuracao: true } });
		const purchaseDefaults = organizationDefaults?.configuracao.defaults.contabilidade.lancamentosPadrao.compras;
		const contasPorDestinacao = await resolvePurchaseDestinationAccountIds({
			trx: tx,
			organizationId,
			configured: purchaseDefaults?.contasDebitoPorDestinacao,
			needed: ["REVENDA", "INSUMO", "USO_CONSUMO", "ATIVO_IMOBILIZADO"],
		});
		const refreshedItems = isReceived ? purchase.itens : await tx.query.purchaseItems.findMany({ where: eq(purchaseItems.compraId, purchase.id) });
		await syncPurchaseCarrierEntries({
			trx: tx,
			organizationId,
			userId: session.user.id,
			purchaseId: purchase.id,
			purchaseTitle: purchase.titulo,
			items: refreshedItems,
			documents,
			purchaseIsReceived: isReceived,
			dataCompetencia: purchase.lancamentoContabil?.dataCompetencia ?? new Date(),
			accounts: {
				estoqueContaId: debitAccountId,
				fornecedoresContaId: creditAccountId,
				contasPorDestinacao,
				creditoTributarioContaId: purchaseDefaults?.debitoCreditoTributarioContaId ?? null,
				despesaPeriodoContaId: purchaseDefaults?.debitoDespesaPeriodoContaId ?? null,
			},
		});
		return { purchaseId: purchase.id, purchaseTitle: purchase.titulo, capitalizado: !isReceived };
	});

	return {
		data: {
			purchaseId: result.purchaseId,
			documentoFiscalId: inbound.id,
			frete: { valorCentavos: cte.valorPrestacaoCentavos, icmsCentavos: Math.min(cte.icms.valorCentavos, cte.valorPrestacaoCentavos), capitalizado: result.capitalizado },
			avisos,
		},
		message: `${label} anexado à compra "${result.purchaseTitle}".`,
	};
}
export type TAttachFreightDocumentOutput = Awaited<ReturnType<typeof attachFreightDocument>>;

async function attachFreightDocumentRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = AttachFreightDocumentInputSchema.parse(await request.json());
	const result = await attachFreightDocument({ input, session });
	return NextResponse.json(result, { status: 201 });
}

export const POST = appApiHandler({ POST: attachFreightDocumentRoute });
