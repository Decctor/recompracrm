import { formatToMoney } from "@/lib/formatting";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

// O título é texto congelado na criação, então o fuso precisa ser explícito: `dataVenda` é um
// instante UTC (sessão do banco em UTC; drizzle lê naive como UTC) e o servidor roda em UTC —
// `format()` puro imprimiria a hora errada. Produto BR-only, mesmo padrão do data-collecting.
const SALE_TITLE_TIMEZONE = process.env.DATA_COLLECTING_TIMEZONE ?? "America/Sao_Paulo";

/**
 * Título user-friendly dos lançamentos de venda (lançamento contábil e transações derivadas).
 *
 * `saleNumber` é a âncora operacional quando existe (ex.: displayId do iFood, o número que a
 * loja vê no painel/cupom); sem número, a data-hora local desambigua vendas do mesmo cliente.
 * Sempre em caps, no formato `VENDA [CANAL] [#NÚMERO] - CLIENTE - VALOR [- DD/MM HH:mm]`.
 */
export function buildSaleEntryTitle({
	channelLabel,
	saleNumber,
	clientName,
	totalValue,
	occurredAt,
}: {
	/** Ex.: "IFOOD". Null/vazio para venda interna. */
	channelLabel?: string | null;
	saleNumber?: string | null;
	clientName?: string | null;
	totalValue: number;
	occurredAt?: Date | null;
}) {
	const channel = channelLabel?.trim() ? ` ${channelLabel.trim().toUpperCase()}` : "";
	const number = saleNumber?.trim() ? ` #${saleNumber.trim()}` : "";
	const parts = [`VENDA${channel}${number}`, (clientName?.trim() || "CONSUMIDOR FINAL").toUpperCase(), formatToMoney(totalValue)];
	if (!number && occurredAt) parts.push(dayjs(occurredAt).tz(SALE_TITLE_TIMEZONE).format("DD/MM HH:mm"));
	return parts.join(" - ");
}
