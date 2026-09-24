import { isCashbackRedemptionAllowedOnSurface } from "@/lib/cashback/redemption-policy";
import type { TBenefitRedemptionSurface } from "@/schemas/enums";
import { type TChannelState, channelNodePrice, channelProductFilter } from "@/lib/products/sales-channels-store";
import type { DB, DBTransaction } from "@/services/drizzle";
import createHttpError from "http-errors";

/**
 * Disponibilidade e preço de um nó (produto/variante) para resgate em um canal, com a mesma régua
 * do catálogo do canal (lib/shop/catalog.ts): filtro de presença por produto e preço RESOLVIDO
 * > 0. Sem channelState (PDV, canal não materializado) vale o preço base do cadastro.
 */
function resolvePrizeChannelPricing(
	channelState: TChannelState | null | undefined,
	node: { produtoId: string; produtoVarianteId?: string | null; precoVenda: number | null },
) {
	if (!channelState) return { disponivel: true, precoVenda: node.precoVenda ?? 0 };
	const filter = channelProductFilter(channelState);
	if (filter.includeIds && !filter.includeIds.includes(node.produtoId)) return { disponivel: false, precoVenda: 0 };
	if (filter.excludeIds?.includes(node.produtoId)) return { disponivel: false, precoVenda: 0 };
	const precoVenda = channelNodePrice(channelState, node) ?? 0;
	return { disponivel: precoVenda > 0, precoVenda };
}

export type TValidatedPrizeForRedemption = {
	id: string;
	titulo: string;
	imagemCapaUrl: string | null;
	// Débito de saldo do cliente, em moeda cashback (R$ ou pontos, conforme a terminologia do programa).
	valor: number;
	// Valor comercial do prêmio (sempre R$): precoVenda da variante ?? do produto.
	valorVenda: number;
	precoCusto: number;
	// produtoId é sempre resolvido (saleItems.produtoId é NOT NULL) — prêmios variante-only
	// devolvem o produto pai da variante.
	produtoId: string;
	produtoVarianteId: string | null;
	produtoNome: string;
	produtoCodigo: string;
	produtoImagemUrl: string | null;
};

/**
 * Valida um prêmio do programa de cashback para resgate e resolve os valores autoritativos
 * (comercial, custo e vínculo de produto) a partir do catálogo. Usado pelo POI e pelo PDV —
 * o cliente informa apenas o id do prêmio; tudo que vira item de venda sai daqui.
 */
export async function validatePrizeForRedemption({
	tx,
	organizacaoId,
	programaId,
	recompensaId,
	channelState,
}: {
	tx: DB | DBTransaction;
	organizacaoId: string;
	programaId: string;
	recompensaId: string;
	channelState?: TChannelState | null;
}): Promise<TValidatedPrizeForRedemption> {
	const prize = await tx.query.cashbackProgramPrizes.findFirst({
		where: (fields, { and, eq }) =>
			and(eq(fields.id, recompensaId), eq(fields.organizacaoId, organizacaoId), eq(fields.programaId, programaId), eq(fields.ativo, true)),
		columns: {
			id: true,
			titulo: true,
			imagemCapaUrl: true,
			valor: true,
			produtoId: true,
			produtoVarianteId: true,
		},
	});
	if (!prize) {
		throw new createHttpError.BadRequest("Recompensa não encontrada ou inativa.");
	}
	if (!prize.produtoId && !prize.produtoVarianteId) {
		throw new createHttpError.BadRequest("A recompensa selecionada não possui vínculo com produto ou variante.");
	}
	if (prize.valor <= 0) {
		// Sem isso o prêmio parece resgatável (saldo >= 0) mas a confirmação estoura lá na frente,
		// no débito FIFO, derrubando a venda inteira com uma mensagem sem relação com a causa.
		throw new createHttpError.BadRequest("A recompensa selecionada está configurada com valor inválido.");
	}

	// Produto e variante são resolvidos com queries org-scoped, e não pelas relations por FK: um
	// prêmio pode ter sido gravado apontando para catálogo de outra organização, e as relations
	// resolveriam esse vínculo sem reclamar. Mesma régua de `validateSaleItemsPricing`.
	const variante = prize.produtoVarianteId
		? ((await tx.query.productVariants.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.id, prize.produtoVarianteId as string), eq(fields.organizacaoId, organizacaoId)),
				columns: { id: true, produtoId: true, nome: true, codigo: true, imagemCapaUrl: true, precoVenda: true, precoCusto: true },
			})) ?? null)
		: null;
	if (prize.produtoVarianteId && !variante) {
		throw new createHttpError.BadRequest("A variante vinculada à recompensa não pertence ao catálogo desta organização.");
	}

	// Prêmio variante-only: o produto pai vem pela variante (saleItems.produtoId é NOT NULL).
	const produtoId = prize.produtoId ?? variante?.produtoId;
	if (!produtoId) {
		throw new createHttpError.BadRequest("A recompensa selecionada não possui vínculo com produto ou variante.");
	}
	const produto = await tx.query.products.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, produtoId), eq(fields.organizacaoId, organizacaoId)),
		columns: { id: true, nome: true, codigo: true, imagemCapaUrl: true, precoVenda: true, precoCusto: true },
	});
	if (!produto) {
		throw new createHttpError.BadRequest("O produto vinculado à recompensa não pertence ao catálogo desta organização.");
	}
	if (variante && variante.produtoId !== produto.id) {
		throw new createHttpError.BadRequest("A variante vinculada à recompensa não pertence ao produto informado.");
	}

	// Preço comercial resolvido no canal da venda: se ficar no preço base, o item da recompensa
	// diverge do resto do pedido (drift na confirmação) e o desconto sai subavaliado nos relatórios.
	const channelPricing = resolvePrizeChannelPricing(channelState, {
		produtoId: produto.id,
		produtoVarianteId: variante?.id ?? null,
		precoVenda: variante?.precoVenda ?? produto.precoVenda ?? null,
	});
	if (!channelPricing.disponivel) {
		throw new createHttpError.BadRequest("O produto vinculado à recompensa não está disponível neste canal de venda.");
	}

	return {
		id: prize.id,
		titulo: prize.titulo,
		imagemCapaUrl: prize.imagemCapaUrl ?? null,
		valor: prize.valor,
		valorVenda: channelPricing.precoVenda,
		precoCusto: variante?.precoCusto ?? produto.precoCusto ?? 0,
		produtoId,
		produtoVarianteId: variante?.id ?? null,
		produtoNome: variante ? `${produto.nome} - ${variante.nome}` : produto.nome,
		produtoCodigo: variante?.codigo ?? produto.codigo,
		produtoImagemUrl: variante?.imagemCapaUrl ?? produto.imagemCapaUrl ?? null,
	};
}

