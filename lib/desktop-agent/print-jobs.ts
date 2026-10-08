import type { TExternalActorContext } from "@/lib/access/authentication";
import type { TPrintJobFinalidadeEnum, TPrintJobFormatoEnum, TPrintJobOrigemTipoEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { type TAgentPrinterEntity, accessPrincipals, agentPrinters, printJobs } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import createHttpError from "http-errors";
import { z } from "zod";
import { CupomVendaDadosSchema, renderCupomVendaHtml } from "./templates/cupom-venda";
import { EtiquetaLoteDadosSchema, renderEtiquetaLoteHtml, renderEtiquetaLoteZpl } from "./templates/etiqueta-lote";
import { TesteImpressaoDadosSchema, renderTesteImpressaoHtml, renderTesteImpressaoZpl } from "./templates/teste-impressao";
import { TicketPreparoDadosSchema, renderTicketPreparoHtml } from "./templates/ticket-preparo";

// Fila durável de jobs de impressão do agente desktop (plano: docs/dev-planning/desktop-agent-printing-plan.md).
// Enqueue renderiza no servidor; claim é atômico com lease; report exige posse da tentativa.

// TTL por finalidade: cupom atrasado é pior que cupom nenhum; etiqueta e DANFE toleram espera.
const FINALIDADE_TTL_MINUTES: Record<TPrintJobFinalidadeEnum, number> = {
	CUPOM_VENDA: 30,
	// Ticket de preparo atrasado é um prato que já saiu (ou nem foi feito): mesmo TTL do cupom.
	TICKET_PREPARO: 30,
	ETIQUETA_LOTE: 24 * 60,
	DANFE_NFCE: 24 * 60,
	DANFE_NFE: 24 * 60,
	// Teste atrasado não serve pra nada: quem clicou já desistiu de esperar.
	TESTE: 15,
};

const CLAIM_LEASE_MINUTES = 2;
// Máximo de tentativas automáticas: o modo de falha perigoso é "imprimiu mas não reportou"
// (cupom em dobro no balcão) — acima disso a reimpressão é decisão humana no dashboard.
export const PRINT_JOB_MAX_TENTATIVAS = 2;

// Compatibilidade formato ↔ driver: o claim nunca entrega ZPL a impressora de driver comum, nem HTML/PDF à térmica de rede.
const FORMATO_DRIVERS_COMPATIVEIS: Record<TPrintJobFormatoEnum, TAgentPrinterEntity["driver"][]> = {
	HTML: ["DRIVER_SO"],
	PDF_URL: ["DRIVER_SO"],
	ZPL: ["ZPL_REDE"],
};

// Condição de "há trabalho claimável" — compartilhada entre o claim e o sweep de nudge do canal WS:
// PENDENTE (ou lease vencida), dentro das tentativas e do TTL.
export function claimablePrintJobsCondition(now: Date) {
	return and(
		or(eq(printJobs.status, "PENDENTE"), and(eq(printJobs.status, "PROCESSANDO"), lt(printJobs.leaseExpiraEm, now))),
		lt(printJobs.numeroTentativas, PRINT_JOB_MAX_TENTATIVAS),
		gt(printJobs.expiraEm, now),
	);
}

const DanfeDadosSchema = z.object({
	pdfUrl: z
		.string({ required_error: "URL do PDF da DANFE não informada.", invalid_type_error: "Tipo não válido para a URL do PDF da DANFE." })
		.url("URL do PDF da DANFE inválida."),
});

type TRenderedPrintContent = {
	formato: TPrintJobFormatoEnum;
	conteudo: string | null;
	conteudoUrl: string | null;
};

// Renderização por finalidade — os `dados` crus são validados pelo schema do template.
function renderPrintJobContent({
	finalidade,
	dados,
	formatoPreferido,
}: {
	finalidade: TPrintJobFinalidadeEnum;
	dados: Record<string, unknown>;
	formatoPreferido?: TPrintJobFormatoEnum | null;
}): TRenderedPrintContent {
	switch (finalidade) {
		case "CUPOM_VENDA": {
			const parsed = CupomVendaDadosSchema.parse(dados);
			return { formato: "HTML", conteudo: renderCupomVendaHtml(parsed), conteudoUrl: null };
		}
		case "TICKET_PREPARO": {
			const parsed = TicketPreparoDadosSchema.parse(dados);
			return { formato: "HTML", conteudo: renderTicketPreparoHtml(parsed), conteudoUrl: null };
		}
		case "ETIQUETA_LOTE": {
			const parsed = EtiquetaLoteDadosSchema.parse(dados);
			if (formatoPreferido === "ZPL") return { formato: "ZPL", conteudo: renderEtiquetaLoteZpl(parsed), conteudoUrl: null };
			return { formato: "HTML", conteudo: renderEtiquetaLoteHtml(parsed), conteudoUrl: null };
		}
		case "DANFE_NFCE":
		case "DANFE_NFE": {
			const parsed = DanfeDadosSchema.parse(dados);
			return { formato: "PDF_URL", conteudo: null, conteudoUrl: parsed.pdfUrl };
		}
		case "TESTE": {
			const parsed = TesteImpressaoDadosSchema.parse(dados);
			if (formatoPreferido === "ZPL") return { formato: "ZPL", conteudo: renderTesteImpressaoZpl(parsed), conteudoUrl: null };
			return { formato: "HTML", conteudo: renderTesteImpressaoHtml(parsed), conteudoUrl: null };
		}
	}
}

type TEnqueuePrintJobParams = {
	organizacaoId: string;
	finalidade: TPrintJobFinalidadeEnum;
	// Snapshot estruturado da origem — validado pelo schema do template da finalidade.
	dados: Record<string, unknown>;
	origemTipo: TPrintJobOrigemTipoEnum;
	origemId?: string | null;
	lojaId?: string | null;
	copias?: number | null;
	// Presente em auto-print (ex.: "CUPOM_VENDA:<vendaId>") — repetição devolve o job original.
	chaveIdempotencia?: string | null;
	// Override de impressora (reimpressão manual); em regra o roteamento é por finalidade no claim.
	impressoraId?: string | null;
	solicitadoPorId?: string | null;
	formatoPreferido?: TPrintJobFormatoEnum | null;
};
// Ponto de entrada único de criação de jobs — o futuro wiring de vendas/delivery chama isto.
export async function enqueuePrintJob(params: TEnqueuePrintJobParams) {
	const rendered = renderPrintJobContent({ finalidade: params.finalidade, dados: params.dados, formatoPreferido: params.formatoPreferido });
	const expiraEm = dayjs().add(FINALIDADE_TTL_MINUTES[params.finalidade], "minutes").toDate();

	const [insertedJob] = await db
		.insert(printJobs)
		.values({
			organizacaoId: params.organizacaoId,
			lojaId: params.lojaId ?? null,
			finalidade: params.finalidade,
			formato: rendered.formato,
			conteudo: rendered.conteudo,
			conteudoUrl: rendered.conteudoUrl,
			copias: params.copias ?? 1,
			dados: params.dados,
			origemTipo: params.origemTipo,
			origemId: params.origemId ?? null,
			chaveIdempotencia: params.chaveIdempotencia ?? null,
			impressoraId: params.impressoraId ?? null,
			solicitadoPorId: params.solicitadoPorId ?? null,
			expiraEm,
		})
		.onConflictDoNothing({ target: [printJobs.organizacaoId, printJobs.chaveIdempotencia] })
		.returning({ id: printJobs.id, status: printJobs.status, expiraEm: printJobs.expiraEm });

	if (insertedJob) return { job: insertedJob, created: true };

	// Conflito de chave de idempotência: devolve o job original em vez de duplicar a impressão.
	const existingJob = await db.query.printJobs.findFirst({
		where: and(eq(printJobs.organizacaoId, params.organizacaoId), eq(printJobs.chaveIdempotencia, params.chaveIdempotencia as string)),
		columns: { id: true, status: true, expiraEm: true },
	});
	if (!existingJob) throw new createHttpError.InternalServerError("Erro ao criar job de impressão.");
	return { job: existingJob, created: false };
}
export type TEnqueuePrintJobOutput = Awaited<ReturnType<typeof enqueuePrintJob>>;

// Guarda anti-lixo do auto-print: sem impressora ativa atendendo a finalidade, não vale
// enfileirar (acumularia EXPIRADO no dashboard a cada venda). Ignora `disponivel` de propósito:
// agent temporariamente offline deve continuar recebendo jobs (imprime ao voltar, dentro do TTL);
// disponivel=false com ativa=true é flutuação de sync, não decisão do lojista.
export async function organizationHasActivePrinterForFinalidade({
	organizacaoId,
	finalidade,
}: {
	organizacaoId: string;
	finalidade: TPrintJobFinalidadeEnum;
}) {
	const printers = await db.query.agentPrinters.findMany({
		where: and(eq(agentPrinters.organizacaoId, organizacaoId), eq(agentPrinters.ativa, true)),
		columns: { finalidades: true },
	});
	return printers.some((printer) => printer.finalidades.includes(finalidade));
}

// Impressoras do principal aptas a receber trabalho (ativas no dashboard e presentes no último sync).
export async function getClaimablePrinters(principalId: string) {
	return await db.query.agentPrinters.findMany({
		where: and(eq(agentPrinters.principalId, principalId), eq(agentPrinters.ativa, true), eq(agentPrinters.disponivel, true)),
	});
}

function resolvePrinterForJob({
	job,
	printers,
}: {
	job: { finalidade: string; formato: TPrintJobFormatoEnum; impressoraId: string | null };
	printers: TAgentPrinterEntity[];
}) {
	const compatiblePrinters = printers.filter((printer) => FORMATO_DRIVERS_COMPATIVEIS[job.formato].includes(printer.driver));
	if (job.impressoraId) return compatiblePrinters.find((printer) => printer.id === job.impressoraId) ?? null;
	return compatiblePrinters.find((printer) => printer.finalidades.includes(job.finalidade)) ?? null;
}

type TClaimPrintJobsParams = {
	actor: TExternalActorContext;
	limite: number;
};
// Claim atômico: transição condicional PENDENTE→PROCESSANDO (ou retomada de lease vencida)
// com tentativa própria — dois agents nunca levam o mesmo job (mesmo padrão da idempotência POI).
export async function claimPrintJobs({ actor, limite }: TClaimPrintJobsParams) {
	const principal = await db.query.accessPrincipals.findFirst({
		where: eq(accessPrincipals.id, actor.principalId),
		columns: { lojaId: true },
	});
	const printers = await getClaimablePrinters(actor.principalId);
	if (printers.length === 0) return { jobs: [], impressorasAtivas: 0 };

	const finalidadesAtendidas = Array.from(new Set(printers.flatMap((printer) => printer.finalidades)));
	const printerIds = printers.map((printer) => printer.id);
	const now = new Date();

	// Candidatos: roteáveis por finalidade OU endereçados a uma impressora deste agent.
	const finalidadeCondition =
		finalidadesAtendidas.length > 0
			? or(inArray(printJobs.finalidade, finalidadesAtendidas as never), inArray(printJobs.impressoraId, printerIds))
			: inArray(printJobs.impressoraId, printerIds);

	const candidates = await db.query.printJobs.findMany({
		where: and(
			eq(printJobs.organizacaoId, actor.organizationId),
			claimablePrintJobsCondition(now),
			finalidadeCondition,
			// Job de loja específica só sai no agent daquela loja.
			principal?.lojaId ? or(isNull(printJobs.lojaId), eq(printJobs.lojaId, principal.lojaId)) : isNull(printJobs.lojaId),
		),
		orderBy: (fields, { asc }) => asc(fields.dataInsercao),
		limit: limite,
	});

	const claimedJobs: Array<{
		id: string;
		finalidade: string;
		formato: TPrintJobFormatoEnum;
		conteudo: string | null;
		conteudoUrl: string | null;
		copias: number;
		tentativaId: string;
		leaseExpiraEm: Date;
		impressora: { id: string; nomeSistema: string; apelido: string | null; driver: TAgentPrinterEntity["driver"]; metadados: unknown };
	}> = [];

	for (const candidate of candidates) {
		const printer = resolvePrinterForJob({ job: candidate, printers });
		if (!printer) continue;

		const tentativaId = crypto.randomUUID();
		const leaseExpiraEm = dayjs().add(CLAIM_LEASE_MINUTES, "minutes").toDate();
		const [claimed] = await db
			.update(printJobs)
			.set({
				status: "PROCESSANDO",
				tentativaId,
				leaseExpiraEm,
				numeroTentativas: candidate.numeroTentativas + 1,
				principalId: actor.principalId,
				impressoraId: printer.id,
			})
			.where(
				and(
					eq(printJobs.id, candidate.id),
					// Reavaliação atômica: outro agent pode ter levado o job entre o select e este update.
					or(eq(printJobs.status, "PENDENTE"), and(eq(printJobs.status, "PROCESSANDO"), lt(printJobs.leaseExpiraEm, new Date()))),
					lt(printJobs.numeroTentativas, PRINT_JOB_MAX_TENTATIVAS),
				),
			)
			.returning({ id: printJobs.id });
		if (!claimed) continue;

		claimedJobs.push({
			id: candidate.id,
			finalidade: candidate.finalidade,
			formato: candidate.formato,
			conteudo: candidate.conteudo,
			conteudoUrl: candidate.conteudoUrl,
			copias: candidate.copias,
			tentativaId,
			leaseExpiraEm,
			impressora: { id: printer.id, nomeSistema: printer.nomeSistema, apelido: printer.apelido, driver: printer.driver, metadados: printer.metadados },
		});
	}

	return { jobs: claimedJobs, impressorasAtivas: printers.length };
}
export type TClaimPrintJobsOutput = Awaited<ReturnType<typeof claimPrintJobs>>;

type TReportPrintJobResultParams = {
	actor: TExternalActorContext;
	jobId: string;
	tentativaId: string;
	resultado: "IMPRESSO" | "ERRO";
	erro?: string | null;
};
// Report exige posse da tentativa: se a lease venceu e outro claim assumiu, este report é rejeitado.
export async function reportPrintJobResult({ actor, jobId, tentativaId, resultado, erro }: TReportPrintJobResultParams) {
	const [reported] = await db
		.update(printJobs)
		.set({
			status: resultado,
			erro: resultado === "ERRO" ? (erro ?? "Erro não especificado pelo agente.") : null,
			dataConclusao: new Date(),
		})
		.where(
			and(
				eq(printJobs.id, jobId),
				eq(printJobs.organizacaoId, actor.organizationId),
				eq(printJobs.principalId, actor.principalId),
				eq(printJobs.tentativaId, tentativaId),
				eq(printJobs.status, "PROCESSANDO"),
			),
		)
		.returning({ id: printJobs.id, status: printJobs.status });

	if (!reported) throw new createHttpError.Conflict("Esta tentativa não possui mais a posse do job de impressão.");
	return reported;
}
export type TReportPrintJobResultOutput = Awaited<ReturnType<typeof reportPrintJobResult>>;

type TListPrintJobsParams = {
	organizacaoId: string;
	status?: string | null;
	limite: number;
};
// Listagem para diagnóstico (agent e dashboard) — sem o conteúdo renderizado, que só interessa ao claim.
export async function listPrintJobs({ organizacaoId, status, limite }: TListPrintJobsParams) {
	return await db.query.printJobs.findMany({
		where: and(eq(printJobs.organizacaoId, organizacaoId), status ? eq(printJobs.status, status as never) : undefined),
		columns: {
			id: true,
			lojaId: true,
			finalidade: true,
			formato: true,
			copias: true,
			origemTipo: true,
			origemId: true,
			status: true,
			numeroTentativas: true,
			impressoraId: true,
			principalId: true,
			erro: true,
			expiraEm: true,
			dataInsercao: true,
			dataConclusao: true,
		},
		orderBy: [desc(printJobs.dataInsercao)],
		limit: limite,
	});
}
export type TListPrintJobsOutput = Awaited<ReturnType<typeof listPrintJobs>>;
