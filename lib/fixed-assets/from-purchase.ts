import { getMonthKey } from "@/lib/fixed-assets/depreciation";
import { findLatestClosedFixedAssetsMonth } from "@/lib/fixed-assets/monthly-close";
import { getModifierCounterparty } from "@/lib/purchase/costing";
import type { TPurchaseItemInput } from "@/lib/purchase-processing/process-purchase-item-stock";
import { DEFAULT_FIXED_ASSET_USEFUL_LIFE_MONTHS } from "@/schemas/fixed-assets";
import type { DBTransaction } from "@/services/drizzle";
import { fixedAssets } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";

/**
 * Recebimento de item com destinação ATIVO_IMOBILIZADO (ADR-0002, decisão 8): não há movimento de
 * estoque; nasce um registro em `fixed_assets` com a quantidade do item e `valorAquisicao` igual ao
 * custo total (base + componentes capitalizados, líquido do ICMS creditável). Quem quiser plaquetas
 * individuais divide o registro depois.
 */

const CIAP_KEYS = new Set(["IMPOSTOS_ICMS", "IMPOSTOS_DIFAL", "IMPOSTOS_FCP_DIFAL", "IMPOSTOS_ICMS_ST_ENTRADA", "IMPOSTOS_ANTECIPACAO"]);

/** Crédito de ICMS do item que vira CIAP: tudo que foi tratado como crédito tributário sob chave de ICMS. */
export function getItemCiapCreditCents(item: Pick<TPurchaseItemInput, "modificadoresCusto">) {
	let cents = 0;
	for (const modifier of item.modificadoresCusto?.modificadores ?? []) {
		if (modifier.tratamento !== "CREDITO_TRIBUTARIO" || !CIAP_KEYS.has(modifier.chave)) continue;
		// Reduções de crédito não existem (costing recusa); contrapartida não importa: o crédito é o mesmo.
		void getModifierCounterparty(modifier);
		cents += modifier.valorCentavos;
	}
	return cents;
}

export async function createFixedAssetsForPurchaseItem({
	trx,
	organizationId,
	userId,
	purchaseId,
	purchaseItemId,
	item,
	receivedAt,
}: {
	trx: DBTransaction;
	organizationId: string;
	userId: string;
	purchaseId: string;
	purchaseItemId: string;
	item: TPurchaseItemInput;
	receivedAt: Date;
}) {
	const quantidade = Math.max(1, Math.round(item.quantidade));
	const ciapCents = getItemCiapCreditCents(item);
	const [inserted] = await trx
		.insert(fixedAssets)
		.values({
			organizacaoId: organizationId,
			produtoId: item.produtoId,
			produtoVarianteId: item.produtoVarianteId ?? null,
			compraId: purchaseId,
			compraItemId: purchaseItemId,
			descricao: item.snapshotProdutoDescricao,
			status: "EM_USO",
			quantidade,
			valorAquisicao: item.valorTotalCusto ?? item.valorTotalLiquido ?? item.valorTotalBruto,
			dataInicioUso: receivedAt,
			vidaUtilMeses: DEFAULT_FIXED_ASSET_USEFUL_LIFE_MONTHS,
			valorResidual: 0,
			depreciacaoAcumuladaInicial: 0,
			creditoIcmsCiap: ciapCents > 0 ? ciapCents / 100 : null,
			anotacoes: item.anotacoes ?? null,
			autorId: userId,
		})
		.returning({ id: fixedAssets.id });
	if (!inserted) throw new createHttpError.InternalServerError("Erro ao registrar o bem do ativo imobilizado.");
	return inserted.id;
}

/**
 * Desfazer o recebimento (ou cancelar a compra) remove os bens que ela criou — desde que nenhum
 * deles já tenha entrado num lançamento PATRIMONIO. Bem já depreciado num mês fechado não some:
 * ele é baixado, e o lançamento do mês continua valendo.
 */
export async function removeFixedAssetsForPurchaseItem({
	trx,
	organizationId,
	purchaseItemId,
}: {
	trx: DBTransaction;
	organizationId: string;
	purchaseItemId: string;
}) {
	const assets = await trx.query.fixedAssets.findMany({
		where: and(eq(fixedAssets.organizacaoId, organizationId), eq(fixedAssets.compraItemId, purchaseItemId)),
		columns: { id: true, dataInicioUso: true, descricao: true, status: true },
	});
	if (assets.length === 0) return;
	const latestClosedMonth = await findLatestClosedFixedAssetsMonth({ trx, organizationId });
	for (const asset of assets) {
		if (latestClosedMonth && getMonthKey(asset.dataInicioUso) <= latestClosedMonth)
			throw new createHttpError.BadRequest(
				`O bem "${asset.descricao}" já entrou no fechamento de ${latestClosedMonth} do patrimônio. Baixe o bem em Produtos › Patrimônio em vez de desfazer o recebimento.`,
			);
	}
	await trx.delete(fixedAssets).where(and(eq(fixedAssets.organizacaoId, organizationId), eq(fixedAssets.compraItemId, purchaseItemId)));
}
