import type { TCouponEntity } from "@/services/drizzle/schema";
import { couponGrants, couponRedemptions, coupons } from "@/services/drizzle/schema";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import z from "zod";
import { defineAgentTool } from "./define-tool";

/** Traduz o benefício estruturado para uma frase que o agente pode repassar ao cliente. */
function describeBenefit(
	coupon: Pick<
		TCouponEntity,
		"beneficioTipo" | "beneficioValor" | "beneficioDescontoMaximo" | "beneficioCompreQuantidade" | "beneficioLeveQuantidade" | "beneficioAplicacao"
	>,
): string {
	const value = coupon.beneficioValor ?? 0;
	switch (coupon.beneficioTipo) {
		case "DESCONTO_FIXO":
			return `R$ ${value.toFixed(2)} de desconto`;
		case "DESCONTO_PERCENTUAL":
			return coupon.beneficioDescontoMaximo
				? `${value}% de desconto (limitado a R$ ${coupon.beneficioDescontoMaximo.toFixed(2)})`
				: `${value}% de desconto`;
		case "PRECO_FIXO":
			return `preço promocional de R$ ${value.toFixed(2)}`;
		case "COMPRE_X_LEVE_Y":
			return `compre ${coupon.beneficioCompreQuantidade ?? "?"} e leve ${coupon.beneficioLeveQuantidade ?? "?"}`;
		case "BRINDE":
			return "uma unidade grátis de um dos produtos permitidos, escolhida no checkout; adicionais e entrega são cobrados à parte";
		default:
			return "benefício especial";
	}
}

function buildConditions(
	coupon: Pick<TCouponEntity, "condicaoValorMinimoVenda" | "condicaoQuantidadeMinimaItens" | "condicoesTexto" | "validacaoModo">,
) {
	return {
		valorMinimoVenda: coupon.condicaoValorMinimoVenda,
		quantidadeMinimaItens: coupon.condicaoQuantidadeMinimaItens,
		// Cupons de validação MANUAL têm as regras em texto livre — o resgate é feito no balcão.
		regrasEmTexto: coupon.condicoesTexto,
		exigeConferenciaManual: coupon.validacaoModo === "MANUAL",
	};
}

/**
 * Consulta os cupons que o cliente pode usar e os que já usou.
 *
 * "Disponíveis" reúne duas fontes distintas: os cupons GLOBAIS vigentes da organização e as
 * atribuições individuais do cliente (`coupon_grants`), cuja `expiracaoData` sobrepõe a
 * vigência do cupom.
 */
