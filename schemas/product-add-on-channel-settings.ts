import { z } from "zod";

export const AddOnOptionChannelSettingInputSchema = z.object({
	canalVendaId: z
		.string({
			required_error: "ID do canal de venda não informado.",
			invalid_type_error: "Tipo não válido para ID do canal de venda.",
		})
		.min(1, { message: "ID do canal de venda não informado." }),
	produtoAddOnOpcaoId: z
		.string({
			required_error: "ID da opção de adicional não informado.",
			invalid_type_error: "Tipo não válido para ID da opção de adicional.",
		})
		.min(1, { message: "ID da opção de adicional não informado." }),
	// Os dois campos nulos = voltar a herdar (a linha esparsa é removida).
	precoDelta: z
		.number({
			invalid_type_error: "Tipo não válido para preço da opção no canal.",
		})
		.nonnegative({ message: "O preço da opção no canal não pode ser negativo." })
		.optional()
		.nullable(),
	disponivel: z
		.boolean({
			invalid_type_error: "Tipo não válido para disponibilidade da opção no canal.",
		})
		.optional()
		.nullable(),
});

export type TAddOnOptionChannelSettingInput = z.infer<typeof AddOnOptionChannelSettingInputSchema>;
