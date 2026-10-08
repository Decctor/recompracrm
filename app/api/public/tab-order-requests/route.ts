import { createHash } from "node:crypto";
import { appApiHandler } from "@/lib/app-api";
import { autoApproveTabOrderRequest, filterComandaOrderableProductIds, hashPublicToken, resolveServiceSettings } from "@/lib/tabs";
import { enforcePublicRateLimit } from "@/lib/tabs/public-rate-limit";
import { TabOrderRequestPayloadSchema } from "@/schemas/tab-order-requests";
import { db } from "@/services/drizzle";
import { sales, tabOrderRequests, tabs } from "@/services/drizzle/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// Solicitacao publica de pedido via QR. O cliente publico NAO envia precos —
// apenas referencias de produto + quantidade; a precificacao autoritativa
// acontece na aprovacao (do operador ou, no modo DIRETO, automatica logo apos
// o registro — a linha da solicitacao continua existindo como trilha e como
// vinculo dispositivo->conta). Idempotencia por (org, idempotencyKey), padrao
// shopOrderRequests.
// ============================================================================

const CreatePublicTabOrderRequestInputSchema = z.object({
	// Token bruto do QR (do ponto ou da tab). Resolvido por hash — nunca persistido.
	token: z.string({ required_error: "Token nao informado." }).min(16, { message: "Token invalido." }),
	context: z.enum(["PONTO", "TAB"], { required_error: "Contexto nao informado." }),
	idempotencyKey: z.string({ required_error: "Chave de idempotencia nao informada." }).uuid({ message: "Chave de idempotencia invalida." }),
	deviceKey: z.string({ required_error: "Identificacao do dispositivo nao informada." }).uuid({ message: "Identificacao do dispositivo invalida." }),
	notes: z.string({ invalid_type_error: "Tipo nao valido para observacoes." }).max(500).optional().nullable(),
	tabCode: z.string({ invalid_type_error: "Tipo nao valido para codigo da comanda." }).trim().min(1).max(100).optional().nullable(),
	items: TabOrderRequestPayloadSchema.shape.itens,
});
export type TCreatePublicTabOrderRequestInput = z.infer<typeof CreatePublicTabOrderRequestInputSchema>;

const GetPublicTabOrderSessionInputSchema = z.object({
	token: z.string({ required_error: "Token nao informado." }).min(16, { message: "Token invalido." }),
	deviceKey: z.string({ required_error: "Identificacao do dispositivo nao informada." }).uuid({ message: "Identificacao do dispositivo invalida." }),
});
export type TGetPublicTabOrderSessionInput = z.infer<typeof GetPublicTabOrderSessionInputSchema>;

