import { hashAccessSecret } from "@/lib/access/tokens";
import { runPoiTransactionWithIdempotency } from "@/lib/point-of-interaction/idempotency";
import { computeSaleAggregatedDiscount, authorizeSaleDiscount } from "@/lib/sales/sale-discount-authorization";
import { resolveActiveSalesSession, validateSalesSessionSeller } from "@/lib/sales-sessions";
import {
	closeTabInTransaction,
	finishTabClose,
	launchTabOrder,
	openTab,
	prepareTabClose,
	prepareTabPayment,
	processTabOrderLaunchPostCommit,
	receiveTabPaymentInTransaction,
	resolveServiceSettings,
} from "@/lib/tabs";
import { TAB_CLOSE_BLOCKING_ORDER_STATUSES } from "@/lib/tabs/close-blocking";
import { resolveTabBalance, resolveTabPartialPaymentCap, sumActiveTabPayments } from "@/lib/tabs/partial-payments";
import { describeTabForTitle, sumTabActivePayments } from "@/lib/tabs/utils";
import { tabUsesCode } from "@/schemas/service-settings";
import { db } from "@/services/drizzle";
import { organizations, sales, tabs } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { PaymentTerminalError } from "./errors";
import { buildTerminalCartItems } from "./terminal-benefits";
import type { TTerminalSaleItemInput } from "./terminal-cart-item";
import { roundCents } from "./terminal-cart-item";
import { resolveTerminalDiscount } from "./terminal-discount-policy";
import { type TTerminalPaymentInput, listTerminalPaymentMethods, resolveTerminalSalePayments } from "./terminal-payments";
import { buildChargeView, buildPaymentAttemptSaleView, findPaymentAttemptForDevice } from "./views";

// Contas de atendimento (mesas e comandas) na maquininha. O domínio é o de `lib/tabs` — abrir,
// lançar pedido, receber parcial, fechar —, com o terminal como ator dispositivo (sem usuário):
//
// - pedidos são montados pelo servidor sobre o catálogo do canal COMANDA (preço, adicionais e
//   regras de grupo), como na aprovação de pedidos do QR, e são idempotentes pelo `tabOrderId`
//   gerado no aparelho; o ticket de preparo sai como no painel;
// - parcial e fechamento rodam na transação idempotente do dispositivo (Idempotency-Key): repetir
//   o pedido devolve o mesmo resultado em vez de receber duas vezes;
// - parcial no terminal é dinheiro ou Pix (o cartão só passa na maquininha no fechamento, como
//   perna única e exata do restante, atribuída a este dispositivo);
// - desconto no fechamento segue o teto do vendedor da conta, com a aprovação remota pedida por
//   este terminal (DISCOUNT_APPROVAL_REQUIRED sem ela).

const TERMINAL_TAB_PARTIAL_METHODS = new Set(["DINHEIRO", "PIX"]);

type TTabListRow = {
	id: string;
	codigo: string | null;
	dataAbertura: Date;
	clienteId: string | null;
	servicePoint: { id: string; rotulo: string; grupo: string | null; tipo: string } | null;
	cliente: { id: string; nome: string } | null;
	responsavelVendedor: { id: string; nome: string } | null;
	pedidos: { status: string | null }[];
};

function buildTerminalTabView(
	tab: TTabListRow,
	totals: { consumo: number; pago: number; vendaRascunhoId: string | null; vendedorId: string | null },
) {
	return {
		id: tab.id,
		rotulo: describeTabForTitle(tab),
		codigo: tab.codigo,
		ponto: tab.servicePoint ? { id: tab.servicePoint.id, rotulo: tab.servicePoint.rotulo, grupo: tab.servicePoint.grupo } : null,
		cliente: tab.cliente ? { id: tab.cliente.id, nome: tab.cliente.nome } : null,
		vendedor: tab.responsavelVendedor,
		// Vendedor da venda rascunho: é quem o teto de desconto do fechamento avalia.
		vendedorVendaId: totals.vendedorId,
		dataAbertura: tab.dataAbertura,
		pedidos: tab.pedidos.length,
		pedidosEmAndamento: tab.pedidos.filter((order) => (TAB_CLOSE_BLOCKING_ORDER_STATUSES as readonly string[]).includes(order.status ?? "")).length,
		consumo: roundCents(totals.consumo),
		pago: roundCents(totals.pago),
		restante: resolveTabPartialPaymentCap({ consumo: totals.consumo, jaPago: totals.pago }),
	};
}
export type TTerminalTabView = ReturnType<typeof buildTerminalTabView>;

