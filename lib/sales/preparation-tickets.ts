import { groupSaleItemModifiers } from "@/lib/sales/sale-item-modifier-groups";

// Grão do ticket de preparo, compartilhado entre o board (/api/sales/preparation) e a via
// impressa (TICKET_PREPARO). Um mapeamento só: o que a cozinha lê na tela e no papel é o mesmo.
// Duas fontes, um grão: venda confirmada com preparo (1 venda = 1 ticket) e pedido (rodada) de
// conta aberta (1 venda rascunho : N rodadas).

export const PREPARATION_STATUSES = ["NAO_INICIADO", "EM_PREPARO", "PRONTO"] as const;

export type TPreparationTicketItem = {
	id: string;
	nome: string;
	quantidade: number;
	// "sem cebola", "leite ninho além dos selecionados": é aqui que a cozinha precisa ler.
	observacoes: string | null;
	// Adicionais agrupados pelo grupo de origem ("Escolha seu gelato") — ver groupSaleItemModifiers.
	gruposAdicionais: { grupo: string | null; adicionais: { nome: string; quantidade: number }[] }[];
};

export type TPreparationItemRow = {
	id: string;
	quantidade: number;
	quantidadeCancelada: number;
	observacoes: string | null;
	metadados: unknown;
	produto: { nome: string } | null;
	produtoVariante: { nome: string } | null;
	adicionais: { id: string; nome: string; quantidade: number; opcao: { produtoAddOn: { nome: string } } | null }[];
};

// Cláusula `with` dos itens — a mesma para vendas e pedidos de conta.
export const PREPARATION_ITEMS_WITH = {
	columns: { id: true, quantidade: true, quantidadeCancelada: true, observacoes: true, metadados: true },
	with: {
		produto: { columns: { nome: true } },
		produtoVariante: { columns: { nome: true } },
		adicionais: {
			columns: { id: true, nome: true, quantidade: true },
			with: { opcao: { columns: { id: true }, with: { produtoAddOn: { columns: { nome: true } } } } },
		},
	},
} as const;

export const PREPARATION_DELIVERY_MODE_LABELS: Record<string, string> = {
	PRESENCIAL: "Balcao",
	RETIRADA: "Retirada",
	ENTREGA: "Entrega",
	COMANDA: "Comanda",
};

export function mapPreparationTicketItems(items: TPreparationItemRow[]): TPreparationTicketItem[] {
	return items
		.filter((item) => item.quantidadeCancelada < item.quantidade)
		.map((item) => {
			const metadata = (item.metadados ?? {}) as { nome?: string };
			const variantSuffix = item.produtoVariante?.nome ? ` — ${item.produtoVariante.nome}` : "";
			return {
				id: item.id,
				nome: metadata.nome ?? `${item.produto?.nome ?? "Item"}${variantSuffix}`,
				quantidade: item.quantidade,
				observacoes: item.observacoes?.trim() || null,
				gruposAdicionais: groupSaleItemModifiers(item.adicionais, (modifier) => modifier.opcao?.produtoAddOn.nome).map(({ grupo, adicionais }) => ({
					grupo,
					adicionais: adicionais.map((modifier) => ({ nome: modifier.nome, quantidade: modifier.quantidade })),
				})),
			};
		});
}
