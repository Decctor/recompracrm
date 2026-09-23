import { formatCashbackValue, formatToCNPJ, formatToMoney, formatToPhone, getCashbackUnitLabel } from "@/lib/formatting";
import { formatDateTimeInOperationTimezone } from "@/lib/operation-timezone";
import { z } from "zod";

// Cupom não fiscal de venda (finalidade CUPOM_VENDA) — layout v2 para térmica de 80mm via
// driver do SO (largura útil ~72mm). Renderizado no servidor: o agent só entrega ao driver
// (plano, decisão 2).
//
// Não existe "Pedido Nº": o modelo de dados não tem sequencial por organização e inventar um a
// partir do UUID seria um número falso. O cupom carrega só o código interno (curto, discreto),
// que é o que realmente identifica a venda no dashboard.
export const CupomVendaDadosSchema = z.object({
	organizacao: z.object({
		nome: z.string({
			required_error: "Nome da organização não informado para o cupom.",
			invalid_type_error: "Tipo não válido para o nome da organização.",
		}),
		cnpj: z.string({ invalid_type_error: "Tipo não válido para o CNPJ." }).optional().nullable(),
		telefone: z.string({ invalid_type_error: "Tipo não válido para o telefone." }).optional().nullable(),
		// Logo já embutida como data URL pelo builder — a máquina do agent não necessariamente
		// alcança o bucket, então nunca referenciamos a URL remota aqui.
		logoDataUrl: z.string({ invalid_type_error: "Tipo não válido para a logo da organização." }).optional().nullable(),
	}),
	venda: z.object({
		data: z.coerce.date({ invalid_type_error: "Tipo não válido para a data da venda." }),
		codigoInterno: z.string({ invalid_type_error: "Tipo não válido para o código interno." }).optional().nullable(),
		modalidade: z.string({ invalid_type_error: "Tipo não válido para a modalidade de entrega." }).optional().nullable(),
		comandaNumero: z.string({ invalid_type_error: "Tipo não válido para o número da comanda." }).optional().nullable(),
		vendedorNome: z.string({ invalid_type_error: "Tipo não válido para o nome do vendedor." }).optional().nullable(),
		observacoes: z.string({ invalid_type_error: "Tipo não válido para as observações." }).optional().nullable(),
		// Snapshot em linhas já formatadas: a localização do cliente é FK com onDelete "set null",
		// então congelar o texto aqui mantém a reimpressão fiel ao que foi entregue.
		enderecoEntrega: z
			.array(z.string({ invalid_type_error: "Tipo não válido para a linha do endereço de entrega." }))
			.optional()
			.nullable(),
		contatoTemporario: z
			.object({
				telefone: z.string({ invalid_type_error: "Tipo não válido para o telefone temporário." }).optional().nullable(),
				localizador: z.string({ required_error: "Localizador temporário não informado." }),
				expiraEm: z.coerce.date({ invalid_type_error: "Tipo não válido para a expiração do localizador." }).optional().nullable(),
			})
			.optional()
			.nullable(),
		itens: z
			.array(
				z.object({
					descricao: z.string({
						required_error: "Descrição do item não informada.",
						invalid_type_error: "Tipo não válido para a descrição do item.",
					}),
					quantidade: z.number({
						required_error: "Quantidade do item não informada.",
						invalid_type_error: "Tipo não válido para a quantidade do item.",
					}),
					valorUnitario: z.number({ invalid_type_error: "Tipo não válido para o valor unitário do item." }).optional().nullable(),
					valorTotal: z.number({
						required_error: "Valor total do item não informado.",
						invalid_type_error: "Tipo não válido para o valor total do item.",
					}),
					observacoes: z.string({ invalid_type_error: "Tipo não válido para as observações do item." }).optional().nullable(),
					adicionais: z
						.array(
							z.object({
								nome: z.string({
									required_error: "Nome do adicional não informado.",
									invalid_type_error: "Tipo não válido para o nome do adicional.",
								}),
								quantidade: z.number({ invalid_type_error: "Tipo não válido para a quantidade do adicional." }).optional().nullable(),
								valorTotal: z.number({ invalid_type_error: "Tipo não válido para o valor do adicional." }).optional().nullable(),
							}),
						)
						.optional()
						.nullable(),
				}),
			)
			.optional()
			.nullable(),
		subtotal: z.number({
			required_error: "Subtotal da venda não informado.",
			invalid_type_error: "Tipo não válido para o subtotal da venda.",
		}),
		descontoGeral: z.number({ invalid_type_error: "Tipo não válido para o desconto geral." }).optional().nullable(),
		acrescimos: z.number({ invalid_type_error: "Tipo não válido para os acréscimos." }).optional().nullable(),
		taxaEntrega: z.number({ invalid_type_error: "Tipo não válido para a taxa de entrega." }).optional().nullable(),
		valorFinal: z.number({
			required_error: "Valor final da venda não informado.",
			invalid_type_error: "Tipo não válido para o valor final da venda.",
		}),
		pagamentos: z
			.array(
				z.object({
					metodo: z.string({
						required_error: "Método de pagamento não informado.",
						invalid_type_error: "Tipo não válido para o método de pagamento.",
					}),
					valor: z.number({
						required_error: "Valor do pagamento não informado.",
						invalid_type_error: "Tipo não válido para o valor do pagamento.",
					}),
					parcelas: z.number({ invalid_type_error: "Tipo não válido para o número de parcelas." }).optional().nullable(),
					pago: z.boolean({ invalid_type_error: "Tipo não válido para o status de pagamento." }),
					descricao: z.string({ invalid_type_error: "Tipo não válido para a descrição do pagamento." }).optional().nullable(),
					situacao: z.enum(["PAGO", "PAGO_CANAL", "COBRAR", "EM_ABERTO"], { invalid_type_error: "Situação do pagamento não válida." }).optional(),
				}),
			)
			.optional()
			.nullable(),
		troco: z.number({ invalid_type_error: "Tipo não válido para o troco." }).optional().nullable(),
	}),
	cliente: z
		.object({
			nome: z.string({ invalid_type_error: "Tipo não válido para o nome do cliente." }).optional().nullable(),
			telefone: z.string({ invalid_type_error: "Tipo não válido para o telefone do cliente." }).optional().nullable(),
			totalCompras: z.number({ invalid_type_error: "Tipo não válido para o total de compras do cliente." }).optional().nullable(),
		})
		.optional()
		.nullable(),
	cupom: z
		.object({
			codigo: z.string({ invalid_type_error: "Tipo não válido para o código do cupom." }).optional().nullable(),
			titulo: z.string({ invalid_type_error: "Tipo não válido para o título do cupom." }).optional().nullable(),
			valorDesconto: z.number({
				required_error: "Valor de desconto do cupom não informado.",
				invalid_type_error: "Tipo não válido para o desconto do cupom.",
			}),
		})
		.optional()
		.nullable(),
	recompensa: z
		.object({
			nome: z.string({ invalid_type_error: "Tipo não válido para o nome da recompensa." }).optional().nullable(),
			valorDesconto: z.number({
				required_error: "Valor de desconto da recompensa não informado.",
				invalid_type_error: "Tipo não válido para o desconto da recompensa.",
			}),
		})
		.optional()
		.nullable(),
	cashback: z
		.object({
			terminologia: z.enum(["DINHEIRO", "PONTOS"], { invalid_type_error: "Tipo não válido para a terminologia do cashback." }).optional().nullable(),
			valorResgatado: z.number({ invalid_type_error: "Tipo não válido para o cashback resgatado." }).optional().nullable(),
			valorGanho: z.number({ invalid_type_error: "Tipo não válido para o cashback ganho." }).optional().nullable(),
			// true = a venda ainda não está paga, então o ACÚMULO não existe no ledger e o valor
			// impresso é projeção pela regra do programa. O cupom precisa dizer isso ao cliente.
			projetado: z.boolean({ invalid_type_error: "Tipo não válido para o indicador de projeção." }).optional().nullable(),
		})
		.optional()
		.nullable(),
});
export type TCupomVendaDados = z.infer<typeof CupomVendaDadosSchema>;

