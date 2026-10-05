import { z } from "zod";
import { normalizeProductBarcode } from "@/lib/products/barcode";
import { ProductContentUnitEnum, ProductStockDeductionModeEnum, StockMovementTypeEnum, VariantOptionTypeEnum } from "./enums";

// Código de barras opcional: GTIN/EAN ou código interno imprimível em Code 128; vazio vira null.
// Opcional SEM default: payload sem o campo não altera o valor persistido.
const ProductBarcodeSchema = z
	.string({
		invalid_type_error: "Tipo não válido para código de barras.",
	})
	.nullable()
	.optional()
	.refine((value) => value == null || value.trim() === "" || normalizeProductBarcode(value) != null, {
		message: "Código de barras inválido: use números, letras sem acentos ou símbolos, sem quebras de linha.",
	})
	.transform((value) => (value === undefined ? undefined : normalizeProductBarcode(value)));

const ProductContentQuantitySchema = z
	.number({
		invalid_type_error: "Tipo não válido para quantidade do conteúdo.",
	})
	.positive({ message: "A quantidade do conteúdo deve ser maior que zero." })
	.nullable()
	.optional();

// Preço "De" manual (formulário do produto). Ausente = regra automática de `buildSalePriceUpdate`.
const ProductPreviousPriceSchema = z
	.number({
		invalid_type_error: "Tipo não válido para preço anterior.",
	})
	.nonnegative({ message: "O preço anterior não pode ser negativo." })
	.nullable()
	.optional();

export const ProductSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	// Falso para matéria-prima e itens internos (insumos, embalagens): o produto some de todas as
	// superfícies de venda, mas segue visível no cadastro, nas compras, no estoque e nas fichas técnicas.
	// Opcional SEM default: payload sem o campo não altera o valor persistido
	// (clients antigos não reativam a venda em edições não relacionadas).
	vendavel: z
		.boolean({
			required_error: "Status de venda do produto não informado.",
			invalid_type_error: "Tipo não válido para status de venda do produto.",
		})
		.optional(),
	// Falso tira o produto de todos os canais de venda, acima de `vendavel` e da disponibilidade por
	// canal — é o interruptor que os catálogos checam primeiro. Mesma regra do `vendavel`: opcional
	// SEM default, para que um payload sem o campo não reative um produto pausado.
	ativo: z
		.boolean({
			required_error: "Status de ativação do produto não informado.",
			invalid_type_error: "Tipo não válido para status de ativação do produto.",
		})
		.optional(),
	nome: z.string({
		required_error: "Nome do produto não informado.",
		invalid_type_error: "Tipo não válido para nome do produto.",
	}),
	descricao: z
		.string({
			invalid_type_error: "Tipo não válido para descrição do produto.",
		})
		.optional()
		.nullable()
		.transform((value) => {
			const trimmed = value?.trim();
			return trimmed ? trimmed : null;
		}),
	imagemCapaUrl: z
		.string({
			required_error: "URL da imagem capa do produto não informada.",
			invalid_type_error: "Tipo não válido para URL da imagem capa do produto.",
		})
		.optional()
		.nullable(),
	codigo: z.string({
		required_error: "Codigo do produto não informado.",
		invalid_type_error: "Tipo não válido para codigo do produto.",
	}),
	unidade: z.string({
		required_error: "Unidade do produto não informado.",
		invalid_type_error: "Tipo não válido para unidade do produto.",
	}),
	ncm: z.string({
		required_error: "NCM do produto não informado.",
		invalid_type_error: "Tipo não válido para NCM do produto.",
	}),
	tipo: z.string({
		required_error: "Tipo do produto não informado.",
		invalid_type_error: "Tipo não válido para tipo do produto.",
	}),
	grupo: z.string({
		required_error: "Grupo do produto não informado.",
		invalid_type_error: "Tipo não válido para grupo do produto.",
	}),
	rastreamentoEstoqueAtivo: z
		.boolean({
			required_error: "Status do rastreamento de estoque não informado.",
			invalid_type_error: "Tipo não válido para status do rastreamento de estoque.",
		})
		.default(false),
	// Como a venda baixa estoque: ESTOQUE_PROPRIO (saldo do próprio produto) ou
	// COMPOSICAO (explosão da ficha técnica — pratos, drinks, lanches).
	// Opcional SEM default: payload sem o campo não altera o valor persistido
	// (clients antigos não resetam o modo em edições não relacionadas).
	baixaEstoqueModo: ProductStockDeductionModeEnum.optional(),
	fichaTecnicaReceitaId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da ficha técnica.",
		})
		.optional()
		.nullable(),
	quantidade: z
		.number({
			invalid_type_error: "Tipo não válido para quantidade do produto.",
		})
		.optional()
		.nullable(),
	precoVenda: z
		.number({
			invalid_type_error: "Tipo não válido para preço de venda do produto.",
		})
		.optional()
		.nullable(),
	precoCusto: z
		.number({
			invalid_type_error: "Tipo não válido para preço de custo do produto.",
		})
		.optional()
		.nullable(),
	precoVendaAnterior: ProductPreviousPriceSchema,
	codigoBarras: ProductBarcodeSchema,
	conteudoQuantidade: ProductContentQuantitySchema,
	conteudoUnidade: ProductContentUnitEnum.nullable().optional(),
});
export type TProduct = z.infer<typeof ProductSchema>;

