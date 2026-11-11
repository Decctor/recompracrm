import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { buildPhoneSearchPatterns } from "@/lib/formatting";
import { createSimplifiedSearchCondition } from "@/lib/search";
import type { TCampaignDispatchSkipReasonEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { campaignDispatchRecipients, campaignDispatches, clients, interactions } from "@/services/drizzle/schema";
import { type SQL, and, asc, eq, ilike, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Destinatários de um disparo ("Ver destinatários"): quem entrou na rodada, quem recebeu e por que
 * alguém ficou de fora.
 *
 * A situação exibida não é a coluna `status` crua. Uma falha que a Meta reporta depois do envio
 * só marca a interação como FALHOU — a linha do destinatário continua ENVIADA — então ela é
 * resolvida aqui pelo join, e o painel mostra a mesma coisa que o cliente viveu.
 */

const CampaignDispatchRecipientSituationEnum = z.enum(["ENVIADA", "FALHOU", "PULADA", "PENDENTE"]);
export type TCampaignDispatchRecipientSituation = z.infer<typeof CampaignDispatchRecipientSituationEnum>;

const GetCampaignDispatchRecipientsInputSchema = z.object({
	dispatchId: z.string({ required_error: "ID do disparo não informado.", invalid_type_error: "Tipo inválido para o ID do disparo." }),
	situation: z
		.string({ invalid_type_error: "Tipo inválido para situação." })
		.optional()
		.nullable()
		.transform((v) => (v ? v : null))
		.pipe(CampaignDispatchRecipientSituationEnum.nullable()),
	search: z
		.string({ invalid_type_error: "Tipo inválido para busca." })
		.optional()
		.nullable()
		.transform((v) => v?.trim() || null),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : 1)),
});
export type TGetCampaignDispatchRecipientsInput = z.infer<typeof GetCampaignDispatchRecipientsInputSchema>;

const PAGE_SIZE = 25;

const situationExpr = sql<TCampaignDispatchRecipientSituation>`CASE
	WHEN ${campaignDispatchRecipients.status} = 'ENVIADA' AND ${interactions.statusEnvio} = 'FALHOU' THEN 'FALHOU'
	WHEN ${campaignDispatchRecipients.status} IN ('AGUARDANDO', 'RESERVADA') THEN 'PENDENTE'
	ELSE ${campaignDispatchRecipients.status}::text
END`;

async function getCampaignDispatchRecipients({ input, session }: { input: TGetCampaignDispatchRecipientsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const dispatch = await db.query.campaignDispatches.findFirst({
		where: and(eq(campaignDispatches.id, input.dispatchId), eq(campaignDispatches.organizacaoId, organizationId)),
		columns: { id: true },
	});
	if (!dispatch) throw new createHttpError.NotFound("Disparo não encontrado.");

	const baseConditions: SQL[] = [eq(campaignDispatchRecipients.dispatchId, dispatch.id)];
	if (input.search) {
		const phonePatterns = buildPhoneSearchPatterns(input.search);
		const searchCondition = or(
			createSimplifiedSearchCondition(clients.nome, input.search),
			...phonePatterns.map((pattern) => ilike(clients.telefoneBase, `%${pattern}%`)),
		);
		if (searchCondition) baseConditions.push(searchCondition);
	}

	// Counts per situation ignore the situation filter, so the tabs keep their numbers while switching.
	const countRows = await db
		.select({ situacao: situationExpr, total: sql<number>`count(*)::int` })
		.from(campaignDispatchRecipients)
		.innerJoin(clients, eq(clients.id, campaignDispatchRecipients.clienteId))
		.leftJoin(interactions, eq(interactions.id, campaignDispatchRecipients.interacaoId))
		.where(and(...baseConditions))
		.groupBy(situationExpr);

	const counts = { total: 0, ENVIADA: 0, FALHOU: 0, PULADA: 0, PENDENTE: 0 } satisfies Record<TCampaignDispatchRecipientSituation | "total", number>;
	for (const row of countRows) {
		counts[row.situacao] = Number(row.total);
		counts.total += Number(row.total);
	}

	const recipientsMatched = input.situation ? counts[input.situation] : counts.total;
	const totalPages = Math.ceil(recipientsMatched / PAGE_SIZE);
	const safePage = Number.isFinite(input.page) && input.page > 0 ? input.page : 1;

	const conditions = input.situation ? [...baseConditions, sql`${situationExpr} = ${input.situation}`] : baseConditions;
	const rows =
		recipientsMatched > 0
			? await db
					.select({
						id: campaignDispatchRecipients.id,
						situacao: situationExpr,
						motivoPulo: campaignDispatchRecipients.motivoPulo,
						erro: sql<string | null>`COALESCE(${campaignDispatchRecipients.erro}, ${interactions.erroEnvio})`,
						dataEnvio: campaignDispatchRecipients.dataEnvio,
						interacaoId: campaignDispatchRecipients.interacaoId,
						clienteId: clients.id,
						clienteNome: clients.nome,
						clienteTelefone: clients.telefone,
					})
					.from(campaignDispatchRecipients)
					.innerJoin(clients, eq(clients.id, campaignDispatchRecipients.clienteId))
					.leftJoin(interactions, eq(interactions.id, campaignDispatchRecipients.interacaoId))
					.where(and(...conditions))
					.orderBy(asc(campaignDispatchRecipients.dataInsercao), asc(campaignDispatchRecipients.id))
					.limit(PAGE_SIZE)
					.offset(PAGE_SIZE * (safePage - 1))
			: [];

	const items = rows.map(({ clienteId, clienteNome, clienteTelefone, motivoPulo, ...row }) => ({
		...row,
		motivoPulo: motivoPulo as TCampaignDispatchSkipReasonEnum | null,
		cliente: { id: clienteId, nome: clienteNome, telefone: clienteTelefone },
	}));

	return {
		data: { items, counts, recipientsMatched, totalPages },
		message: "Destinatários do disparo recuperados com sucesso.",
	};
}
export type TGetCampaignDispatchRecipientsOutput = Awaited<ReturnType<typeof getCampaignDispatchRecipients>>;
export type TGetCampaignDispatchRecipientsOutputItems = TGetCampaignDispatchRecipientsOutput["data"]["items"];

async function getCampaignDispatchRecipientsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetCampaignDispatchRecipientsInputSchema.parse({
		dispatchId: searchParams.get("dispatchId") ?? undefined,
		situation: searchParams.get("situation"),
		search: searchParams.get("search"),
		page: searchParams.get("page"),
	});
	const result = await getCampaignDispatchRecipients({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCampaignDispatchRecipientsRoute });
