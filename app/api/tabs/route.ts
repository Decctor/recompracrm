import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { openTab } from "@/lib/tabs";
import { TabStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { sales, tabs } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

const GetTabsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo nao valido para ID da conta." }).optional().nullable(),
	status: z
		.string({ invalid_type_error: "Tipo nao valido para status." })
		.optional()
		.nullable()
		.transform((v) => (v ? TabStatusEnum.array().parse(v.split(",")) : ["ABERTA" as const])),
	servicePointId: z.string({ invalid_type_error: "Tipo nao valido para ID do ponto." }).optional().nullable(),
});
export type TGetTabsInput = z.infer<typeof GetTabsInputSchema>;

const CreateTabInputSchema = z.object({
	servicePointId: z.string({ invalid_type_error: "Tipo nao valido para ID do ponto." }).optional().nullable(),
	codigo: z.string({ invalid_type_error: "Tipo nao valido para codigo da comanda." }).optional().nullable(),
	serviceCardId: z.string({ invalid_type_error: "Tipo nao valido para ID da comanda." }).optional().nullable(),
	clienteId: z.string({ invalid_type_error: "Tipo nao valido para ID do cliente." }).optional().nullable(),
	responsavelVendedorId: z.string({ invalid_type_error: "Tipo nao valido para ID do vendedor." }).optional().nullable(),
	observacoes: z.string({ invalid_type_error: "Tipo nao valido para observacoes." }).optional().nullable(),
});
export type TCreateTabInput = z.infer<typeof CreateTabInputSchema>;

// ============================================================================
// SERVICES
// ============================================================================

const TAB_LIST_WITH = {
	servicePoint: { columns: { id: true, rotulo: true, grupo: true, tipo: true } },
	cliente: { columns: { id: true, nome: true, telefone: true } },
	responsavelVendedor: { columns: { id: true, nome: true } },
} as const;

async function getTabs({ input, orgId }: { input: TGetTabsInput; orgId: string }) {
	if (input.id) {
		const tab = await db.query.tabs.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.id as string), eq(fields.organizacaoId, orgId)),
			with: {
				...TAB_LIST_WITH,
				pedidos: {
					orderBy: (fields, { asc }) => asc(fields.numero),
					with: {
						itens: {
							with: { adicionais: true },
						},
					},
				},
			},
		});
		if (!tab) throw new createHttpError.NotFound("Conta nao encontrada.");

		const draftSale = await db.query.sales.findFirst({
			where: and(eq(sales.tabId, tab.id), eq(sales.statusVenda, "ORCAMENTO")),
			columns: { id: true, valorTotal: true, descontosTotal: true },
		});

		return {
			data: {
				byId: {
					...tab,
					// Total parcial derivado da venda rascunho — nao existe recebivel antes do fechamento.
					consumoParcial: draftSale?.valorTotal ?? 0,
					vendaRascunhoId: draftSale?.id ?? null,
				},
				default: null,
			},
			message: "Conta encontrada.",
		};
	}

	const conditions = [eq(tabs.organizacaoId, orgId), inArray(tabs.status, input.status)];
	if (input.servicePointId) conditions.push(eq(tabs.servicePointId, input.servicePointId));

	const rows = await db.query.tabs.findMany({
		where: and(...conditions),
		with: {
			...TAB_LIST_WITH,
			// dataEnvio/dataInsercao alimentam o calculo de atraso das rodadas no board.
			pedidos: { columns: { id: true, numero: true, status: true, dataEnvio: true, dataInsercao: true } },
			vendas: {
				where: (fields, { eq }) => eq(fields.statusVenda, "ORCAMENTO"),
				columns: { id: true, valorTotal: true },
			},
		},
		orderBy: (fields, { asc }) => asc(fields.dataAbertura),
	});

	const list = rows.map((tab) => {
		const { vendas, ...rest } = tab;
		return {
			...rest,
			consumoParcial: vendas[0]?.valorTotal ?? 0,
			vendaRascunhoId: vendas[0]?.id ?? null,
		};
	});

	return {
		data: { byId: null, default: list },
		message: "Contas carregadas com sucesso.",
	};
}
export type TGetTabsOutput = Awaited<ReturnType<typeof getTabs>>;
export type TTabListItem = NonNullable<TGetTabsOutput["data"]["default"]>[number];
export type TTabDetails = NonNullable<TGetTabsOutput["data"]["byId"]>;

async function createTab({ input, session }: { input: TCreateTabInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;
	const result = await openTab({ orgId, userId: session.user.id, input });

	return {
		data: {
			tab: result.tab,
			created: result.created,
			// Token bruto do QR da tab: SOMENTE na criacao.
			tokenPublico: result.tokenPublico,
		},
		message: result.created ? "Conta aberta com sucesso." : "Conta ja aberta neste ponto — resolvida.",
	};
}
export type TCreateTabOutput = Awaited<ReturnType<typeof createTab>>;

// ============================================================================
// HANDLERS
// ============================================================================

async function getTabsRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const { searchParams } = new URL(request.url);
	const input = GetTabsInputSchema.parse({
		id: searchParams.get("id"),
		status: searchParams.get("status"),
		servicePointId: searchParams.get("servicePointId"),
	});
	const result = await getTabs({ input, orgId: session.membership!.organizacao.id });
	return NextResponse.json(result);
}

async function createTabRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const body = await request.json();
	const input = CreateTabInputSchema.parse(body);
	const result = await createTab({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getTabsRoute });
export const POST = appApiHandler({ POST: createTabRoute });