export const ProductVariantSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	produtoId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo não válido para ID do produto.",
	}),
	nome: z.string({
		required_error: "Nome da variante não informado.",
		invalid_type_error: "Tipo não válido para nome da variante.",
	}),
	codigo: z.string({
		required_error: "Código da variante não informado.",
		invalid_type_error: "Tipo não válido para código da variante.",
	}),
	imagemCapaUrl: z
		.string({
			required_error: "URL da imagem capa da variante não informada.",
			invalid_type_error: "Tipo não válido para URL da imagem capa da variante.",
		})
		.optional()
		.nullable(),
	precoVenda: z.number({
		required_error: "Preço de venda da variante não informado.",
		invalid_type_error: "Tipo não válido para preço de venda da variante.",
	}),
	precoCusto: z.number({
		required_error: "Preço de custo da variante não informado.",
		invalid_type_error: "Tipo não válido para preço de custo da variante.",
	}),
	precoVendaAnterior: ProductPreviousPriceSchema,
	codigoBarras: ProductBarcodeSchema,
	// A unidade é sempre a do produto; a variante só sobrescreve a quantidade.
	conteudoQuantidade: ProductContentQuantitySchema,
	quantidade: z.number({
		required_error: "Quantidade da variante não informada.",
		invalid_type_error: "Tipo não válido para quantidade da variante.",
	}),
	ativo: z.boolean({
		required_error: "Status da variante não informado.",
		invalid_type_error: "Tipo não válido para status da variante.",
	}),
	rastreamentoEstoqueAtivo: z
		.boolean({
			required_error: "Status do rastreamento de estoque não informado.",
			invalid_type_error: "Tipo não válido para status do rastreamento de estoque.",
		})
		.default(false),
});

// -----------------------------------------------------------------------------
// VARIANT OPTIONS (eixos de variacao: "Tamanho", "Cor")
// -----------------------------------------------------------------------------
export const ProductOptionSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	produtoId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo não válido para ID do produto.",
	}),
	nome: z.string({
		required_error: "Nome do eixo de variação não informado.",
		invalid_type_error: "Tipo não válido para nome do eixo de variação.",
	}),
	tipo: VariantOptionTypeEnum.default("TEXTO"),
	ordem: z
		.number({
			required_error: "Ordem do eixo de variação não informada.",
			invalid_type_error: "Tipo não válido para ordem do eixo de variação.",
		})
		.default(0),
});
export type TProductOption = z.infer<typeof ProductOptionSchema>;

export const ProductOptionValueSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	opcaoId: z.string({
		required_error: "ID do eixo de variação não informado.",
		invalid_type_error: "Tipo não válido para ID do eixo de variação.",
	}),
	nome: z.string({
		required_error: "Nome do valor de variação não informado.",
		invalid_type_error: "Tipo não válido para nome do valor de variação.",
	}),
	valorAuxiliar: z
		.string({
			invalid_type_error: "Tipo não válido para valor auxiliar do valor de variação.",
		})
		.optional()
		.nullable(),
	imagemCapaUrl: z
		.string({
			invalid_type_error: "Tipo não válido para URL da imagem capa do valor de variação.",
		})
		.optional()
		.nullable(),
	ordem: z
		.number({
			required_error: "Ordem do valor de variação não informada.",
			invalid_type_error: "Tipo não válido para ordem do valor de variação.",
		})
		.default(0),
});
export type TProductOptionValue = z.infer<typeof ProductOptionValueSchema>;

export const ProductVariantOptionValueSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	produtoVarianteId: z.string({
		required_error: "ID da variante não informado.",
		invalid_type_error: "Tipo não válido para ID da variante.",
	}),
	opcaoId: z.string({
		required_error: "ID do eixo de variação não informado.",
		invalid_type_error: "Tipo não válido para ID do eixo de variação.",
	}),
	opcaoValorId: z.string({
		required_error: "ID do valor de variação não informado.",
		invalid_type_error: "Tipo não válido para ID do valor de variação.",
	}),
});
export type TProductVariantOptionValue = z.infer<typeof ProductVariantOptionValueSchema>;

export const ProductAddOnSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	nome: z.string({
		required_error: "Nome do adicional não informado.",
		invalid_type_error: "Tipo não válido para nome do adicional.",
	}),
	internoNome: z.string({
		required_error: "Nome interno do adicional não informado.",
		invalid_type_error: "Tipo não válido para nome interno do adicional.",
	}),
	minOpcoes: z.number({
		required_error: "Quantidade mínima de opções não informada.",
		invalid_type_error: "Tipo não válido para quantidade mínima de opções.",
	}),
	maxOpcoes: z.number({
		required_error: "Quantidade máxima de opções não informada.",
		invalid_type_error: "Tipo não válido para quantidade máxima de opções.",
	}),
	ativo: z
		.boolean({
			required_error: "Status do adicional não informado.",
			invalid_type_error: "Tipo não válido para status do adicional.",
		})
		.default(true),
});

