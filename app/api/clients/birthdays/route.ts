import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanViewClients } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { INTERACTIONS_CRON_TIMEZONE } from "@/lib/campaigns/time-blocks";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, inArray, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CLIENTS_LIMIT = 8;

/**
 * Aniversariantes de hoje e dos próximos dias. Usa o fuso do cron de interações, o mesmo que dispara
 * a campanha de aniversário — o widget e a automação precisam concordar sobre "hoje".
 */
const GetClientBirthdaysInputSchema = z.object({
	days: z
		.string({ invalid_type_error: "Tipo inválido para a janela em dias." })
		.optional()
		.nullable()
		.transform((v) => (v ? Math.min(Math.max(Number(v), 1), 31) : 7)),
});
export type TGetClientBirthdaysInput = z.infer<typeof GetClientBirthdaysInputSchema>;

async function getClientBirthdays({ input, session }: { input: TGetClientBirthdaysInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const today = dayjs().tz(INTERACTIONS_CRON_TIMEZONE).startOf("day");
	// Pares MM-DD da janela, na ordem: o índice diz "daqui a quantos dias".
	const keys = Array.from({ length: input.days }, (_, index) => today.add(index, "day").format("MM-DD"));
	const birthdayKey = sql<string>`to_char(${clients.dataNascimento}, 'MM-DD')`;

	const rows = await db
		.select({ id: clients.id, nome: clients.nome, telefone: clients.telefone, dataNascimento: clients.dataNascimento, chave: birthdayKey })
		.from(clients)
		.where(and(eq(clients.organizacaoId, organizacaoId), inArray(birthdayKey, keys)));

	const aniversariantes = rows
		.map((row) => ({ ...row, emDias: keys.indexOf(row.chave) }))
		.sort((a, b) => a.emDias - b.emDias || a.nome.localeCompare(b.nome))
		.map(({ chave: _chave, ...row }) => row);

	return {
		data: {
			janelaDias: input.days,
			total: aniversariantes.length,
			hoje: aniversariantes.filter((row) => row.emDias === 0).length,
			clientes: aniversariantes.slice(0, CLIENTS_LIMIT),
		},
		message: "Aniversariantes recuperados com sucesso.",
	};
}
export type TGetClientBirthdaysOutput = Awaited<ReturnType<typeof getClientBirthdays>>;

async function getClientBirthdaysRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanViewClients(session);
	const input = GetClientBirthdaysInputSchema.parse({ days: request.nextUrl.searchParams.get("days") });
	const result = await getClientBirthdays({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getClientBirthdaysRoute });
