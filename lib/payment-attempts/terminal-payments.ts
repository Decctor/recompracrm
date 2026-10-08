import { getOrganizationPaymentMethodsConfig, getPaymentInstallmentsOptions } from "@/lib/payments/defaults";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments/labels";
import { type TCheckoutPaymentSplit, getDefaultCheckoutPaymentSplit, isCheckoutPaymentSplitValid, isPaymentTerminalMethod } from "@/lib/payments/schemas";
import { SALE_CHANGE_TOLERANCE, resolveSaleChange } from "@/lib/sales/sale-change";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import dayjs from "dayjs";
import { PaymentTerminalError } from "./errors";

/**
 * Pagamentos de uma venda nascida no terminal (Fluxo A, docs/04 §4 do RecompraCRM POS).
 *
 * O terminal manda `metodo` + `valor` (o que o cliente entregou) e, quando faz sentido, parcelas e
 * previsão; as regras são as do checkout web — mesmo split, mesmo troco ("bruto entra, troco sai",
 * lib/sales/sale-change.ts), mesma exigência de cliente no fiado. O que este módulo acrescenta é o
 * recorte do terminal: quais métodos ele oferece, qual deles a maquininha executa e o que ainda não
 * é combinável. Puro, sem banco: testável e compartilhável com a documentação.
 */

export const TERMINAL_SALE_METHODS = ["DINHEIRO", "PIX", "CARTAO_DEBITO", "CARTAO_CREDITO", "FIADO_NOTA"] as const satisfies readonly TPaymentMethodEnum[];
export type TTerminalSaleMethod = (typeof TERMINAL_SALE_METHODS)[number];

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

export type TTerminalPaymentMethodView = {
	metodo: TTerminalSaleMethod;
	rotulo: string;
	// Teto de parcelas (1 = sem parcelamento). Só crédito parcela.
	maxParcelas: number;
	// A maquininha executa (cartão): a venda fica pendente até a aprovação.
	executaNaMaquininha: boolean;
	// Fiado: o operador precisa identificar o cliente antes de cobrar.
	exigeCliente: boolean;
	// Dinheiro: o valor recebido pode exceder o total e o excesso vira troco.
	permiteTroco: boolean;
	// Como o pagamento entra no financeiro quando a venda é registrada.
	efetivacao: "IMEDIATA" | "PENDENTE";
	// Prazo padrão da organização para métodos pendentes (fiado), em dias.
	prazoPadraoDias: number;
};

/** Métodos que este terminal oferece: os do recorte acima que a organização marcou como suportados. */
export function listTerminalPaymentMethods(configuracao: Pick<TOrganizationConfiguration, "defaults"> | null | undefined): TTerminalPaymentMethodView[] {
	const methodsConfig = getOrganizationPaymentMethodsConfig(configuracao);
	return TERMINAL_SALE_METHODS.filter((metodo) => methodsConfig[metodo]?.suportado).map((metodo) => {
		const config = methodsConfig[metodo];
		const terminal = isPaymentTerminalMethod(metodo);
		return {
			metodo,
			rotulo: PAYMENT_METHOD_LABELS[metodo],
			maxParcelas: metodo === "CARTAO_CREDITO" ? Math.max(1, ...getPaymentInstallmentsOptions(config)) : 1,
			executaNaMaquininha: terminal,
			exigeCliente: metodo === "FIADO_NOTA",
			permiteTroco: metodo === "DINHEIRO",
			efetivacao: terminal || metodo === "FIADO_NOTA" ? "PENDENTE" : "IMEDIATA",
			prazoPadraoDias: Math.max(0, config?.delayDiasPadrao ?? 0),
		};
	});
}

export type TTerminalPaymentInput = {
	metodo: TPaymentMethodEnum;
	valor: number;
	totalParcelas?: number | null;
	// YYYY-MM-DD; só para métodos pendentes (fiado). Ausente = prazo padrão da organização.
	dataPrevisao?: string | null;
};

export type TResolvedTerminalPayments = {
	splits: TCheckoutPaymentSplit[];
	troco: number;
	// Há uma perna de cartão: a confirmação cria a tentativa atribuída a este dispositivo.
	terminal: boolean;
};

