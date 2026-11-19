import type { TCreateFiscalCreditRatesInput, TCreateFiscalCreditRatesOutput } from "@/app/api/fiscal/credit-rates/route";
import axios from "axios";
export async function createFiscalCreditRates(input: TCreateFiscalCreditRatesInput) {
	const { data } = await axios.post<TCreateFiscalCreditRatesOutput>("/api/fiscal/credit-rates", input);
	return data;
}
