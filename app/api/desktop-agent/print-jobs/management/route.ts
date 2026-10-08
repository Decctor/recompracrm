import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { buildCupomVendaDados } from "@/lib/desktop-agent/cupom-venda-data";
import { enqueuePrintJob } from "@/lib/desktop-agent/print-jobs";
import { buildTicketPreparoDadosFromSale, buildTicketPreparoDadosFromTabOrder } from "@/lib/desktop-agent/ticket-preparo-data";
import type { TEtiquetaLoteDados } from "@/lib/desktop-agent/templates/etiqueta-lote";
import type { TTesteImpressaoDados } from "@/lib/desktop-agent/templates/teste-impressao";
import { PrintJobStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { agentPrinters, organizations, printJobs, productions } from "@/services/drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Rotas de GESTÃO da fila de impressão (sessão humana): listagem para troubleshooting e
// enfileiramento manual (imprimir cupom da venda, etiquetas da produção, página de teste).
// Os `dados` do job são SEMPRE montados aqui no servidor a partir da entidade — o browser
// só aponta a origem (plano, decisão 2).

const GetPrintJobsManagementInputSchema = z.object({
	status: PrintJobStatusEnum.optional().nullable(),
	limit: z
		.string({ invalid_type_error: "Tipo não válido para o limite." })
		.optional()
		.nullable()
		.transform((value) => (value ? Math.min(Number(value), 100) : 30)),
});
export type TGetPrintJobsManagementInput = z.infer<typeof GetPrintJobsManagementInputSchema>;

type TGetPrintJobsManagementParams = {
	input: TGetPrintJobsManagementInput;
	organizacaoId: string;
};
async function getPrintJobsManagement({ input, organizacaoId }: TGetPrintJobsManagementParams) {
	const jobs = await db.query.printJobs.findMany({
		where: and(eq(printJobs.organizacaoId, organizacaoId), input.status ? eq(printJobs.status, input.status) : undefined),
		columns: {
			id: true,
			finalidade: true,
			formato: true,
			copias: true,
			origemTipo: true,
			origemId: true,
			status: true,
			numeroTentativas: true,
			erro: true,
			expiraEm: true,
			dataInsercao: true,
			dataConclusao: true,
		},
		with: {
			impressora: { columns: { id: true, nomeSistema: true, apelido: true } },
			principal: { columns: { id: true, nome: true } },
			solicitadoPor: { columns: { id: true, nome: true } },
		},
		orderBy: [desc(printJobs.dataInsercao)],
		limit: input.limit,
	});
	return { data: { jobs }, message: "Jobs de impressão listados com sucesso." };
}
export type TGetPrintJobsManagementOutput = Awaited<ReturnType<typeof getPrintJobsManagement>>;

async function getPrintJobsManagementRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!session.membership.permissoes.empresa.visualizar)
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar os jobs de impressão da organização.");

	const input = GetPrintJobsManagementInputSchema.parse({
		status: request.nextUrl.searchParams.get("status"),
		limit: request.nextUrl.searchParams.get("limit"),
	});
	const result = await getPrintJobsManagement({ input, organizacaoId: session.membership.organizacao.id });
	return NextResponse.json(result);
}

const CreateManualPrintJobInputSchema = z.object({
	finalidade: z.enum(["CUPOM_VENDA", "TICKET_PREPARO", "ETIQUETA_LOTE", "TESTE"], {
		required_error: "Finalidade da impressão não informada.",
		invalid_type_error: "Tipo não válido para a finalidade da impressão.",
	}),
	vendaId: z.string({ invalid_type_error: "Tipo não válido para o ID da venda." }).optional().nullable(),
	// TICKET_PREPARO aceita venda OU pedido de conta (rodada) — o grão do board de preparo.
	tabOrderId: z.string({ invalid_type_error: "Tipo não válido para o ID do pedido." }).optional().nullable(),
	producaoId: z.string({ invalid_type_error: "Tipo não válido para o ID da produção." }).optional().nullable(),
	impressoraId: z.string({ invalid_type_error: "Tipo não válido para o ID da impressora." }).optional().nullable(),
});
export type TCreateManualPrintJobInput = z.infer<typeof CreateManualPrintJobInputSchema>;

