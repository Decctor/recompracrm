import { formatToMoney, formatToPhone } from "@/lib/formatting";
import { groupSaleItemModifiers } from "@/lib/sales/sale-item-modifier-groups";

/**
 * Resumo do pedido da loja digital no formato que a loja recebe pelo WhatsApp. O cliente envia
 * por conta própria (link wa.me), então o texto precisa se sustentar sozinho: quem atende lê só
 * a mensagem, sem abrir o sistema — por isso leva endereço completo e telefone do cliente.
 *
 * Valores de adicionais são por unidade do item, como gravados em `sale_item_modifiers`.
 */

const SEPARATOR = "------------------------------------";

const PAYMENT_LABELS: Record<string, string> = {
	DINHEIRO: "Dinheiro",
	PIX: "PIX",
	CARTAO_DEBITO: "Cartão de débito",
	CARTAO_CREDITO: "Cartão de crédito",
};

export function getShopPaymentLabel(method: string | null | undefined) {
	if (!method) return null;
	return PAYMENT_LABELS[method] ?? method;
}

export type TShopOrderWhatsappModifier = {
	nome: string;
	grupo: string | null;
	quantidade: number;
	valorUnitario: number;
	valorTotal: number;
};

export type TShopOrderWhatsappItem = {
	nome: string;
	quantidade: number;
	valorUnitarioBase: number;
	valorTotalBruto: number;
	observacoes: string | null;
	adicionais: TShopOrderWhatsappModifier[];
};

export type TShopOrderWhatsappAddress = {
	logradouro: string | null;
	numero: string | null;
	complemento: string | null;
	bairro: string | null;
	cidade: string | null;
	estado: string | null;
	cep: string | null;
};

export type TShopOrderWhatsappInput = {
	organizationName: string;
	orderNumber: string;
	client: { nome: string; telefone: string | null } | null;
	deliveryMode: "ENTREGA" | "RETIRADA" | string | null;
	address: TShopOrderWhatsappAddress | null;
	paymentMethod: string | null;
	items: TShopOrderWhatsappItem[];
	subtotal: number;
	coupon: { code: string | null; discount: number } | null;
	cashbackRedeemed: number;
	rewards: { title: string; value: number }[];
	otherDiscount: number;
	deliveryFee: number;
	estimatedMinutes: number | null;
	total: number;
	notes: string | null;
};

function formatCep(value: string) {
	const digits = value.replace(/[^0-9]/g, "");
	return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value;
}

export function formatShopOrderAddress(address: TShopOrderWhatsappAddress) {
	const street = [address.logradouro, address.numero].filter(Boolean).join(", ");
	const city = [address.cidade, address.estado].filter(Boolean).join("/");
	return [street, address.complemento, address.bairro, city, address.cep ? `CEP: ${formatCep(address.cep)}` : null]
		.map((part) => part?.trim())
		.filter(Boolean)
		.join(" - ");
}

function formatQuantity(value: number) {
	return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function buildItemLines(item: TShopOrderWhatsappItem, position: number) {
	const lines = [
		`*${position}. ${item.nome.toUpperCase()}*`,
		`   Qtd: ${formatQuantity(item.quantidade)}x`,
		`   Valor unit.: ${formatToMoney(item.valorUnitarioBase)}`,
	];

	for (const group of groupSaleItemModifiers(item.adicionais, (modifier) => modifier.grupo)) {
		lines.push(`   *${group.grupo ?? "Adicionais"}:*`);
		for (const modifier of group.adicionais) {
			const quantity = modifier.quantidade > 1 ? `${formatQuantity(modifier.quantidade)}x ` : "";
			lines.push(
				modifier.valorTotal > 0
					? `      + ${quantity}${modifier.nome} (${formatToMoney(modifier.valorTotal)})`
					: `      - ${quantity}${modifier.nome}`,
			);
		}
	}

	const modifiersTotal = item.adicionais.reduce((sum, modifier) => sum + modifier.valorTotal, 0);
	if (modifiersTotal > 0) lines.push(`   *Adicionais: +${formatToMoney(modifiersTotal)}*`);
	if (item.observacoes?.trim()) lines.push(`   *Obs:* ${item.observacoes.trim()}`);
	lines.push(`   *Subtotal: ${formatToMoney(item.valorTotalBruto)}*`);
	return lines;
}

export function buildShopOrderWhatsappMessage(input: TShopOrderWhatsappInput) {
	const isDelivery = input.deliveryMode === "ENTREGA";
	const lines: string[] = [`*NOVO PEDIDO - ${input.organizationName.trim().toUpperCase()}*`, `Código: *${input.orderNumber}*`, SEPARATOR, ""];

	if (input.client) {
		lines.push(`*Cliente:* ${input.client.nome}`);
		if (input.client.telefone) lines.push(`*Telefone:* ${formatToPhone(input.client.telefone)}`);
		lines.push("");
	}

	lines.push(`*Recebimento:* ${isDelivery ? "Entrega" : "Retirada no local"}`);
	if (isDelivery && input.address) {
		const address = formatShopOrderAddress(input.address);
		if (address) lines.push(`*Endereço:* ${address}`);
	}
	const payment = getShopPaymentLabel(input.paymentMethod);
	if (payment) lines.push(`*Pagamento:* ${payment}`);
	lines.push("", SEPARATOR, "*ITENS DO PEDIDO*", SEPARATOR, "");

	input.items.forEach((item, index) => {
		lines.push(...buildItemLines(item, index + 1), "");
	});

	lines.push(SEPARATOR, `Subtotal produtos: ${formatToMoney(input.subtotal)}`);
	if (input.coupon && input.coupon.discount > 0) {
		lines.push(`Cupom${input.coupon.code ? ` (${input.coupon.code})` : ""}: -${formatToMoney(input.coupon.discount)}`);
	}
	if (input.cashbackRedeemed > 0) lines.push(`Cashback: -${formatToMoney(input.cashbackRedeemed)}`);
	for (const reward of input.rewards) {
		if (reward.value > 0) lines.push(`Recompensa (${reward.title}): -${formatToMoney(reward.value)}`);
	}
	if (input.otherDiscount > 0) lines.push(`Descontos: -${formatToMoney(input.otherDiscount)}`);
	if (isDelivery) lines.push(`Taxa de entrega: ${input.deliveryFee > 0 ? formatToMoney(input.deliveryFee) : "Grátis"}`);
	if (input.estimatedMinutes) lines.push(`Prazo estimado: ${input.estimatedMinutes} minutos`);
	lines.push(`*TOTAL: ${formatToMoney(input.total)}*`, SEPARATOR);

	if (input.notes?.trim()) lines.push("", `*Observações:* ${input.notes.trim()}`);

	return lines.join("\n");
}

/** Link wa.me para o número da loja com o texto já preenchido. Sem número válido, não há link. */
export function buildWhatsappMessageUrl(phone: string | null | undefined, message: string) {
	const digits = phone?.replace(/[^0-9]/g, "") ?? "";
	if (digits.length < 10) return null;
	const internationalNumber = digits.length <= 11 ? `55${digits}` : digits;
	return `https://wa.me/${internationalNumber}?text=${encodeURIComponent(message)}`;
}