const TAB_WITH = {
	servicePoint: { columns: { id: true, rotulo: true, grupo: true, tipo: true } },
	cliente: { columns: { id: true, nome: true } },
	responsavelVendedor: { columns: { id: true, nome: true } },
} as const;

/** Configuração de atendimento, pontos ativos e contas abertas — a tela "Contas" do terminal. */
export async function loadTerminalTabsOverview({ organizationId }: { organizationId: string }) {
	const settings = await resolveServiceSettings({ orgId: organizationId });
	const configuracao = {
		habilitadas: settings.contas.habilitadas,
		identificacao: settings.contas.identificacao,
		pontoObrigatorio: settings.contas.pontoObrigatorio,
		usaCodigo: tabUsesCode(settings.contas),
		pontosHabilitados: settings.pontos.habilitados,
	};
	if (!settings.contas.habilitadas) return { configuracao, pontos: [], contas: [] };

	const [points, rows] = await Promise.all([
		db.query.servicePoints.findMany({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizationId), eq(fields.ativo, true)),
			columns: { id: true, rotulo: true, grupo: true, tipo: true, capacidade: true },
			orderBy: (fields, { asc }) => [asc(fields.grupo), asc(fields.rotulo)],
		}),
		db.query.tabs.findMany({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizationId), eq(fields.status, "ABERTA")),
			with: {
				...TAB_WITH,
				pedidos: { columns: { status: true } },
				vendas: { where: (fields, { eq }) => eq(fields.statusVenda, "ORCAMENTO"), columns: { id: true, valorTotal: true, vendedorId: true } },
				pagamentosParciais: { where: (fields, { eq }) => eq(fields.status, "ATIVO"), columns: { valor: true, status: true } },
			},
			orderBy: (fields, { asc }) => asc(fields.dataAbertura),
		}),
	]);
	const contas = rows.map((tab) =>
		buildTerminalTabView(tab, {
			consumo: tab.vendas[0]?.valorTotal ?? 0,
			pago: sumActiveTabPayments(tab.pagamentosParciais),
			vendaRascunhoId: tab.vendas[0]?.id ?? null,
			vendedorId: tab.vendas[0]?.vendedorId ?? null,
		}),
	);
	// Ponto ocupado = tem conta aberta; o app mostra a mesa livre/ocupada na grade.
	const pontos = points.map((point) => ({ ...point, contasAbertas: contas.filter((conta) => conta.ponto?.id === point.id).length }));
	return { configuracao, pontos, contas };
}
export type TTerminalTabsOverview = Awaited<ReturnType<typeof loadTerminalTabsOverview>>;

/** Conta com os pedidos (itens e adicionais) e os recebimentos parciais. */
export async function getTerminalTabDetails({ organizationId, tabId }: { organizationId: string; tabId: string }) {
	const tab = await db.query.tabs.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, tabId), eq(fields.organizacaoId, organizationId)),
		with: {
			...TAB_WITH,
			pedidos: { orderBy: (fields, { asc }) => asc(fields.numero), with: { itens: { with: { adicionais: true } } } },
			pagamentosParciais: { orderBy: (fields, { asc }) => asc(fields.dataRecebimento) },
		},
	});
	if (!tab) throw new PaymentTerminalError(404, "NOT_FOUND", "Conta não encontrada.");
	const draftSale = await db.query.sales.findFirst({
		where: and(eq(sales.tabId, tab.id), eq(sales.statusVenda, "ORCAMENTO")),
		columns: { id: true, valorTotal: true, vendedorId: true },
	});
	const base = buildTerminalTabView(tab, {
		consumo: draftSale?.valorTotal ?? 0,
		pago: sumActiveTabPayments(tab.pagamentosParciais),
		vendaRascunhoId: draftSale?.id ?? null,
		vendedorId: draftSale?.vendedorId ?? null,
	});
	return {
		...base,
		status: tab.status,
		pedidosDetalhe: tab.pedidos.map((order) => ({
			id: order.id,
			numero: order.numero,
			status: order.status,
			dataEnvio: order.dataEnvio,
			observacoes: order.observacoes,
			itens: order.itens.map((item) => ({
				id: item.id,
				nome: ((item.metadados as { nome?: string } | null)?.nome ?? "Item").toString(),
				quantidade: item.quantidade,
				quantidadeCancelada: item.quantidadeCancelada,
				valorTotal: item.valorVendaTotalLiquido,
				observacoes: item.observacoes,
				adicionais: item.adicionais.map((modifier) => ({ nome: modifier.nome, quantidade: modifier.quantidade })),
			})),
		})),
		pagamentos: tab.pagamentosParciais.map((payment) => ({
			id: payment.id,
			metodo: payment.metodo,
			valor: payment.valor,
			status: payment.status,
			pagadorNome: payment.pagadorNome,
			dataRecebimento: payment.dataRecebimento,
		})),
	};
}
export type TTerminalTabDetails = Awaited<ReturnType<typeof getTerminalTabDetails>>;

