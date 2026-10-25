import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getNextRecurringOccurrence } from "@/lib/finances/recurrence";
import { canCreateFinances, canEditFinances, canViewFinances } from "@/lib/permissions/finances";
import {
	CreateFinancialRecurringRuleInputSchema,
	UpdateFinancialRecurringRuleInputSchema,
	type TCreateFinancialRecurringRuleInput,
	type TUpdateFinancialRecurringRuleInput,
	type TFinancialRecurringRuleConfig,
} from "@/schemas/financial-recurring";
import { db, type DBTransaction } from "@/services/drizzle";
import { accountingEntries, financialAccounts, financialRecurringRules } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";
import dayjs from "dayjs";

const GetRecurringRulesInputSchema = z.object({ id: z.string().optional().nullable() });
export type TGetRecurringRulesInput = z.infer<typeof GetRecurringRulesInputSchema>;
export type TCreateRecurringRuleInput = TCreateFinancialRecurringRuleInput;
export type TUpdateRecurringRuleInput = TUpdateFinancialRecurringRuleInput;

function getOrganizationId(session: TAuthUserSession) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	return organizationId;
}

async function getRecurringRules({ input, session }: { input: TGetRecurringRulesInput; session: TAuthUserSession }) {
	const organizacaoId = getOrganizationId(session);
	if (input.id) {
		const rule = await db.query.financialRecurringRules.findFirst({
			where: and(eq(financialRecurringRules.id, input.id), eq(financialRecurringRules.organizacaoId, organizacaoId)),
			with: { lancamentoContabilOrigem: { columns: { id: true, titulo: true, valor: true, dataCompetencia: true } } },
		});
		if (!rule) throw new createHttpError.NotFound("Regra de recorrência não encontrada.");
		return { data: { byId: rule, default: null }, message: "Regra de recorrência encontrada com sucesso." };
	}

	const rules = await db.query.financialRecurringRules.findMany({
		where: eq(financialRecurringRules.organizacaoId, organizacaoId),
		with: { lancamentoContabilOrigem: { columns: { id: true, titulo: true, valor: true, dataCompetencia: true } } },
		orderBy: (fields, { desc }) => desc(fields.dataInsercao),
	});
	return { data: { byId: null, default: rules }, message: "Regras de recorrência encontradas com sucesso." };
}
export type TGetRecurringRulesOutput = Awaited<ReturnType<typeof getRecurringRules>>;

async function getOriginEntry({ tx, entryId, organizacaoId }: { tx: DBTransaction; entryId: string; organizacaoId: string }) {
	const entry = await tx.query.accountingEntries.findFirst({
		where: and(eq(accountingEntries.id, entryId), eq(accountingEntries.organizacaoId, organizacaoId)),
		with: { transacoesFinanceiras: true },
	});
	if (!entry) throw new createHttpError.NotFound("Lançamento contábil de origem não encontrado.");
	if (entry.origemTipo !== "MANUAL") throw new createHttpError.BadRequest("Somente lançamentos manuais podem iniciar uma recorrência financeira.");
	if (entry.recorrenciaRegraId) throw new createHttpError.Conflict("Este lançamento já possui uma regra de recorrência.");
	return entry;
}