export function escapeHtml(value: string) {
	return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

// Labels locais em vez de utils/select-options.tsx: aquele módulo é .tsx e carrega ícones do
// lucide — o caminho de impressão roda no servidor e não deve arrastar React junto.
const METODO_PAGAMENTO_LABELS: Record<string, string> = {
	DINHEIRO: "Dinheiro",
	PIX: "PIX",
	CARTAO_CREDITO: "Cartão de crédito",
	CARTAO_DEBITO: "Cartão de débito",
	BOLETO: "Boleto",
	TRANSFERENCIA: "Transferência",
	CASHBACK: "Cashback",
	VALE: "Vale",
	A_DEFINIR: "A definir",
	FIADO_NOTA: "Fiado",
	OUTRO: "Outro",
};

const MODALIDADE_LABELS: Record<string, string> = {
	PRESENCIAL: "VENDA NO BALCÃO",
	RETIRADA: "RETIRAR NO LOCAL",
	ENTREGA: "ENTREGA",
	COMANDA: "COMANDA",
};

function renderLinha(label: string, valor: string, { destaque, negativo }: { destaque?: boolean; negativo?: boolean } = {}) {
	return `<div class="linha${destaque ? " destaque" : ""}"><span>${escapeHtml(label)}</span><span>${negativo ? "-" : ""}${escapeHtml(valor)}</span></div>`;
}

export function renderCupomVendaHtml(dados: TCupomVendaDados) {
	const { organizacao, venda, cliente, cupom, recompensa, cashback } = dados;

	const cabecalhoHtml = `<div class="centro cabecalho">
		${organizacao.logoDataUrl ? `<img class="logo" src="${escapeHtml(organizacao.logoDataUrl)}" alt="" />` : ""}
		<h1>${escapeHtml(organizacao.nome)}</h1>
		${
			// CNPJ e telefone na MESMA linha: numa bobina, cada linha do cabeçalho é papel gasto antes
			// do que o cliente veio conferir. Endereço da loja saiu — quem tem o cupom já esteve nela.
			organizacao.cnpj || organizacao.telefone
				? `<p class="mini">${[
						organizacao.cnpj ? `CNPJ ${formatToCNPJ(organizacao.cnpj)}` : null,
						organizacao.telefone ? formatToPhone(organizacao.telefone) : null,
					]
						.filter(Boolean)
						.map((parte) => escapeHtml(parte as string))
						.join(" &middot; ")}</p>`
				: ""
		}
	</div>`;

	const metaHtml = `<div class="centro meta">
		<p class="forte">${formatDateTimeInOperationTimezone(venda.data)}</p>
		${venda.codigoInterno ? `<p class="mini fraco">Cód. interno: #${escapeHtml(venda.codigoInterno)}</p>` : ""}
	</div>`;

	const totalComprasHtml =
		cliente?.totalCompras && cliente.totalCompras > 0
			? `<p>${cliente.totalCompras === 1 ? "1ª compra na loja" : `${cliente.totalCompras} compras na loja`}</p>`
			: "";
	const clienteHtml = cliente?.nome
		? `<div class="sep"></div>
		<div class="bloco">
			<p><span class="rotulo">Cliente:</span> ${escapeHtml(cliente.nome)}</p>
			${cliente.telefone ? `<p><span class="rotulo">Telefone:</span> ${escapeHtml(formatToPhone(cliente.telefone))}</p>` : ""}
			${totalComprasHtml}
		</div>`
		: "";

	const modalidadeLabel = venda.modalidade ? (MODALIDADE_LABELS[venda.modalidade] ?? venda.modalidade) : null;
	const contatoTemporarioHtml =
		venda.modalidade === "ENTREGA" && venda.contatoTemporario
			? `<div class="contato-ifood">
			<p class="titulo-secao">CONTATO IFOOD</p>
			${venda.contatoTemporario.telefone ? `<p class="telefone-ifood">${escapeHtml(venda.contatoTemporario.telefone)}</p>` : ""}
			<p class="localizador-ifood">LOCALIZADOR ${escapeHtml(venda.contatoTemporario.localizador)}</p>
			${venda.contatoTemporario.expiraEm ? `<p class="mini">Válido até ${formatDateTimeInOperationTimezone(venda.contatoTemporario.expiraEm)}</p>` : ""}
		</div>`
			: "";
	const modalidadeHtml = modalidadeLabel
		? `<div class="sep"></div>
		<div class="bloco">
			<p class="faixa">${escapeHtml(modalidadeLabel)}${venda.comandaNumero ? ` Nº ${escapeHtml(venda.comandaNumero)}` : ""}</p>
			${venda.enderecoEntrega?.length ? venda.enderecoEntrega.map((linha) => `<p>${escapeHtml(linha)}</p>`).join("") : ""}
			${contatoTemporarioHtml}
		</div>`
		: "";

	const itensHtml = venda.itens?.length
		? `<div class="sep"></div>
		<p class="centro titulo-secao">ITENS DO PEDIDO</p>
		<div class="sep fina"></div>
		<table class="itens">
			${venda.itens
				.map(
					(item) => `<tr>
				<td class="qtd">${item.quantidade}x</td>
				<td class="desc">${escapeHtml(item.descricao)}${
					item.valorUnitario != null && item.quantidade > 1 ? `<span class="mini fraco"> (${formatToMoney(item.valorUnitario)} un.)</span>` : ""
				}${
					item.adicionais?.length
						? item.adicionais
								.map(
									(adicional) =>
										`<span class="adicional">+ ${adicional.quantidade && adicional.quantidade > 1 ? `${adicional.quantidade}x ` : ""}${escapeHtml(adicional.nome)}${
											adicional.valorTotal ? ` (${formatToMoney(adicional.valorTotal)})` : ""
										}</span>`,
								)
								.join("")
						: ""
				}${item.observacoes ? `<span class="observacao">Obs.: ${escapeHtml(item.observacoes)}</span>` : ""}</td>
				<td class="val">${formatToMoney(item.valorTotal)}</td>
			</tr>`,
				)
				.join("")}
		</table>`
		: "";

	const descontoGeral = venda.descontoGeral ?? 0;
	const acrescimos = venda.acrescimos ?? 0;
	const taxaEntrega = venda.taxaEntrega ?? 0;
	const totaisHtml = `<div class="sep"></div>
	<div class="bloco">
		${renderLinha("Subtotal", formatToMoney(venda.subtotal))}
		${cupom && cupom.valorDesconto > 0 ? renderLinha(`Cupom ${cupom.codigo ?? cupom.titulo ?? ""}`.trim(), formatToMoney(cupom.valorDesconto), { negativo: true }) : ""}
		${cashback?.valorResgatado ? renderLinha("Resgate de cashback", formatToMoney(cashback.valorResgatado), { negativo: true }) : ""}
		${recompensa && recompensa.valorDesconto > 0 ? renderLinha(`Recompensa${recompensa.nome ? `: ${recompensa.nome}` : ""}`, formatToMoney(recompensa.valorDesconto), { negativo: true }) : ""}
		${descontoGeral > 0 ? renderLinha("Desconto", formatToMoney(descontoGeral), { negativo: true }) : ""}
		${taxaEntrega > 0 ? renderLinha("Taxa de entrega", formatToMoney(taxaEntrega)) : ""}
		${acrescimos > 0 ? renderLinha("Acréscimo", formatToMoney(acrescimos)) : ""}
	</div>
	<div class="sep fina"></div>
	<div class="bloco">${renderLinha("TOTAL", formatToMoney(venda.valorFinal), { destaque: true })}</div>`;

	const pagamentosHtml = venda.pagamentos?.length
		? `<div class="sep"></div>
		<p class="titulo-secao">FORMAS DE PAGAMENTO</p>
		<div class="bloco">
			${venda.pagamentos
				.map((pagamento) => {
					const label = METODO_PAGAMENTO_LABELS[pagamento.metodo] ?? pagamento.metodo;
					const parcelas = pagamento.parcelas && pagamento.parcelas > 1 ? ` ${pagamento.parcelas}x` : "";
					const situacao = pagamento.situacao ?? (pagamento.pago ? "PAGO" : "EM_ABERTO");
					const situacaoLabel =
						situacao === "COBRAR" ? "COBRAR NA ENTREGA" : situacao === "PAGO_CANAL" ? "PAGO PELO IFOOD" : situacao === "PAGO" ? "PAGO" : "EM ABERTO";
					const descricao = pagamento.descricao ? ` · ${pagamento.descricao}` : "";
					return renderLinha(`${label}${parcelas}${descricao} (${situacaoLabel})`, formatToMoney(pagamento.valor));
				})
				.join("")}
			${venda.troco && venda.troco > 0 ? renderLinha("TROCO", formatToMoney(venda.troco), { destaque: true }) : ""}
		</div>`
		: "";
	const valorACobrar = venda.pagamentos?.reduce((total, pagamento) => total + (pagamento.situacao === "COBRAR" ? pagamento.valor : 0), 0) ?? 0;
	const jaPagoPeloCanal = !!venda.pagamentos?.length && venda.pagamentos.every((pagamento) => pagamento.situacao === "PAGO_CANAL");
	const valorACobrarHtml =
		valorACobrar > 0
			? `<div class="pagamento-destaque">VALOR A COBRAR: ${formatToMoney(valorACobrar)}</div>`
			: jaPagoPeloCanal
				? `<div class="pagamento-destaque">JÁ PAGO · NADA A COBRAR</div>`
				: "";

	// Uma linha só: o que esta compra rendeu. Saldo em carteira e validade saíram — eram duas linhas
	// a mais para uma informação que o cliente consulta no app, não na bobina.
	const terminologia = cashback?.terminologia ?? "DINHEIRO";
	const valorGanho = cashback?.valorGanho ?? 0;
	const cashbackHtml =
		valorGanho > 0
			? `<div class="sep"></div>
		<div class="bloco">${renderLinha(
			`${getCashbackUnitLabel(terminologia, { uppercase: true })} ${cashback?.projetado ? "A CREDITAR" : "DESTA COMPRA"}`,
			formatCashbackValue(valorGanho, terminologia),
			{ destaque: true },
		)}</div>`
			: "";

	const observacoesHtml = venda.observacoes
		? `<div class="sep"></div>
		<div class="bloco"><p class="rotulo">Observações</p><p>${escapeHtml(venda.observacoes)}</p></div>`
		: "";

	const vendedorHtml = venda.vendedorNome ? `<p class="mini">Atendente: ${escapeHtml(venda.vendedorNome)}</p>` : "";

	return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><style>
@page { margin: 0; }
@media print { body { margin: 0; } }
body { margin: 0; padding: 4mm; width: 72mm; box-sizing: border-box; font-family: 'Courier New', monospace; font-size: 9pt; line-height: 1.35; color: #000; background: #fff; }
.centro { text-align: center; }
h1 { margin: 0; font-size: 12pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2mm; }
p { margin: 0; }
.cabecalho { margin-bottom: 1mm; }
/* Térmica é 1 bit: sem dessaturar + reforçar contraste, logo colorida vira borrão cinza. */
.logo { display: block; margin: 0 auto 1.5mm; max-width: 44mm; max-height: 16mm; object-fit: contain; filter: grayscale(1) contrast(1.4); }
.mini { font-size: 7.5pt; font-weight: 700; }
.fraco { color: #000; }
.forte { font-weight: 700; }
.meta { margin-top: 1mm; }
.bloco { font-weight: 700; }
.rotulo { font-weight: 700; }
.titulo-secao { font-weight: 700; font-size: 8.5pt; letter-spacing: 0.3mm; }
.faixa { font-weight: 700; font-size: 10pt; text-align: center; border: 0.4mm solid #000; padding: 1mm 0; margin-bottom: 1mm; }
.contato-ifood { border: 0.4mm solid #000; margin-top: 1.5mm; padding: 1.2mm; text-align: center; }
.telefone-ifood { font-size: 10pt; font-weight: 700; }
.localizador-ifood { margin: 0.8mm 0; font-size: 11pt; font-weight: 700; letter-spacing: 0.2mm; }
.sep { border-top: 1px dashed #000; margin: 2mm 0; }
.sep.fina { margin: 1mm 0; }
.linha { display: flex; justify-content: space-between; gap: 2mm; }
.linha span:last-child { white-space: nowrap; }
.linha.destaque { font-weight: 700; font-size: 12pt; }
.pagamento-destaque { margin-top: 1mm; padding: 1.5mm 1mm; background: #000; color: #fff; text-align: center; font-size: 11pt; font-weight: 700; }
.itens { width: 100%; border-collapse: collapse; font-weight: 700; }
.itens td { padding: 0.6mm 0; vertical-align: top; }
.itens .qtd { width: 8mm; }
.itens .desc { padding-right: 1.5mm; word-break: break-word; }
.itens .val { text-align: right; white-space: nowrap; }
.adicional { display: block; font-size: 7.5pt; padding-left: 2mm; }
/* Observação em negrito: é a linha que a cozinha erra quando passa despercebida. */
.observacao { display: block; font-size: 8pt; font-weight: 700; padding-left: 2mm; }
.rodape { margin-top: 3mm; font-size: 7.5pt; font-weight: 700; }
</style></head><body>
${cabecalhoHtml}
${metaHtml}
${clienteHtml}
${modalidadeHtml}
${itensHtml}
${totaisHtml}
${pagamentosHtml}
${valorACobrarHtml}
${cashbackHtml}
${observacoesHtml}
<div class="sep"></div>
<div class="centro rodape">
	<p class="forte">Obrigado pela preferência!</p>
	${vendedorHtml}
	<p>NÃO É DOCUMENTO FISCAL</p>
</div>
</body></html>`;
}
