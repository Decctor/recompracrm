import type { TCreateStockTransactionsInput, TCreateStockTransactionsOutput } from "@/app/api/products/stock-transactions/route";
import axios from "axios";

export async function createStockTransactions(input: TCreateStockTransactionsInput) {
	const { data } = await axios.post<TCreateStockTransactionsOutput>("/api/products/stock-transactions", input);
	return data;
}
