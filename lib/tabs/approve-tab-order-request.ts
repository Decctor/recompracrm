import { resolveCatalogOrderItem } from "@/lib/products/resolve-catalog-order-item";
import type { TTabOrderRequestPayload } from "@/schemas/tab-order-requests";
import { db } from "@/services/drizzle";
import { tabOrderRequests } from "@/services/drizzle/schema";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { launchTabOrder, processTabOrderLaunchPostCommit, type TTabOrderItemInput } from "./launch-tab-order";
import { openTab } from "./open-tab";
import { getTabMenuProducts } from "./public-menu";
import { resolveServiceSettings } from "./utils";

// ============================================================================
// Aprovacao de solicitacao de pedido via QR — um servico para dois atores:
// o operador no inbox (operatorId) e o sistema no modo DIRETO (operatorId nulo,
// chamado pela propria rota publica logo apos registrar a solicitacao).
// Aprovar executa a MESMA validacao autoritativa de precos e o MESMO
// launchTabOrder do composer, com o id da solicitacao como id do tabOrder —
// retry de aprovacao nao duplica pedido.
// ============================================================================

export type TApproveTabOrderRequestDestination = { type: "EXISTING"; tabId: string } | { type: "NEW"; code: string } | null;

export type TApproveTabOrderRequestInput = {
	orgId: string;
	requestId: string;
	/** null = aprovacao automatica (modo DIRETO). */
	operatorId: string | null;
	destination?: TApproveTabOrderRequestDestination;
};

