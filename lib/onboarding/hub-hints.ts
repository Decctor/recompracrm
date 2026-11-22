import type { TActivation, TActivationMilestone } from "./activation";

/**
 * Estados vazios do hub que apontam para a ação que os preenche, decididos sem I/O.
 *
 * Um bloco vazio só ganha dica antes da ativação, quando o vazio é da loja que ainda não chegou lá
 * ("Nenhum cliente segmentado ainda" numa loja de balcão sem nenhuma venda). Depois de ativada, o
 * vazio é real e o texto de sempre vale. Cada dica cita só o que a ativação sabe; sem dado, null.
 */

export type THubEmptyHint = { texto: string; acao: { rotulo: string; href: string } | null };

export type THubEmptyHints = {
	/** Faixa de vendas, quando nenhuma venda entrou ainda. */
	vendas: THubEmptyHint | null;
	/** "Como a base se divide hoje", sem cliente segmentado. */
	segmentos: THubEmptyHint | null;
	/** "Campanhas em curso", sem mensagem entregue. */
	campanhas: THubEmptyHint | null;
};

const EMPTY: THubEmptyHints = { vendas: null, segmentos: null, campanhas: null };

function milestone(activation: TActivation, chave: string): TActivationMilestone | undefined {
	return activation.marcos.find((item) => item.chave === chave);
}

function actionOf(item: TActivationMilestone | undefined): THubEmptyHint["acao"] {
	return item?.acao?.href ? { rotulo: item.acao.rotulo, href: item.acao.href } : null;
}

function isPending(item: TActivationMilestone | undefined) {
	return !!item && item.estado !== "FEITO";
}

export function resolveHubEmptyHints(activation: TActivation | null | undefined): THubEmptyHints {
	if (!activation || activation.ativado) return EMPTY;

	const source = milestone(activation, "fonte");
	const base = milestone(activation, "base");
	const firstCounterSale = milestone(activation, "primeira-venda-balcao");
	const firstErpSale = milestone(activation, "primeira-venda-erp");
	const whatsapp = milestone(activation, "whatsapp");
	const firstDelivery = milestone(activation, "primeira-entrega");

	let vendas: THubEmptyHint | null = null;
	let segmentos: THubEmptyHint | null = null;
	if (activation.segmento === "SEM_FONTE" && isPending(source)) {
		vendas = { texto: "Defina de onde vêm as vendas para elas aparecerem aqui.", acao: actionOf(source) };
		segmentos = { texto: "Os clientes aparecem aqui a partir da primeira venda.", acao: actionOf(source) };
	} else if (isPending(firstCounterSale)) {
		vendas = { texto: "Registre a primeira no balcão: ela aparece aqui na hora.", acao: actionOf(firstCounterSale) };
		segmentos = { texto: "Os clientes aparecem aqui a partir da primeira venda no balcão.", acao: actionOf(firstCounterSale) };
	} else if (isPending(firstErpSale)) {
		vendas = { texto: "A primeira venda pelo sistema aparece aqui na hora.", acao: actionOf(firstErpSale) };
	} else if (base?.estado === "EM_ANDAMENTO") {
		vendas = { texto: "As vendas do seu sistema aparecem aqui assim que chegarem.", acao: null };
		segmentos = { texto: "Sua base está chegando. Os segmentos aparecem quando os clientes forem organizados.", acao: null };
	}

	let campanhas: THubEmptyHint | null = null;
	if (isPending(whatsapp)) {
		campanhas = { texto: "As campanhas saem pelo WhatsApp oficial, que ainda não está conectado.", acao: actionOf(whatsapp) };
	} else if (isPending(firstDelivery) && firstDelivery?.acao) {
		campanhas = { texto: firstDelivery.acao.descricao, acao: actionOf(firstDelivery) };
	}

	return { vendas, segmentos, campanhas };
}
