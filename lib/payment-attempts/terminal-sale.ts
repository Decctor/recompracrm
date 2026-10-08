import { hashAccessSecret } from "@/lib/access/tokens";
import { resolvePaymentFinancialAccounts } from "@/lib/payments";
import { runPoiTransactionWithIdempotency } from "@/lib/point-of-interaction/idempotency";
import { channelNodePrice, loadChannelState } from "@/lib/products/sales-channels-store";
import { SaleItemResolutionError, resolveSaleItems } from "@/lib/sales/resolve-sale-items";
import { processSaleConfirmationInTransaction, processSaleConfirmationPostCommit } from "@/lib/sales/sale-processing";
import { resolveActiveSalesSession, validateSalesSessionSeller } from "@/lib/sales-sessions";
import { validateActiveSeller } from "@/lib/sellers/validate-active-seller";
import { clients, saleItems, sales, sellers } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { PaymentTerminalError } from "./errors";
import { type TTerminalPaymentInput, listTerminalPaymentMethods, resolveTerminalSalePayments } from "./terminal-payments";
import { buildChargeView, buildPaymentAttemptSaleView, findPaymentAttemptForDevice } from "./views";

// Fluxo A (recompracrm-pos-android/docs/01): a venda nasce no terminal. Preços vêm do catálogo do
// canal PDV (nunca do payload), sem desconto, cupom, cashback ou adicionais neste marco. Os
// pagamentos seguem as regras do checkout (lib/payment-attempts/terminal-payments.ts): dinheiro com
// troco, Pix e fiado registram a venda na hora; cartão confirma a venda com a transação pendente e
// a tentativa atribuída ao PRÓPRIO dispositivo, na mesma transação — a aprovação no terminal efetiva.

