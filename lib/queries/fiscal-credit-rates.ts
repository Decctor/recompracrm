import type { TGetFiscalCreditRatesOutput } from "@/app/api/fiscal/credit-rates/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

async function fetchFiscalCreditRates() {
	const { data } = await axios.get<TGetFiscalCreditRatesOutput>("/api/fiscal/credit-rates");
	return data.data.default;
}
export function useFiscalCreditRates(enabled: boolean) {
	const queryKey = ["fiscal-credit-rates"];
	return { ...useQuery({ queryKey, queryFn: fetchFiscalCreditRates, enabled }), queryKey };
}
