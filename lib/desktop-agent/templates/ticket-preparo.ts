import { formatDateTimeInOperationTimezone } from "@/lib/operation-timezone";
import { z } from "zod";
import { escapeHtml } from "./cupom-venda";

// Ticket de preparo (finalidade TICKET_PREPARO) — a via da cozinha/produção, térmica de 80mm via
// driver do SO. Deliberadamente diferente do cupom: sem logo, sem CNPJ, sem preços. Quem lê está
// de pé, a um metro da bobina, com pressa: tipo grande, o LUGAR no topo (é o que decide para onde
// o prato vai), quantidade em destaque e observações em negrito.

export const TicketPreparoDadosSchema = z.object({
	// "Mesa 12", "Comanda 15", "Entrega · iFood": o que a cozinha grita na hora de sair.
	etiqueta: z.string({ required_error: "Etiqueta do ticket não informada.", invalid_type_error: "Tipo não válido para a etiqueta do ticket." }),
	// Pedido 3 da conta; nulo para vendas (não há sequencial por organização — ver cupom).
	numeroPedido: z.number({ invalid_type_error: "Tipo não válido para o número do pedido." }).optional().nullable(),
	origem: z.enum(["VENDA", "PEDIDO_CONTA"], { invalid_type_error: "Tipo não válido para a origem do ticket." }),
	modalidade: z.string({ invalid_type_error: "Tipo não válido para a modalidade." }).optional().nullable(),
	canal: z.string({ invalid_type_error: "Tipo não válido para o canal." }).optional().nullable(),
	data: z.coerce.date({ invalid_type_error: "Tipo não válido para a data do pedido." }),
	clienteNome: z.string({ invalid_type_error: "Tipo não válido para o nome do cliente." }).optional().nullable(),
	codigoInterno: z.string({ invalid_type_error: "Tipo não válido para o código interno." }).optional().nullable(),
	observacoes: z.string({ invalid_type_error: "Tipo não válido para as observações." }).optional().nullable(),
	// Estação de preparo deste ticket (docs/dev-planning/preparation-stations-plan.md). Ausente em
	// jobs antigos e em orgs sem estação: ticket único, sem cabeçalho de estação.
	estacao: z
		.object({
			id: z.string({ required_error: "ID da estação não informado.", invalid_type_error: "Tipo não válido para o ID da estação." }),
			nome: z.string({ required_error: "Nome da estação não informado.", invalid_type_error: "Tipo não válido para o nome da estação." }),
		})
		.optional()
		.nullable(),
	itens: z
		.array(
			z.object({
				nome: z.string({ required_error: "Nome do item não informado.", invalid_type_error: "Tipo não válido para o nome do item." }),
				quantidade: z.number({ required_error: "Quantidade do item não informada.", invalid_type_error: "Tipo não válido para a quantidade." }),
				observacoes: z.string({ invalid_type_error: "Tipo não válido para as observações do item." }).optional().nullable(),
				// Item da estação deste ticket. Os demais (escopo PEDIDO) saem em corpo menor sob
				// "Também neste pedido". Default true: job antigo imprime tudo em destaque, como antes.
				destaque: z.boolean({ invalid_type_error: "Tipo não válido para o destaque do item." }).optional().default(true),
				gruposAdicionais: z
					.array(
						z.object({
							grupo: z.string({ invalid_type_error: "Tipo não válido para o grupo do adicional." }).optional().nullable(),
							adicionais: z.array(
								z.object({
									nome: z.string({ required_error: "Nome do adicional não informado." }),
									quantidade: z.number({ invalid_type_error: "Tipo não válido para a quantidade do adicional." }).optional().nullable(),
								}),
							),
						}),
					)
					.optional()
					.nullable(),
			}),
		)
		.min(1, { message: "Ticket de preparo sem itens." }),
});
// Tipo de ENTRADA do schema: `destaque` é opcional (default true no parse) para que `dados` antigos
// e montagens manuais continuem válidos; o template trata ausente como destaque.
export type TTicketPreparoDados = z.input<typeof TicketPreparoDadosSchema>;