export type TOpenTerminalTabInput = {
	servicePointId?: string | null;
	codigo?: string | null;
	clienteId?: string | null;
	responsavelVendedorId?: string | null;
	observacoes?: string | null;
};

/** Abre a conta (na mesa e/ou pelo número da comanda) com o terminal como quem abriu. */
export async function openTerminalTab({
	organizationId,
	deviceId,
	input,
}: {
	organizationId: string;
	deviceId: string;
	input: TOpenTerminalTabInput;
}) {
	const opened = await openTab({ orgId: organizationId, userId: null, input });
	if (opened.created) {
		// Quem abriu: a coluna é de usuário; o dispositivo fica nos metadados da conta.
		const metadados = { ...(opened.tab.metadados as Record<string, unknown> | null), abertaPorDispositivoId: deviceId };
		await db.update(tabs).set({ metadados }).where(eq(tabs.id, opened.tab.id));
	}
	return { created: opened.created, conta: await getTerminalTabDetails({ organizationId, tabId: opened.tab.id }) };
}

export type TLaunchTerminalTabOrderInput = {
	tabId: string;
	/** Gerado no aparelho por pedido: repetir com o mesmo id não lança de novo. */
	tabOrderId: string;
	observacoes?: string | null;
	itens: TTerminalSaleItemInput[];
};

/** Lança um pedido na conta: itens montados pelo servidor no canal COMANDA; ticket de preparo depois do commit. */
export async function launchTerminalTabOrder({ organizationId, input }: { organizationId: string; input: TLaunchTerminalTabOrderInput }) {
	if (input.itens.length === 0) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "Adicione itens ao pedido.");
	const itens = await buildTerminalCartItems({ organizationId, itens: input.itens, canal: "COMANDA" });
	const launched = await launchTabOrder({
		orgId: organizationId,
		userId: null,
		input: { tabId: input.tabId, tabOrderId: input.tabOrderId, observacoes: input.observacoes ?? null, itens },
	});
	if (!launched.deduplicated) await processTabOrderLaunchPostCommit({ orgId: organizationId, tabOrderId: launched.tabOrderId, userId: null });
	return {
		pedidoNumero: launched.tabOrderNumero,
		deduplicado: launched.deduplicated,
		conta: await getTerminalTabDetails({ organizationId, tabId: input.tabId }),
	};
}

async function loadOrganization(organizationId: string) {
	const organization = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) });
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");
	return organization;
}

/** Caixa do recebimento: obrigatório quando a organização exige; o vendedor da conta precisa caber nele. */
async function resolveTabSalesSession({
	organizationId,
	organization,
	tabId,
	sessaoVendaId,
}: {
	organizationId: string;
	organization: Awaited<ReturnType<typeof loadOrganization>>;
	tabId: string;
	sessaoVendaId: string | null | undefined;
}) {
	const sessaoObrigatoria = organization.configuracao.preferencias.sessoesVenda?.obrigatorio ?? false;
	if (sessaoObrigatoria && !sessaoVendaId)
		throw new PaymentTerminalError(422, "VALIDATION_ERROR", "Nenhum caixa aberto. Escolha o caixa para continuar.");
	if (!sessaoVendaId) return null;
	const activeSession = await resolveActiveSalesSession({ orgId: organizationId, sessaoVendaId });
	if (!activeSession) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "O caixa escolhido não está aberto.");
	const draftSale = await db.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.tabId, tabId), eq(fields.organizacaoId, organizationId), eq(fields.statusVenda, "ORCAMENTO")),
		columns: { vendedorId: true },
	});
	if (!draftSale) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "Conta sem consumo lançado.");
	validateSalesSessionSeller({ session: activeSession, vendedorId: draftSale.vendedorId });
	return activeSession.id;
}

export type TReceiveTerminalTabPaymentInput = {
	tabId: string;
	payment: { metodo: string; valor: number };
	pagadorNome?: string | null;
	sessaoVendaId?: string | null;
};

