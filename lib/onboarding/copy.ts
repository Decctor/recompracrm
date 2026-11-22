import type { TOnboardingReadiness } from "./readiness";

/**
 * Textos que dependem do estado real. Centralizados para que nenhuma tela diga "Tudo pronto"
 * quando só o cadastro existe.
 */
export function getConclusionCopy(readiness: TOnboardingReadiness): { titulo: string; descricao: string } {
	const importing = readiness.fonteDados.integracoes.some((integration) => integration.status === "CONECTADO");
	if (readiness.cashback.estado === "ATIVO") {
		return {
			titulo: "Seu programa está preparado",
			descricao: importing
				? "O cashback já vale para as próximas compras. Enquanto o histórico chega, você pode liberar as campanhas e conhecer sua base."
				: "O cashback já vale para as próximas compras. Veja o que já funciona e qual é a próxima ação.",
		};
	}
	if (importing || readiness.fonteDados.definida) {
		return {
			titulo: "Sua base está chegando",
			descricao: "As vendas estão entrando. Cashback e campanhas ficam preparados para quando você quiser ativar.",
		};
	}
	return {
		titulo: "Sua conta está criada",
		descricao: "Você adiou as configurações. Elas continuam disponíveis no painel, na ordem que fizer sentido para você.",
	};
}

export function formatCashbackPreview(resumo: NonNullable<TOnboardingReadiness["cashback"]["resumo"]>): {
	principal: string;
	secundaria: string | null;
} {
	const base = 100;
	const credit = resumo.acumuloTipo === "PERCENTUAL" ? (base * resumo.acumuloValor) / 100 : resumo.acumuloValor;
	const creditLabel = credit.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
	const validity = resumo.validadeDias > 0 ? ` para usar em até ${resumo.validadeDias} dias` : "";
	const principal = `Uma compra de R$ 100 gera ${creditLabel}${validity}.`;
	const secundaria =
		resumo.limiteResgate !== null
			? resumo.limiteResgate.tipo === "PERCENTUAL"
				? `Até ${resumo.limiteResgate.valor}% do valor da próxima compra pode ser pago com o saldo.`
				: `Até ${resumo.limiteResgate.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} da próxima compra pode ser pago com o saldo.`
			: null;
	return { principal, secundaria };
}

export function formatCount(count: number, singular: string, plural: string) {
	return `${count.toLocaleString("pt-BR")} ${count === 1 ? singular : plural}`;
}