export const couponsTool = defineAgentTool({
	name: "cupons.consultar",
	description: `Consulta cupons de desconto — os que o cliente pode usar agora e os que já usou.

Use visao="DISPONIVEIS" (padrão) para os cupons válidos para este cliente neste momento:
inclui tanto os cupons abertos a todos os clientes quanto os atribuídos individualmente a ele.
Retorna código, benefício, condições de uso e validade.
Use visao="RESGATES" para o histórico de cupons já utilizados pelo cliente.

Informe "codigo" para verificar um cupom específico (ex.: o cliente pergunta "o cupom PROMO10
ainda vale?").

Nunca prometa um desconto que não apareça nesta consulta, e sempre mencione as condições
(valor mínimo, quantidade mínima) junto do benefício.`,
	inputSchema: z.object({
		visao: z.enum(["DISPONIVEIS", "RESGATES"]).optional().describe("O que consultar. Padrão: DISPONIVEIS."),
		codigo: z.string().min(1).optional().describe("Verificar apenas o cupom com este código."),
		limite: z.number().int().min(1).max(50).optional().describe("Máximo de cupons retornados. Padrão: 10."),
	}),
	async execute(input, context) {
		const { db, organizacaoId, chat } = context;
		const view = input.visao ?? "DISPONIVEIS";
		const limit = input.limite ?? 10;
		const now = new Date();

		if (view === "RESGATES") {
			const conditions = [eq(couponRedemptions.organizacaoId, organizacaoId), eq(couponRedemptions.clienteId, chat.clienteId)];
			if (input.codigo) conditions.push(eq(couponRedemptions.cupomCodigo, input.codigo));

			const redemptions = await db.query.couponRedemptions.findMany({
				where: and(...conditions),
				orderBy: [desc(couponRedemptions.dataInsercao)],
				limit,
				columns: { cupomTitulo: true, cupomCodigo: true, status: true, valorDesconto: true, vendaValor: true, dataInsercao: true },
			});

			return {
				success: true,
				message: redemptions.length > 0 ? `${redemptions.length} resgate(s) de cupom encontrado(s).` : "O cliente ainda não utilizou nenhum cupom.",
				result: { resgates: redemptions },
			};
		}

		// Vigência: início já passou (ou não definido) e fim ainda não chegou (ou não expira).
		const globalConditions = [
			eq(coupons.organizacaoId, organizacaoId),
			eq(coupons.ativo, true),
			eq(coupons.escopo, "GLOBAL"),
			or(isNull(coupons.vigenciaInicio), lte(coupons.vigenciaInicio, now)),
			or(isNull(coupons.vigenciaFim), gt(coupons.vigenciaFim, now)),
		];
		if (input.codigo) globalConditions.push(eq(coupons.codigo, input.codigo));

		const globalCoupons = await db.query.coupons.findMany({
			where: and(...globalConditions),
			orderBy: [desc(coupons.dataInsercao)],
			limit,
		});

		const grants = await db.query.couponGrants.findMany({
			where: and(
				eq(couponGrants.organizacaoId, organizacaoId),
				eq(couponGrants.clienteId, chat.clienteId),
				gt(couponGrants.quantidadeDisponivel, 0),
				or(isNull(couponGrants.expiracaoData), gt(couponGrants.expiracaoData, now)),
			),
			orderBy: [desc(couponGrants.dataInsercao)],
			limit,
			with: { cupom: true },
		});

		const available = [
			...globalCoupons.map((coupon) => ({
				codigo: coupon.codigo,
				titulo: coupon.titulo,
				descricao: coupon.descricao,
				beneficio: describeBenefit(coupon),
				aplicacao: coupon.beneficioAplicacao,
				condicoes: buildConditions(coupon),
				validoAte: coupon.vigenciaFim,
				origem: "GLOBAL" as const,
			})),
			...grants
				.filter((grant) => {
					const coupon = grant.cupom;
					if (!coupon || !coupon.ativo || coupon.organizacaoId !== organizacaoId) return false;
					if (input.codigo && coupon.codigo !== input.codigo && grant.codigo !== input.codigo) return false;
					if (coupon.vigenciaInicio && coupon.vigenciaInicio > now) return false;
					// A expiração do grant já foi filtrada no WHERE; a do cupom ainda precisa valer.
					if (coupon.vigenciaFim && coupon.vigenciaFim <= now && !grant.expiracaoData) return false;
					return true;
				})
				.map((grant) => ({
					codigo: grant.codigo ?? grant.cupom.codigo,
					titulo: grant.cupom.titulo,
					descricao: grant.cupom.descricao,
					beneficio: describeBenefit(grant.cupom),
					aplicacao: grant.cupom.beneficioAplicacao,
					condicoes: buildConditions(grant.cupom),
					validoAte: grant.expiracaoData ?? grant.cupom.vigenciaFim,
					quantidadeDisponivel: grant.quantidadeDisponivel,
					origem: "ATRIBUIDO_AO_CLIENTE" as const,
				})),
		].slice(0, limit);

		if (available.length === 0) {
			return {
				success: true,
				message: input.codigo
					? `Nenhum cupom válido encontrado com o código "${input.codigo}" para este cliente.`
					: "Nenhum cupom disponível para este cliente no momento.",
				result: { totalEncontrado: 0, cupons: [] },
			};
		}

		return {
			success: true,
			message: `${available.length} cupom(ns) disponível(is) para este cliente.`,
			result: { totalEncontrado: available.length, cupons: available },
		};
	},
});
