import type { TGetShopAvailabilityOutput } from "@/app/api/shop/[orgId]/availability/route";
import type { TGetShopCatalogOutput } from "@/app/api/shop/[orgId]/catalog/route";
import type { TGetPublicShopOrderOutput } from "@/app/api/shop/[orgId]/orders/[token]/route";
import type { TGetAvailableShopRewardsOutput } from "@/app/api/shop/[orgId]/cashback-rewards/available/route";
import type {
  TGetAvailableShopCouponsInput,
  TGetAvailableShopCouponsOutput,
} from "@/app/api/shop/[orgId]/coupons/available/route";
import type {
  TShopClientLookupInput,
  TShopClientLookupOutput,
} from "@/app/api/shop/[orgId]/clients/lookup/route";
import type {
  TGetShopOrdersInput,
  TGetShopOrdersOutput,
} from "@/app/api/shop/orders/route";
import type { TGetShopSettingsOutput } from "@/app/api/shop/settings/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "./../hooks/use-debounce";

async function fetchShopCatalog(orgId: string) {
  const { data } = await axios.get<TGetShopCatalogOutput>(
    `/api/shop/${orgId}/catalog`,
  );
  return data.data;
}

export function useShopCatalog({
  orgId,
  initialData,
}: {
  orgId: string;
  initialData?: TGetShopCatalogOutput["data"];
}) {
  const queryKey = ["shop-catalog", orgId] as const;
  return {
    ...useQuery({
      queryKey,
      queryFn: () => fetchShopCatalog(orgId),
      enabled: !!orgId,
      initialData,
      staleTime: 60_000,
    }),
    queryKey,
  };
}

async function fetchShopAvailability(orgId: string) {
  const { data } = await axios.get<TGetShopAvailabilityOutput>(
    `/api/shop/${orgId}/availability`,
  );
  return data.data;
}

export function useShopAvailability({
  orgId,
  initialData,
}: {
  orgId: string;
  initialData?: TGetShopAvailabilityOutput["data"];
}) {
  const queryKey = ["shop-availability", orgId] as const;
  return {
    ...useQuery({
      queryKey,
      queryFn: () => fetchShopAvailability(orgId),
      enabled: !!orgId,
      initialData,
      staleTime: 30_000,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
    }),
    queryKey,
  };
}

async function fetchShopClientLookup({
  orgId,
  input,
}: {
  orgId: string;
  input: TShopClientLookupInput;
}) {
  const { data } = await axios.post<TShopClientLookupOutput>(
    `/api/shop/${orgId}/clients/lookup`,
    input,
  );
  return data.data;
}

export function useShopClientLookup({
  orgId,
  telefone,
}: {
  orgId: string;
  telefone: string;
}) {
  const debouncedInput = useDebounceMemo({ orgId, telefone }, 700);
  const queryKey = ["shop-client-lookup", debouncedInput] as const;
  return {
    ...useQuery({
      queryKey,
      queryFn: () =>
        fetchShopClientLookup({
          orgId: debouncedInput.orgId,
          input: { telefone: debouncedInput.telefone },
        }),
      enabled:
        !!debouncedInput.orgId &&
        debouncedInput.telefone.replace(/\D/g, "").length >= 10,
      staleTime: 5 * 60_000,
    }),
    queryKey,
  };
}

async function fetchShopSettings() {
  const { data } =
    await axios.get<TGetShopSettingsOutput>("/api/shop/settings");
  return data.data;
}

export function useShopSettings() {
  const queryKey = ["shop-settings"] as const;
  return {
    ...useQuery({
      queryKey,
      queryFn: fetchShopSettings,
    }),
    queryKey,
  };
}

async function fetchShopOrders(input: TGetShopOrdersInput) {
  const searchParams = new URLSearchParams();
  searchParams.set("page", input.page.toString());
  if (input.status) searchParams.set("status", input.status);
  if (input.statusAtendimento)
    searchParams.set("statusAtendimento", input.statusAtendimento);
  if (input.search) searchParams.set("search", input.search);
  const { data } = await axios.get<TGetShopOrdersOutput>(
    `/api/shop/orders?${searchParams.toString()}`,
  );
  return data.data;
}