export const ProductAddOnOptionSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	produtoAddOnId: z.string({
		required_error: "ID do adicional não informado.",
		invalid_type_error: "Tipo não válido para ID do adicional.",
	}),
	nome: z.string({
		required_error: "Nome da opção não informado.",
		invalid_type_error: "Tipo não válido para nome da opção.",
	}),
	produtoId: z
		.string({
			required_error: "ID do produto não informado.",
			invalid_type_error: "Tipo não válido para ID do produto.",
		})
		.optional()
		.nullable(),
	produtoVarianteId: z
		.string({
			required_error: "ID da variante não informada.",
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.optional()
		.nullable(),
	quantidadeConsumo: z
		.number({
			required_error: "Quantidade de consumo não informada.",
			invalid_type_error: "Tipo não válido para quantidade de consumo.",
		})
		.default(1.0),
	codigo: z.string({
		required_error: "Código da opção não informado.",
		invalid_type_error: "Tipo não válido para código da opção.",
	}),
	precoDelta: z
		.number({
			required_error: "Preço delta não informado.",
			invalid_type_error: "Tipo não válido para preço delta.",
		})
		.default(0.0),
	maxQtdePorItem: z
		.number({
			required_error: "Quantidade máxima por item não informada.",
			invalid_type_error: "Tipo não válido para quantidade máxima por item.",
		})
		.default(1),
	ativo: z
		.boolean({
			required_error: "Status da opção não informado.",
			invalid_type_error: "Tipo não válido para status da opção.",
		})
		.default(true),
});

export const ProductAddOnReferenceSchema = z.object({
	produtoId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo não válido para ID do produto.",
	}),
	produtoVarianteId: z
		.string({
			required_error: "ID da variante não informada.",
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.optional()
		.nullable(),
	produtoAddOnId: z.string({
		required_error: "ID do adicional não informado.",
		invalid_type_error: "Tipo não válido para ID do adicional.",
	}),
	ordem: z.number({
		required_error: "Ordem não informada.",
		invalid_type_error: "Tipo não válido para ordem.",
	}),
});
export const ProductStockTransactionSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	produtoId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo não válido para ID do produto.",
	}),
	produtoVarianteId: z
		.string({
			required_error: "ID da variante não informada.",
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.optional()
		.nullable(),

	// Purchase related fields
	compraId: z
		.string({
			required_error: "ID da compra não informada.",
			invalid_type_error: "Tipo não válido para ID da compra.",
		})
		.optional()
		.nullable(),
	compraItemId: z
		.string({
			required_error: "ID do item da compra não informado.",
			invalid_type_error: "Tipo não válido para ID do item da compra.",
		})
		.optional(),

	// Sale related fields
	vendaId: z
		.string({
			required_error: "ID da venda não informada.",
			invalid_type_error: "Tipo não válido para ID da venda.",
		})
		.optional()
		.nullable(),
	vendaItemId: z
		.string({
			required_error: "ID do item da venda não informado.",
			invalid_type_error: "Tipo não válido para ID do item da venda.",
		})
		.optional()
		.nullable(),

	tipo: StockMovementTypeEnum,

	// Quantity related fields
	quantidade: z.number({
		required_error: "Quantidade não informada.",
		invalid_type_error: "Tipo não válido para quantidade.",
	}),
	saldoAnterior: z
		.number({
			required_error: "Saldo anterior não informado.",
			invalid_type_error: "Tipo não válido para saldo anterior.",
		})
		.optional()
		.nullable(),
	saldoPosterior: z
		.number({
			required_error: "Saldo posterior não informado.",
			invalid_type_error: "Tipo não válido para saldo posterior.",
		})
		.optional()
		.nullable(),

	// Cost related fields
	custoUnitarioMovimentado: z
		.number({
			required_error: "Custo unitário movimentado não informado.",
			invalid_type_error: "Tipo não válido para custo unitário movimentado.",
		})
		.optional()
		.nullable(),
	custoUnitarioAnterior: z
		.number({
			required_error: "Custo unitário anterior não informado.",
			invalid_type_error: "Tipo não válido para custo unitário anterior.",
		})
		.optional()
		.nullable(),
	custoUnitarioPosterior: z
		.number({
			required_error: "Custo unitário posterior não informado.",
			invalid_type_error: "Tipo não válido para custo unitário posterior.",
		})
		.optional(),

	motivo: z
		.string({
			required_error: "Motivo não informado.",
			invalid_type_error: "Tipo não válido para motivo.",
		})
		.optional()
		.nullable(),

	operadorId: z
		.string({
			required_error: "ID do operador não informado.",
			invalid_type_error: "Tipo não válido para ID do operador.",
		})
		.optional()
		.nullable(),

	dataInsercao: z
		.string({
			required_error: "Data de inserção não informada.",
			invalid_type_error: "Tipo não válido para data de inserção.",
		})
		.datetime({ message: "Tipo não válido para data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
