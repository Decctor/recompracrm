import { resolveFixedAssetAccounts } from "@/lib/fixed-assets/accounts";
import { fromCents, getAccumulatedDepreciationCents, getMonthKey, getPreviousMonthKey, splitAssetValues, toCents } from "@/lib/fixed-assets/depreciation";
import { syncAccountingEntryLines, type TAccountingEntryLineInput } from "@/lib/finances/accounting-entry-lines";
import type { DBTransaction } from "@/services/drizzle";
import { accountingEntries, accountingEntryLines, fixedAssets } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";

/**
 * Baixa e divisão de bens (ADR-0002, decisão 8). Baixa parcial = divisão do registro: o original
 * fica com o que sobrou e o separado nasce já BAIXADO. Cada registro continua uma função pura dos
 * próprios campos; não há tabela de movimentos de bem.
 */

export function buildFixedAssetWriteOffKey(organizationId: string, assetId: string) {
	return `patrimonio:${organizationId}:baixa:${assetId}`;
}

export async function loadFixedAssetOrThrow({ trx, organizationId, assetId }: { trx: DBTransaction; organizationId: string; assetId: string }) {
	const asset = await trx.query.fixedAssets.findFirst({ where: and(eq(fixedAssets.id, assetId), eq(fixedAssets.organizacaoId, organizationId)) });
	if (!asset) throw new createHttpError.NotFound("Bem não encontrado.");
	return asset;
}

/**
 * Separa `parte` unidades do registro num registro novo (plaqueta própria ou baixa parcial).
 * Devolve o id do registro separado.
 */
export async function splitFixedAsset({
	trx,
	organizationId,
	userId,
	assetId,
	parte,
	separado,
}: {
	trx: DBTransaction;
	organizationId: string;
	userId: string;
	assetId: string;
	parte: number;
	separado?: { codigoPatrimonio?: string | null; numeroSerie?: string | null; localizacao?: string | null; responsavelId?: string | null; descricao?: string | null };
}) {
	const asset = await loadFixedAssetOrThrow({ trx, organizationId, assetId });
	if (asset.status === "BAIXADO") throw new createHttpError.BadRequest("Um bem baixado não pode ser dividido.");
	const { restante, separado: split } = splitAssetValues(asset, parte);
	await trx
		.update(fixedAssets)
		.set({
			quantidade: restante.quantidade,
			valorAquisicao: restante.valorAquisicao,
			valorResidual: restante.valorResidual,
			depreciacaoAcumuladaInicial: restante.depreciacaoAcumuladaInicial,
			creditoIcmsCiap: restante.creditoIcmsCiap,
			dataAtualizacao: new Date(),
		})
		.where(eq(fixedAssets.id, asset.id));
	const [inserted] = await trx
		.insert(fixedAssets)
		.values({
			organizacaoId: organizationId,
			produtoId: asset.produtoId,
			produtoVarianteId: asset.produtoVarianteId,
			compraId: asset.compraId,
			compraItemId: asset.compraItemId,
			codigoPatrimonio: separado?.codigoPatrimonio ?? null,
			descricao: separado?.descricao ?? asset.descricao,
			numeroSerie: separado?.numeroSerie ?? null,
			localizacao: separado?.localizacao ?? asset.localizacao,
			responsavelId: separado?.responsavelId ?? asset.responsavelId,
			status: asset.status,
			quantidade: split.quantidade,
			valorAquisicao: split.valorAquisicao,
			dataInicioUso: asset.dataInicioUso,
			vidaUtilMeses: asset.vidaUtilMeses,
			valorResidual: split.valorResidual,
			depreciacaoAcumuladaInicial: split.depreciacaoAcumuladaInicial,
			creditoIcmsCiap: split.creditoIcmsCiap,
			anotacoes: asset.anotacoes,
			autorId: userId,
		})
		.returning({ id: fixedAssets.id });
	if (!inserted) throw new createHttpError.InternalServerError("Erro ao dividir o bem.");
	return inserted.id;
}

/**
 * Baixa integral de um registro: grava data, motivo e valor, e lança a saída do bem:
 *
 *   D Depreciação acumulada     acumulada até o mês anterior à baixa
 *   D Resultado na baixa        valor contábil restante (perda) — conta de despesas do período
 *   C Imobilizado               valor de aquisição
 *
 * O valor recebido pela venda do bem (`valorBaixa`) é informativo aqui: o recebimento, se houver,
 * é um lançamento financeiro próprio.
 */
