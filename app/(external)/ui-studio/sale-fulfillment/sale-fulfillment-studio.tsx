"use client";

import type { TGetSalesFulfillmentOutputById } from "@/app/api/sales/fulfillment/route";
import { SaleFulfillmentDetailsPreview } from "@/components/Modals/Sales/SaleFulfillmentDetailsMenu";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { useState } from "react";

const STUDIO_SALE = {
	id: "sale-studio-1942",
	idExterno: "1942",
	documento: "PED-1942",
	valorTotal: 289.7,
	descontosTotal: 18.5,
	acrescimosTotal: 12,
	statusVenda: "CONFIRMADA",
	statusAtendimento: "EM_PREPARO",
	integracaoCanal: null,
	integracao: null,
	entregaModalidade: "ENTREGA",
	comandaNumero: null,
	clienteId: "client-studio-1",
	observacoes: "Entregar no portão lateral. O interfone está com defeito.",
	dataVenda: new Date("2026-09-04T14:32:00-03:00"),
	statusAtendimentoData: new Date("2026-09-04T14:41:00-03:00"),
	canal: "WhatsApp",
	cliente: {
		id: "client-studio-1",
		nome: "Mariana Oliveira",
		telefone: "11987654321",
	},
	financeiro: "PARCIALMENTE_RECEBIDA",
	pagamentos: [
		{
			id: "payment-studio-1",
			metodo: "PIX",
			valor: 189.7,
			parcela: null,
			totalParcelas: null,
			dataEfetivacao: new Date("2026-09-04T14:34:00-03:00"),
			dataPrevisao: new Date("2026-09-04T14:34:00-03:00"),
			provedorStatus: "CONFIRMADO",
			editavel: false,
			motivoNaoEditavel: "Pagamento já recebido.",
			grupoParcelasId: null,
			lancamentoContabilId: "entry-studio-1",
			contaFinanceiraId: "account-studio-1",
		},
		{
			id: "payment-studio-2",
			metodo: "DINHEIRO",
			valor: 100,
			parcela: null,
			totalParcelas: null,
			dataEfetivacao: null,
			dataPrevisao: new Date("2026-09-04T18:00:00-03:00"),
			provedorStatus: null,
			editavel: true,
			motivoNaoEditavel: null,
			grupoParcelasId: null,
			lancamentoContabilId: "entry-studio-1",
			contaFinanceiraId: "account-studio-2",
		},
	],
	resumoPagamentos: { totalEditaveis: 1, totalPendentes: 1, totalEfetivadas: 1 },
	pagamentoObservacoes: "Troco para R$ 150,00.",
	fiscal: "AUTORIZADO",
	documentoFiscalId: "fiscal-studio-1",
	editabilidade: {
		nivel: "CABECALHO",
		rascunho: false,
		motivos: ["Nota fiscal emitida: cancele a nota para editar valores."],
		valorMinimoEdicao: 189.7,
		fiscalBloqueia: true,
		cancelamentoDisponivel: true,
		cancelamentoExigeFiscal: true,
		exclusaoBloqueadaPorFiscal: true,
	},
	entregaLocalizacao: {
		id: "location-studio-1",
		titulo: "Casa",
		localizacaoCep: "04538-132",
		localizacaoEstado: "SP",
		localizacaoCidade: "São Paulo",
		localizacaoBairro: "Vila Olímpia",
		localizacaoLogradouro: "Rua das Fiandeiras",
		localizacaoNumero: "312",
		localizacaoComplemento: "Fundos",
	},
	itens: [
		{
			id: "item-studio-1",
			quantidade: 2,
			valorVendaUnitario: 74.9,
			valorVendaTotalBruto: 149.8,
			valorTotalDesconto: 10,
			valorVendaTotalLiquido: 139.8,
			produto: { id: "product-studio-1", nome: "Kit churrasco premium 8 peças", codigo: "CHU-008", unidade: "UN", imagemCapaUrl: null },
			produtoVariante: { id: "variant-studio-1", nome: "Cabo de madeira", codigo: "MAD", imagemCapaUrl: null },
			adicionais: [],
		},
		{
			id: "item-studio-2",
			quantidade: 1,
			valorVendaUnitario: 89.9,
			valorVendaTotalBruto: 101.9,
			valorTotalDesconto: 8.5,
			valorVendaTotalLiquido: 93.4,
			produto: { id: "product-studio-2", nome: "Tábua de corte em bambu", codigo: "TAB-042", unidade: "UN", imagemCapaUrl: null },
			produtoVariante: null,
			adicionais: [
				{ id: "addon-studio-1", quantidade: 1, valorUnitario: 12, valorTotal: 12, opcao: { id: "option-studio-1", nome: "Gravação personalizada" } },
			],
		},
		{
			id: "item-studio-3",
			quantidade: 3,
			valorVendaUnitario: 14.5,
			valorVendaTotalBruto: 43.5,
			valorTotalDesconto: 0,
			valorVendaTotalLiquido: 43.5,
			produto: { id: "product-studio-3", nome: "Carvão vegetal 4 kg", codigo: "CAR-004", unidade: "PCT", imagemCapaUrl: null },
			produtoVariante: null,
			adicionais: [],
		},
		{
			id: "item-studio-4",
			quantidade: 1,
			valorVendaUnitario: 8,
			valorVendaTotalBruto: 8,
			valorTotalDesconto: 0,
			valorVendaTotalLiquido: 8,
			produto: { id: "product-studio-4", nome: "Acendedor ecológico", codigo: "ACE-001", unidade: "UN", imagemCapaUrl: null },
			produtoVariante: null,
			adicionais: [],
		},
		{
			id: "item-studio-5",
			quantidade: 1,
			valorVendaUnitario: 5,
			valorVendaTotalBruto: 5,
			valorTotalDesconto: 0,
			valorVendaTotalLiquido: 5,
			produto: { id: "product-studio-5", nome: "Caixa de fósforos longos", codigo: "FOS-010", unidade: "CX", imagemCapaUrl: null },
			produtoVariante: null,
			adicionais: [],
		},
	],
	documentosFiscais: [
		{
			id: "fiscal-studio-1",
			tipo: "NFCE",
			statusInterno: "AUTORIZADO",
			numero: "4832",
			serie: "1",
			dataEmissao: new Date("2026-09-04T14:35:00-03:00"),
			dataInsercao: new Date("2026-09-04T14:35:00-03:00"),
		},
	],
} satisfies TGetSalesFulfillmentOutputById;

export function SaleFulfillmentStudio() {
	const [isOpen, setIsOpen] = useState(true);

	return (
		<main className="flex min-h-screen items-center justify-center bg-secondary/45 p-6">
			<div className="max-w-md space-y-4 text-center">
				<p className="text-xs font-extrabold uppercase tracking-[0.08em] text-brand">UI Studio</p>
				<h1 className="text-2xl font-extrabold tracking-tight">Detalhes do pedido</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					Prévia isolada com dados fictícios para revisar hierarquia, densidade e responsividade.
				</p>
				<Button onClick={() => setIsOpen(true)}>
					<Eye className="size-4" />
					Abrir prévia
				</Button>
			</div>
			{isOpen ? <SaleFulfillmentDetailsPreview sale={STUDIO_SALE} closeMenu={() => setIsOpen(false)} /> : null}
		</main>
	);
}
