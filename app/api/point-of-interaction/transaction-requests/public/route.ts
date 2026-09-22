import {
	CreatePointOfInteractionTransactionRequestInputSchema,
	type TCreatePointOfInteractionTransactionOutput,
} from "@/app/api/point-of-interaction/new-transaction/route";
import { appApiHandler } from "@/lib/app-api";
import { resolvePoiPrizeLines } from "@/lib/point-of-interaction/prize-lines";
import { type TPoiPrizeInfoById, buildPoiTransactionRequestSummary } from "@/lib/point-of-interaction/transaction-requests";
import { db } from "@/services/drizzle";
import { cashbackProgramPrizes, coupons, poiTransactionRequests } from "@/services/drizzle/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

const CreatePoiTransactionRequestInputSchema = z.object({
	payload: CreatePointOfInteractionTransactionRequestInputSchema,
});
export type TCreatePoiTransactionRequestInput = z.infer<typeof CreatePoiTransactionRequestInputSchema>;

async function createPoiTransactionRequest({ input }: { input: TCreatePoiTransactionRequestInput }) {
	const tokenPublico = crypto.randomUUID();

	// Título/imagem de cada recompensa para o resumo, org-scoped (o payload é público).
	const prizeIds = [...new Set(resolvePoiPrizeLines(input.payload.sale).map((line) => line.prizeId))];
	const prizeInfo: TPoiPrizeInfoById = {};
	if (prizeIds.length > 0) {
		const prizes = await db.query.cashbackProgramPrizes.findMany({
			where: and(inArray(cashbackProgramPrizes.id, prizeIds), eq(cashbackProgramPrizes.organizacaoId, input.payload.orgId)),
			columns: { id: true, titulo: true, imagemCapaUrl: true },
		});
		for (const prize of prizes) prizeInfo[prize.id] = { titulo: prize.titulo, imagemCapaUrl: prize.imagemCapaUrl };
	}

	let couponInfo: { titulo?: string | null; codigo?: string | null; validacaoModo?: string | null; condicoesTexto?: string | null } | null = null;
	if (input.payload.sale.coupon?.cupomId) {
		const coupon = await db.query.coupons.findFirst({
			where: eq(coupons.id, input.payload.sale.coupon.cupomId),
			columns: { titulo: true, codigo: true, validacaoModo: true, condicoesTexto: true },
		});
		couponInfo = coupon ?? null;
	}

	const resumoSolicitacao = buildPoiTransactionRequestSummary(input.payload, prizeInfo, couponInfo);

	const [request] = await db
		.insert(poiTransactionRequests)
		.values({
			organizacaoId: input.payload.orgId,
			clienteId: input.payload.client.id ?? null,
			tipoSolicitacao: "NOVA_TRANSACAO",
			status: "PENDENTE",
			tokenPublico,
			payloadSolicitacao: input.payload,
			resumoSolicitacao,
		})
		.returning({ id: poiTransactionRequests.id, tokenPublico: poiTransactionRequests.tokenPublico, status: poiTransactionRequests.status });

	if (!request) {
		throw new createHttpError.InternalServerError("Erro ao criar solicitação de transação.");
	}

	return {
		data: request,
		message: "Solicitação criada com sucesso.",
	};
}
export type TCreatePoiTransactionRequestOutput = Awaited<ReturnType<typeof createPoiTransactionRequest>>;

const GetPoiTransactionRequestStatusInputSchema = z.object({
	token: z.string({ required_error: "Token público não informado.", invalid_type_error: "Tipo não válido para token público." }),
});
export type TGetPoiTransactionRequestStatusInput = z.infer<typeof GetPoiTransactionRequestStatusInputSchema>;

async function getPoiTransactionRequestStatus({ input }: { input: TGetPoiTransactionRequestStatusInput }) {
	const request = await db.query.poiTransactionRequests.findFirst({
		where: eq(poiTransactionRequests.tokenPublico, input.token),
		columns: {
			id: true,
			tokenPublico: true,
			status: true,
			vendaId: true,
			dataInsercao: true,
			dataAprovacao: true,
			dataRejeicao: true,
			erroProcessamento: true,
			resumoSolicitacao: true,
		},
		with: {
			cliente: {
				columns: {
					id: true,
					nome: true,
					telefone: true,
				},
			},
		},
		orderBy: [desc(poiTransactionRequests.dataInsercao)],
	});

	if (!request) {
		throw new createHttpError.NotFound("Solicitação não encontrada.");
	}

	const resumo = (request.resumoSolicitacao ?? null) as {
		resultadoProcessamento?: TCreatePointOfInteractionTransactionOutput["data"] | null;
	};

	return {
		data: {
			id: request.id,
			tokenPublico: request.tokenPublico,
			status: request.status,
			vendaId: request.vendaId,
			dataInsercao: request.dataInsercao,
			dataAprovacao: request.dataAprovacao,
			dataRejeicao: request.dataRejeicao,
			cliente: request.cliente,
			resultadoProcessamento: resumo?.resultadoProcessamento ?? null,
			mensagemPublica:
				request.status === "REJEITADO"
					? "Sua solicitação não foi aprovada pelo operador. Tente novamente no balcão."
					: request.status === "ERRO"
						? "Não foi possível processar sua solicitação. Tente novamente em instantes."
						: request.status === "APROVADO"
							? "Solicitação aprovada com sucesso."
							: "Sua solicitação está aguardando aprovação do operador.",
			erroProcessamento: request.status === "ERRO" ? request.erroProcessamento : null,
			resumoSolicitacao: request.resumoSolicitacao,
		},
		message: "Status da solicitação obtido com sucesso.",
	};
}
export type TGetPoiTransactionRequestStatusOutput = Awaited<ReturnType<typeof getPoiTransactionRequestStatus>>;

async function createPoiTransactionRequestRoute(request: NextRequest) {
	const body = await request.json();
	const input = CreatePoiTransactionRequestInputSchema.parse(body);
	const result = await createPoiTransactionRequest({ input });
	return NextResponse.json(result, { status: 201 });
}

async function getPoiTransactionRequestStatusRoute(request: NextRequest) {
	const input = GetPoiTransactionRequestStatusInputSchema.parse({ token: request.nextUrl.searchParams.get("token") });
	const result = await getPoiTransactionRequestStatus({ input });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: createPoiTransactionRequestRoute });
export const GET = appApiHandler({ GET: getPoiTransactionRequestStatusRoute });