/** Recebimento parcial (dinheiro ou Pix), na transação idempotente do dispositivo. */
export async function receiveTerminalTabPayment({
	organizationId,
	deviceId,
	idempotencyKey,
	input,
}: {
	organizationId: string;
	deviceId: string;
	idempotencyKey: string;
	input: TReceiveTerminalTabPaymentInput;
}) {
	if (!TERMINAL_TAB_PARTIAL_METHODS.has(input.payment.metodo)) {
		throw new PaymentTerminalError(
			422,
			"UNSUPPORTED_PAYMENT_OPERATION",
			"Parcial no terminal é em dinheiro ou Pix. O cartão passa no fechamento da conta.",
		);
	}
	const organization = await loadOrganization(organizationId);
	const sessaoVendaId = await resolveTabSalesSession({ organizationId, organization, tabId: input.tabId, sessaoVendaId: input.sessaoVendaId });
	const tabInput = {
		tabId: input.tabId,
		payment: { metodo: input.payment.metodo as "DINHEIRO" | "PIX", valor: roundCents(input.payment.valor) },
		payerName: input.pagadorNome ?? null,
		sessaoVendaId,
	};
	const salePayment = await prepareTabPayment({ organization, input: tabInput });
	return runPoiTransactionWithIdempotency({
		organizacaoId: organizationId,
		principalId: deviceId,
		idempotencyKey,
		payload: { deviceId, operation: "TAB_PAYMENT", input },
		execute: async (tx) => {
			const received = await receiveTabPaymentInTransaction({ tx, organization, userId: null, input: tabInput, salePayment });
			return {
				result: {
					data: { pagamentoId: received.tabPayment.id, pago: received.valorPago, restante: received.valorRestante },
					message: "Recebimento registrado.",
				},
			};
		},
	});
}
export type TReceiveTerminalTabPaymentOutput = Awaited<ReturnType<typeof receiveTerminalTabPayment>>;

export type TCloseTerminalTabInput = {
	tabId: string;
	payments: TTerminalPaymentInput[];
	sessaoVendaId?: string | null;
	descontosTotal?: number | null;
	descontoAprovacaoId?: string | null;
	/** Entregar os pedidos ainda em preparo em vez de recusar o fechamento. */
	entregarPedidosEmAndamento?: boolean | null;
};

/**
 * Fecha a conta: o restante (consumo − desconto − parciais) pelo recorte de pagamentos do terminal.
 * Com cartão, devolve a cobrança atribuída a este dispositivo, como na venda nascida no terminal.
 */
