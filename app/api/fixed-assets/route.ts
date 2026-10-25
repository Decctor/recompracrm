import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { fromCents, getAccumulatedDepreciationCents, getBookValueCents, getCiapInstallmentCents, getMonthKey, getMonthsInUse, getPreviousMonthKey } from "@/lib/fixed-assets/depreciation";
import { findLatestClosedFixedAssetsMonth } from "@/lib/fixed-assets/monthly-close";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { FixedAssetStatusEnum } from "@/schemas/enums";
import { FixedAssetSchema } from "@/schemas/fixed-assets";
import { db } from "@/services/drizzle";
import { fixedAssets, type TFixedAssetEntity } from "@/services/drizzle/schema";
import { and, count, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

/** Bens do ativo imobilizado (ADR-0002, decisão 8). Nascem do recebimento de compras ou do cadastro manual. */

function getSessionOrganization(session: TAuthUserSession) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	return organizationId;
}

/** Posição contábil do bem como o razão a reflete: até o último mês completo. */
export function describeFixedAssetPosition(asset: TFixedAssetEntity, now = new Date()) {
	const month = getPreviousMonthKey(getMonthKey(now));
	const acumulada = getAccumulatedDepreciationCents(asset, month);
	let ciapApropriado = 0;
	if (asset.creditoIcmsCiap) {
		for (let index = 0; index < getMonthsInUse(asset, month) && index < 48; index += 1) {
			const start = asset.dataInicioUso;
			const key = getMonthKey(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1)));
			ciapApropriado += getCiapInstallmentCents(asset, key);
		}
	}
	return {
		mesReferencia: month,
		mesesEmUso: getMonthsInUse(asset, month),
		depreciacaoAcumulada: fromCents(acumulada),
		valorContabil: fromCents(getBookValueCents(asset, month)),
		ciapApropriado: fromCents(ciapApropriado),
		ciapRestante: fromCents(Math.max(0, Math.round((asset.creditoIcmsCiap ?? 0) * 100) - ciapApropriado)),
	};
}

const GetFixedAssetsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo inválido para o ID do bem." }).optional().nullable(),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
	search: z.string({ invalid_type_error: "Tipo inválido para a busca." }).optional().nullable(),
	statuses: z
		.string({ invalid_type_error: "Tipo inválido para os status." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",").filter((status) => FixedAssetStatusEnum.safeParse(status).success) : [])),
});
export type TGetFixedAssetsInput = z.infer<typeof GetFixedAssetsInputSchema>;

async function getFixedAssets({ input, session }: { input: TGetFixedAssetsInput; session: TAuthUserSession }) {
	const organizationId = getSessionOrganization(session);
	if (input.id) {
		const asset = await db.query.fixedAssets.findFirst({
			where: and(eq(fixedAssets.id, input.id), eq(fixedAssets.organizacaoId, organizationId)),
			with: {
				produto: { columns: { id: true, nome: true, codigo: true, imagemCapaUrl: true } },
				compra: { columns: { id: true, titulo: true } },
				responsavel: { columns: { id: true, nome: true, avatarUrl: true } },
			},
		});
		if (!asset) throw new createHttpError.NotFound("Bem não encontrado.");
		const ultimoFechamento = await findLatestClosedFixedAssetsMonth({ trx: db, organizationId });
		return { data: { byId: { ...asset, posicao: describeFixedAssetPosition(asset), ultimoFechamento }, default: null }, message: "Bem encontrado com sucesso." };
	}

	const conditions: SQL[] = [eq(fixedAssets.organizacaoId, organizationId)];
	if (input.search?.trim())
		conditions.push(
			or(
				createSimplifiedSearchCondition(fixedAssets.descricao, input.search),
				createSimplifiedSearchCondition(fixedAssets.codigoPatrimonio, input.search),
				createSimplifiedSearchCondition(fixedAssets.numeroSerie, input.search),
				createSimplifiedSearchCondition(fixedAssets.localizacao, input.search),
			)!,
		);
	if (input.statuses.length > 0) conditions.push(inArray(fixedAssets.status, input.statuses as TFixedAssetEntity["status"][]));
	const PAGE_SIZE = 25;
	const [[{ matched }], assets] = await Promise.all([
		db
			.select({ matched: count() })
			.from(fixedAssets)
			.where(and(...conditions)),
		db.query.fixedAssets.findMany({
			where: and(...conditions),
			with: { produto: { columns: { id: true, nome: true, imagemCapaUrl: true } }, compra: { columns: { id: true, titulo: true } } },
			orderBy: [desc(fixedAssets.dataInsercao)],
			limit: PAGE_SIZE,
			offset: PAGE_SIZE * (input.page - 1),
		}),
	]);
	return {
		data: {
			byId: null,
			default: {
				assets: assets.map((asset) => ({ ...asset, posicao: describeFixedAssetPosition(asset) })),
				assetsMatched: matched,
				totalPages: Math.ceil(matched / PAGE_SIZE),
			},
		},
		message: "Bens encontrados com sucesso.",
	};
}
export type TGetFixedAssetsOutput = Awaited<ReturnType<typeof getFixedAssets>>;
export type TGetFixedAssetsOutputById = NonNullable<TGetFixedAssetsOutput["data"]["byId"]>;
export type TGetFixedAssetsOutputDefault = NonNullable<TGetFixedAssetsOutput["data"]["default"]>;

async function getFixedAssetsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership?.permissoes.compras.visualizar) throw new createHttpError.Forbidden("Você não possui permissão para ver o patrimônio.");
	const input = GetFixedAssetsInputSchema.parse({
		id: request.nextUrl.searchParams.get("id") ?? undefined,
		page: request.nextUrl.searchParams.get("page") ?? undefined,
		search: request.nextUrl.searchParams.get("search") ?? undefined,
		statuses: request.nextUrl.searchParams.get("statuses") ?? undefined,
	});
	return NextResponse.json(await getFixedAssets({ input, session }));
}
export const GET = appApiHandler({ GET: getFixedAssetsRoute });