export async function approveTabOrderRequest({ orgId, requestId, operatorId, destination }: TApproveTabOrderRequestInput) {
	const request = await db.query.tabOrderRequests.findFirst({
		where: and(eq(tabOrderRequests.id, requestId), eq(tabOrderRequests.organizacaoId, orgId)),
	});
	if (!request) throw new createHttpError.NotFound("Solicitacao nao encontrada.");

	// CAS -> PROCESSANDO serializa aprovacoes. PROCESSANDO tambem e reivindicavel:
	// se o processo cair no meio, a solicitacao nao fica presa — o retry e seguro porque o
	// launchTabOrder dedupa pelo id da solicitacao (o pedido nunca duplica).
	const claimed = await db
		.update(tabOrderRequests)
		.set({ status: "PROCESSANDO", operadorAprovadorId: operatorId })
		.where(and(eq(tabOrderRequests.id, request.id), inArray(tabOrderRequests.status, ["PENDENTE", "ERRO", "PROCESSANDO"])))
		.returning({ id: tabOrderRequests.id });
	if (claimed.length === 0) throw new createHttpError.Conflict("A solicitacao ja foi processada por outra operacao.");

	try {
		// Conta escolhida pelo operador precisa pertencer ao PONTO da solicitacao — o pedido
		// da Mesa 12 nao pode ser aprovado por engano na comanda da Mesa 7.
		const selectedTabId = destination?.type === "EXISTING" ? destination.tabId : null;
		if (selectedTabId && !request.tabId) {
			const targetTab = await db.query.tabs.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.id, selectedTabId), eq(fields.organizacaoId, orgId)),
				columns: { id: true, status: true, servicePointId: true },
			});
			if (!targetTab || targetTab.status !== "ABERTA") throw new createHttpError.BadRequest("A conta selecionada nao esta aberta.");
			if (request.servicePointId && targetTab.servicePointId !== request.servicePointId) {
				throw new createHttpError.BadRequest("A conta selecionada nao pertence ao ponto de atendimento da solicitacao.");
			}
		}

		// Resolve a conta: da solicitacao, do operador, ou implicita do ponto (Somente mesas).
		let tabId = request.tabId ?? selectedTabId;
		const newTabCode = destination?.type === "NEW" ? destination.code : null;
		if (!tabId && newTabCode) {
			if (!request.servicePointId) throw new createHttpError.BadRequest("A solicitacao nao possui um ponto de atendimento para abrir a conta.");
			const settings = await resolveServiceSettings({ orgId });
			if (settings.aberturaPublica === "DESABILITADA") {
				throw new createHttpError.Forbidden("A abertura de contas a partir de solicitacoes publicas nao esta habilitada.");
			}
			if (settings.contas.identificacao !== "CODIGO_MANUAL") {
				throw new createHttpError.BadRequest("Esta operacao nao utiliza contas identificadas por codigo.");
			}

			const openTabWithCode = await db.query.tabs.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.organizacaoId, orgId), eq(fields.codigo, newTabCode), eq(fields.status, "ABERTA")),
				columns: { id: true, servicePointId: true },
			});
			if (openTabWithCode) {
				if (openTabWithCode.servicePointId !== request.servicePointId) {
					throw new createHttpError.Conflict(`A comanda ${newTabCode} ja esta aberta em outro ponto de atendimento.`);
				}
				tabId = openTabWithCode.id;
			} else {
				const opened = await openTab({
					orgId,
					userId: operatorId,
					input: { servicePointId: request.servicePointId, codigo: newTabCode },
				});
				tabId = opened.tab.id;
			}
		}
		if (!tabId && request.servicePointId) {
			const settings = await resolveServiceSettings({ orgId });
			if (settings.contas.identificacao === "AUTOMATICA" && settings.contas.maxAbertasPorPonto === 1) {
				const opened = await openTab({ orgId, userId: operatorId, input: { servicePointId: request.servicePointId } });
				tabId = opened.tab.id;
			}
		}
		if (!tabId) {
			throw new createHttpError.BadRequest("Selecione a conta que recebera o pedido — o QR do ponto nao identifica a comanda sozinho.");
		}

		// Precificacao autoritativa NA APROVACAO: precos atuais do catalogo, nunca do cliente publico.
		// O cardapio da comanda (restrito aos produtos citados) ja vem com o gate do canal COMANDA e
		// com os grupos projetados — a solicitacao pode ter sido feita antes de o produto sair do
		// canal ou de uma opcao ser pausada, e a aprovacao e a superficie que revalida.
		const payload = request.payloadSolicitacao;
		const productIds = [...new Set(payload.itens.map((item) => item.produtoId))];
		const catalog = await getTabMenuProducts({ orgId, productIds });
		const productMap = new Map(catalog.map((product) => [product.id, product]));

		const itens: TTabOrderItemInput[] = payload.itens.map((item) => {
			const product = productMap.get(item.produtoId);
			if (!product) throw new createHttpError.BadRequest(`O produto do item "${item.nome}" nao esta mais disponivel.`);
			// Regras de grupo (minimo/maximo/quantidade por opcao) e precos de opcao no canal — a mesma
			// conta da loja, sobre o mesmo catalogo que o cliente viu.
			const resolved = resolveCatalogOrderItem({
				product,
				variantId: item.produtoVarianteId ?? null,
				quantity: item.quantidade,
				modifiers: item.modificadores,
				observacoes: item.observacoes ?? null,
			});
			return {
				produtoId: resolved.produtoId,
				produtoVarianteId: resolved.produtoVarianteId,
				nome: resolved.nome,
				codigo: resolved.codigo,
				imagemUrl: resolved.imagemUrl,
				quantidade: resolved.quantidade,
				valorUnitarioBase: resolved.valorUnitarioBase,
				valorModificadores: resolved.valorModificadores,
				valorUnitarioFinal: resolved.valorUnitarioFinal,
				valorTotalBruto: resolved.valorTotalBruto,
				valorDesconto: resolved.valorDesconto,
				valorTotalLiquido: resolved.valorTotalLiquido,
				observacoes: resolved.observacoes,
				modificadores: resolved.modificadores,
			};
		});

		const launched = await launchTabOrder({
			orgId,
			userId: operatorId,
			input: {
				tabId,
				// Id da solicitacao como id do pedido: retry de aprovacao nao duplica.
				tabOrderId: request.id,
				observacoes: payload.observacoes ?? null,
				itens,
			},
		});

		await db
			.update(tabOrderRequests)
			.set({ status: "CONCLUIDA", tabId, tabOrderId: launched.tabOrderId, erroProcessamento: null })
			.where(eq(tabOrderRequests.id, request.id));

		// Pedido lancado e solicitacao concluida: efeitos pos-commit (ticket de preparo). E aqui que
		// "so pedido aprovado imprime" acontece — PENDENTE e REJEITADA nunca chegam a este ponto.
		await processTabOrderLaunchPostCommit({ orgId, tabOrderId: launched.tabOrderId, userId: operatorId });

		return { requestId: request.id, status: "CONCLUIDA" as const, tabOrderId: launched.tabOrderId, tabOrderNumero: launched.tabOrderNumero };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Erro ao processar a solicitacao.";
		await db.update(tabOrderRequests).set({ status: "ERRO", erroProcessamento: message }).where(eq(tabOrderRequests.id, request.id));
		throw error;
	}
}
export type TApproveTabOrderRequestResult = Awaited<ReturnType<typeof approveTabOrderRequest>>;