async function createRecurringRule({
	input,
	session,
}: {
	input: z.infer<typeof CreateFinancialRecurringRuleInputSchema>;
	session: TAuthUserSession;
}) {
	const organizacaoId = getOrganizationId(session);
	if (!canCreateFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para criar regras de recorrência.");

	const [rule] = await db.transaction(async (tx) => {
		const entry = await getOriginEntry({ tx, entryId: input.accountingEntryId, organizacaoId });
		const accountIds = entry.transacoesFinanceiras.map((transaction) => transaction.contaFinanceiraId).filter((id): id is string => !!id);
		const accounts = accountIds.length
			? await tx.query.financialAccounts.findMany({
					where: and(eq(financialAccounts.organizacaoId, organizacaoId), inArray(financialAccounts.id, accountIds)),
					columns: { id: true, tipo: true },
				})
			: [];
		const accountById = new Map(accounts.map((account) => [account.id, account]));
		if (accounts.length !== new Set(accountIds).size) throw new createHttpError.NotFound("Conta financeira da recorrência não encontrada.");
		const templateTransacoes = entry.transacoesFinanceiras.map((transaction) => {
			const account = transaction.contaFinanceiraId ? accountById.get(transaction.contaFinanceiraId) : undefined;
			return {
				contaFinanceiraId: transaction.contaFinanceiraId,
				titulo: transaction.titulo,
				tipo: transaction.tipo,
				valor: transaction.valor,
				metodo: transaction.metodo,
				diaPrevisao: account?.tipo === "CARTAO_CREDITO" ? null : dayjs(transaction.dataPrevisao).date(),
				previsaoModo: account?.tipo === "CARTAO_CREDITO" ? ("INFERIR_PELA_CONTA" as const) : ("DIA_FIXO" as const),
			};
		});
		const config = input.config;
		const nextOccurrence = getNextRecurringOccurrence(entry.dataCompetencia, config);
		const [createdRule] = await tx
			.insert(financialRecurringRules)
			.values({
				organizacaoId,
				autorId: session.user.id,
				lancamentoContabilOrigemId: entry.id,
				clienteId: entry.clienteId,
				fornecedorId: entry.fornecedorId,
				status: "ATIVA",
				config,
				templateLancamento: {
					clienteId: entry.clienteId,
					fornecedorId: entry.fornecedorId,
					titulo: entry.titulo,
					anotacoes: entry.anotacoes,
					idContaDebito: entry.idContaDebito,
					idContaCredito: entry.idContaCredito,
					valor: entry.valor,
					valorPrevisto: entry.valorPrevisto,
					dataCompetencia: entry.dataCompetencia,
				},
				templateTransacoes,
				proximaGeracaoEm: nextOccurrence,
				gerarAte: config.fim ?? null,
			})
			.returning({ id: financialRecurringRules.id });
		if (!createdRule) throw new createHttpError.InternalServerError("Não foi possível criar a regra de recorrência.");
		await tx
			.update(accountingEntries)
			.set({ recorrenciaRegraId: createdRule.id, recorrenciaInstanciaData: entry.dataCompetencia })
			.where(eq(accountingEntries.id, entry.id));
		return [createdRule] as const;
	});

	return { data: { id: rule.id }, message: "Regra de recorrência criada com sucesso." };
}
export type TCreateRecurringRuleOutput = Awaited<ReturnType<typeof createRecurringRule>>;

async function updateRecurringRule({
	input,
	session,
}: {
	input: z.infer<typeof UpdateFinancialRecurringRuleInputSchema>;
	session: TAuthUserSession;
}) {
	const organizacaoId = getOrganizationId(session);
	if (!canEditFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para editar regras de recorrência.");
	const existing = await db.query.financialRecurringRules.findFirst({
		where: and(eq(financialRecurringRules.id, input.ruleId), eq(financialRecurringRules.organizacaoId, organizacaoId)),
	});
	if (!existing) throw new createHttpError.NotFound("Regra de recorrência não encontrada.");
	const config = input.config ?? (existing.config as TFinancialRecurringRuleConfig);
	const status = input.status ?? existing.status;
	await db
		.update(financialRecurringRules)
		.set({ config, status, proximaGeracaoEm: status === "ATIVA" ? getNextRecurringOccurrence(new Date(), config) : null, gerarAte: config.fim ?? null })
		.where(and(eq(financialRecurringRules.id, input.ruleId), eq(financialRecurringRules.organizacaoId, organizacaoId)));
	return { data: { id: input.ruleId }, message: "Regra de recorrência atualizada com sucesso." };
}
export type TUpdateRecurringRuleOutput = Awaited<ReturnType<typeof updateRecurringRule>>;

async function getRecurringRulesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!canViewFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para acessar o módulo financeiro.");
	const input = GetRecurringRulesInputSchema.parse({ id: request.nextUrl.searchParams.get("id") });
	return NextResponse.json(await getRecurringRules({ input, session }));
}

async function createRecurringRuleRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = CreateFinancialRecurringRuleInputSchema.parse(await request.json());
	return NextResponse.json(await createRecurringRule({ input, session }), { status: 201 });
}

async function updateRecurringRuleRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = UpdateFinancialRecurringRuleInputSchema.parse(await request.json());
	return NextResponse.json(await updateRecurringRule({ input, session }));
}

export const GET = appApiHandler({ GET: getRecurringRulesRoute });
export const POST = appApiHandler({ POST: createRecurringRuleRoute });
export const PUT = appApiHandler({ PUT: updateRecurringRuleRoute });
