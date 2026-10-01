import type {
	TCreateCashbackProgramInput,
	TCreateCashbackProgramOutput,
	TUpdateCashbackProgramInput,
	TUpdateCashbackProgramOutput,
} from "@/app/api/cashback-programs/route";
import type {
	TCreateCashbackProgramRedemptionInput,
	TCreateCashbackProgramRedemptionOutput,
} from "@/app/api/cashback-programs/transactions/redemption/route";
import axios from "axios";
import type {
	TCreateCashbackProgramPrizeInput,
	TCreateCashbackProgramPrizeOutput,
	TDeleteCashbackProgramPrizeInput,
	TDeleteCashbackProgramPrizeOutput,
	TUpdateCashbackProgramPrizeInput,
	TUpdateCashbackProgramPrizeOutput,
} from "@/app/api/cashback-programs/prizes/route";
import type {
	TGetCashbackProgramPrizesShareImageInput,
	TGetCashbackProgramPrizesShareImageOutput,
} from "@/app/api/cashback-programs/prizes/share-image/route";
import type { TRestoreCashbackProgramPrizeInput, TRestoreCashbackProgramPrizeOutput } from "@/app/api/cashback-programs/prizes/restore/route";

export async function createCashbackProgram(input: TCreateCashbackProgramInput) {
	const { data } = await axios.post<TCreateCashbackProgramOutput>("/api/cashback-programs", input);
	return data;
}

export async function updateCashbackProgram(input: TUpdateCashbackProgramInput) {
	const { data } = await axios.put<TUpdateCashbackProgramOutput>("/api/cashback-programs", input);
	return data;
}

export async function createCashbackProgramRedemption(input: TCreateCashbackProgramRedemptionInput) {
	const { data } = await axios.post<TCreateCashbackProgramRedemptionOutput>("/api/cashback-programs/transactions/redemption", input);
	return data;
}

export async function createCashbackProgramPrize(input: TCreateCashbackProgramPrizeInput) {
	const { data } = await axios.post<TCreateCashbackProgramPrizeOutput>("/api/cashback-programs/prizes", input);
	return data;
}

export async function updateCashbackProgramPrize(input: TUpdateCashbackProgramPrizeInput) {
	const { data } = await axios.put<TUpdateCashbackProgramPrizeOutput>("/api/cashback-programs/prizes", input);
	return data;
}

export async function deleteCashbackProgramPrize(input: TDeleteCashbackProgramPrizeInput) {
	const searchParams = new URLSearchParams({ id: input.id });
	const { data } = await axios.delete<TDeleteCashbackProgramPrizeOutput>(`/api/cashback-programs/prizes?${searchParams.toString()}`);
	return data;
}

export async function restoreCashbackProgramPrize(input: TRestoreCashbackProgramPrizeInput) {
	const { data } = await axios.post<TRestoreCashbackProgramPrizeOutput>("/api/cashback-programs/prizes/restore", input);
	return data;
}

export async function getCashbackProgramPrizesShareImage(input: TGetCashbackProgramPrizesShareImageInput) {
	const searchParams = new URLSearchParams({ mode: input.mode });
	const { data } = await axios.get<TGetCashbackProgramPrizesShareImageOutput>(`/api/cashback-programs/prizes/share-image?${searchParams.toString()}`);
	return data;
}