// ----------------------------------------------------------------------------
// Modo DIRETO: aprovacao automatica logo apos o registro da solicitacao publica.
// ----------------------------------------------------------------------------

// Teto de pedidos auto-aprovados por dispositivo numa janela curta. Acima disso a solicitacao
// degrada para o inbox em vez de ser recusada: um grupo grande pedindo em rodadas rapidas e
// legitimo, mas passa a ter um humano olhando. E o controle de abuso que destravou o DIRETO.
const AUTO_APPROVAL_WINDOW_MINUTES = 10;
const AUTO_APPROVAL_MAX_PER_DEVICE_IN_WINDOW = 5;

type TAutoApproveTabOrderRequestInput = {
	orgId: string;
	requestId: string;
	deviceKeyHash: string;
	tabId: string | null;
	payload: TTabOrderRequestPayload;
};

// Nunca lanca: qualquer motivo pelo qual o destino nao e deterministico (QR de ponto com varias
// comandas, produto que saiu do canal, limite por dispositivo) devolve a solicitacao PENDENTE
// para o inbox com o motivo registrado — o cliente nao recebe erro, recebe "aguarde o atendente".
export async function autoApproveTabOrderRequest({ orgId, requestId, deviceKeyHash, tabId, payload }: TAutoApproveTabOrderRequestInput) {
	const windowStart = new Date(Date.now() - AUTO_APPROVAL_WINDOW_MINUTES * 60_000);
	const [{ recent }] = await db
		.select({ recent: count() })
		.from(tabOrderRequests)
		.where(
			and(
				eq(tabOrderRequests.organizacaoId, orgId),
				eq(tabOrderRequests.deviceKeyHash, deviceKeyHash),
				eq(tabOrderRequests.status, "CONCLUIDA"),
				gt(tabOrderRequests.dataInsercao, windowStart),
			),
		);
	if (recent >= AUTO_APPROVAL_MAX_PER_DEVICE_IN_WINDOW) {
		return await leavePendingForOperator({ requestId, reason: "Limite de pedidos automaticos por dispositivo atingido." });
	}

	// QR do ponto sem conta vinculada: a unica pista deterministica e o codigo da comanda que o
	// cliente informou; sem ele, o servico resolve a implicita (Somente mesas) ou cai no inbox.
	const destination: TApproveTabOrderRequestDestination = !tabId && payload.codigoTab ? { type: "NEW", code: payload.codigoTab } : null;

	try {
		const approved = await approveTabOrderRequest({ orgId, requestId, operatorId: null, destination });
		return { status: "CONCLUIDA" as const, tabOrderId: approved.tabOrderId, tabOrderNumero: approved.tabOrderNumero };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Erro ao aprovar automaticamente.";
		console.warn(`[TAB_ORDER_REQUESTS] [ORG: ${orgId}] Aprovacao automatica nao aplicada a ${requestId}: ${message}`);
		return await leavePendingForOperator({ requestId, reason: message });
	}
}
export type TAutoApproveTabOrderRequestResult = Awaited<ReturnType<typeof autoApproveTabOrderRequest>>;

async function leavePendingForOperator({ requestId, reason }: { requestId: string; reason: string }) {
	// O inbox lista PENDENTE; o motivo fica em erroProcessamento para o operador entender por que
	// o pedido nao saiu sozinho. operadorAprovadorId volta a nulo (o claim do DIRETO ja era nulo).
	await db
		.update(tabOrderRequests)
		.set({ status: "PENDENTE", erroProcessamento: `Aprovacao automatica nao aplicada: ${reason}` })
		.where(eq(tabOrderRequests.id, requestId));
	return { status: "PENDENTE" as const, tabOrderId: null, tabOrderNumero: null };
}