export async function closeTerminalTab({
	organizationId,
	deviceId,
	idempotencyKey,
	input,
}: {
	organizationId: string;
	deviceId: string;
	idempotencyKey: string;
	input: TCloseTerminalTabInput;
}) {
	const organization = await loadOrganization(organizationId);
	const sessaoVendaId = await resolveTabSalesSession({ organizationId, organization, tabId: input.tabId, sessaoVendaId: input.sessaoVendaId });
	const fingerprint = hashAccessSecret(JSON.stringify({ deviceId, operation: "TAB_CLOSE", input }));

	return runPoiTransactionWithIdempotency({
		organizacaoId: organizationId,
		principalId: deviceId,
		idempotencyKey,
		payload: { deviceId, operation: "TAB_CLOSE", input },
		execute: async (tx) => {
			const [tab] = await tx
				.select({ id: tabs.id, status: tabs.status, clienteId: tabs.clienteId })
				.from(tabs)
				.where(and(eq(tabs.id, input.tabId), eq(tabs.organizacaoId, organizationId)));
			if (!tab) throw new PaymentTerminalError(404, "NOT_FOUND", "Conta não encontrada.");
			if (tab.status !== "ABERTA") throw new PaymentTerminalError(409, "CONFLICT", "A conta já não está aberta.");
			const draftSale = await tx.query.sales.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.tabId, tab.id), eq(fields.statusVenda, "ORCAMENTO")),
				columns: { id: true, valorTotal: true, vendedorId: true },
				with: { itens: { columns: { quantidade: true, quantidadeCancelada: true, valorVendaTotalBruto: true, valorTotalDesconto: true } } },
			});
			if (!draftSale) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "Conta sem consumo lançado: cancele a conta no RecompraCRM.");

			// Desconto do fechamento: teto do vendedor da conta, aprovação remota pedida por este terminal.
			const descontoGeral = resolveTerminalDiscount({ descontosTotal: input.descontosTotal, itemsTotal: draftSale.valorTotal });
			let descontoAprovacaoId: string | null = null;
			if (descontoGeral > 0) {
				const aggregated = computeSaleAggregatedDiscount({
					itens: draftSale.itens
						.filter((item) => item.quantidadeCancelada < item.quantidade)
						.map((item) => ({ valorTotalBruto: item.valorVendaTotalBruto, valorDesconto: item.valorTotalDesconto })),
					descontosGerais: descontoGeral,
				});
				descontoAprovacaoId = await authorizeSaleDiscount({
					orgId: organizationId,
					session: null,
					deviceId,
					vendedorId: draftSale.vendedorId,
					valorBase: aggregated.valorBase,
					descontoTotal: aggregated.descontoTotal,
					aprovacaoId: input.descontoAprovacaoId,
				}).catch((error: unknown) => {
					if (createHttpError.isHttpError(error) && error.statusCode === 403)
						throw new PaymentTerminalError(403, "DISCOUNT_APPROVAL_REQUIRED", error.message);
					throw error;
				});
			}

			const jaPago = await sumTabActivePayments(tx, { tabId: tab.id });
			const balance = resolveTabBalance({ consumo: draftSale.valorTotal, descontoGeral, jaPago });
			if (balance.bloqueio) throw new PaymentTerminalError(422, "VALIDATION_ERROR", balance.bloqueio);
			if (balance.restante <= 0 && input.payments.length > 0)
				throw new PaymentTerminalError(422, "VALIDATION_ERROR", "Os parciais já quitam a conta: feche sem pagamento.");
			const resolved =
				balance.restante <= 0
					? { splits: [], troco: 0, terminal: false }
					: resolveTerminalSalePayments({
							payments: input.payments,
							saleTotal: balance.restante,
							deviceId,
							hasClient: Boolean(tab.clienteId),
							methods: listTerminalPaymentMethods(organization.configuracao),
						});

			const closeInput = {
				tabId: tab.id,
				pagamentos: resolved.splits.map((split) => ({
					metodo: split.metodo,
					valor: split.valor,
					totalParcelas: split.totalParcelas ?? null,
					efetivacaoTipo: split.efetivacaoTipo,
					dataPrevisao: split.dataPrevisao ?? null,
					dispositivoId: split.dispositivoId ?? null,
				})),
				sessaoVendaId,
				descontoGeral: descontoGeral > 0 ? descontoGeral : null,
				descontoAprovacaoId,
				entregarPedidosEmAndamento: input.entregarPedidosEmAndamento ?? false,
			};
			const prepared = await prepareTabClose({ organization, input: closeInput });
			const { result, confirmationInput } = await closeTabInTransaction({
				tx,
				organization,
				userId: null,
				input: closeInput,
				prepared,
				deviceId,
				terminalAttempt: resolved.terminal ? { chaveIdempotencia: idempotencyKey, fingerprintEntrada: fingerprint, origem: "DISPOSITIVO" } : null,
			});

			let charge: ReturnType<typeof buildChargeView> | null = null;
			if (resolved.terminal) {
				const attemptId = result.confirmation.tentativaPagamento?.id;
				if (!attemptId) throw new createHttpError.InternalServerError("A tentativa de pagamento do fechamento não foi criada.");
				charge = buildChargeView(await findPaymentAttemptForDevice({ organizationId, deviceId, attemptId, database: tx }));
			}
			const sale = buildPaymentAttemptSaleView({
				id: result.saleId,
				idExterno: "",
				valorTotal: result.valorTotal,
				statusVenda: "CONFIRMADA",
				cliente: null,
			});
			return {
				result: {
					data: {
						charge,
						saleId: result.saleId,
						venda: {
							...sale,
							troco: result.confirmation.troco,
							descontoManual: descontoGeral,
							parcialRecebido: balance.jaPago,
							pagamentos: resolved.splits.map((split) => ({
								metodo: split.metodo,
								valor: split.valor,
								totalParcelas: split.totalParcelas ?? 1,
								efetivacaoTipo: split.efetivacaoTipo,
								dataPrevisao: split.dataPrevisao ?? null,
							})),
						},
					},
					message: charge ? "Conta fechada. Execute a cobrança no terminal." : "Conta fechada.",
				},
				afterCommit: () => finishTabClose(confirmationInput).then(() => undefined),
			};
		},
	});
}
export type TCloseTerminalTabOutput = Awaited<ReturnType<typeof closeTerminalTab>>;