function round2(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function unsupported(message: string): never {
	throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", message);
}

function invalid(message: string): never {
	throw new PaymentTerminalError(422, "VALIDATION_ERROR", message);
}

/**
 * Valida e normaliza os pagamentos do terminal no formato do split do checkout.
 *
 * Regras deste marco: dinheiro, Pix e fiado combinam entre si e o excesso em dinheiro vira troco;
 * cartão ainda é uma perna única cobrindo exatamente o total (a tentativa cobre a venda inteira —
 * split misto com cartão é o próximo passo, lib/payment-attempts/assignment.ts).
 */
export function resolveTerminalSalePayments({
	payments,
	saleTotal,
	deviceId,
	hasClient,
	methods,
	today = dayjs().format("YYYY-MM-DD"),
}: {
	payments: TTerminalPaymentInput[];
	saleTotal: number;
	deviceId: string;
	hasClient: boolean;
	methods: TTerminalPaymentMethodView[];
	today?: string;
}): TResolvedTerminalPayments {
	if (payments.length === 0) invalid("Informe pelo menos um pagamento.");
	const byMethod = new Map(methods.map((method) => [method.metodo, method]));

	const splits = payments.map((payment) => {
		const method = byMethod.get(payment.metodo as TTerminalSaleMethod);
		if (!method) unsupported(`O método ${PAYMENT_METHOD_LABELS[payment.metodo] ?? payment.metodo} não está disponível neste terminal.`);
		if (!Number.isFinite(payment.valor) || payment.valor <= 0) invalid("Cada pagamento precisa ter valor maior que zero.");
		const valor = round2(payment.valor);

		const totalParcelas = payment.totalParcelas ?? 1;
		if (!Number.isInteger(totalParcelas) || totalParcelas < 1) unsupported("Parcelamento inválido.");
		if (totalParcelas > method.maxParcelas) {
			unsupported(method.maxParcelas === 1 ? `${method.rotulo} não admite parcelamento.` : `${method.rotulo} parcela em até ${method.maxParcelas}x nesta loja.`);
		}

		if (method.exigeCliente && !hasClient) unsupported("Fiado exige um cliente identificado: busque o cliente pelo telefone antes de cobrar.");

		let dataPrevisao = today;
		if (method.efetivacao === "PENDENTE" && !method.executaNaMaquininha) {
			if (payment.dataPrevisao != null) {
				if (!DATE_INPUT.test(payment.dataPrevisao) || !dayjs(payment.dataPrevisao).isValid()) invalid("Data de previsão inválida.");
				if (payment.dataPrevisao < today) invalid("A data de previsão não pode ficar no passado.");
				dataPrevisao = payment.dataPrevisao;
			} else dataPrevisao = dayjs(today).add(method.prazoPadraoDias, "day").format("YYYY-MM-DD");
		}

		return getDefaultCheckoutPaymentSplit({
			metodo: method.metodo,
			valor,
			totalParcelas: method.executaNaMaquininha ? totalParcelas : null,
			efetivacaoTipo: method.efetivacao,
			dataPrevisao,
			dispositivoId: method.executaNaMaquininha ? deviceId : null,
		});
	});

	// Cartão neste marco: perna única e exata. A tentativa atribuída cobre a venda inteira.
	const terminalLegs = splits.filter((split) => split.dispositivoId);
	if (terminalLegs.length > 0) {
		if (splits.length > 1) unsupported("Nesta versão o cartão não se combina com outros métodos: a cobrança na maquininha cobre o total da venda.");
		if (Math.abs(terminalLegs[0].valor - saleTotal) > SALE_CHANGE_TOLERANCE) unsupported("O pagamento em cartão precisa ser exatamente o total da venda.");
	}

	const change = resolveSaleChange({ payments: splits, saleTotal });
	if (change.totalPagamentos + SALE_CHANGE_TOLERANCE < saleTotal) invalid(`Os pagamentos somam menos que o total da venda. Falta ${formatMoney(round2(saleTotal - change.totalPagamentos))}.`);
	if (change.bloqueio) unsupported(change.bloqueio);
	if (change.troco > 0 && !change.cobertoPorDinheiro) unsupported("Troco só sai do dinheiro recebido: informe o valor exato nos demais métodos.");

	for (const split of splits) {
		if (!isCheckoutPaymentSplitValid(split, { hasLinkedClient: hasClient })) invalid(`Pagamento em ${PAYMENT_METHOD_LABELS[split.metodo]} inválido.`);
	}

	return { splits, troco: change.troco, terminal: terminalLegs.length > 0 };
}

function formatMoney(value: number) {
	return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
