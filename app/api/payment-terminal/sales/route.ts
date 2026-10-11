import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { PaymentTerminalError, createTerminalSale, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { PaymentMethodEnum } from "@/schemas/enums";
import { TerminalSaleBenefitsInputSchema, TerminalSaleItemsInputSchema } from "@/schemas/payment-attempts";
import { db } from "@/services/drizzle";
import { accessPrincipals } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Fluxo A: venda nascida no terminal (scope payment-terminal:sales:create, Idempotency-Key
// obrigatório). Mesmo pipeline do PDV web (lib/sales/create-and-confirm-sale.ts) com a maquininha
// como ator dispositivo. O backend precifica pelo catálogo, confere as regras de adicionais e aplica as regras de pagamento do checkout
// (lib/payment-attempts/terminal-payments.ts). Com cartão, devolve a cobrança já atribuída a este
// dispositivo e o app segue para a execução; com dinheiro, Pix ou fiado, a venda já sai registrada
// e a resposta traz o troco. Benefícios (cupom AUTOMATICA, cashback, recompensas) seguem as
// regras do checkout e reduzem o total a pagar (lib/payment-attempts/terminal-benefits-policy.ts).
const CreateTerminalSaleInputSchema = z.object({
	sale: z.object({
		clienteId: z.string({ invalid_type_error: "Tipo inválido para o cliente." }).optional().nullable(),
		vendedorId: z.string({ invalid_type_error: "Tipo inválido para o vendedor." }).optional().nullable(),
		sessaoVendaId: z.string({ invalid_type_error: "Tipo inválido para o caixa." }).optional().nullable(),
		observacoes: z.string({ invalid_type_error: "Tipo inválido para observações." }).max(500).optional().nullable(),
		// Vazio só numa venda de recompensas: o service exige itens ou recompensas.
		itens: TerminalSaleItemsInputSchema,
	}),
	benefits: TerminalSaleBenefitsInputSchema.optional().nullable(),
	payments: z
		.array(
			z.object({
				metodo: PaymentMethodEnum,
				// O que o cliente entregou neste método; o excesso em dinheiro vira troco.
				valor: z
					.number({ required_error: "Valor do pagamento não informado.", invalid_type_error: "Tipo inválido para o valor do pagamento." })
					.positive("O valor do pagamento deve ser positivo."),
				totalParcelas: z.number({ invalid_type_error: "Tipo inválido para o total de parcelas." }).int().min(1).max(99).optional().nullable(),
				dataPrevisao: z
					.string({ invalid_type_error: "Tipo inválido para a data de previsão." })
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Data de previsão inválida.")
					.optional()
					.nullable(),
			}),
		)
		// Vazio só quando os benefícios quitam a venda (total zero).
		.max(5, "A venda excede o número máximo de pagamentos."),
});
export type TCreateTerminalSaleRouteInput = z.infer<typeof CreateTerminalSaleInputSchema>;
export type { TCreateTerminalSaleOutput } from "@/lib/payment-attempts";

async function createTerminalSaleRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:sales:create");

	const idempotencyKey = request.headers.get("idempotency-key")?.trim();
	if (!idempotencyKey)
		throw new PaymentTerminalError(400, "IDEMPOTENCY_KEY_REQUIRED", "O cabeçalho Idempotency-Key é obrigatório para criar a venda.");
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
