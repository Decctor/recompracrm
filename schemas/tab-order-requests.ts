import { z } from "zod";

// ============================================================================
// Solicitacoes publicas de pedido via QR (docs/tabs/implementation-plan.md, fase 3).
// O cliente publico NUNCA envia precos: o payload guarda apenas referencias de
// produto + quantidade; a precificacao autoritativa acontece na aprovacao.
// ============================================================================

// Adicional escolhido pelo cliente: so a referencia da opcao e a quantidade. Nome e preco vem do
// catalogo na aprovacao (resolveCatalogOrderItem), nunca do payload.
export const TabOrderRequestItemModifierSchema = z.object({
	opcaoId: z.string({ required_error: "ID da opcao nao informado.", invalid_type_error: "Tipo nao valido para ID da opcao." }),
	// Snapshot para exibicao no inbox do operador (o preco e o nome lancado vem do catalogo).
	nome: z.string({ invalid_type_error: "Tipo nao valido para nome da opcao." }).max(200).optional().nullable(),
	quantidade: z
		.number({ required_error: "Quantidade do adicional nao informada.", invalid_type_error: "Tipo nao valido para quantidade do adicional." })
		.int({ message: "Quantidade do adicional deve ser inteira." })
		.positive({ message: "Quantidade do adicional deve ser positiva." })
		.max(99, { message: "Quantidade maxima por adicional excedida." }),
});
export type TTabOrderRequestItemModifier = z.infer<typeof TabOrderRequestItemModifierSchema>;

export const TabOrderRequestItemSchema = z.object({
	produtoId: z.string({ required_error: "ID do produto nao informado.", invalid_type_error: "Tipo nao valido para ID do produto." }),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo nao valido para ID da variante." }).optional().nullable(),
	// Snapshot para exibicao na aprovacao (o preco NAO vem daqui).
	nome: z.string({ required_error: "Nome do item nao informado.", invalid_type_error: "Tipo nao valido para nome do item." }),
	quantidade: z
		.number({ required_error: "Quantidade nao informada.", invalid_type_error: "Tipo nao valido para quantidade." })
		.positive({ message: "Quantidade deve ser positiva." })
		.max(99, { message: "Quantidade maxima por item excedida." }),
	observacoes: z
		.string({ invalid_type_error: "Tipo nao valido para observacoes do item." })
		.trim()
		.max(200, { message: "Observacao do item deve ter no maximo 200 caracteres." })
		.optional()
		.nullable(),
	// Default vazio: solicitacoes gravadas antes dos adicionais continuam legiveis.
	modificadores: z.array(TabOrderRequestItemModifierSchema).max(30, { message: "Limite de adicionais por item excedido." }).default([]),
});
export type TTabOrderRequestItem = z.infer<typeof TabOrderRequestItemSchema>;

export const TabOrderRequestPayloadSchema = z.object({
	itens: z.array(TabOrderRequestItemSchema).min(1, { message: "Pelo menos um item e obrigatorio." }).max(50, { message: "Limite de itens excedido." }),
	observacoes: z.string({ invalid_type_error: "Tipo nao valido para observacoes." }).max(500).optional().nullable(),
	// Informado apenas no QR do ponto quando ha varias comandas abertas. E uma
	// pista para o operador, nao uma autorizacao para vincular a conta sozinho.
	codigoTab: z.string({ invalid_type_error: "Tipo nao valido para codigo da comanda." }).trim().min(1).max(100).optional().nullable(),
	contexto: z.enum(["PONTO", "TAB"], {
		required_error: "Contexto da solicitacao nao informado.",
		invalid_type_error: "Tipo nao valido para contexto da solicitacao.",
	}),
});
export type TTabOrderRequestPayload = z.infer<typeof TabOrderRequestPayloadSchema>;
