import { z } from "zod";
import { VisualKitFormatEnum, VisualKitOutputEnum, VisualKitStatusEnum } from "./enums";

// Opções de exibição compartilhadas por todas as peças do kit.
export const VisualKitConfigSchema = z.object({
	mostrarPrecoDe: z.boolean({
		required_error: 'Opção de preço "De" não informada.',
		invalid_type_error: 'Tipo não válido para opção de preço "De".',
	}),
	mostrarPercentual: z.boolean({
		required_error: "Opção de percentual de desconto não informada.",
		invalid_type_error: "Tipo não válido para opção de percentual de desconto.",
	}),
	mostrarCodigoBarras: z.boolean({
		required_error: "Opção de código de barras não informada.",
		invalid_type_error: "Tipo não válido para opção de código de barras.",
	}),
	mostrarPrecoUnidade: z.boolean({
		required_error: "Opção de preço por unidade de medida não informada.",
		invalid_type_error: "Tipo não válido para opção de preço por unidade de medida.",
	}),
	// Adesivos: repete os produtos até completar a folha de 65. Ausente em kits antigos = desligado.
	completarFolhaAdesivos: z
		.boolean({
			invalid_type_error: "Tipo não válido para opção de completar a folha de adesivos.",
		})
		.optional(),
});
export type TVisualKitConfig = z.infer<typeof VisualKitConfigSchema>;

export const DEFAULT_VISUAL_KIT_CONFIG: TVisualKitConfig = {
	mostrarPrecoDe: true,
	mostrarPercentual: true,
	mostrarCodigoBarras: true,
	mostrarPrecoUnidade: true,
	completarFolhaAdesivos: false,
};

// Sobrescritas por peça (hoje só a chamada); vazio = herda do kit.
export const VisualKitPieceConfigSchema = z.object({
	chamada: z
		.string({
			invalid_type_error: "Tipo não válido para chamada da peça.",
		})
		.max(80, { message: "A chamada da peça pode ter no máximo 80 caracteres." })
		.optional()
		.nullable(),
});
export type TVisualKitPieceConfig = z.infer<typeof VisualKitPieceConfigSchema>;

export const VisualKitSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	nome: z
		.string({
			required_error: "Nome do kit não informado.",
			invalid_type_error: "Tipo não válido para nome do kit.",
		})
		.max(120, { message: "O nome do kit pode ter no máximo 120 caracteres." }),
	chamada: z
		.string({
			required_error: "Chamada do kit não informada.",
			invalid_type_error: "Tipo não válido para chamada do kit.",
		})
		.max(80, { message: "A chamada pode ter no máximo 80 caracteres." }),
	validadeFim: z
		.string({
			invalid_type_error: "Tipo não válido para validade do kit.",
		})
		.datetime({ message: "Data de validade inválida." })
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	canalVendaId: z
		.string({
			invalid_type_error: "Tipo não válido para canal de venda do kit.",
		})
		.nullable(),
	configuracao: VisualKitConfigSchema,
	status: VisualKitStatusEnum,
	autorId: z.string({
		required_error: "Autor do kit não informado.",
		invalid_type_error: "Tipo não válido para autor do kit.",
	}),
});
export type TVisualKit = z.infer<typeof VisualKitSchema>;

export const VisualKitPieceSchema = z.object({
	formato: VisualKitFormatEnum,
	saida: VisualKitOutputEnum,
	ordem: z
		.number({
			required_error: "Ordem da peça não informada.",
			invalid_type_error: "Tipo não válido para ordem da peça.",
		})
		.int(),
	configuracao: VisualKitPieceConfigSchema.nullable(),
});
export type TVisualKitPiece = z.infer<typeof VisualKitPieceSchema>;

export const VisualKitItemSchema = z.object({
	produtoId: z.string({
		required_error: "Produto do kit não informado.",
		invalid_type_error: "Tipo não válido para produto do kit.",
	}),
	produtoVarianteId: z
		.string({
			invalid_type_error: "Tipo não válido para variante do kit.",
		})
		.nullable(),
	ordem: z
		.number({
			required_error: "Ordem do produto não informada.",
			invalid_type_error: "Tipo não válido para ordem do produto.",
		})
		.int(),
});
export type TVisualKitItem = z.infer<typeof VisualKitItemSchema>;