// Cadastro manual: bens que já existiam antes do sistema (ou comprados fora dele).
const CreateFixedAssetInputSchema = z.object({
	asset: FixedAssetSchema.omit({
		organizacaoId: true,
		compraId: true,
		compraItemId: true,
		dataBaixa: true,
		motivoBaixa: true,
		valorBaixa: true,
		autorId: true,
		dataInsercao: true,
		dataAtualizacao: true,
	}),
});
// O cliente envia datas em ISO (`z.input`); o serviço recebe o resultado do parse.
export type TCreateFixedAssetInput = z.input<typeof CreateFixedAssetInputSchema>;
type TCreateFixedAssetParsed = z.infer<typeof CreateFixedAssetInputSchema>;

async function createFixedAsset({ input, session }: { input: TCreateFixedAssetParsed; session: TAuthUserSession }) {
	const organizationId = getSessionOrganization(session);
	const { asset } = input;
	if (asset.status === "BAIXADO") throw new createHttpError.BadRequest("Um bem não nasce baixado: cadastre-o e registre a baixa depois.");
	if (asset.valorResidual > asset.valorAquisicao) throw new createHttpError.BadRequest("O valor residual não pode passar do valor de aquisição.");
	const [inserted] = await db
		.insert(fixedAssets)
		.values({ ...asset, organizacaoId: organizationId, autorId: session.user.id })
		.returning({ id: fixedAssets.id });
	if (!inserted) throw new createHttpError.InternalServerError("Erro ao cadastrar o bem.");
	return { data: { insertedId: inserted.id }, message: "Bem cadastrado com sucesso." };
}
export type TCreateFixedAssetOutput = Awaited<ReturnType<typeof createFixedAsset>>;

async function createFixedAssetRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership?.permissoes.compras.editar) throw new createHttpError.Forbidden("Você não possui permissão para cadastrar bens.");
	const input = CreateFixedAssetInputSchema.parse(await request.json());
	return NextResponse.json(await createFixedAsset({ input, session }), { status: 201 });
}
export const POST = appApiHandler({ POST: createFixedAssetRoute });

const UpdateFixedAssetInputSchema = z.object({
	assetId: z.string({ required_error: "ID do bem não informado." }),
	asset: FixedAssetSchema.pick({
		descricao: true,
		codigoPatrimonio: true,
		numeroSerie: true,
		localizacao: true,
		responsavelId: true,
		status: true,
		vidaUtilMeses: true,
		valorResidual: true,
		dataInicioUso: true,
		anotacoes: true,
		valorAquisicao: true,
		depreciacaoAcumuladaInicial: true,
		creditoIcmsCiap: true,
	}),
});
export type TUpdateFixedAssetInput = z.input<typeof UpdateFixedAssetInputSchema>;
type TUpdateFixedAssetParsed = z.infer<typeof UpdateFixedAssetInputSchema>;

async function updateFixedAsset({ input, session }: { input: TUpdateFixedAssetParsed; session: TAuthUserSession }) {
	const organizationId = getSessionOrganization(session);
	const existing = await db.query.fixedAssets.findFirst({ where: and(eq(fixedAssets.id, input.assetId), eq(fixedAssets.organizacaoId, organizationId)) });
	if (!existing) throw new createHttpError.NotFound("Bem não encontrado.");
	if (existing.status === "BAIXADO") throw new createHttpError.BadRequest("Um bem baixado não é mais editado.");
	if (input.asset.status === "BAIXADO") throw new createHttpError.BadRequest("A baixa tem fluxo próprio: use a ação de baixar o bem.");
	const { asset } = input;
	// Valor de aquisição e CIAP vêm da compra quando o bem nasceu dela: aqui só o cadastro manual os edita.
	const fromPurchase = !!existing.compraItemId;
	const valorAquisicao = fromPurchase ? existing.valorAquisicao : asset.valorAquisicao;
	if (asset.valorResidual > valorAquisicao) throw new createHttpError.BadRequest("O valor residual não pode passar do valor de aquisição.");
	await db
		.update(fixedAssets)
		.set({
			descricao: asset.descricao,
			codigoPatrimonio: asset.codigoPatrimonio ?? null,
			numeroSerie: asset.numeroSerie ?? null,
			localizacao: asset.localizacao ?? null,
			responsavelId: asset.responsavelId ?? null,
			status: asset.status,
			vidaUtilMeses: asset.vidaUtilMeses,
			valorResidual: asset.valorResidual,
			dataInicioUso: asset.dataInicioUso,
			anotacoes: asset.anotacoes ?? null,
			...(fromPurchase ? {} : { valorAquisicao, depreciacaoAcumuladaInicial: asset.depreciacaoAcumuladaInicial, creditoIcmsCiap: asset.creditoIcmsCiap ?? null }),
			dataAtualizacao: new Date(),
		})
		.where(eq(fixedAssets.id, existing.id));
	return { data: { updatedId: existing.id }, message: "Bem atualizado com sucesso." };
}
export type TUpdateFixedAssetOutput = Awaited<ReturnType<typeof updateFixedAsset>>;

async function updateFixedAssetRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership?.permissoes.compras.editar) throw new createHttpError.Forbidden("Você não possui permissão para editar bens.");
	const input = UpdateFixedAssetInputSchema.parse(await request.json());
	return NextResponse.json(await updateFixedAsset({ input, session }));
}
export const PUT = appApiHandler({ PUT: updateFixedAssetRoute });
