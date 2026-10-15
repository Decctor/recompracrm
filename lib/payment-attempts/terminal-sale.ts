import { hashAccessSecret } from "@/lib/access/tokens";
import { runPoiTransactionWithIdempotency } from "@/lib/point-of-interaction/idempotency";
import { type TSaleActor, finishSaleCreation, persistSaleCreation, prepareSaleCreation } from "@/lib/sales/create-and-confirm-sale";
import type { TCreateAndConfirmSaleInput } from "@/schemas/sale-checkout";
import { clients, organizations, sellers } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { PaymentTerminalError } from "./errors";
import { authorizeSaleDiscount } from "@/lib/sales/sale-discount-authorization";
import { buildTerminalCartItems, loadTerminalClientBenefits } from "./terminal-benefits";
import { requireTerminalSaleAddress, resolveTerminalDeliveryFee } from "./terminal-delivery";
import { resolveTerminalDiscount } from "./terminal-discount-policy";
import { type TTerminalBenefitsRequest, decideTerminalBenefits } from "./terminal-benefits-policy";
import { type TTerminalSaleItemInput, roundCents } from "./terminal-cart-item";
import {
	type TResolvedTerminalPayments,
	type TTerminalPaymentInput,
	listTerminalPaymentMethods,
	resolveTerminalSalePayments,
} from "./terminal-payments";
import { buildDeviceChargesForAttempts, buildPaymentAttemptSaleView } from "./views";

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
//   mesma venda;
// - benefícios (cupom AUTOMATICA, cashback, recompensas) são decididos aqui contra o carrinho já
//   precificado (terminal-benefits-policy.ts) e entram no pipeline como no PDV web; o que o cliente
//   paga é o total depois deles, e uma venda quitada pelos benefícios não leva pagamento;
// - desconto manual segue o teto do vendedor (sem vendedor com membership, zero): acima dele a
//   venda exige uma aprovação pedida por ESTE terminal (terminal-discount-approvals.ts), e a
//   recusa sai como DISCOUNT_APPROVAL_REQUIRED para o app pedir ao gestor;
// - modalidade de entrega como no checkout web: ENTREGA exige cliente, leva um endereço dele e a
//   taxa da loja (acréscimo marcado em `rascunhoMetadados.taxaEntrega`, que o fiscal destaca), e
//   dinheiro/Pix passam a "receber na entrega" por padrão; COMANDA leva o número.

export type { TTerminalSaleItemInput };