const MODALIDADE_LABELS: Record<string, string> = {
	PRESENCIAL: "BALCÃO",
	RETIRADA: "RETIRADA",
	ENTREGA: "ENTREGA",
	COMANDA: "COMANDA",
};

type TTicketPreparoItem = TTicketPreparoDados["itens"][number];

function renderAdicionaisHtml(grupos: NonNullable<TTicketPreparoItem["gruposAdicionais"]>) {
	return grupos
		.map(({ grupo, adicionais }) => {
			const opcoesHtml = adicionais
				.map(
					(adicional) =>
						`<span class="adicional${grupo ? " agrupado" : ""}">+ ${adicional.quantidade && adicional.quantidade > 1 ? `${adicional.quantidade}x ` : ""}${escapeHtml(adicional.nome)}</span>`,
				)
				.join("");
			return grupo ? `<span class="grupo-adicionais">${escapeHtml(grupo)}</span>${opcoesHtml}` : opcoesHtml;
		})
		.join("");
}

function renderItemDescricaoHtml(item: TTicketPreparoItem) {
	return `${escapeHtml(item.nome)}${item.gruposAdicionais?.length ? renderAdicionaisHtml(item.gruposAdicionais) : ""}${
		item.observacoes ? `<span class="observacao">&raquo; ${escapeHtml(item.observacoes)}</span>` : ""
	}`;
}

// Itens de outras estações: contexto para a montagem do pedido, não trabalho desta estação —
// corpo menor, sem negrito, sem a quantidade em fonte grande.
function renderOutrosItensHtml(itens: TTicketPreparoItem[]) {
	const linhasHtml = itens
		.map(
			(item) =>
				`<div class="outro-item">${item.quantidade}x ${escapeHtml(item.nome)}${item.gruposAdicionais?.length ? renderAdicionaisHtml(item.gruposAdicionais) : ""}${
					item.observacoes ? `<span class="outro-observacao">&raquo; ${escapeHtml(item.observacoes)}</span>` : ""
				}</div>`,
		)
		.join("");
	return `<div class="sep"></div>
<div class="outros"><p class="outros-titulo">Também neste pedido</p>${linhasHtml}</div>`;
}

