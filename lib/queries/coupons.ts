import type { TGetCouponGrantsInput, TGetCouponGrantsOutput } from "@/app/api/coupons/grants/route";
import type { TGetPoiAvailableCouponsOutput } from "@/app/api/point-of-interaction/coupons/available/route";
import type { TGetAvailablePosCouponsInput, TGetAvailablePosCouponsOutput } from "@/app/api/pos/coupons/available/route";
import type { TGetCouponsInput, TGetCouponsOutput } from "@/app/api/coupons/route";
import type { TDeliveryModeEnum } from "@/schemas/enums";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchCoupons(input: TGetCouponsInput) {
	const searchParams = new URLSearchParams();
	if (input.search) searchParams.set("search", input.search);
	if (input.activeOnly) searchParams.set("activeOnly", "true");
	if (input.page) searchParams.set("page", input.page.toString());
	const { data } = await axios.get<TGetCouponsOutput>(`/api/coupons?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Cupons não encontrados.");
	return result;
}

type UseCouponsParams = {
	initialParams?: Partial<TGetCouponsInput>;
};
export function useCoupons({ initialParams }: UseCouponsParams = {}) {
	const [queryParams, setQueryParams] = useState<TGetCouponsInput>({
		id: null,
		page: initialParams?.page || 1,
		search: initialParams?.search || "",
		activeOnly: initialParams?.activeOnly || false,
	});

	function updateQueryParams(newParams: Partial<TGetCouponsInput>) {
		setQueryParams((prevParams) => ({ ...prevParams, ...newParams }));
	}
	const debouncedQueryParams = useDebounceMemo(queryParams, 500);
	return {
		...useQuery({
			queryKey: ["coupons", debouncedQueryParams],
			queryFn: () => fetchCoupons(debouncedQueryParams),
		}),
		queryKey: ["coupons", debouncedQueryParams],
		queryParams,
		updateQueryParams,
	};
}

async function fetchCouponById(id: string) {
	const { data } = await axios.get<TGetCouponsOutput>(`/api/coupons?id=${id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Cupom não encontrado.");
	return result;
}

export function useCouponById({ couponId }: { couponId: string }) {
	return {
		...useQuery({
			queryKey: ["coupon-by-id", couponId],
			queryFn: () => fetchCouponById(couponId),
		}),
		queryKey: ["coupon-by-id", couponId],
	};
}

async function fetchCouponGrants(input: TGetCouponGrantsInput) {
	const searchParams = new URLSearchParams();
	searchParams.set("couponId", input.couponId);
	if (input.page) searchParams.set("page", input.page.toString());
	const { data } = await axios.get<TGetCouponGrantsOutput>(`/api/coupons/grants?${searchParams.toString()}`);
	return data.data;
}

export function useCouponGrants({ couponId }: { couponId: string }) {
	const [queryParams, setQueryParams] = useState<TGetCouponGrantsInput>({ couponId, page: 1 });

	function updateQueryParams(newParams: Partial<TGetCouponGrantsInput>) {
		setQueryParams((prevParams) => ({ ...prevParams, ...newParams }));
	}
	return {
		...useQuery({
			queryKey: ["coupon-grants", queryParams],
			queryFn: () => fetchCouponGrants(queryParams),
		}),
		queryKey: ["coupon-grants", queryParams],
		queryParams,
		updateQueryParams,
	};
}

async function fetchPosAvailableCoupons(input: TGetAvailablePosCouponsInput) {
	const { data } = await axios.post<TGetAvailablePosCouponsOutput>("/api/pos/coupons/available", input);
	return data.data.coupons;
}

/**
 * Cupons disponíveis para o cliente vinculado no PDV, avaliados contra o carrinho atual
 * (cupons AUTOMATICA retornam `avaliacao` com o desconto computado pelo servidor).
 */
export function usePosAvailableCoupons({
	clienteId,
	itens,
	entregaModalidade,
}: {
	clienteId: string | null;
	itens: TGetAvailablePosCouponsInput["itens"];
	entregaModalidade?: TGetAvailablePosCouponsInput["entregaModalidade"];
}) {
	const debouncedInput = useDebounceMemo({ clienteId, itens, entregaModalidade }, 500);
	const queryKey = ["pos-available-coupons", debouncedInput];
	return {
		...useQuery({
			queryKey,
			queryFn: () =>
				fetchPosAvailableCoupons({
					clienteId: debouncedInput.clienteId as string,
					itens: debouncedInput.itens,
					entregaModalidade: debouncedInput.entregaModalidade,
				}),
			enabled: !!debouncedInput.clienteId,
		}),
		queryKey,
	};
}
export type TPosAvailableCoupon = Awaited<ReturnType<typeof fetchPosAvailableCoupons>>[number];

async function fetchPoiAvailableCoupons(input: {
	orgId: string;
	clienteId: string;
	valorVenda?: number | null;
	entregaModalidade?: TDeliveryModeEnum | null;
}) {
	const searchParams = new URLSearchParams();
	searchParams.set("orgId", input.orgId);
	searchParams.set("clienteId", input.clienteId);
	if (input.valorVenda) searchParams.set("valorVenda", input.valorVenda.toString());
	if (input.entregaModalidade) searchParams.set("entregaModalidade", input.entregaModalidade);
	const { data } = await axios.get<TGetPoiAvailableCouponsOutput>(`/api/point-of-interaction/coupons/available?${searchParams.toString()}`);
	return data.data.coupons;
}

/**
 * Cupons disponíveis para o cliente identificado no ponto de interação (endpoint público).
 * Quando `valorVenda` é informado, cupons AUTOMATICA de venda total retornam o desconto estimado.
 */
export function usePoiAvailableCoupons({
	orgId,
	clienteId,
	valorVenda,
	entregaModalidade,
}: {
	orgId: string;
	clienteId: string | null;
	valorVenda?: number | null;
	entregaModalidade?: TDeliveryModeEnum | null;
}) {
	const debouncedInput = useDebounceMemo({ orgId, clienteId, valorVenda: valorVenda ?? null, entregaModalidade }, 500);
	const queryKey = ["poi-available-coupons", debouncedInput];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchPoiAvailableCoupons({ ...debouncedInput, clienteId: debouncedInput.clienteId as string }),
			enabled: !!debouncedInput.clienteId,
		}),
		queryKey,
	};
}
export type TPoiAvailableCoupon = Awaited<ReturnType<typeof fetchPoiAvailableCoupons>>[number];
