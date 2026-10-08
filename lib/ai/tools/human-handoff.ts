import z from "zod";
import { transferChatToHuman } from "../agent/transfer-to-human";
import { defineAgentTool } from "./define-tool";

/**
 * Handoff para atendente humano.
 *
 * `chatId` vem do contexto — na versão anterior o modelo informava o id do chat e do cliente,
 * o que permitia apontar para uma conversa alheia.
 */
export const humanHandoffTool = defineAgentTool({
	name: "atendimento.transferir_para_humano",
	description: `Transfere esta conversa para um atendente humano.

Por padrão, NÃO use: você mesmo atende. Use somente quando o cliente pedir explicitamente
falar com uma pessoa, houver reclamação ou problema com um pedido já feito, ou as instruções da
empresa mandarem transferir naquele caso. Nunca use por saudação, pedido de cardápio, pergunta
sobre produto, preço, horário ou entrega, por assunto de dias anteriores, nem porque a base de
conhecimento não responde — nesse caso diga que não tem a informação.

Escreva um "resumoConversa" completo — é o que o atendente vê antes de assumir, e ele não
lerá o histórico inteiro. Após transferir, não envie outra mensagem ao cliente no mesmo turno
além de avisá-lo de que um atendente vai continuar.`,
	inputSchema: z.object({
		motivo: z.string().min(3).describe("Motivo objetivo da transferência (uma frase)."),
		resumoConversa: z.string().min(10).describe("Resumo do que o cliente quer e do que já foi tratado, para o atendente humano."),
	}),
	async execute(input, context) {
		// No playground não há atendente real para receber o chat de teste: simulamos o
		// handoff para que o fluxo possa ser exercitado sem efeito colateral.
		if (context.run.gatilho === "PLAYGROUND") {
			return {
				success: true,
				message: "Transferência simulada (playground). Em produção, o atendimento seria transferido a um atendente humano.",
				result: { simulado: true, motivo: input.motivo },
			};
		}

		// O modelo às vezes repete a chamada no mesmo turno (a run b937da03 transferiu três vezes).
		// A conversa já é de um humano: repetir sortearia outro atendente e dispararia outra
		// notificação.
		if (context.effects.handoffAttendanceId) {
			return {
				success: true,
				message: "O atendimento já foi transferido nesta execução. Não transfira de novo: apenas responda ao cliente.",
				result: { atendimentoId: context.effects.handoffAttendanceId },
			};
		}

		const { atendimentoId, usuarioDestinoNome } = await transferChatToHuman({
			db: context.db,
			organizacaoId: context.organizacaoId,
			chatId: context.chat.id,
			motivo: input.motivo,
			resumoConversa: input.resumoConversa,
		});
		if (atendimentoId) context.effects.handoffAttendanceId = atendimentoId;

		return {
			success: true,
			message: `Atendimento transferido para ${usuarioDestinoNome}. Avise o cliente de que um atendente vai continuar em seguida.`,
			result: { atendimentoId },
		};
	},
});