async function createPublicTabOrderRequest({ input, clientIp }: { input: TCreatePublicTabOrderRequestInput; clientIp: string }) {
	const tokenHash = hashPublicToken(input.token);
	const deviceKeyHash = createHash("sha256").update(input.deviceKey).digest("hex");
	enforcePublicRateLimit({ key: `${clientIp}:${tokenHash.slice(0, 16)}` });

	// Resolve o contexto pelo hash do token.
	let orgId: string;
	let servicePointId: string | null = null;
	let tabId: string | null = null;

	if (input.context === "PONTO") {
		const point = await db.query.servicePoints.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.tokenPublicoHash, tokenHash), eq(fields.ativo, true)),
			columns: { id: true, organizacaoId: true },
		});
		if (!point) throw new createHttpError.NotFound("QR Code invalido ou desativado.");
		orgId = point.organizacaoId;
		servicePointId = point.id;

		// Uma aprovacao anterior vincula este dispositivo a uma conta enquanto ela
		// permanecer aberta. O QR do ponto continua sem listar contas publicamente.
		const [linkedRequest] = await db
			.select({ tabId: tabOrderRequests.tabId })
			.from(tabOrderRequests)
			.innerJoin(tabs, and(eq(tabOrderRequests.tabId, tabs.id), eq(tabs.status, "ABERTA"), eq(tabs.servicePointId, point.id)))
			.where(
				and(
					eq(tabOrderRequests.organizacaoId, orgId),
					eq(tabOrderRequests.servicePointId, point.id),
					eq(tabOrderRequests.deviceKeyHash, deviceKeyHash),
					eq(tabOrderRequests.status, "CONCLUIDA"),
					isNotNull(tabOrderRequests.tabId),
				),
			)
			.orderBy(desc(tabOrderRequests.dataInsercao))
			.limit(1);
		tabId = linkedRequest?.tabId ?? null;
	} else {
		const tab = await db.query.tabs.findFirst({
			where: (fields, { eq }) => eq(fields.tokenPublicoHash, tokenHash),
			columns: { id: true, organizacaoId: true, status: true, servicePointId: true },
		});
		if (!tab) throw new createHttpError.NotFound("QR Code invalido.");
		if (tab.status !== "ABERTA") throw new createHttpError.BadRequest("Esta conta ja foi fechada.");
		orgId = tab.organizacaoId;
		tabId = tab.id;
		servicePointId = tab.servicePointId;
	}

	// Politica da organizacao: pedidos de cliente precisam estar habilitados.
	const settings = await resolveServiceSettings({ orgId });
	if (settings.pedidosCliente === "DESABILITADO") {
		throw new createHttpError.Forbidden("Pedidos pelo QR Code nao estao habilitados. Chame um atendente.");
	}

	// Valida os produtos referenciados (existencia/atividade/vendabilidade/canal COMANDA — sem precos).
	const productIds = [...new Set(input.items.map((item) => item.produtoId))];
	const orderableIds = await filterComandaOrderableProductIds({ orgId, productIds });
	if (orderableIds.size !== productIds.length) {
		throw new createHttpError.BadRequest("Um ou mais itens nao estao disponiveis. Atualize a pagina.");
	}

	const payload = TabOrderRequestPayloadSchema.parse({
		itens: input.items,
		observacoes: input.notes ?? null,
		codigoTab: input.context === "PONTO" && !tabId ? (input.tabCode ?? null) : null,
		contexto: input.context,
	});
	const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

	// Idempotencia: mesma chave + mesmo payload retorna a solicitacao existente.
	const existing = await db.query.tabOrderRequests.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, orgId), eq(fields.idempotencyKey, input.idempotencyKey)),
		columns: { id: true, status: true, payloadHash: true },
	});
	if (existing) {
		if (existing.payloadHash !== payloadHash) throw new createHttpError.Conflict("A chave de idempotencia ja foi usada com outro pedido.");
		return {
			data: { requestId: existing.id, status: existing.status },
			message: requestStatusMessage(existing.status, { repeated: true }),
		};
	}

	const [created] = await db
		.insert(tabOrderRequests)
		.values({
			organizacaoId: orgId,
			servicePointId,
			tabId,
			idempotencyKey: input.idempotencyKey,
			payloadHash,
			deviceKeyHash,
			payloadSolicitacao: payload,
			status: "PENDENTE",
		})
		.onConflictDoNothing()
		.returning({ id: tabOrderRequests.id, status: tabOrderRequests.status });

	if (!created) {
		// Corrida com outra requisicao de mesma chave: reconsulta e reaplica a regra de payload.
		const raced = await db.query.tabOrderRequests.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, orgId), eq(fields.idempotencyKey, input.idempotencyKey)),
			columns: { id: true, status: true, payloadHash: true },
		});
		if (!raced) throw new createHttpError.InternalServerError("Erro ao registrar a solicitacao.");
		if (raced.payloadHash !== payloadHash) throw new createHttpError.Conflict("A chave de idempotencia ja foi usada com outro pedido.");
		return { data: { requestId: raced.id, status: raced.status }, message: requestStatusMessage(raced.status, { repeated: true }) };
	}

	// DIRETO: aprova agora, sem operador. Nunca lanca — destino ambiguo ou limite por dispositivo
	// devolve PENDENTE ao inbox, e o cliente recebe a mensagem de espera em vez de um erro.
	if (settings.pedidosCliente === "DIRETO") {
		const auto = await autoApproveTabOrderRequest({ orgId, requestId: created.id, deviceKeyHash, tabId, payload });
		return { data: { requestId: created.id, status: auto.status }, message: requestStatusMessage(auto.status, { repeated: false }) };
	}

	return {
		data: { requestId: created.id, status: created.status },
		message: requestStatusMessage(created.status, { repeated: false }),
	};
}

