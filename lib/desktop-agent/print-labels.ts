import type { TPrintJobFinalidadeEnum } from "@/schemas/enums";

// Rótulos de finalidade compartilhados entre a fila de impressão (configurações) e o
// roteamento por impressora (modal do dispositivo) — um lugar só para traduzir o enum.

export const PRINT_JOB_FINALIDADE_LABELS: Record<TPrintJobFinalidadeEnum, string> = {
	CUPOM_VENDA: "CUPOM DE VENDA",
	TICKET_PREPARO: "TICKET DE PREPARO",
	ETIQUETA_LOTE: "ETIQUETA DE LOTE",
	DANFE_NFCE: "DANFE NFC-e",
	DANFE_NFE: "DANFE NF-e",
	TESTE: "TESTE",
};

type TRoutablePrintFinalidade = {
	value: Exclude<TPrintJobFinalidadeEnum, "TESTE">;
	label: string;
	description: string;
};

// Finalidades roteáveis: TESTE fica de fora porque sempre carrega impressoraId fixado
// (bypassa o roteamento) — não é algo que se atribua a uma impressora.
export const ROUTABLE_PRINT_FINALIDADES: TRoutablePrintFinalidade[] = [
	{ value: "CUPOM_VENDA", label: "Cupons", description: "Comprovante da venda entregue ao cliente" },
	{ value: "TICKET_PREPARO", label: "Preparo", description: "Via da cozinha/produção: itens do pedido, sem preços" },
	{ value: "ETIQUETA_LOTE", label: "Etiquetas", description: "Etiquetas de lote e validade da produção" },
	{ value: "DANFE_NFCE", label: "NFC-e", description: "DANFE da nota fiscal do consumidor" },
	{ value: "DANFE_NFE", label: "NF-e", description: "DANFE da nota fiscal eletrônica" },
];
