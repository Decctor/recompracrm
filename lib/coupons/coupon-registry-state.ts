import type { TGetCouponsOutputById, TUpdateCouponInput } from "@/app/api/coupons/route";
import type { TUseInternalCouponState } from "@/state-hooks/use-internal-coupon-state";

type TCouponState = TUseInternalCouponState["state"];

/**
 * Estado do cadastro do cupom a partir do que o servidor devolveu.
 *
 * As datas voltam serializadas da API e os inputs de vigência esperam `Date` — a conversão mora
 * aqui para as seções não repetirem, cada uma à sua maneira, a mesma desserialização.
 */
export function mapCouponToState(coupon: TGetCouponsOutputById): TCouponState {
	return {
		coupon: {
			ativo: coupon.ativo,
			titulo: coupon.titulo,
			descricao: coupon.descricao,
			imagemCapaUrl: coupon.imagemCapaUrl,
			codigo: coupon.codigo,
			escopo: coupon.escopo,
			validacaoModo: coupon.validacaoModo,
			condicoesTexto: coupon.condicoesTexto,
			beneficioTipo: coupon.beneficioTipo,
			beneficioValor: coupon.beneficioValor,
			beneficioDescontoMaximo: coupon.beneficioDescontoMaximo,
			beneficioAplicacao: coupon.beneficioAplicacao,
			beneficioCompreQuantidade: coupon.beneficioCompreQuantidade,
			beneficioLeveQuantidade: coupon.beneficioLeveQuantidade,
			condicaoValorMinimoVenda: coupon.condicaoValorMinimoVenda,
			condicaoQuantidadeMinimaItens: coupon.condicaoQuantidadeMinimaItens,
			condicaoModalidadesEntrega: coupon.condicaoModalidadesEntrega ?? [],
			condicaoPrimeiraCompra: coupon.condicaoPrimeiraCompra,
			condicaoAlvosOperador: coupon.condicaoAlvosOperador,
			vigenciaInicio: coupon.vigenciaInicio ? new Date(coupon.vigenciaInicio) : null,
			vigenciaFim: coupon.vigenciaFim ? new Date(coupon.vigenciaFim) : null,
			limiteResgatesTotal: coupon.limiteResgatesTotal,
			limiteResgatesPorCliente: coupon.limiteResgatesPorCliente,
			acumulavel: coupon.acumulavel,
			resgatePermitirViaPos: coupon.resgatePermitirViaPos,
			resgatePermitirViaPontoInteracao: coupon.resgatePermitirViaPontoInteracao,
			resgatePermitirViaLojaDigital: coupon.resgatePermitirViaLojaDigital,
		},
		couponTargets: coupon.alvos.map((target) => ({
			id: target.id,
			papel: target.papel,
			produtoId: target.produtoId,
			produtoVarianteId: target.produtoVarianteId,
			grupo: target.grupo,
			quantidadeMinima: target.quantidadeMinima,
			produtoNome: target.produto?.nome ?? null,
			produtoVarianteNome: target.produtoVariante?.nome ?? null,
		})),
		couponAudiences: coupon.audiencias.map((audience) => ({
			id: audience.id,
			clienteTagId: audience.clienteTagId,
			segmentacaoRFM: audience.segmentacaoRFM,
			clienteTagTitulo: audience.clienteTag?.titulo ?? null,
		})),
	};
}

/**
 * Payload de uma seção do cadastro.
 *
 * A rota de atualização recebe o cupom inteiro, mas a tela edita por seção: os campos fora da seção
 * são reenviados do que o servidor devolveu — nunca do rascunho local — para que aplicar uma seção
 * jamais sobrescreva o rascunho aberto em outra. É a mesma regra do cadastro de produto.
 *
 * Alvos e audiências vão em todo payload, com seus ids: enviar lista vazia não apaga nada, mas a
 * validação de coerência da rota lê essas listas (um benefício em "itens elegíveis" exige alvo), e
 * omiti-las reprovaria o cupom por um estado que não é o dele.
 */
type TCouponSection = "general" | "benefit" | "validity" | "audience";

