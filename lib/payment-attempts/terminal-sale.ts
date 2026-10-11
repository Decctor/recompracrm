import { hashAccessSecret } from "@/lib/access/tokens";
import { runPoiTransactionWithIdempotency } from "@/lib/point-of-interaction/idempotency";
import { hydratePOSProducts } from "@/lib/pos/hydrate-pos-products";
import { type TSaleActor, finishSaleCreation, persistSaleCreation, prepareSaleCreation } from "@/lib/sales/create-and-confirm-sale";
import type { TCreateAndConfirmSaleInput } from "@/schemas/sale-checkout";
import { clients, organizations, sellers } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { PaymentTerminalError } from "./errors";
import { type TTerminalSaleItemInput, buildTerminalCartItem, roundCents } from "./terminal-cart-item";
import { type TTerminalPaymentInput, listTerminalPaymentMethods, resolveTerminalSalePayments } from "./terminal-payments";
import { buildChargeView, buildPaymentAttemptSaleView, findPaymentAttemptForDevice } from "./views";

// Fluxo A (recompracrm-pos-android/docs/01): a venda nasce no terminal e segue o MESMO pipeline do
// PDV web (lib/sales/create-and-confirm-sale.ts), com a maquininha como ator dispositivo. O que
// fica aqui é só o que é do terminal:
//
// - o terminal manda referência, quantidade, adicionais escolhidos e observação; o item é montado
//   pelo servidor sobre a projeção do canal PDV (`resolveCatalogOrderItem`: preço do nó, regras de
//   grupo, preço das opções) — nunca com valores do aparelho;
// - os pagamentos seguem o recorte do terminal (lib/payment-attempts/terminal-payments.ts): dinheiro
//   com troco, Pix e fiado registram a venda na hora; a perna de cartão vira a tentativa atribuída a
//   este dispositivo, criada na mesma transação;
// - tudo roda na transação idempotente do dispositivo (Idempotency-Key): repetir o pedido devolve a
//   mesma venda.

export type { TTerminalSaleItemInput };

export type TCreateTerminalSaleInput = {
	sale: {
		clienteId?: string | null;
		vendedorId?: string | null;
		sessaoVendaId?: string | null;
		observacoes?: string | null;
		itens: TTerminalSaleItemInput[];
	};
	payments: TTerminalPaymentInput[];
};

export type TCreateTerminalSaleParams = {
	organizationId: string;
	deviceId: string;
	deviceName: string;
	idempotencyKey: string;
	input: TCreateTerminalSaleInput;
};

export async function createTerminalSale({ organizationId, deviceId, deviceName, idempotencyKey, input }: TCreateTerminalSaleParams) {
	if (input.sale.itens.length === 0) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "Adicione pelo menos um item à venda.");
	if (input.payments.length === 0) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "Informe pelo menos um pagamento.");

	const fingerprint = hashAccessSecret(JSON.stringify({ deviceId, input }));
	const actor: TSaleActor = { kind: "DEVICE", organizationId, deviceId, deviceName };

	return runPoiTransactionWithIdempotency({
		organizacaoId: organizationId,
		principalId: deviceId,
		idempotencyKey,
		payload: { deviceId, input },
		execute: async (tx) => {
			const organization = await tx.query.organizations.findFirst({ where: eq(organizations.id, organizationId), columns: { configuracao: true } });
			if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

			// Itens pelo catálogo do canal PDV: o terminal manda referência, quantidade e escolhas.
			const productIds = [...new Set(input.sale.itens.map((item) => item.produtoId))];
			const catalog = new Map((await hydratePOSProducts({ orgId: organizationId, productIds })).map((product) => [product.id, product]));
			const itens = input.sale.itens.map((item) => buildTerminalCartItem(catalog.get(item.produtoId), item));
			const saleTotal = roundCents(itens.reduce((sum, item) => sum + item.valorTotalLiquido, 0));
			if (saleTotal <= 0) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "A venda precisa ter valor maior que zero.");

			const client = input.sale.clienteId
				? await tx.query.clients.findFirst({ where: and(eq(clients.id, input.sale.clienteId), eq(clients.organizacaoId, organizationId)), columns: { id: true, nome: true } })
				: null;
			if (input.sale.clienteId && !client) throw new PaymentTerminalError(404, "NOT_FOUND", "Cliente não encontrado nesta organização.");
			const seller = input.sale.vendedorId
				? await tx.query.sellers.findFirst({ where: and(eq(sellers.id, input.sale.vendedorId), eq(sellers.organizacaoId, organizationId)), columns: { id: true, nome: true } })
				: null;

			// Mesmo split do checkout: o terminal manda o que o cliente entregou, o excesso em dinheiro
			// vira troco e a perna de cartão (se houver) é atribuída a este dispositivo.
			const resolvedPayments = resolveTerminalSalePayments({
				payments: input.payments,
				saleTotal,
				deviceId,
				hasClient: Boolean(client),
				methods: listTerminalPaymentMethods(organization.configuracao),
			});

			const saleInput: TCreateAndConfirmSaleInput = {
				clienteId: client?.id ?? null,
				vendedorId: seller?.id ?? input.sale.vendedorId ?? null,
				vendedorNome: seller?.nome ?? null,
				entregaModalidade: "PRESENCIAL",
				observacoes: input.sale.observacoes ?? null,
				pagamentos: resolvedPayments.splits.map(({ id: _id, ...split }) => split),
				cashbackResgate: 0,
				sessaoVendaId: input.sale.sessaoVendaId ?? null,
				itens,
			};

			const prepared = await prepareSaleCreation({ actor, input: saleInput });
			const { saleId, confirmation } = await persistSaleCreation({
				tx,
				actor,
				prepared,
				terminalAttempt: resolvedPayments.terminal ? { chaveIdempotencia: idempotencyKey, fingerprintEntrada: fingerprint, origem: "DISPOSITIVO" } : null,
			});

			// Com cartão, a cobrança volta para o app executar; sem cartão, a venda já está registrada
			// e o app só mostra o resultado (e o troco).
			let charge: ReturnType<typeof buildChargeView> | null = null;
			if (resolvedPayments.terminal) {
				const attemptId = confirmation.tentativaPagamento?.id;
				if (!attemptId) throw new createHttpError.InternalServerError("A tentativa de pagamento da venda não foi criada.");
				charge = buildChargeView(await findPaymentAttemptForDevice({ organizationId, deviceId, attemptId, database: tx }));
			}
			const sale = buildPaymentAttemptSaleView({ id: saleId, idExterno: "", valorTotal: prepared.valorTotal, statusVenda: "CONFIRMADA", cliente: client ? { nome: client.nome } : null });
			const result = {
				data: {
					charge,
					saleId,
					venda: {
						...sale,
						troco: confirmation.troco,
						pagamentos: resolvedPayments.splits.map((split) => ({
							metodo: split.metodo,
							valor: split.valor,
							totalParcelas: split.totalParcelas ?? 1,
							efetivacaoTipo: split.efetivacaoTipo,
							dataPrevisao: split.dataPrevisao ?? null,
						})),
					},
				},
				message: charge ? "Venda criada. Execute a cobrança no terminal." : "Venda registrada.",
			};
			return {
				result,
				afterCommit: () => finishSaleCreation({ actor, prepared, saleId }).then(() => undefined),
			};
		},
	});
}
export type TCreateTerminalSaleOutput = Awaited<ReturnType<typeof createTerminalSale>>;
