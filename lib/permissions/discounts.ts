import type { TDiscountLimitTypeEnum } from "@/schemas/enums";
import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Autoridade de desconto de um membro com a semântica de ausência já resolvida.
 * Funções puras usadas de forma idêntica no client (feedback imediato no PDV) e no server
 * (enforcement autoritativo nas rotas de venda) — espelho do padrão `resolveSaleFiscalEmissionOverride`.
 */
export type TDiscountAuthority = {
	aplicar: boolean;
	limiteTipo: TDiscountLimitTypeEnum | null;
	limiteValor: number | null;
	aprovar: boolean;
};

export type TDiscountEvaluation = "PERMITIDO" | "REQUER_APROVACAO";

/**
 * Autoridade de quem vende sem sessão humana (a maquininha, como dispositivo): nenhum desconto é
 * liberado pela identidade, e qualquer desconto exige aprovação de um gestor — a menos que o
 * vendedor escolhido tenha membership com teto próprio.
 */
export const DEVICE_DISCOUNT_AUTHORITY: TDiscountAuthority = { aplicar: false, limiteTipo: null, limiteValor: null, aprovar: false };

// Mesma tolerância de centavos do recálculo de venda (não importada para manter o módulo puro/client-safe).
const DISCOUNT_CENT_TOLERANCE = 0.01;

/**
 * Resolve a autoridade de desconto a partir do jsonb de permissões da membership.
 * `descontos` ausente/null = comportamento legado: desconto liberado sem teto e aprovação
 * caindo para `empresa.editar` (mesmo padrão retrocompatível da chave `integracoes`).
 */
export function resolveDiscountAuthority(permissoes: TOrganizationMemberPermissions | null | undefined): TDiscountAuthority {
	const descontos = permissoes?.vendas?.descontos;
	if (!descontos) {
		return {
			aplicar: true,
			limiteTipo: null,
			limiteValor: null,
			aprovar: permissoes?.empresa.editar ?? false,
		};
	}
	return {
		aplicar: descontos.aplicar,
		limiteTipo: descontos.limiteTipo,
		limiteValor: descontos.limiteValor,
		aprovar: descontos.aprovar,
	};
}

/**
 * Teto efetivo (em valor absoluto) para o desconto agregado da venda.
 * - `aplicar: false` ⇒ teto zero (qualquer desconto exige aprovação);
 * - `limiteTipo`/`limiteValor` nulos ⇒ sem teto (retorna null);
 * - `PERCENTUAL` ⇒ teto = valorBase × limiteValor / 100; `FIXO` ⇒ teto = limiteValor.
 */
export function getDiscountCeiling({ authority, valorBase }: { authority: TDiscountAuthority; valorBase: number }): number | null {
	if (!authority.aplicar) return 0;
	if (!authority.limiteTipo || authority.limiteValor === null) return null;
	if (authority.limiteTipo === "PERCENTUAL") return Math.max(0, (valorBase * authority.limiteValor) / 100);
	return Math.max(0, authority.limiteValor);
}

/**
 * Avalia o desconto agregado da venda contra o teto do membro.
 * `valorBase` = Σ bruto dos itens; `descontoTotal` = desconto geral + Σ descontos de itens +
 * cupom MANUAL (cashback e cupom AUTOMATICA ficam fora — têm regras próprias validadas pelo motor).
 */
export function evaluateDiscount({
	authority,
	valorBase,
	descontoTotal,
}: {
	authority: TDiscountAuthority;
	valorBase: number;
	descontoTotal: number;
}): TDiscountEvaluation {
	if (descontoTotal <= DISCOUNT_CENT_TOLERANCE) return "PERMITIDO";
	const ceiling = getDiscountCeiling({ authority, valorBase });
	if (ceiling === null) return "PERMITIDO";
	return descontoTotal <= ceiling + DISCOUNT_CENT_TOLERANCE ? "PERMITIDO" : "REQUER_APROVACAO";
}
