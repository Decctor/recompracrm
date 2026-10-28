import { z } from "zod";
import { SalesChannelCatalogModeEnum, SalesChannelTypeEnum } from "./enums";

// Os tipos das entidades vêm do $inferSelect em services/drizzle/schema/sales-channels.ts
// (convenção do repo). Aqui ficam apenas os validadores de runtime.

export const SalesChannelSchema = z.object({
	id: z.string({
		required_error: "ID do canal de venda não informado.",
		invalid_type_error: "Tipo não válido para ID do canal de venda.",
	}),
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	canal: SalesChannelTypeEnum,
	integracaoId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da integração.",
		})
		.nullable(),
	refExterno: z
		.string({
			invalid_type_error: "Tipo não válido para referência externa do canal.",
		})
		.nullable(),
	catalogoModo: SalesChannelCatalogModeEnum,
	// Se os mínimos dos grupos de adicionais valem neste canal — ver o comentário da coluna.
	exigirAdicionaisMinimos: z.boolean({
		required_error: "Exigência de adicionais obrigatórios não informada.",
		invalid_type_error: "Tipo não válido para exigência de adicionais obrigatórios.",
	}),
	// Ordem dos grupos da vitrine — ver o comentário da coluna.
	ordemGrupos: z.array(
		z.string({
			invalid_type_error: "Tipo não válido para grupo da vitrine.",
		}),
	),
	ordemProdutos: z.array(
		z
			.string({ required_error: "ID do produto não informado.", invalid_type_error: "Tipo não válido para ID do produto." })
			.min(1, "ID do produto não informado."),
		{
			required_error: "Ordem dos produtos não informada.",
			invalid_type_error: "Tipo não válido para ordem dos produtos.",
		},
	),
	dataInsercao: z.date({
		required_error: "Data de inserção não informada.",
		invalid_type_error: "Tipo não válido para data de inserção.",
	}),
	dataAtualizacao: z
		.date({
			invalid_type_error: "Tipo não válido para data de atualização.",
		})
		.nullable(),
});

export const ProductChannelSettingSchema = z.object({
	id: z.string({
		required_error: "ID da configuração de canal não informado.",
		invalid_type_error: "Tipo não válido para ID da configuração de canal.",
	}),
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	canalVendaId: z.string({
		required_error: "ID do canal de venda não informado.",
		invalid_type_error: "Tipo não válido para ID do canal de venda.",
	}),
	produtoId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo não válido para ID do produto.",
	}),
	produtoVarianteId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.nullable(),
	// Nulo = herda o padrão do canal.
	disponivel: z
		.boolean({
			invalid_type_error: "Tipo não válido para disponibilidade no canal.",
		})
		.nullable(),
	// Nulo = herda o preço base do produto/variante.
	precoVenda: z
		.number({
			invalid_type_error: "Tipo não válido para preço de venda no canal.",
		})
		.nonnegative({ message: "O preço de venda no canal não pode ser negativo." })
		.nullable(),
	dataInsercao: z.date({
		required_error: "Data de inserção não informada.",
		invalid_type_error: "Tipo não válido para data de inserção.",
	}),
	dataAtualizacao: z
		.date({
			invalid_type_error: "Tipo não válido para data de atualização.",
		})
		.nullable(),
});
