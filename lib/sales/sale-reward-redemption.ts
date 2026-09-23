import { type TValidatedPrizeForRedemption, validatePrizeForRedemption } from "@/lib/cashback/prizes";
import { getCashbackRedemptionBlockReason } from "@/lib/cashback/redemption-policy";
import { loadChannelState } from "@/lib/products/sales-channels-store";
import {
	POS_REWARD_SALE_ITEM_ORIGIN,
	type TSaleRewardDraftSnapshot,
	type TSaleRewardRedemptionLineInput,
	normalizeRewardRedemptionLines,
} from "@/lib/sales/sale-reward-snapshot";
import type { TBenefitRedemptionSurface } from "@/schemas/enums";
import type { DB, DBTransaction } from "@/services/drizzle";
import createHttpError from "http-errors";

// Parte client-safe (tipo do snapshot, origem do item, parser, matemática das linhas) mora em
// sale-reward-snapshot.ts; reexportada aqui para os consumidores de servidor não precisarem de
// dois imports.
export {
	POS_REWARD_SALE_ITEM_ORIGIN,
	buildRewardSnapshotsMetadataKeys,
	parseSaleRewardDraftSnapshots,
	resolveRewardRedemptionLinesInput,
	sumRewardRedemptionSaleValue,
	sumRewardRedemptionValue,
	type TSaleRewardDraftSnapshot,
	type TSaleRewardRedemptionLineInput,
} from "@/lib/sales/sale-reward-snapshot";

export type TAdmittedSaleReward = {
	programaId: string;
	prize: TValidatedPrizeForRedemption;
	quantidade: number;
};

/**
 * Admissão do resgate de recompensas em uma venda — uma linha por recompensa distinta, com
 * quantidade. Exige cliente vinculado, aplica as regras de exclusividade (cupom e
 * resgate-desconto não são combináveis com recompensa), resolve UM programa para todas as
 * linhas (o débito FIFO é por programa), exige a modalidade de recompensas e a superfície de
 * resgate (`surface` = onde o cliente PEDIU a recompensa, não o canal da venda), valida cada
 * prêmio contra o catálogo (com o preço do canal, quando informado) e pré-checa o saldo do
 * cliente contra a SOMA das linhas — checar prêmio a prêmio deixaria passar dois prêmios
 * individualmente pagáveis cuja soma estoura, e a falha só apareceria dentro do FIFO na
 * confirmação, com a venda já gravada. Tudo que vira item/ledger sai daqui — o cliente informa
 * apenas ids e quantidades.
 *
 * Lista vazia devolve lista vazia sem tocar no banco.
 */
export async function admitSaleRewardRedemptions({
	tx,
	organizacaoId,
	clienteId,
	recompensas,
	hasCoupon,
	cashbackResgate,
	surface,
	canal,
}: {
	tx: DB | DBTransaction;
	organizacaoId: string;
	clienteId: string | null | undefined;
	recompensas: TSaleRewardRedemptionLineInput[];
	hasCoupon: boolean;
	cashbackResgate: number;
	surface: TBenefitRedemptionSurface;
	canal?: Parameters<typeof loadChannelState>[0]["canal"] | null;
}): Promise<TAdmittedSaleReward[]> {
	if (recompensas.length === 0) return [];
	const normalized = normalizeRewardRedemptionLines(recompensas);
	if (normalized.erro !== null) throw new createHttpError.BadRequest(normalized.erro);
	const linhas = normalized.linhas;

	if (!clienteId) throw new createHttpError.BadRequest("Vincule um cliente para resgatar recompensas.");
	if (hasCoupon) throw new createHttpError.BadRequest("Cupons não podem ser combinados com resgate de recompensa.");
	if (cashbackResgate > 0) throw new createHttpError.BadRequest("Resgate de recompensa não pode ser combinado com desconto em cashback.");

	let resolvedProgramId = linhas.find((line) => line.programaId)?.programaId ?? null;
	if (!resolvedProgramId) {
		const balance = await tx.query.cashbackProgramBalances.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizacaoId), eq(fields.clienteId, clienteId)),
			columns: { programaId: true },
		});
		resolvedProgramId = balance?.programaId ?? null;
	}
	if (!resolvedProgramId) throw new createHttpError.BadRequest("Programa de cashback não informado.");

	const program = await tx.query.cashbackPrograms.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, resolvedProgramId), eq(fields.organizacaoId, organizacaoId), eq(fields.ativo, true)),
		columns: {
			id: true,
			modalidadeRecompensasPermitida: true,
			resgatePermitirViaPos: true,
			resgatePermitirViaPontoIntegracao: true,
			resgatePermitirViaLojaDigital: true,
		},
	});
	if (!program) throw new createHttpError.NotFound("Programa de cashback não encontrado.");
	if (!program.modalidadeRecompensasPermitida) {
		throw new createHttpError.BadRequest("O programa de cashback não permite resgate de recompensas.");
	}
	const surfaceBlockReason = getCashbackRedemptionBlockReason({ program, surface });
	if (surfaceBlockReason) throw new createHttpError.Forbidden(surfaceBlockReason);

	const channelState = canal ? await loadChannelState({ orgId: organizacaoId, canal }) : null;
	const admitted: TAdmittedSaleReward[] = [];
	for (const line of linhas) {
		const prize = await validatePrizeForRedemption({
			tx,
			organizacaoId,
			programaId: program.id,
			recompensaId: line.recompensaId,
			channelState,
		});
		admitted.push({ programaId: program.id, prize, quantidade: line.quantidade });
	}

	// Pré-checagem de saldo sobre a soma. O débito autoritativo continua sendo o FIFO da
	// confirmação, mas sem esta guarda a venda inteira é gravada antes de o débito estourar — na
	// loja digital isso deixava um ORCAMENTO órfão com o item grátis e o pedido irrepetível.
	const totalResgate = sumAdmittedRewardsRedemptionValue(admitted);
	const balance = await tx.query.cashbackProgramBalances.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizacaoId), eq(fields.clienteId, clienteId), eq(fields.programaId, program.id)),
		columns: { saldoValorDisponivel: true },
	});
	if ((balance?.saldoValorDisponivel ?? 0) < totalResgate) {
		throw new createHttpError.BadRequest(
			admitted.length > 1 ? "Saldo insuficiente para resgatar todas as recompensas selecionadas." : "Saldo insuficiente para resgatar a recompensa.",
		);
	}

	return admitted;
}