type TCreateManualPrintJobParams = {
	input: TCreateManualPrintJobInput;
	organizacaoId: string;
	solicitadoPorId: string;
	solicitadoPorNome: string;
};
async function createManualPrintJob({ input, organizacaoId, solicitadoPorId, solicitadoPorNome }: TCreateManualPrintJobParams) {
	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.id, organizacaoId),
		columns: { nome: true, cnpj: true, telefone: true },
	});
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	if (input.finalidade === "CUPOM_VENDA") {
		if (!input.vendaId) throw new createHttpError.BadRequest("ID da venda não informado para a impressão do cupom.");
		// Builder compartilhado com o auto-print — cupom manual e automático sempre idênticos.
		const dados = await buildCupomVendaDados({ organizacaoId, vendaId: input.vendaId });

		const result = await enqueuePrintJob({
			organizacaoId,
			finalidade: "CUPOM_VENDA",
			dados: dados as unknown as Record<string, unknown>,
			origemTipo: "VENDA",
			origemId: input.vendaId,
			impressoraId: input.impressoraId,
			solicitadoPorId,
		});
		return { data: { jobs: [result.job] }, message: "Cupom enviado para impressão." };
	}

	if (input.finalidade === "TICKET_PREPARO") {
		if (!input.vendaId && !input.tabOrderId) throw new createHttpError.BadRequest("Informe a venda ou o pedido para a impressão do ticket de preparo.");
		// Builders compartilhados com o auto-print — reimpressão manual idêntica à automática.
		const dados = input.tabOrderId
			? await buildTicketPreparoDadosFromTabOrder({ organizacaoId, tabOrderId: input.tabOrderId })
			: await buildTicketPreparoDadosFromSale({ organizacaoId, vendaId: input.vendaId as string });

		const result = await enqueuePrintJob({
			organizacaoId,
			finalidade: "TICKET_PREPARO",
			dados: dados as unknown as Record<string, unknown>,
			origemTipo: input.tabOrderId ? "PEDIDO_CONTA" : "VENDA",
			origemId: input.tabOrderId ?? input.vendaId,
			impressoraId: input.impressoraId,
			solicitadoPorId,
		});
		return { data: { jobs: [result.job] }, message: "Ticket de preparo enviado para impressão." };
	}

	if (input.finalidade === "ETIQUETA_LOTE") {
		if (!input.producaoId) throw new createHttpError.BadRequest("ID da produção não informado para a impressão das etiquetas.");
		const production = await db.query.productions.findFirst({
			where: and(eq(productions.id, input.producaoId), eq(productions.organizacaoId, organizacaoId)),
			columns: { id: true, titulo: true, dataInicio: true, dataConclusao: true, dataInsercao: true },
			with: {
				saidas: {
					columns: { id: true, quantidadeReal: true, quantidadePrevista: true, dataValidade: true },
					with: {
						produto: { columns: { nome: true } },
						produtoVariante: { columns: { nome: true } },
					},
				},
			},
		});
		if (!production) throw new createHttpError.NotFound("Produção não encontrada.");
		if (production.saidas.length === 0) throw new createHttpError.BadRequest("A produção não possui saídas para etiquetar.");

		// Uma etiqueta por saída da produção; o código do lote deriva da produção.
		const loteCodigo = production.id.slice(0, 8).toUpperCase();
		const dataFabricacao = production.dataConclusao ?? production.dataInicio ?? production.dataInsercao;

		const jobs = [];
		for (const saida of production.saidas) {
			const dados: TEtiquetaLoteDados = {
				organizacao: { nome: organization.nome },
				etiqueta: {
					produtoNome: [saida.produto?.nome, saida.produtoVariante?.nome].filter(Boolean).join(" - ") || production.titulo,
					loteCodigo,
					dataFabricacao,
					dataValidade: saida.dataValidade,
					quantidade: saida.quantidadeReal ?? saida.quantidadePrevista,
				},
			};
			const result = await enqueuePrintJob({
				organizacaoId,
				finalidade: "ETIQUETA_LOTE",
				dados: dados as unknown as Record<string, unknown>,
				origemTipo: "LOTE",
				origemId: saida.id,
				impressoraId: input.impressoraId,
				solicitadoPorId,
			});
			jobs.push(result.job);
		}
		return { data: { jobs }, message: jobs.length === 1 ? "Etiqueta enviada para impressão." : `${jobs.length} etiquetas enviadas para impressão.` };
	}

	// TESTE: sempre com impressora fixada — valida o pipeline fim-a-fim para aquela impressora.
	if (!input.impressoraId) throw new createHttpError.BadRequest("ID da impressora não informado para o teste de impressão.");
	const printer = await db.query.agentPrinters.findFirst({
		where: and(eq(agentPrinters.id, input.impressoraId), eq(agentPrinters.organizacaoId, organizacaoId)),
		columns: { id: true, nomeSistema: true, apelido: true, driver: true },
	});
	if (!printer) throw new createHttpError.NotFound("Impressora não encontrada.");

	const dados: TTesteImpressaoDados = {
		organizacao: { nome: organization.nome },
		impressora: { nome: printer.apelido ?? printer.nomeSistema },
		solicitadoPor: solicitadoPorNome,
		dataSolicitacao: new Date(),
	};
	const result = await enqueuePrintJob({
		organizacaoId,
		finalidade: "TESTE",
		dados: dados as unknown as Record<string, unknown>,
		origemTipo: "MANUAL",
		impressoraId: printer.id,
		solicitadoPorId,
		formatoPreferido: printer.driver === "ZPL_REDE" ? "ZPL" : "HTML",
	});
	return { data: { jobs: [result.job] }, message: "Página de teste enviada para impressão." };
}
export type TCreateManualPrintJobOutput = Awaited<ReturnType<typeof createManualPrintJob>>;

// Enfileirar impressão é ação operacional (operador de balcão imprime cupom): exige apenas
// vínculo com a organização, sem permissão especial.
async function createManualPrintJobRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const input = CreateManualPrintJobInputSchema.parse(await request.json());
	const result = await createManualPrintJob({
		input,
		organizacaoId: session.membership.organizacao.id,
		solicitadoPorId: session.user.id,
		solicitadoPorNome: session.user.nome,
	});
	return NextResponse.json(result, { status: 201 });
}

export const GET = appApiHandler({ GET: getPrintJobsManagementRoute });
export const POST = appApiHandler({ POST: createManualPrintJobRoute });