export type TCreateTerminalSaleInput = {
	sale: {
		clienteId?: string | null;
		vendedorId?: string | null;
		sessaoVendaId?: string | null;
		observacoes?: string | null;
		/** PRESENCIAL (padrão), RETIRADA, ENTREGA (cliente + endereço + taxa da loja) ou COMANDA (número). */
		entregaModalidade?: "PRESENCIAL" | "RETIRADA" | "ENTREGA" | "COMANDA" | null;
		entregaLocalizacaoId?: string | null;
		comandaNumero?: string | null;
		/** Desconto geral da venda, em reais. Acima do teto do vendedor exige `descontoAprovacaoId`. */
		descontosTotal?: number | null;
		descontoAprovacaoId?: string | null;
		itens: TTerminalSaleItemInput[];
	};
	benefits?: TTerminalBenefitsRequest | null;
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
	const hasRewards = (input.benefits?.recompensas?.length ?? 0) > 0;
	if (input.sale.itens.length === 0 && !hasRewards) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "Adicione pelo menos um item à venda.");

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
			const itens = await buildTerminalCartItems({ organizationId, itens: input.sale.itens });
			const itemsTotal = roundCents(itens.reduce((sum, item) => sum + item.valorTotalLiquido, 0));
			if (itens.length > 0 && itemsTotal <= 0) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "A venda precisa ter valor maior que zero.");

			const client = input.sale.clienteId
				? await tx.query.clients.findFirst({
						where: and(eq(clients.id, input.sale.clienteId), eq(clients.organizacaoId, organizationId)),
						columns: { id: true, nome: true },
					})
				: null;
			if (input.sale.clienteId && !client) throw new PaymentTerminalError(404, "NOT_FOUND", "Cliente não encontrado nesta organização.");
			const seller = input.sale.vendedorId
				? await tx.query.sellers.findFirst({
						where: and(eq(sellers.id, input.sale.vendedorId), eq(sellers.organizacaoId, organizationId)),
						columns: { id: true, nome: true },
					})
				: null;

			// Modalidade de entrega: mesmas exigências do checkout web.
			const entregaModalidade = input.sale.entregaModalidade ?? "PRESENCIAL";
			if (entregaModalidade === "ENTREGA" && !client) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "Entrega exige um cliente identificado.");
			if (entregaModalidade === "ENTREGA" && !input.sale.entregaLocalizacaoId)
				throw new PaymentTerminalError(422, "VALIDATION_ERROR", "Escolha o endereço de entrega.");
			const entregaLocalizacaoId =
				entregaModalidade === "ENTREGA" && client && input.sale.entregaLocalizacaoId
					? await requireTerminalSaleAddress({ organizationId, clienteId: client.id, entregaLocalizacaoId: input.sale.entregaLocalizacaoId })
					: null;
			const comandaNumero = entregaModalidade === "COMANDA" ? input.sale.comandaNumero?.trim() || null : null;
			if (entregaModalidade === "COMANDA" && !comandaNumero) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "Informe o número da comanda.");
			const taxaEntrega = await resolveTerminalDeliveryFee({ organizationId, entregaModalidade, subtotalItens: itemsTotal });

			// Desconto manual antes dos benefícios (mesma ordem do checkout web). Conferido aqui para a
			// recusa sair com código próprio; o pipeline confere de novo e consome a aprovação.
			const vendedorId = seller?.id ?? input.sale.vendedorId ?? null;
			const descontosTotal = resolveTerminalDiscount({ descontosTotal: input.sale.descontosTotal, itemsTotal });
			const descontoAprovacaoId = input.sale.descontoAprovacaoId ?? null;
			if (descontosTotal > 0) {
				await authorizeSaleDiscount({
					orgId: organizationId,
					session: null,
					deviceId,
					vendedorId,
					valorBase: roundCents(itens.reduce((sum, item) => sum + item.valorTotalBruto, 0)),
					descontoTotal: descontosTotal,
					aprovacaoId: descontoAprovacaoId,
				}).catch((error: unknown) => {
					if (createHttpError.isHttpError(error) && error.statusCode === 403) {
						throw new PaymentTerminalError(403, "DISCOUNT_APPROVAL_REQUIRED", error.message);
					}
					throw error;
				});
			}

			// Benefícios contra o carrinho precificado: o desconto do cupom é o do motor, o cashback
			// respeita o teto do programa sobre o que sobra depois do cupom.
			const wantsBenefits = !!input.benefits?.cupomId || (input.benefits?.cashbackResgate ?? 0) > 0 || hasRewards;
			const benefits = wantsBenefits && client ? await loadTerminalClientBenefits({ organizationId, clienteId: client.id, itens }) : null;
			const decision = decideTerminalBenefits({
				itemsTotal: roundCents(itemsTotal - descontosTotal),
				hasClient: Boolean(client),
				request: input.benefits,
				coupons: benefits?.cupons ?? [],
				cashback: benefits?.cashback ?? null,
			});
			// A taxa de entrega soma depois dos descontos (acréscimo da venda, como no checkout web).
			const saleTotal = roundCents(decision.total + taxaEntrega);

			// Quitada pelos benefícios (total zero): não há o que cobrar.
			if (saleTotal <= 0 && input.payments.length > 0) {
				throw new PaymentTerminalError(422, "VALIDATION_ERROR", "Os benefícios já quitam a venda: registre sem pagamento.");
			}
			// Mesmo split do checkout: o terminal manda o que o cliente entregou, o excesso em dinheiro
			// vira troco e a perna de cartão (se houver) é atribuída a este dispositivo.
			const resolvedPayments: TResolvedTerminalPayments =
				saleTotal <= 0
					? { splits: [], troco: 0, terminal: false }
					: resolveTerminalSalePayments({
							payments: input.payments,
							saleTotal,
							deviceId,
							hasClient: Boolean(client),
							methods: listTerminalPaymentMethods(organization.configuracao),
							entregaModalidade,
						});

			const saleInput: TCreateAndConfirmSaleInput = {
				clienteId: client?.id ?? null,
				vendedorId,
				vendedorNome: seller?.nome ?? null,
				entregaModalidade,
				entregaLocalizacaoId,
				comandaNumero,
				acrescimosTotal: taxaEntrega > 0 ? taxaEntrega : null,
				rascunhoMetadados: taxaEntrega > 0 ? { taxaEntrega } : null,
				observacoes: input.sale.observacoes ?? null,
				descontosTotal: descontosTotal > 0 ? descontosTotal : null,
				descontoAprovacaoId: descontosTotal > 0 ? descontoAprovacaoId : null,
				pagamentos: resolvedPayments.splits.map(({ id: _id, ...split }) => split),
				cashbackResgate: decision.cashbackResgate,
				cashbackProgramaId: decision.cashbackProgramaId,
				cupomResgate: decision.cupom
					? { cupomId: decision.cupom.id, valorDesconto: decision.cupomDesconto, codigo: decision.cupom.codigo, titulo: decision.cupom.titulo }
					: null,
				recompensasResgate: decision.recompensas.length > 0 ? decision.recompensas : null,
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
			// Uma cobrança por perna em cartão, na ordem das pernas; `charge` (a primeira) fica para
			// versões do app que só executam uma.
			const charges = await buildDeviceChargesForAttempts({
				organizationId,
				deviceId,
				attemptIds: confirmation.tentativasPagamento.map((attempt) => attempt.id),
				database: tx,
			});
			if (resolvedPayments.terminal && charges.length === 0) throw new createHttpError.InternalServerError("A tentativa de pagamento não foi criada.");
			const charge = charges[0] ?? null;
			const sale = buildPaymentAttemptSaleView({
				id: saleId,
				idExterno: "",
				valorTotal: prepared.valorTotal,
				statusVenda: "CONFIRMADA",
				cliente: client ? { nome: client.nome } : null,
			});
			const result = {
				data: {
					charge,
					charges,
					saleId,
					venda: {
						...sale,
						troco: confirmation.troco,
						entregaModalidade,
						taxaEntrega,
						descontoManual: descontosTotal,
						descontoCupom: decision.cupomDesconto,
						cashbackResgatado: decision.cashbackResgate,
						cashbackAcumulado: confirmation.cashbackAcumulo?.accumulatedValue ?? 0,
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
