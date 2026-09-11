import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { launchTabOrder } from "@/lib/tabs";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// INPUT SCHEMA (mesmo shape de itens do rascunho de POS — validacao autoritativa no service)
// ============================================================================

const TabOrderItemModifierInputSchema = z.object({
	opcaoId: z.string({ required_error: "ID da opcao nao informado." }),
	nome: z.string({ required_error: "Nome do modificador nao informado." }),
	quantidade: z.number({ required_error: "Quantidade do modificador nao informada." }),
	valorUnitario: z.number({ required_error: "Valor unitario do modificador nao informado." }),
	valorTotal: z.number({ required_error: "Valor total do modificador nao informado." }),
});

const TabOrderItemInputSchema = z.object({
	produtoId: z.string({ required_error: "ID do produto nao informado." }),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo nao valido para ID da variante." }).optional().nullable(),
	nome: z.string({ required_error: "Nome do item nao informado." }),
	codigo: z.string({ required_error: "Codigo do item nao informado." }),
	imagemUrl: z.string({ invalid_type_error: "Tipo nao valido para URL da imagem." }).optional().nullable(),
	quantidade: z.number({ required_error: "Quantidade nao informada." }).min(1),
	valorUnitarioBase: z.number({ required_error: "Valor unitario base nao informado." }),
	valorModificadores: z.number({ required_error: "Valor de modificadores nao informado." }),
	valorUnitarioFinal: z.number({ required_error: "Valor unitario final nao informado." }),
	valorTotalBruto: z.number({ required_error: "Valor total bruto nao informado." }),
	valorDesconto: z.number({ invalid_type_error: "Tipo nao valido para desconto." }).default(0),
	valorTotalLiquido: z.number({ required_error: "Valor total liquido nao informado." }),
	observacoes: z
		.string({ invalid_type_error: "Tipo nao valido para observacoes do item." })
		.max(500, { message: "Observacao do item deve ter no maximo 500 caracteres." })
		.optional()
		.nullable(),
	modificadores: z.array(TabOrderItemModifierInputSchema),
});

const CreateTabOrderInputSchema = z.object({
	tabId: z.string({ required_error: "ID da conta nao informado." }),
	// UUID gerado no client, OBRIGATORIO: duplo toque/retry reenvia o mesmo id e o pedido nao
	// duplica. Invariante 6 do plano — a idempotencia nao pode ser opcional na superficie autoritativa.
	tabOrderId: z.string({ required_error: "ID do pedido nao informado." }).uuid({ message: "ID do pedido invalido." }),
	observacoes: z.string({ invalid_type_error: "Tipo nao valido para observacoes." }).optional().nullable(),
	itens: z.array(TabOrderItemInputSchema).min(1, { message: "Pelo menos um item e obrigatorio." }),
});
export type TCreateTabOrderInput = z.infer<typeof CreateTabOrderInputSchema>;

// ============================================================================
// SERVICE
// ============================================================================

async function createTabOrder({ input, session }: { input: TCreateTabOrderInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;
	const result = await launchTabOrder({ orgId, userId: session.user.id, input });

	return {
		data: result,
		message: result.deduplicated ? "Pedido ja havia sido lancado." : `Pedido ${result.tabOrderNumero} lancado com sucesso.`,
	};
}
export type TCreateTabOrderOutput = Awaited<ReturnType<typeof createTabOrder>>;

// ============================================================================
// HANDLER
// ============================================================================

async function createTabOrderRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());

	const body = await request.json();
	const input = CreateTabOrderInputSchema.parse(body);
	const result = await createTabOrder({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: createTabOrderRoute });
