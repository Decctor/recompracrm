import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { receiveStoreCredit } from "@/lib/finances/store-credit/receive";
import { canEditFinances } from "@/lib/permissions/finances";
import { PaymentMethodEnum } from "@/schemas/enums";

/**
 * Envelope da operação em inglês, campos de entidade em português: `receipt` e `allocations`
 * organizam a chamada, o que está dentro deles viaja como dado.
 */
const ReceiveStoreCreditInputSchema = z.object({
	clientId: z.string({ required_error: "Cliente não informado.", invalid_type_error: "Tipo inválido para o cliente." }),
	receipt: z.object({
		valor: z
			.number({ required_error: "Valor recebido não informado.", invalid_type_error: "Tipo inválido para o valor recebido." })
			.positive({ message: "O valor recebido precisa ser maior que zero." }),
		dataRecebimento: z
			.string({ required_error: "Data do recebimento não informada.", invalid_type_error: "Tipo inválido para a data do recebimento." })
			.datetime({ message: "Tipo inválido para a data do recebimento." })
			.transform((value) => new Date(value)),
		metodo: PaymentMethodEnum,
		contaFinanceiraId: z.string({ invalid_type_error: "Tipo inválido para a conta financeira." }).optional().nullable().default(null),
		sessaoVendaId: z.string({ invalid_type_error: "Tipo inválido para a sessão de caixa." }).optional().nullable().default(null),
		observacoes: z.string({ invalid_type_error: "Tipo inválido para as observações." }).optional().nullable().default(null),
		novaDataPrevisao: z
			.string({ invalid_type_error: "Tipo inválido para a nova previsão." })
			.datetime({ message: "Tipo inválido para a nova previsão." })
			.optional()
			.nullable()
			.default(null)
			.transform((value) => (value ? new Date(value) : null)),
	}),
	allocations: z
		.array(
			z.object({
				transacaoId: z.string({ required_error: "Venda não informada no abatimento.", invalid_type_error: "Tipo inválido para a venda." }),
				valor: z
					.number({ required_error: "Valor do abatimento não informado.", invalid_type_error: "Tipo inválido para o valor do abatimento." })
					.positive({ message: "O valor abatido de cada venda precisa ser maior que zero." }),
			}),
			{ required_error: "Abatimento não informado.", invalid_type_error: "Tipo inválido para o abatimento." },
		)
		.min(1, { message: "Selecione ao menos uma venda para abater." }),
});
export type TReceiveStoreCreditInput = z.infer<typeof ReceiveStoreCreditInputSchema>;
/**
 * O que o cliente envia, antes dos `transform` do schema: datas como string ISO. É este o tipo que
 * a mutation usa — `z.infer` já entrega `Date`, que é o que o serviço recebe, não o que trafega.
 */
export type TReceiveStoreCreditPayload = z.input<typeof ReceiveStoreCreditInputSchema>;

async function receiveStoreCreditService({ input, orgId, authorId }: { input: TReceiveStoreCreditInput; orgId: string; authorId: string }) {
	const result = await receiveStoreCredit({
		orgId,
		authorId,
		clientId: input.clientId,
		receipt: input.receipt,
		allocations: input.allocations,
	});

	const quitadas = result.titulosQuitados;
	const parciais = result.titulosParciais;
	const detalhe = [
		quitadas > 0 ? `${quitadas} ${quitadas === 1 ? "venda quitada" : "vendas quitadas"}` : null,
		parciais > 0 ? `${parciais} com saldo` : null,
	]
		.filter(Boolean)
		.join(", ");

	return {
		data: result,
		message: detalhe ? `Recebimento registrado: ${detalhe}.` : "Recebimento registrado com sucesso.",
	};
}
export type TReceiveStoreCreditOutput = Awaited<ReturnType<typeof receiveStoreCreditService>>;

async function receiveStoreCreditRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canEditFinances(session.membership.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para registrar recebimentos de fiado.");

	const body = await request.json();
	const input = ReceiveStoreCreditInputSchema.parse(body);
	const result = await receiveStoreCreditService({ input, orgId: session.membership.organizacao.id, authorId: session.user.id });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: receiveStoreCreditRoute });
