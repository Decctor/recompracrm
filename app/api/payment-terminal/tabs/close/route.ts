import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { PaymentTerminalError, closeTerminalTab, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { PaymentMethodEnum } from "@/schemas/enums";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Fechamento da conta no terminal (Idempotency-Key obrigatório). Os pagamentos cobrem o restante
// (consumo − desconto − parciais) com o recorte do terminal: dinheiro com troco, Pix, fiado, e
// cartão como perna única exata — com cartão, a resposta traz a cobrança atribuída a este
// dispositivo, como na venda nascida no terminal.
const CloseTerminalTabInputSchema = z.object({
	tabId: z.string({ required_error: "Conta não informada.", invalid_type_error: "Tipo inválido para a conta." }),
	payments: z
		.array(
			z.object({
				metodo: PaymentMethodEnum,
				valor: z
					.number({ required_error: "Valor do pagamento não informado.", invalid_type_error: "Tipo inválido para o valor do pagamento." })
					.positive("O valor do pagamento deve ser positivo."),
				totalParcelas: z.number({ invalid_type_error: "Tipo inválido para o total de parcelas." }).int().min(1).max(99).optional().nullable(),
				dataPrevisao: z
					.string({ invalid_type_error: "Tipo inválido para a data de previsão." })
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Data de previsão inválida.")
					.optional()
					.nullable(),
				efetivacaoTipo: z.enum(["IMEDIATA", "PENDENTE"], { invalid_type_error: "Tipo inválido para a efetivação do pagamento." }).optional().nullable(),
			}),
		)
		.max(5, "O fechamento excede o número máximo de pagamentos."),
	sessaoVendaId: z.string({ invalid_type_error: "Tipo inválido para o caixa." }).optional().nullable(),
	descontosTotal: z.number({ invalid_type_error: "Tipo inválido para o desconto." }).min(0, "O desconto não pode ser negativo.").optional().nullable(),
	descontoAprovacaoId: z.string({ invalid_type_error: "Tipo inválido para a aprovação de desconto." }).optional().nullable(),
	entregarPedidosEmAndamento: z.boolean({ invalid_type_error: "Tipo inválido para entregar os pedidos em andamento." }).optional().nullable(),
});
export type TCloseTerminalTabRouteInput = z.infer<typeof CloseTerminalTabInputSchema>;
export type { TCloseTerminalTabOutput } from "@/lib/payment-attempts";

async function closeTerminalTabRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:sales:create");
	const idempotencyKey = request.headers.get("idempotency-key")?.trim();
	if (!idempotencyKey)
		throw new PaymentTerminalError(400, "IDEMPOTENCY_KEY_REQUIRED", "O cabeçalho Idempotency-Key é obrigatório para fechar a conta.");
	if (idempotencyKey.length > 255) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "O cabeçalho Idempotency-Key excede o tamanho permitido.");
	const input = CloseTerminalTabInputSchema.parse(await request.json());
	const result = await closeTerminalTab({ organizationId: actor.organizationId, deviceId: actor.principalId, idempotencyKey, input });
	return NextResponse.json(result, { status: 201 });
}

export const POST = paymentTerminalApiHandler({ POST: closeTerminalTabRoute });
