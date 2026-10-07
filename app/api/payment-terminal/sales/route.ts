import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { PaymentTerminalError, createTerminalSale, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { PaymentMethodEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { accessPrincipals } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Fluxo A: venda nascida no terminal (scope payment-terminal:sales:create, Idempotency-Key
// obrigatório). O backend precifica pelo catálogo, confirma a venda com a transação pendente e
// devolve a cobrança já atribuída a este dispositivo — o app segue direto para a execução.
const CreateTerminalSaleInputSchema = z.object({
	sale: z.object({
		clienteId: z.string({ invalid_type_error: "Tipo inválido para o cliente." }).optional().nullable(),
		vendedorId: z.string({ invalid_type_error: "Tipo inválido para o vendedor." }).optional().nullable(),
		sessaoVendaId: z.string({ invalid_type_error: "Tipo inválido para o caixa." }).optional().nullable(),
		observacoes: z.string({ invalid_type_error: "Tipo inválido para observações." }).max(500).optional().nullable(),
		itens: z
			.array(
				z.object({
					produtoId: z.string({ required_error: "Produto não informado.", invalid_type_error: "Tipo inválido para o produto." }),
					produtoVarianteId: z.string({ invalid_type_error: "Tipo inválido para a variação." }).optional().nullable(),
					quantidade: z.number({ required_error: "Quantidade não informada.", invalid_type_error: "Tipo inválido para a quantidade." }).positive("A quantidade deve ser positiva."),
				}),
			)
			.min(1, "Adicione pelo menos um item à venda.")
			.max(200, "A venda excede o número máximo de itens."),
	}),
	payment: z.object({
		metodo: PaymentMethodEnum,
		totalParcelas: z.number({ invalid_type_error: "Tipo inválido para o total de parcelas." }).int().min(1).max(99).optional().nullable(),
	}),
});
export type TCreateTerminalSaleRouteInput = z.infer<typeof CreateTerminalSaleInputSchema>;
export type { TCreateTerminalSaleOutput } from "@/lib/payment-attempts";

async function createTerminalSaleRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:sales:create");

	const idempotencyKey = request.headers.get("idempotency-key")?.trim();
	if (!idempotencyKey) throw new PaymentTerminalError(400, "IDEMPOTENCY_KEY_REQUIRED", "O cabeçalho Idempotency-Key é obrigatório para criar a venda.");
	if (idempotencyKey.length > 255) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "O cabeçalho Idempotency-Key excede o tamanho permitido.");

	const input = CreateTerminalSaleInputSchema.parse(await request.json());
	const device = await db.query.accessPrincipals.findFirst({ where: eq(accessPrincipals.id, actor.principalId), columns: { nome: true } });
	const result = await createTerminalSale({
		organizationId: actor.organizationId,
		deviceId: actor.principalId,
		deviceName: device?.nome ?? "Terminal",
		idempotencyKey,
		input,
	});
	return NextResponse.json(result, { status: 201 });
}

export const POST = paymentTerminalApiHandler({ POST: createTerminalSaleRoute });