export async function writeOffFixedAsset({
	trx,
	organizationId,
	userId,
	assetId,
	dataBaixa,
	motivoBaixa,
	valorBaixa,
}: {
	trx: DBTransaction;
	organizationId: string;
	userId: string;
	assetId: string;
	dataBaixa: Date;
	motivoBaixa: string;
	valorBaixa: number | null;
}) {
	const asset = await loadFixedAssetOrThrow({ trx, organizationId, assetId });
	if (asset.status === "BAIXADO") throw new createHttpError.BadRequest("Este bem já foi baixado.");
	if (dataBaixa.getTime() < asset.dataInicioUso.getTime()) throw new createHttpError.BadRequest("A data da baixa não pode ser anterior ao início de uso.");
	const key = buildFixedAssetWriteOffKey(organizationId, assetId);

	await trx
		.update(fixedAssets)
		.set({ status: "BAIXADO", dataBaixa, motivoBaixa, valorBaixa, dataAtualizacao: new Date() })
		.where(eq(fixedAssets.id, asset.id));

	const accounts = await resolveFixedAssetAccounts({ trx, organizationId, autoProvisionFromSeed: true });
	const written = { ...asset, dataBaixa };
	const accumulatedCents = getAccumulatedDepreciationCents(written, getPreviousMonthKey(getMonthKey(dataBaixa)));
	const acquisitionCents = toCents(asset.valorAquisicao);
	const bookValueCents = Math.max(0, acquisitionCents - accumulatedCents);
	if (acquisitionCents === 0) return { entryId: null, valorContabilCentavos: 0 };
	if (bookValueCents > 0 && !accounts.resultadoBaixaContaId)
		throw new createHttpError.BadRequest("Conta de despesas do período não configurada. Defina-a em Configurações › Financeiro › Lançamentos padrão › Compras.");

	const lines: TAccountingEntryLineInput[] = [];
	let order = 0;
	if (accumulatedCents > 0)
		lines.push({ contaContabilId: accounts.depreciacaoAcumuladaContaId, natureza: "DEBITO", valor: fromCents(accumulatedCents), descricao: "Depreciação acumulada baixada", ordem: order++, metadados: { origem: "PATRIMONIO", tipo: "BAIXA" } });
	if (bookValueCents > 0)
		lines.push({ contaContabilId: accounts.resultadoBaixaContaId!, natureza: "DEBITO", valor: fromCents(bookValueCents), descricao: "Resultado na baixa do bem", ordem: order++, metadados: { origem: "PATRIMONIO", tipo: "BAIXA" } });
	lines.push({ contaContabilId: accounts.imobilizadoContaId, natureza: "CREDITO", valor: fromCents(acquisitionCents), descricao: "Imobilizado baixado", ordem: order, metadados: { origem: "PATRIMONIO", tipo: "BAIXA" } });

	const titulo = `Baixa de bem — ${asset.descricao}`;
	const valor = fromCents(acquisitionCents);
	const existing = await trx.query.accountingEntries.findFirst({ where: and(eq(accountingEntries.organizacaoId, organizationId), eq(accountingEntries.chaveIdempotencia, key)), columns: { id: true } });
	let entryId: string;
	if (existing) {
		entryId = existing.id;
		await trx.delete(accountingEntryLines).where(eq(accountingEntryLines.lancamentoContabilId, entryId));
		await trx.update(accountingEntries).set({ titulo, valor, dataCompetencia: dataBaixa, anotacoes: motivoBaixa }).where(eq(accountingEntries.id, entryId));
	} else {
		const [inserted] = await trx
			.insert(accountingEntries)
			.values({
				organizacaoId: organizationId,
				origemTipo: "PATRIMONIO",
				titulo,
				anotacoes: motivoBaixa,
				idContaDebito: lines[0].contaContabilId,
				idContaCredito: accounts.imobilizadoContaId,
				valor,
				dataCompetencia: dataBaixa,
				chaveIdempotencia: key,
				autorId: userId,
			})
			.returning({ id: accountingEntries.id });
		if (!inserted) throw new createHttpError.InternalServerError("Erro ao lançar a baixa do bem.");
		entryId = inserted.id;
	}
	await syncAccountingEntryLines({ trx, organizationId, accountingEntryId: entryId, entryValue: valor, lines });
	return { entryId, valorContabilCentavos: bookValueCents };
}