export function useShopOrders(initialParams?: Partial<TGetShopOrdersInput>) {
  const [params, setParams] = useState<TGetShopOrdersInput>({
    page: initialParams?.page ?? 1,
    status: initialParams?.status ?? "ORCAMENTO",
    statusAtendimento: initialParams?.statusAtendimento ?? null,
    search: initialParams?.search ?? null,
  });
  const debouncedParams = useDebounceMemo(params, 400);
  const queryKey = ["shop-orders", debouncedParams] as const;

  function updateParams(newParams: Partial<TGetShopOrdersInput>) {
    setParams((prev) => ({ ...prev, ...newParams }));
  }

  return {
    ...useQuery({
      queryKey,
      queryFn: () => fetchShopOrders(debouncedParams),
    }),
    queryKey,
    params,
    updateParams,
  };
}

const PUBLIC_ORDER_TERMINAL_STATUSES = new Set(["ENTREGUE", "CANCELADO"]);

async function fetchPublicShopOrder({
  orgId,
  token,
}: {
  orgId: string;
  token: string;
}) {
  const { data } = await axios.get<TGetPublicShopOrderOutput>(
    "/api/shop/" + orgId + "/orders/" + token,
  );
  return data.data;
}

export function usePublicShopOrder({
  orgId,
  token,
}: {
  orgId: string;
  token: string;
}) {
  const queryKey = ["public-shop-order", orgId, token] as const;
  return {
    ...useQuery({
      queryKey,
      queryFn: () => fetchPublicShopOrder({ orgId, token }),
      enabled: !!orgId && !!token,
      staleTime: 10_000,
      refetchInterval: (query) => {
        const status = query.state.data?.order.statusAtendimento;
        return status && PUBLIC_ORDER_TERMINAL_STATUSES.has(status)
          ? false
          : 20_000;
      },
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    }),
    queryKey,
  };
}

async function fetchShopAvailableCoupons({
  orgId,
  input,
}: {
  orgId: string;
  input: TGetAvailableShopCouponsInput;
}) {
  const { data } = await axios.post<TGetAvailableShopCouponsOutput>(
    `/api/shop/${orgId}/coupons/available`,
    input,
  );
  return data.data.coupons;
}

export function useShopAvailableCoupons({
  orgId,
  clienteId,
  itens,
  entregaModalidade,
  enabled = true,
}: {
  orgId: string;
  clienteId: string | null;
  itens: TGetAvailableShopCouponsInput["itens"];
  entregaModalidade?: TGetAvailableShopCouponsInput["entregaModalidade"];
  enabled?: boolean;
}) {
  const debouncedInput = useDebounceMemo({ orgId, clienteId, itens, entregaModalidade }, 500);
  const queryKey = ["shop-available-coupons", debouncedInput] as const;
  return {
    ...useQuery({
      queryKey,
      queryFn: () =>
        fetchShopAvailableCoupons({
          orgId: debouncedInput.orgId,
          input: {
            clienteId: debouncedInput.clienteId as string,
            itens: debouncedInput.itens,
            entregaModalidade: debouncedInput.entregaModalidade,
          },
        }),
      enabled:
        enabled &&
        !!debouncedInput.orgId &&
        !!debouncedInput.clienteId &&
        debouncedInput.itens.length > 0,
    }),
    queryKey,
  };
}
export type TShopAvailableCoupon = Awaited<
  ReturnType<typeof fetchShopAvailableCoupons>
>[number];

async function fetchShopAvailableRewards({
  orgId,
  clienteId,
}: {
  orgId: string;
  clienteId: string;
}) {
  const searchParams = new URLSearchParams({ clienteId });
  const { data } = await axios.get<TGetAvailableShopRewardsOutput>(
    `/api/shop/${orgId}/cashback-rewards/available?${searchParams.toString()}`,
  );
  return data.data;
}

export function useShopAvailableRewards({
  orgId,
  clienteId,
  enabled = true,
}: {
  orgId: string;
  clienteId: string | null;
  enabled?: boolean;
}) {
  const queryKey = ["shop-available-rewards", orgId, clienteId] as const;
  return {
    ...useQuery({
      queryKey,
      queryFn: () =>
        fetchShopAvailableRewards({ orgId, clienteId: clienteId as string }),
      enabled: enabled && !!orgId && !!clienteId,
    }),
    queryKey,
  };
}
export type TShopAvailableReward = Awaited<
  ReturnType<typeof fetchShopAvailableRewards>
>["rewards"][number];