export function buildCouponSectionUpdateInput({
	coupon,
	state,
	section,
}: {
	coupon: TGetCouponsOutputById;
	state: TCouponState;
	section: TCouponSection;
}): TUpdateCouponInput {
	const server = mapCouponToState(coupon);
	const draft = state.coupon;
	const persisted = server.coupon;

	const couponPayload: TCouponState["coupon"] = {
		...persisted,
		...(section === "general"
			? {
					ativo: draft.ativo,
					titulo: draft.titulo,
					descricao: draft.descricao,
					codigo: draft.codigo,
					escopo: draft.escopo,
					validacaoModo: draft.validacaoModo,
					condicoesTexto: draft.condicoesTexto,
				}
			: {}),
		...(section === "benefit"
			? {
					beneficioTipo: draft.beneficioTipo,
					beneficioValor: draft.beneficioValor,
					beneficioDescontoMaximo: draft.beneficioDescontoMaximo,
					beneficioAplicacao: draft.beneficioAplicacao,
					beneficioCompreQuantidade: draft.beneficioCompreQuantidade,
					beneficioLeveQuantidade: draft.beneficioLeveQuantidade,
				}
			: {}),
		...(section === "validity"
			? {
					vigenciaInicio: draft.vigenciaInicio,
					vigenciaFim: draft.vigenciaFim,
					limiteResgatesTotal: draft.limiteResgatesTotal,
					limiteResgatesPorCliente: draft.limiteResgatesPorCliente,
					resgatePermitirViaPos: draft.resgatePermitirViaPos,
					resgatePermitirViaPontoInteracao: draft.resgatePermitirViaPontoInteracao,
					resgatePermitirViaLojaDigital: draft.resgatePermitirViaLojaDigital,
				}
			: {}),
		// As condições de carrinho (modalidade, primeira compra, valor/quantidade mínimos) moram com
		// os alvos porque é ali que o bloco de produtos as renderiza — separá-las daria dois
		// rascunhos concorrentes sobre os mesmos campos.
		...(section === "audience"
			? {
					condicaoValorMinimoVenda: draft.condicaoValorMinimoVenda,
					condicaoQuantidadeMinimaItens: draft.condicaoQuantidadeMinimaItens,
					condicaoAlvosOperador: draft.condicaoAlvosOperador,
					condicaoModalidadesEntrega: draft.condicaoModalidadesEntrega,
					condicaoPrimeiraCompra: draft.condicaoPrimeiraCompra,
				}
			: {}),
	};

	return {
		couponId: coupon.id,
		coupon: couponPayload,
		couponTargets: section === "audience" ? state.couponTargets : server.couponTargets,
		couponAudiences: section === "audience" ? state.couponAudiences : server.couponAudiences,
	};
}

/** Validações que cabe à tela barrar antes do envio, com a mensagem já no idioma do usuário. */
export function validateCouponSectionState({ state, section }: { state: TCouponState; section: TCouponSection }): string | null {
	const { coupon } = state;

	if (section === "general") {
		if (!coupon.titulo.trim()) return "O título do cupom não pode ser vazio.";
		if (!coupon.codigo.trim()) return "O código do cupom não pode ser vazio.";
		if (coupon.validacaoModo === "MANUAL" && !coupon.condicoesTexto?.trim()) {
			return "Cupons de validação manual exigem o texto de condições para orientar cliente e operador.";
		}
	}

	if (section === "benefit") {
		const needsValue = ["DESCONTO_FIXO", "DESCONTO_PERCENTUAL", "PRECO_FIXO"].includes(coupon.beneficioTipo);
		if (needsValue && (!coupon.beneficioValor || coupon.beneficioValor <= 0)) return "O valor do benefício do cupom deve ser maior que zero.";
		if (coupon.beneficioTipo === "DESCONTO_PERCENTUAL" && (coupon.beneficioValor ?? 0) > 100) {
			return "O desconto percentual do cupom não pode ser maior que 100%.";
		}
	}

	if (section === "validity") {
		if (coupon.vigenciaInicio && coupon.vigenciaFim && coupon.vigenciaInicio > coupon.vigenciaFim) {
			return "O início da vigência não pode ser posterior ao fim.";
		}
		if (coupon.limiteResgatesTotal != null && coupon.limiteResgatesTotal < 1) return "O limite total de resgates deve ser de pelo menos 1.";
		if (coupon.limiteResgatesPorCliente != null && coupon.limiteResgatesPorCliente < 1) return "O limite por cliente deve ser de pelo menos 1.";
		if (!coupon.resgatePermitirViaPos && !coupon.resgatePermitirViaPontoInteracao && !coupon.resgatePermitirViaLojaDigital) {
			return "O cupom precisa de pelo menos uma superfície de resgate habilitada.";
		}
	}

	return null;
}