export function renderTicketPreparoHtml(dados: TTicketPreparoDados) {
	const modalidadeLabel = dados.modalidade ? (MODALIDADE_LABELS[dados.modalidade] ?? dados.modalidade) : null;
	// A linha de contexto só acrescenta o que a etiqueta ainda não disse: "Mesa 12" dispensa
	// "COMANDA"; "Entrega" dispensa repetir "ENTREGA", mas precisa do canal ("IFOOD") para a
	// cozinha saber a embalagem.
	const etiquetaJaDiz = (valor: string) => valor.trim().toLocaleLowerCase("pt-BR") === dados.etiqueta.trim().toLocaleLowerCase("pt-BR");
	const contexto = [
		modalidadeLabel && dados.origem === "VENDA" && !etiquetaJaDiz(modalidadeLabel) ? modalidadeLabel : null,
		dados.canal && dados.canal !== "COMANDA" && !etiquetaJaDiz(dados.canal) ? dados.canal.toUpperCase() : null,
	]
		.filter(Boolean)
		.join(" · ");

	// Sem nenhum item em destaque (dado inconsistente), imprime tudo em destaque: melhor um ticket
	// sem realce do que um ticket sem trabalho.
	const hasHighlightedItem = dados.itens.some((item) => item.destaque !== false);
	const itensDestaque = hasHighlightedItem ? dados.itens.filter((item) => item.destaque !== false) : dados.itens;
	const outrosItens = hasHighlightedItem ? dados.itens.filter((item) => item.destaque === false) : [];

	const totalItens = itensDestaque.reduce((total, item) => total + item.quantidade, 0);
	const totalOutrosItens = outrosItens.reduce((total, item) => total + item.quantidade, 0);

	const itensHtml = itensDestaque
		.map(
			(item) => `<tr>
			<td class="qtd">${item.quantidade}</td>
			<td class="desc">${renderItemDescricaoHtml(item)}</td>
		</tr>`,
		)
		.join("");

	return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><style>
@page { margin: 0; }
@media print { body { margin: 0; } }
body { margin: 0; padding: 4mm; width: 72mm; box-sizing: border-box; font-family: 'Courier New', monospace; font-size: 10pt; line-height: 1.3; color: #000; background: #fff; font-weight: 700; }
p { margin: 0; }
.centro { text-align: center; }
.etiqueta { font-size: 18pt; line-height: 1.1; text-transform: uppercase; border: 0.5mm solid #000; padding: 1.5mm 1mm; margin-bottom: 1.5mm; word-break: break-word; }
.pedido { font-size: 13pt; margin-bottom: 1mm; }
.contexto { font-size: 9pt; letter-spacing: 0.2mm; }
.meta { font-size: 8.5pt; margin-top: 1mm; }
.sep { border-top: 1px dashed #000; margin: 2mm 0; }
.itens { width: 100%; border-collapse: collapse; }
.itens td { padding: 1.2mm 0; vertical-align: top; border-bottom: 1px dotted #000; }
.itens tr:last-child td { border-bottom: 0; }
.itens .qtd { width: 10mm; font-size: 15pt; line-height: 1; }
.itens .desc { font-size: 11pt; word-break: break-word; }
.adicional { display: block; font-size: 9pt; padding-left: 2mm; }
.adicional.agrupado { padding-left: 4mm; }
.grupo-adicionais { display: block; margin-top: 0.8mm; padding-left: 2mm; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1mm; }
/* Observação: a linha que a cozinha erra quando passa despercebida — invertida, não só negrito. */
.observacao { display: inline-block; margin-top: 0.8mm; padding: 0.5mm 1mm; background: #000; color: #fff; font-size: 9.5pt; }
.observacoes-pedido { margin-top: 1mm; padding: 1.5mm 1mm; border: 0.5mm solid #000; font-size: 10pt; }
.rodape { margin-top: 2mm; font-size: 8pt; }
${
	dados.estacao
		? `.estacao { margin-bottom: 1.5mm; padding: 0.8mm 1mm; background: #000; color: #fff; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.3mm; word-break: break-word; }
`
		: ""
}${
		outrosItens.length > 0
			? `.outros { font-weight: 400; font-size: 8.5pt; }
.outros-titulo { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1mm; margin-bottom: 0.8mm; }
.outro-item { padding: 0.6mm 0; word-break: break-word; }
.outros .adicional { font-size: 8pt; }
.outro-observacao { display: block; padding-left: 2mm; font-size: 8pt; }
`
			: ""
	}</style></head><body>
${dados.estacao ? `<p class="centro estacao">${escapeHtml(dados.estacao.nome)}</p>\n` : ""}<div class="centro etiqueta">${escapeHtml(dados.etiqueta)}</div>
${dados.numeroPedido ? `<p class="centro pedido">PEDIDO ${dados.numeroPedido}</p>` : ""}
${contexto ? `<p class="centro contexto">${contexto}</p>` : ""}
<p class="centro meta">${formatDateTimeInOperationTimezone(dados.data)}${dados.clienteNome ? ` &middot; ${escapeHtml(dados.clienteNome)}` : ""}</p>
<div class="sep"></div>
<table class="itens">${itensHtml}</table>
${dados.observacoes ? `<div class="observacoes-pedido">OBS: ${escapeHtml(dados.observacoes)}</div>` : ""}
${outrosItens.length > 0 ? `${renderOutrosItensHtml(outrosItens)}\n` : ""}<div class="sep"></div>
<p class="centro rodape">${totalItens} ${totalItens === 1 ? "ITEM" : "ITENS"}${
		totalOutrosItens > 0 ? ` &middot; +${totalOutrosItens} EM OUTRAS ESTAÇÕES` : ""
	}${dados.codigoInterno ? ` &middot; #${escapeHtml(dados.codigoInterno)}` : ""}</p>
</body></html>`;
}
