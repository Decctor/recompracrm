import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { PrintJobFinalidadeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { agentPrinters, preparationStations } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Rotas de GESTÃO de impressoras (sessão humana). O sync do agent vive em printers/sync (Bearer).

async function getAgentPrinters({ organizacaoId }: { organizacaoId: string }) {
	const printers = await db.query.agentPrinters.findMany({
		where: eq(agentPrinters.organizacaoId, organizacaoId),
		columns: {
			id: true,
			principalId: true,
			nomeSistema: true,
			apelido: true,
			driver: true,
			finalidades: true,
			estacoesPreparo: true,
			ativa: true,
			disponivel: true,
			metadados: true,
			ultimaSincronizacao: true,
			dataInsercao: true,
		},
		with: {
			principal: { columns: { id: true, nome: true, status: true } },
		},
		// O agente sincroniza todas as impressoras no mesmo instante, então dataInsercao empata e a
		// ordem ficava indefinida — a lista reordenava a cada UPDATE. nomeSistema é imutável (vem do
		// SO) e o id desempata: a ordem não muda quando o usuário renomeia ou (des)ativa uma delas.
		orderBy: (fields, { asc }) => [asc(fields.nomeSistema), asc(fields.id)],
	});
	return { data: { impressoras: printers }, message: "Impressoras listadas com sucesso." };
}
export type TGetAgentPrintersOutput = Awaited<ReturnType<typeof getAgentPrinters>>;

// Qualquer membro da organização pode LER as impressoras: é o que alimenta o estado dos botões
// de impressão nas telas operacionais (vendas, produções) — não é configuração sensível.
async function getAgentPrintersRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const result = await getAgentPrinters({ organizacaoId: session.membership.organizacao.id });
	return NextResponse.json(result);
}

const UpdateAgentPrinterInputSchema = z.object({
	id: z.string({
		required_error: "ID da impressora não informado.",
		invalid_type_error: "Tipo não válido para o ID da impressora.",
	}),
	apelido: z.string({ invalid_type_error: "Tipo não válido para o apelido da impressora." }).optional().nullable(),
	finalidades: z.array(PrintJobFinalidadeEnum, { invalid_type_error: "Tipo não válido para a lista de finalidades." }).optional().nullable(),
	ativa: z.boolean({ invalid_type_error: "Tipo não válido para o status da impressora." }).optional().nullable(),
	// Estações de preparo atendidas no TICKET_PREPARO (ids de preparation_stations da organização).
	estacoesPreparo: z
		.array(z.string({ invalid_type_error: "Tipo não válido para a estação de preparo." }), {
			invalid_type_error: "Tipo não válido para a lista de estações de preparo.",
		})
		.optional()
		.nullable(),
});
export type TUpdateAgentPrinterInput = z.infer<typeof UpdateAgentPrinterInputSchema>;

type TUpdateAgentPrinterParams = {
	input: TUpdateAgentPrinterInput;
	organizacaoId: string;
};
async function updateAgentPrinter({ input, organizacaoId }: TUpdateAgentPrinterParams) {
	const printer = await db.query.agentPrinters.findFirst({
		where: and(eq(agentPrinters.id, input.id), eq(agentPrinters.organizacaoId, organizacaoId)),
	});
	if (!printer) throw new createHttpError.NotFound("Impressora não encontrada.");

	// TESTE nunca é finalidade de roteamento (sempre carrega impressoraId fixado) — não persiste.
	const finalidades = input.finalidades?.filter((finalidade) => finalidade !== "TESTE");

	// estacoes_preparo é jsonb sem FK: só ids de estações desta organização entram.
	const estacoesPreparo = input.estacoesPreparo ? [...new Set(input.estacoesPreparo)] : null;
	if (estacoesPreparo && estacoesPreparo.length > 0) {
		const stations = await db
			.select({ id: preparationStations.id })
			.from(preparationStations)
			.where(and(eq(preparationStations.organizacaoId, organizacaoId), inArray(preparationStations.id, estacoesPreparo)));
		if (stations.length !== estacoesPreparo.length) throw new createHttpError.BadRequest("Estação de preparo não encontrada na organização.");
	}

	await db
		.update(agentPrinters)
		.set({
			...(input.apelido !== undefined ? { apelido: input.apelido?.trim() || null } : {}),
			...(finalidades ? { finalidades } : {}),
			...(estacoesPreparo ? { estacoesPreparo } : {}),
			...(input.ativa != null ? { ativa: input.ativa } : {}),
		})
		.where(eq(agentPrinters.id, printer.id));

	return { data: { id: printer.id }, message: "Impressora atualizada com sucesso." };
}
export type TUpdateAgentPrinterOutput = Awaited<ReturnType<typeof updateAgentPrinter>>;

async function updateAgentPrinterRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!session.membership.permissoes.empresa.editar)
		throw new createHttpError.Forbidden("Você não possui permissão para gerenciar impressoras da organização.");

	const input = UpdateAgentPrinterInputSchema.parse(await request.json());
	const result = await updateAgentPrinter({ input, organizacaoId: session.membership.organizacao.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getAgentPrintersRoute });
export const PATCH = appApiHandler({ PATCH: updateAgentPrinterRoute });
