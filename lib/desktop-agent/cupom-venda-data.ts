import { calculateAccumulatedCashbackValue } from "@/lib/cashback/accumulation";
import { getSaleChangeTotal } from "@/lib/sales/sale-change";
import { POS_REWARD_SALE_ITEM_ORIGIN } from "@/lib/sales/sale-reward-redemption";
import { classifySalePaymentTransactions } from "@/lib/sales/utils";
import { readShopDeliveryFee } from "@/lib/shop/config";
import { db } from "@/services/drizzle";
import { cashbackPrograms, couponRedemptions, organizations, sales } from "@/services/drizzle/schema";
import { and, count, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { fetchOrganizationLogoDataUrl } from "./organization-logo";
import type { TCupomVendaDados } from "./templates/cupom-venda";

// Builder único dos `dados` do CUPOM_VENDA — consumido pela impressão manual (rota de gestão) e
// pelo auto-print (lib/desktop-agent/auto-print.ts). Um builder só = cupom manual e automático
// sempre idênticos.

type TEnderecoFields = {
	localizacaoCep?: string | null;
	localizacaoEstado?: string | null;
	localizacaoCidade?: string | null;
	localizacaoBairro?: string | null;
	localizacaoLogradouro?: string | null;
	localizacaoNumero?: string | null;
	localizacaoComplemento?: string | null;
};

// formatLocation() de lib/formatting não serve aqui: ela anexa LAT/LONG quando a localização tem
// coordenadas — o que é exatamente o caso de clientLocations — e um cupom com "LAT -18.91" na
// frente do entregador é ruído.
function buildAddressLines(location: TEnderecoFields): string[] {
	const linhas: string[] = [];

	const logradouro = [location.localizacaoLogradouro, location.localizacaoNumero].filter(Boolean).join(", ");
	if (logradouro) linhas.push(location.localizacaoComplemento ? `${logradouro} - ${location.localizacaoComplemento}` : logradouro);

	const cidade = [location.localizacaoCidade, location.localizacaoEstado].filter(Boolean).join("/");
	const bairroCidade = [location.localizacaoBairro, cidade].filter(Boolean).join(" - ");
	if (bairroCidade) linhas.push(bairroCidade);

	if (location.localizacaoCep) linhas.push(`CEP ${location.localizacaoCep}`);

	return linhas;
}

function readItemSnapshot(metadados: unknown) {
	if (!metadados || typeof metadados !== "object" || Array.isArray(metadados)) return null;
	return metadados as { nome?: string; origem?: string; recompensaId?: string };
}

export async function buildCupomVendaDados({ organizacaoId, vendaId }: { organizacaoId: string; vendaId: string }): Promise<TCupomVendaDados> {
	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.id, organizacaoId),
		columns: { nome: true, cnpj: true, telefone: true, logoUrl: true },
	});
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const sale = await db.query.sales.findFirst({
		where: and(eq(sales.id, vendaId), eq(sales.organizacaoId, organizacaoId)),
		columns: {
			id: true,
			dataVenda: true,
			valorTotal: true,
			descontosTotal: true,
			acrescimosTotal: true,
			clienteId: true,
			vendedorNome: true,
			observacoes: true,
			integracaoMetadados: true,
			rascunhoMetadados: true,
			entregaModalidade: true,
			comandaNumero: true,
		},
		with: {
			cliente: { columns: { id: true, nome: true, telefone: true } },
			entregaLocalizacao: {
				columns: {
					localizacaoCep: true,
					localizacaoEstado: true,
					localizacaoCidade: true,
					localizacaoBairro: true,
					localizacaoLogradouro: true,
					localizacaoNumero: true,
					localizacaoComplemento: true,
				},
			},
			itens: {
				columns: {
					quantidade: true,
					valorVendaUnitario: true,
					valorVendaTotalBruto: true,
					valorTotalDesconto: true,
					observacoes: true,
					metadados: true,
				},
				with: {
					produto: { columns: { nome: true } },
					produtoVariante: { columns: { nome: true } },
					adicionais: { columns: { nome: true, quantidade: true, valorTotal: true } },
				},
			},
			lancamentosContabeis: {
				columns: { id: true },
				with: {
					transacoesFinanceiras: {
						columns: {
							id: true,
							valor: true,
							tipo: true,
							metodo: true,
							parcela: true,
							totalParcelas: true,
							dataEfetivacao: true,
							dataPrevisao: true,
							provedorStatus: true,
							contaFinanceiraId: true,
							modificadoresMetadata: true,
						},
					},
				},
			},
			transacoesCashback: {
				columns: { tipo: true, status: true, valor: true, resgateRecompensaId: true },
			},
		},
	});
	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");

	const clienteId = sale.clienteId;
	const [logoDataUrl, cupomResgatado, program, totalCompras] = await Promise.all([
		fetchOrganizationLogoDataUrl(organization.logoUrl),
		db.query.couponRedemptions.findFirst({
			where: and(eq(couponRedemptions.vendaId, sale.id), eq(couponRedemptions.organizacaoId, organizacaoId), eq(couponRedemptions.status, "UTILIZADO")),
			columns: { valorDesconto: true, cupomTitulo: true, cupomCodigo: true },
		}),
		db.query.cashbackPrograms.findFirst({
			where: and(eq(cashbackPrograms.organizacaoId, organizacaoId), eq(cashbackPrograms.ativo, true)),
			columns: { id: true, terminologia: true, acumuloTipo: true, acumuloValor: true, acumuloRegraValorMinimo: true },
		}),
		// Contagem viva em vez de clients.metadataTotalCompras: aquele contador só é mantido no
		// caminho de integração (data-collecting), então imprimiria um número errado para vendas de
		// PDV. É um COUNT por cupom impresso, coberto por idx_sales_client_id.
		clienteId
			? db
					.select({ total: count() })
					.from(sales)
					.where(and(eq(sales.organizacaoId, organizacaoId), eq(sales.clienteId, clienteId), eq(sales.statusVenda, "CONFIRMADA")))
					.then((rows) => rows[0]?.total ?? 0)
			: Promise.resolve(0),
	]);

	// ---- Decomposição dos descontos (mesma regra de lib/sales/map-sale-to-sale-state.ts) ----
	const descontosTotal = sale.descontosTotal ?? 0;
	const acrescimosTotal = sale.acrescimosTotal ?? 0;
	// A loja digital grava a taxa no snapshot do checkout; o restante segue como acréscimo genérico
	// (no PDV a taxa entra via acréscimo geral e não tem como ser distinguida).
	const taxaEntrega = Math.min(readShopDeliveryFee(sale.rascunhoMetadados), acrescimosTotal);
	const acrescimosGenericos = Math.max(0, acrescimosTotal - taxaEntrega);

	const resgatesAtivos = sale.transacoesCashback.filter((transaction) => transaction.tipo === "RESGATE" && transaction.status === "ATIVO");
	// Só resgates-desconto compõem o desconto em R$. O resgate de recompensa está em moeda cashback
	// e seu efeito comercial já vive no item com 100% de desconto — somá-lo aqui descontaria duas vezes.
	const cashbackResgate = resgatesAtivos
		.filter((transaction) => !transaction.resgateRecompensaId)
		.reduce((sum, transaction) => sum + Math.abs(transaction.valor), 0);
	const temRecompensaResgatada = resgatesAtivos.some((transaction) => !!transaction.resgateRecompensaId);

	const cupomDesconto = cupomResgatado?.valorDesconto ?? 0;
	// Uma linha impressa por recompensa; o "Desconto" geral subtrai TODAS — subtrair só a primeira
	// imprimiria o valor das demais como desconto do operador.
	const rewardItems = temRecompensaResgatada
		? sale.itens.filter((item) => readItemSnapshot(item.metadados)?.origem === POS_REWARD_SALE_ITEM_ORIGIN)
		: [];
	const descontoRecompensas = rewardItems.reduce((sum, item) => sum + (item.valorTotalDesconto ?? 0), 0);
	const descontoGeral = Math.max(0, descontosTotal - cupomDesconto - cashbackResgate - descontoRecompensas);

	// O subtotal impresso é o que reconcilia com o TOTAL (Subtotal - descontos + acréscimos = TOTAL).
	// A soma dos itens só é usada quando as duas concordam: vendas de canal externo chegam com totais
	// da origem que nem sempre batem com a soma das linhas, e um cupom que não fecha a conta na frente
	// do cliente é pior do que um cupom sem detalhe.
	const subtotalItens = sale.itens.reduce((sum, item) => sum + (item.valorVendaTotalBruto ?? 0), 0);
	const subtotalReconciliado = sale.valorTotal + descontosTotal - acrescimosTotal;
	const subtotal = Math.abs(subtotalItens - subtotalReconciliado) < 0.01 ? subtotalItens : subtotalReconciliado;

	// ---- Pagamentos: agrupados por método + situação, como o cliente lê ----
	const transacoesVenda = sale.lancamentosContabeis.flatMap((entry) =>
		entry.transacoesFinanceiras.map((transaction) => ({ ...transaction, lancamentoContabilId: entry.id })),
	);
	const pagamentosClassificados = classifySalePaymentTransactions(transacoesVenda);
	// Pagamentos saem pelo valor entregue (R$ 50 em dinheiro) e o troco vem da SAÍDA de troco da venda.
	const trocoTotal = getSaleChangeTotal(transacoesVenda);
	const pagamentosAgrupados = new Map<string, { metodo: string; valor: number; parcelas: number | null; pago: boolean }>();
	for (const pagamento of pagamentosClassificados.todas) {
		const pago = pagamento.dataEfetivacao != null;
		const chave = `${pagamento.metodo}:${pago}`;
		const atual = pagamentosAgrupados.get(chave);
		if (atual) {
			atual.valor += pagamento.valor;
			atual.parcelas = Math.max(atual.parcelas ?? 1, pagamento.totalParcelas ?? 1);
			continue;
		}
		pagamentosAgrupados.set(chave, { metodo: pagamento.metodo, valor: pagamento.valor, parcelas: pagamento.totalParcelas ?? null, pago });
	}
	const pagamentosCanal = sale.integracaoMetadados?.pagamentos?.metodos ?? [];
	const pagamentosCupom: TCupomVendaDados["venda"]["pagamentos"] =
		pagamentosCanal.length > 0
			? pagamentosCanal.map((pagamento) => ({
					metodo: pagamento.metodo,
					valor: pagamento.valor,
					parcelas: null,
					pago: pagamento.pagoOnline,
					descricao: pagamento.descricao,
					situacao: pagamento.pagoOnline ? ("PAGO_CANAL" as const) : ("COBRAR" as const),
				}))
			: [...pagamentosAgrupados.values()].map((pagamento) => ({ ...pagamento, situacao: pagamento.pago ? ("PAGO" as const) : ("EM_ABERTO" as const) }));

	// ---- Cashback: realizado quando o ledger já tem o ACÚMULO, projetado quando ainda não ----
	const acumulo = sale.transacoesCashback.find((transaction) => transaction.tipo === "ACÚMULO") ?? null;
	// Projeção pela MESMA função que o acúmulo real usa (lib/cashback/accumulation.ts) — inclusive a
	// regra de valor mínimo, que pode zerar o ganho. Sem fórmula paralela para divergir.
	const ganhoProjetado =
		program && clienteId
			? calculateAccumulatedCashbackValue({
					accumulationType: program.acumuloTipo,
					accumulationValue: program.acumuloValor,
					minimumSaleValue: program.acumuloRegraValorMinimo,
					saleValue: sale.valorTotal,
				})
			: 0;
	const valorGanho = acumulo ? acumulo.valor : ganhoProjetado;
	const cashbackDados: TCupomVendaDados["cashback"] =
		program && clienteId
			? {
					terminologia: program.terminologia as "DINHEIRO" | "PONTOS",
					valorResgatado: cashbackResgate > 0 ? cashbackResgate : null,
					valorGanho,
					projetado: !acumulo,
				}
			: null;

	return {
		organizacao: {
			nome: organization.nome,
			cnpj: organization.cnpj,
			telefone: organization.telefone,
			logoDataUrl,
		},
		venda: {
			data: sale.dataVenda ?? new Date(),
			codigoInterno: sale.id.slice(0, 8).toUpperCase(),
			modalidade: sale.entregaModalidade,
			comandaNumero: sale.comandaNumero,
			vendedorNome: sale.vendedorNome,
			observacoes: sale.observacoes,
			enderecoEntrega: sale.entregaModalidade === "ENTREGA" && sale.entregaLocalizacao ? buildAddressLines(sale.entregaLocalizacao) : null,
			contatoTemporario:
				sale.entregaModalidade === "ENTREGA" && sale.integracaoMetadados?.contatoTemporario
					? {
							telefone: sale.integracaoMetadados.contatoTemporario.telefone,
							localizador: sale.integracaoMetadados.contatoTemporario.localizador,
							expiraEm: sale.integracaoMetadados.contatoTemporario.expiraEm ? new Date(sale.integracaoMetadados.contatoTemporario.expiraEm) : null,
						}
					: null,
			itens: sale.itens.map((item) => {
				const snapshot = readItemSnapshot(item.metadados);
				return {
					descricao: [item.produto?.nome, item.produtoVariante?.nome].filter(Boolean).join(" - ") || snapshot?.nome || "Item",
					quantidade: item.quantidade,
					valorUnitario: item.valorVendaUnitario,
					valorTotal: item.valorVendaTotalBruto ?? 0,
					observacoes: item.observacoes,
					adicionais: item.adicionais.map((adicional) => ({
						nome: adicional.nome,
						quantidade: adicional.quantidade,
						valorTotal: adicional.valorTotal,
					})),
				};
			}),
			subtotal,
			descontoGeral,
			acrescimos: acrescimosGenericos,
			taxaEntrega,
			valorFinal: sale.valorTotal,
			pagamentos: pagamentosCupom,
			troco: pagamentosCanal.length === 0 && trocoTotal > 0 ? trocoTotal : null,
		},
		cliente: sale.cliente ? { nome: sale.cliente.nome, telefone: sale.cliente.telefone, totalCompras } : null,
		cupom: cupomResgatado
			? { codigo: cupomResgatado.cupomCodigo, titulo: cupomResgatado.cupomTitulo, valorDesconto: cupomResgatado.valorDesconto }
			: null,
		recompensas: rewardItems
			.filter((item) => (item.valorTotalDesconto ?? 0) > 0)
			.map((item) => ({
				nome: [item.produto?.nome, item.produtoVariante?.nome].filter(Boolean).join(" - ") || null,
				quantidade: item.quantidade,
				valorDesconto: item.valorTotalDesconto ?? 0,
			})),
		cashback: cashbackDados,
	};
}
