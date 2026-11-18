import type { TGetClientsOutputDefault } from "@/lib/clients/listing";
import { formatDateAsLocale, formatToMoney, formatToPhone } from "@/lib/formatting";

type TClientExportSource = TGetClientsOutputDefault["clients"][number];

export type TClientExportRow = {
	ID: string;
	NOME: string;
	TELEFONE: string;
	EMAIL: string;
	"CPF/CNPJ": string;
	AQUISIÇÃO: string;
	"SEGMENTAÇÃO RFM": string;
	"VALOR TOTAL DE COMPRAS": string;
	"QUANTIDADE TOTAL DE COMPRAS": number;
	"PRIMEIRA COMPRA": string | null;
	"ÚLTIMA COMPRA": string | null;
	"CASHBACK DISPONÍVEL": string;
	CIDADE: string;
	ESTADO: string;
	BAIRRO: string;
	CEP: string;
	"PRODUTO/GRUPO MAIS COMPRADO": string;
	"DATA DE CADASTRO": string | null;
};

function formatOptionalDate(date?: string | Date | null) {
	return date ? formatDateAsLocale(date) : "";
}

/** Linha da planilha de clientes. Montada no servidor, pela rota que confere `canExportClients`. */
export function formatClientExportRow(client: TClientExportSource): TClientExportRow {
	const cashbackBalance = client.saldos[0] ?? null;

	return {
		ID: client.id,
		NOME: client.nome,
		TELEFONE: client.telefone ? formatToPhone(client.telefone) : "",
		EMAIL: client.email ?? "",
		"CPF/CNPJ": client.cpfCnpj ?? "",
		AQUISIÇÃO: client.canalAquisicao ?? "",
		"SEGMENTAÇÃO RFM": client.analiseRFMTitulo ?? "",
		"VALOR TOTAL DE COMPRAS": formatToMoney(client.estatisticas.comprasValorTotal),
		"QUANTIDADE TOTAL DE COMPRAS": client.estatisticas.comprasQtdeTotal,
		"PRIMEIRA COMPRA": formatOptionalDate(client.estatisticas.primeiraCompraData),
		"ÚLTIMA COMPRA": formatOptionalDate(client.estatisticas.ultimaCompraData),
		"CASHBACK DISPONÍVEL": cashbackBalance ? formatToMoney(cashbackBalance.saldoValorDisponivel) : "",
		CIDADE: client.localizacaoCidade ?? "",
		ESTADO: client.localizacaoEstado ?? "",
		BAIRRO: client.localizacaoBairro ?? "",
		CEP: client.localizacaoCep ?? "",
		"PRODUTO/GRUPO MAIS COMPRADO": client.metadataGrupoProdutoMaisComprado ?? "",
		"DATA DE CADASTRO": formatOptionalDate(client.dataInsercao),
	};
}