/** Débito total de saldo (moeda cashback) das linhas admitidas. */
export function sumAdmittedRewardsRedemptionValue(rewards: TAdmittedSaleReward[]): number {
	return rewards.reduce((sum, reward) => sum + reward.prize.valor * reward.quantidade, 0);
}

/** Desconto comercial total (R$) das linhas admitidas — o que entra em `sales.descontosTotal`. */
export function sumAdmittedRewardsSaleValue(rewards: TAdmittedSaleReward[]): number {
	return rewards.reduce((sum, reward) => sum + reward.prize.valorVenda * reward.quantidade, 0);
}

/** Custo total (R$) das linhas admitidas — o que entra em `sales.custoTotal`. */
export function sumAdmittedRewardsCost(rewards: TAdmittedSaleReward[]): number {
	return rewards.reduce((sum, reward) => sum + reward.prize.precoCusto * reward.quantidade, 0);
}

/**
 * Valores do saleItem de uma linha de recompensa: item normal com 100% de desconto (líquido 0)
 * e custo real do catálogo, na quantidade da linha. Sendo um saleItem comum, baixa estoque,
 * compõe COGS e aparece no documento fiscal com vProd/vDesc — o débito de saldo acontece na
 * confirmação, à parte.
 */
export function buildRewardSaleItemValues({
	organizacaoId,
	vendaId,
	clienteId,
	prize,
	quantidade,
}: {
	organizacaoId: string;
	vendaId: string;
	clienteId: string | null;
	prize: TValidatedPrizeForRedemption;
	quantidade: number;
}) {
	return {
		organizacaoId,
		vendaId,
		clienteId,
		produtoId: prize.produtoId,
		produtoVarianteId: prize.produtoVarianteId,
		quantidade,
		valorVendaUnitario: prize.valorVenda,
		valorCustoUnitario: prize.precoCusto,
		valorVendaTotalBruto: prize.valorVenda * quantidade,
		valorTotalDesconto: prize.valorVenda * quantidade,
		valorVendaTotalLiquido: 0,
		valorCustoTotal: prize.precoCusto * quantidade,
		metadados: {
			origem: POS_REWARD_SALE_ITEM_ORIGIN,
			recompensaId: prize.id,
			quantidade,
			// Por unidade, como no snapshot.
			valorResgate: prize.valor,
			valorComercial: prize.valorVenda,
			nome: prize.produtoNome,
			codigo: prize.produtoCodigo,
			imagemUrl: prize.produtoImagemUrl,
		},
	};
}

/** Uma inserção por linha admitida. */
export function buildRewardSaleItemsValues({
	organizacaoId,
	vendaId,
	clienteId,
	rewards,
}: {
	organizacaoId: string;
	vendaId: string;
	clienteId: string | null;
	rewards: TAdmittedSaleReward[];
}) {
	return rewards.map((reward) => buildRewardSaleItemValues({ organizacaoId, vendaId, clienteId, prize: reward.prize, quantidade: reward.quantidade }));
}

export function buildSaleRewardDraftSnapshot({ programaId, prize, quantidade }: TAdmittedSaleReward): TSaleRewardDraftSnapshot {
	return {
		recompensaId: prize.id,
		programaId,
		titulo: prize.titulo,
		valor: prize.valor,
		valorVenda: prize.valorVenda,
		quantidade,
	};
}

export function buildSaleRewardDraftSnapshots(rewards: TAdmittedSaleReward[]): TSaleRewardDraftSnapshot[] {
	return rewards.map(buildSaleRewardDraftSnapshot);
}

/** Forma que `processSaleConfirmation` recebe: uma linha por recompensa admitida. */
export function toSaleRewardRedemptionInputs(rewards: TAdmittedSaleReward[]) {
	return rewards.map((reward) => ({
		recompensaId: reward.prize.id,
		programaId: reward.programaId,
		valorResgate: reward.prize.valor,
		quantidade: reward.quantidade,
	}));
}