export type TTerminalSaleItemInput = { produtoId: string; produtoVarianteId?: string | null; quantidade: number };

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

	return runPoiTransactionWithIdempotency({
		organizacaoId: organizationId,
		principalId: deviceId,
		idempotencyKey,
		payload: { deviceId, input },
		execute: async (tx) => {
			const organization = await tx.query.organizations.findFirst({ where: (fields, { eq: equals }) => equals(fields.id, organizationId) });
			if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

			const accountingDefaults = organization.configuracao.defaults.contabilidade.lancamentosPadrao.vendas;
			if (!accountingDefaults.debitoContaId || !accountingDefaults.creditoContaId) {
				throw new createHttpError.InternalServerError("A organização não possui contas padrão de vendas configuradas.");
			}

			// Vendedor: obrigatório quando informado, validado como ativo; o terminal não vende "como usuário".
			await validateActiveSeller({ orgId: organizationId, sellerId: input.sale.vendedorId ?? null });
			const seller = input.sale.vendedorId
				? await tx.query.sellers.findFirst({ where: and(eq(sellers.id, input.sale.vendedorId), eq(sellers.organizacaoId, organizationId)), columns: { id: true, nome: true } })
				: null;

			// Caixa: mesma política do PDV web — obrigatório quando a organização exige; a sessão
			// informada precisa estar aberta e aceitar o vendedor.
			const sessionRequired = organization.configuracao.preferencias.sessoesVenda?.obrigatorio ?? false;
			if (sessionRequired && !input.sale.sessaoVendaId) {
				throw new PaymentTerminalError(409, "CONFLICT", "Nenhum caixa selecionado. Abra uma sessão de venda no RecompraCRM e escolha o caixa no terminal.");
			}
			let sessaoVendaId: string | null = null;
			if (input.sale.sessaoVendaId) {
				const activeSession = await resolveActiveSalesSession({ orgId: organizationId, sessaoVendaId: input.sale.sessaoVendaId });
				if (!activeSession) throw new PaymentTerminalError(409, "CONFLICT", "O caixa selecionado não está mais aberto. Escolha outro caixa.");
				validateSalesSessionSeller({ session: activeSession, vendedorId: input.sale.vendedorId ?? null });
				sessaoVendaId = activeSession.id;
			}

			const client = input.sale.clienteId
				? await tx.query.clients.findFirst({ where: and(eq(clients.id, input.sale.clienteId), eq(clients.organizacaoId, organizationId)), columns: { id: true, nome: true } })
				: null;
			if (input.sale.clienteId && !client) throw new PaymentTerminalError(404, "NOT_FOUND", "Cliente não encontrado nesta organização.");

			// Itens pelo catálogo, com o preço do canal PDV — o terminal manda só referência e quantidade.
			const resolved = await resolveSaleItems({ db: tx, organizacaoId: organizationId, itens: input.sale.itens }).catch((error) => {
				if (error instanceof SaleItemResolutionError) throw new PaymentTerminalError(422, "VALIDATION_ERROR", error.message);
				throw error;
			});
			const channelState = await loadChannelState({ orgId: organizationId, canal: "POS" });
			const pricedItems = resolved.map((item) => {
				const preco = channelNodePrice(channelState, { produtoId: item.produtoId, produtoVarianteId: item.produtoVarianteId, precoVenda: item.preco }) ?? item.preco;
				return { ...item, preco, total: Math.round(preco * item.quantidade * 100) / 100 };
			});
			const valorTotal = Math.round(pricedItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
			if (valorTotal <= 0) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "A venda precisa ter valor maior que zero.");
			const custoTotal = pricedItems.reduce((sum, item) => sum + item.custoTotal, 0);

			// Mesmo split do checkout: o terminal manda o que o cliente entregou, o excesso em dinheiro
			// vira troco e a perna de cartão (se houver) é normalizada como pendente pela confirmação.
			const resolvedPayments = resolveTerminalSalePayments({
				payments: input.payments,
				saleTotal: valorTotal,
				deviceId,
				hasClient: Boolean(client),
				methods: listTerminalPaymentMethods(organization.configuracao),
			});
			const salePayments = await resolvePaymentFinancialAccounts({ organization, payments: resolvedPayments.splits, tx });

			const idExterno = `TERM-${Date.now()}`;
			const [insertedSale] = await tx
				.insert(sales)
				.values({
					organizacaoId: organizationId,
					clienteId: input.sale.clienteId ?? null,
					idExterno,
					valorTotal,
					descontosTotal: null,
					acrescimosTotal: null,
					custoTotal,
					vendedorNome: seller?.nome ?? deviceName,
					vendedorId: seller?.id ?? null,
					entregaModalidade: "PRESENCIAL",
					observacoes: input.sale.observacoes ?? null,
					rascunhoMetadados: { origem: "TERMINAL", dispositivoId: deviceId },
					parceiro: "",
					chave: "",
					documento: "",
					modelo: "",
					movimento: "RECEITAS",
					natureza: "",
					serie: "SN01",
					situacao: "",
					tipo: "Venda de produtos",
					canal: "POS",
					processamentoOrigem: "INTERNO",
					statusVenda: "ORCAMENTO",
					emissaoFiscalAutomatica: null,
				})
				.returning({ id: sales.id });
			if (!insertedSale) throw new createHttpError.InternalServerError("Erro ao criar a venda.");

			await tx.insert(saleItems).values(
				pricedItems.map((item) => ({
					organizacaoId: organizationId,
					vendaId: insertedSale.id,
					clienteId: input.sale.clienteId ?? null,
					produtoId: item.produtoId,
					produtoVarianteId: item.produtoVarianteId,
					quantidade: item.quantidade,
					valorVendaUnitario: item.preco,
					valorCustoUnitario: item.custo,
					valorVendaTotalBruto: item.total,
					valorTotalDesconto: 0,
					valorVendaTotalLiquido: item.total,
					valorCustoTotal: item.custoTotal,
					metadados: {
						nome: item.variacao ? `${item.nome} — ${item.variacao}` : item.nome,
						codigo: item.codigo,
						imagemUrl: item.imagemUrl,
						produtoId: item.produtoId,
						produtoVarianteId: item.produtoVarianteId,
						valorUnitarioBase: item.preco,
						valorModificadores: 0,
						modificadores: [],
					},
				})),
			);

			const confirmation = await processSaleConfirmationInTransaction({
				tx,
				input: {
					organization,
					saleId: insertedSale.id,
					salePayments,
					saleAuthorId: null,
					saleClientId: input.sale.clienteId ?? null,
					accountingEntryDebitAccountId: accountingDefaults.debitoContaId,
					accountingEntryCreditAccountId: accountingDefaults.creditoContaId,
					sessaoVendaId,
					terminalAttempt: { chaveIdempotencia: idempotencyKey, fingerprintEntrada: fingerprint, origem: "DISPOSITIVO" },
				},
			});
			// Com cartão, a cobrança volta para o app executar; sem cartão, a venda já está registrada
			// e o app só mostra o resultado (e o troco).
			let charge: ReturnType<typeof buildChargeView> | null = null;
			if (resolvedPayments.terminal) {
				const attemptId = confirmation.tentativaPagamento?.id;
				if (!attemptId) throw new createHttpError.InternalServerError("A tentativa de pagamento da venda não foi criada.");
				charge = buildChargeView(await findPaymentAttemptForDevice({ organizationId, deviceId, attemptId, database: tx }));
			}
			const sale = buildPaymentAttemptSaleView({ id: insertedSale.id, idExterno, valorTotal, statusVenda: "CONFIRMADA", cliente: client ? { nome: client.nome } : null });
			const result = {
				data: {
					charge,
					saleId: insertedSale.id,
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
				afterCommit: () => processSaleConfirmationPostCommit({ organization, saleId: insertedSale.id, saleAuthorId: null }).then(() => undefined),
			};
		},
	});
}
export type TCreateTerminalSaleOutput = Awaited<ReturnType<typeof createTerminalSale>>;
