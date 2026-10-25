import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { closeFixedAssetsMonth, listPendingFixedAssetsMonths } from "@/lib/fixed-assets/monthly-close";
import { splitFixedAsset, writeOffFixedAsset } from "@/lib/fixed-assets/write-off";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

/**
 * Ações do patrimônio que não são edição de campos: dividir um registro (plaqueta própria ou baixa
 * parcial), baixar um bem e fechar (ou refechar) um mês. Uma rota, uma ação por chamada.
 */

const SplitSchema = z.object({
	action: z.literal("DIVIDIR"),
	assetId: z.string({ required_error: "ID do bem não informado." }),
	parte: z.number({ required_error: "Quantidade a separar não informada." }).int().positive(),
	separado: z
		.object({
			codigoPatrimonio: z.string().optional().nullable(),
			numeroSerie: z.string().optional().nullable(),
			localizacao: z.string().optional().nullable(),
			descricao: z.string().optional().nullable(),
		})
		.optional()
		.nullable(),
});
const WriteOffSchema = z.object({
	action: z.literal("BAIXAR"),
	assetId: z.string({ required_error: "ID do bem não informado." }),
	// Baixa parcial: separa `parte` unidades e baixa só elas.
	parte: z.number().int().positive().optional().nullable(),
	dataBaixa: z
		.string({ required_error: "Data da baixa não informada." })
		.datetime({ message: "Tipo não válido para a data da baixa." })
		.transform((value) => new Date(value)),
	motivoBaixa: z.string({ required_error: "Motivo da baixa não informado." }).trim().min(3, "Descreva o motivo da baixa."),
	valorBaixa: z.number().nonnegative().optional().nullable(),
});
const CloseMonthSchema = z.object({
	action: z.literal("FECHAR_MES"),
	month: z.string({ required_error: "Mês não informado." }).regex(/^\d{4}-\d{2}$/, "Use AAAA-MM."),
	coeficienteCiap: z.number().min(0).max(1).optional().nullable(),
});
const FixedAssetActionInputSchema = z.discriminatedUnion("action", [SplitSchema, WriteOffSchema, CloseMonthSchema]);
export type TFixedAssetActionInput = z.input<typeof FixedAssetActionInputSchema>;
type TFixedAssetActionParsed = z.infer<typeof FixedAssetActionInputSchema>;

async function runFixedAssetAction({ input, session }: { input: TFixedAssetActionParsed; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const userId = session.user.id;
	return db.transaction(async (tx) => {
		if (input.action === "DIVIDIR") {
			const separadoId = await splitFixedAsset({ trx: tx, organizationId, userId, assetId: input.assetId, parte: input.parte, separado: input.separado ?? undefined });
			return { data: { assetId: input.assetId, separadoId, month: null, closing: null }, message: "Bem dividido com sucesso." };
		}
		if (input.action === "BAIXAR") {
			let targetId = input.assetId;
			if (input.parte) targetId = await splitFixedAsset({ trx: tx, organizationId, userId, assetId: input.assetId, parte: input.parte });
			const result = await writeOffFixedAsset({
				trx: tx,
				organizationId,
				userId,
				assetId: targetId,
				dataBaixa: input.dataBaixa,
				motivoBaixa: input.motivoBaixa,
				valorBaixa: input.valorBaixa ?? null,
			});
			return { data: { assetId: input.assetId, separadoId: input.parte ? targetId : null, month: null, closing: { entryId: result.entryId } }, message: "Baixa registrada com sucesso." };
		}
		const closing = await closeFixedAssetsMonth({ trx: tx, organizationId, month: input.month, userId, coeficienteCiap: input.coeficienteCiap ?? 1 });
		return { data: { assetId: null, separadoId: null, month: closing.month, closing }, message: `Mês ${input.month} do patrimônio fechado.` };
	});
}
export type TFixedAssetActionOutput = Awaited<ReturnType<typeof runFixedAssetAction>>;

async function fixedAssetActionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership?.permissoes.compras.editar) throw new createHttpError.Forbidden("Você não possui permissão para alterar o patrimônio.");
	const input = FixedAssetActionInputSchema.parse(await request.json());
	return NextResponse.json(await runFixedAssetAction({ input, session }));
}
export const POST = appApiHandler({ POST: fixedAssetActionRoute });

/** Meses completos ainda sem fechamento (o cron fecha sozinho; aqui é só visibilidade). */
async function getPendingMonthsRoute() {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const pending = await listPendingFixedAssetsMonths({ trx: db, organizationId });
	return NextResponse.json({ data: { pending }, message: "Meses pendentes listados." });
}
export type TGetFixedAssetsPendingMonthsOutput = { data: { pending: string[] }; message: string };
export const GET = appApiHandler({ GET: getPendingMonthsRoute });