/**
 * Lista as recompensas resgatáveis de um cliente, com o saldo e o programa resolvidos. Usada pelo
 * PDV e pela loja digital — a elegibilidade e a resolução de programa precisam ser idênticas nas
 * duas superfícies, senão elas mostram listas diferentes para o mesmo cliente.
 */
export async function listAvailableCashbackRewards({
	tx,
	organizacaoId,
	clienteId,
	surface,
	channelState,
}: {
	tx: DB | DBTransaction;
	organizacaoId: string;
	clienteId: string;
	/** Superfície que vai exibir a lista — sem resgate nela, a lista sai vazia (a admissão recusaria de qualquer forma). */
	surface: TBenefitRedemptionSurface;
	channelState?: TChannelState | null;
}) {
	// Mesma resolução do resgate (`admitSaleRewardRedemptions`): o programa do cliente é o do seu
	// saldo. Só quando o cliente não tem saldo em nenhum programa é que se cai no programa ativo da
	// organização — do contrário, uma org com mais de um programa listaria prêmios de um e
	// debitaria o saldo de outro.
	const clientBalance = await tx.query.cashbackProgramBalances.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizacaoId), eq(fields.clienteId, clienteId)),
		columns: { saldoValorDisponivel: true, programaId: true },
	});
	const program = await tx.query.cashbackPrograms.findFirst({
		where: (fields, { and, eq }) =>
			clientBalance?.programaId
				? and(eq(fields.id, clientBalance.programaId), eq(fields.organizacaoId, organizacaoId))
				: and(eq(fields.organizacaoId, organizacaoId), eq(fields.ativo, true)),
		columns: {
			id: true,
			ativo: true,
			terminologia: true,
			modalidadeRecompensasPermitida: true,
			resgatePermitirViaPos: true,
			resgatePermitirViaPontoIntegracao: true,
			resgatePermitirViaLojaDigital: true,
		},
	});
	const rewardsAvailable = !!program?.ativo && program.modalidadeRecompensasPermitida && isCashbackRedemptionAllowedOnSurface(program, surface);
	// Saldo só conta quando é do programa resolvido.
	const balance = clientBalance && clientBalance.programaId === program?.id ? clientBalance : null;
	const saldoValorDisponivel = balance?.saldoValorDisponivel ?? 0;

	const prizes =
		rewardsAvailable && program
			? await tx.query.cashbackProgramPrizes.findMany({
					where: (fields, { and, eq, gt }) =>
						and(eq(fields.organizacaoId, organizacaoId), eq(fields.programaId, program.id), eq(fields.ativo, true), gt(fields.valor, 0)),
					columns: { id: true, titulo: true, descricao: true, imagemCapaUrl: true, valor: true, produtoId: true, produtoVarianteId: true },
					with: {
						produto: { columns: { precoVenda: true, grupo: true, imagemCapaUrl: true } },
						produtoVariante: { columns: { produtoId: true, precoVenda: true, imagemCapaUrl: true } },
					},
					orderBy: (fields, { asc }) => asc(fields.valor),
				})
			: [];

	const rewards = prizes
		// Prêmio sem vínculo com produto/variante não é resgatável (não vira item de venda).
		// `valor > 0` já é filtrado na query: prêmio de valor zero não passa no débito do ledger.
		.filter((prize) => !!prize.produtoId || !!prize.produtoVarianteId)
		.flatMap((prize) => {
			const produtoId = prize.produtoId ?? prize.produtoVariante?.produtoId;
			if (!produtoId) return [];
			const channelPricing = resolvePrizeChannelPricing(channelState, {
				produtoId,
				produtoVarianteId: prize.produtoVarianteId,
				precoVenda: prize.produtoVariante?.precoVenda ?? prize.produto?.precoVenda ?? null,
			});
			// Fora do canal não aparece: `validatePrizeForRedemption` recusaria o resgate de qualquer forma.
			if (!channelPricing.disponivel) return [];
			const elegivel = saldoValorDisponivel >= prize.valor;
			return [
				{
					id: prize.id,
					titulo: prize.titulo,
					descricao: prize.descricao,
					imagemCapaUrl: prize.imagemCapaUrl ?? prize.produtoVariante?.imagemCapaUrl ?? prize.produto?.imagemCapaUrl ?? null,
					grupo: prize.produto?.grupo ?? null,
					valor: prize.valor,
					valorVenda: channelPricing.precoVenda,
					elegivel,
					motivo: elegivel ? null : "Saldo insuficiente.",
				},
			];
		});

	return {
		program: program
			? {
					id: program.id,
					ativo: program.ativo,
					terminologia: program.terminologia,
					modalidadeRecompensasPermitida: program.modalidadeRecompensasPermitida,
				}
			: null,
		saldoValorDisponivel,
		rewards,
	};
}