type TPublicRequestStatus = (typeof tabOrderRequests.$inferSelect)["status"];
function requestStatusMessage(status: TPublicRequestStatus, { repeated }: { repeated: boolean }) {
	if (status === "CONCLUIDA" || status === "APROVADA") return repeated ? "Pedido ja enviado para a cozinha." : "Pedido enviado para a cozinha!";
	if (status === "REJEITADA") return "Esta solicitacao foi recusada pelo atendente.";
	return repeated ? "Solicitacao ja registrada. Aguarde a aprovacao do atendente." : "Pedido enviado! Aguarde a aprovacao do atendente.";
}
export type TCreatePublicTabOrderRequestOutput = Awaited<ReturnType<typeof createPublicTabOrderRequest>>;

async function getPublicTabOrderSession({ input, clientIp }: { input: TGetPublicTabOrderSessionInput; clientIp: string }) {
	const tokenHash = hashPublicToken(input.token);
	const deviceKeyHash = createHash("sha256").update(input.deviceKey).digest("hex");
	enforcePublicRateLimit({ key: `session:${clientIp}:${tokenHash.slice(0, 16)}:${deviceKeyHash.slice(0, 12)}` });

	const point = await db.query.servicePoints.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.tokenPublicoHash, tokenHash), eq(fields.ativo, true)),
		columns: { id: true, organizacaoId: true, rotulo: true },
	});
	if (!point) throw new createHttpError.NotFound("QR Code invalido ou desativado.");

	const requests = await db.query.tabOrderRequests.findMany({
		where: and(
			eq(tabOrderRequests.organizacaoId, point.organizacaoId),
			eq(tabOrderRequests.servicePointId, point.id),
			eq(tabOrderRequests.deviceKeyHash, deviceKeyHash),
		),
		columns: {
			id: true,
			status: true,
			tabId: true,
			payloadSolicitacao: true,
			motivoRejeicao: true,
			erroProcessamento: true,
			dataInsercao: true,
			dataAtualizacao: true,
		},
		orderBy: (fields, { desc }) => desc(fields.dataInsercao),
		limit: 20,
	});

	let linkedTab = null;
	for (const request of requests) {
		if (request.status !== "CONCLUIDA" || !request.tabId) continue;
		linkedTab = await db.query.tabs.findFirst({
			where: (fields, { and, eq }) =>
				and(
					eq(fields.id, request.tabId as string),
					eq(fields.organizacaoId, point.organizacaoId),
					eq(fields.servicePointId, point.id),
					eq(fields.status, "ABERTA"),
				),
			columns: { id: true, codigo: true, status: true, dataAbertura: true },
			with: {
				servicePoint: { columns: { id: true, rotulo: true } },
				pedidos: {
					orderBy: (fields, { asc }) => asc(fields.numero),
					columns: { id: true, numero: true, status: true, dataEnvio: true },
					with: {
						itens: {
							columns: {
								id: true,
								quantidade: true,
								quantidadeCancelada: true,
								valorVendaTotalLiquido: true,
								metadados: true,
							},
						},
					},
				},
			},
		});
		if (linkedTab) break;
	}

	const draftSale = linkedTab
		? await db.query.sales.findFirst({
				where: and(eq(sales.tabId, linkedTab.id), eq(sales.statusVenda, "ORCAMENTO")),
				columns: { valorTotal: true },
			})
		: null;

	return {
		data: {
			requests,
			tab: linkedTab ? { ...linkedTab, consumoParcial: draftSale?.valorTotal ?? 0 } : null,
		},
		message: "Sessao do dispositivo carregada com sucesso.",
	};
}
export type TGetPublicTabOrderSessionOutput = Awaited<ReturnType<typeof getPublicTabOrderSession>>;

async function createPublicTabOrderRequestRoute(request: NextRequest) {
	const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
	const body = await request.json();
	const input = CreatePublicTabOrderRequestInputSchema.parse(body);
	const result = await createPublicTabOrderRequest({ input, clientIp });
	return NextResponse.json(result);
}

async function getPublicTabOrderSessionRoute(request: NextRequest) {
	const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
	const { searchParams } = new URL(request.url);
	const input = GetPublicTabOrderSessionInputSchema.parse({
		token: searchParams.get("token"),
		deviceKey: searchParams.get("deviceKey"),
	});
	const result = await getPublicTabOrderSession({ input, clientIp });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getPublicTabOrderSessionRoute });
export const POST = appApiHandler({ POST: createPublicTabOrderRequestRoute });
