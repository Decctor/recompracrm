"use client";

import type { TAppliedCoupon } from "@/schemas/coupons";
import type {
  TCreateShopOrderInput,
  TShopCartItem,
  TShopCustomer,
  TShopDelivery,
  TShopPaymentMethod,
  TShopRewardSnapshot,
} from "@/schemas/shop";
import { useCallback, useEffect, useMemo, useState } from "react";

// v5: `reward.resgates` (lista, com quantidade) no lugar de `reward.resgate`.
const SHOP_CART_STORAGE_VERSION = 5;

type TShopOrderState = {
  orgId: string;
  mode: "CARDAPIO" | "CATALOGO";
  cart: {
    items: TShopCartItem[];
  };
  customer: TShopCustomer;
  delivery: TShopDelivery;
  cashback: {
    resgateSolicitado: number;
  };
  coupon: {
    resgate: TAppliedCoupon | null;
  };
  reward: {
    // Uma linha por recompensa distinta, com quantidade (`recompensaId` é a chave da linha).
    resgates: TShopRewardSnapshot[];
  };
  payment: {
    metodo: TShopPaymentMethod;
    observacoes: string;
    precisaTroco: boolean;
    trocoPara: number | null;
  };
  idempotencyKey: string;
  publicAccessToken: string;
  checkoutStep:
    | "CARRINHO"
    | "CLIENTE"
    | "ENTREGA"
    | "CASHBACK"
    | "PAGAMENTO"
    | "REVISAO";
};

const CHECKOUT_STEPS: TShopOrderState["checkoutStep"][] = [
  "CARRINHO",
  "CLIENTE",
  "ENTREGA",
  "CASHBACK",
  "PAGAMENTO",
  "REVISAO",
];

type TStoredShopOrderState = {
  version: number;
  cart: TShopOrderState["cart"];
  customer: Partial<Pick<TShopCustomer, "id" | "nome" | "telefone">>;
  delivery: Partial<TShopDelivery>;
  cashback: TShopOrderState["cashback"];
  coupon?: TShopOrderState["coupon"];
  reward?: TShopOrderState["reward"];
  payment: TShopOrderState["payment"];
  idempotencyKey: string;
  publicAccessToken: string;
};

function getStorageKey(orgId: string) {
  return `shop-cart:${orgId}`;
}

function createOrderIdentity() {
  return {
    idempotencyKey: crypto.randomUUID(),
    publicAccessToken: crypto.randomUUID(),
  };
}

function getDefaultState(
  orgId: string,
  mode: "CARDAPIO" | "CATALOGO",
): TShopOrderState {
  return {
    orgId,
    mode,
    cart: { items: [] },
    customer: { id: null, nome: "", cpfCnpj: null, telefone: "" },
    delivery: { modalidade: "RETIRADA", endereco: null },
    cashback: { resgateSolicitado: 0 },
    coupon: { resgate: null },
    reward: { resgates: [] },
    payment: {
      metodo: "DINHEIRO",
      observacoes: "",
      precisaTroco: false,
      trocoPara: null,
    },
    ...createOrderIdentity(),
    checkoutStep: "CARRINHO",
  };
}

export function useShopOrderState({
  orgId,
  mode,
}: {
  orgId: string;
  mode: "CARDAPIO" | "CATALOGO";
}) {
  const [state, setState] = useState<TShopOrderState>(() =>
    getDefaultState(orgId, mode),
  );

  const hydrateFromStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(getStorageKey(orgId));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as TStoredShopOrderState;
      if (parsed.version !== SHOP_CART_STORAGE_VERSION) {
        window.localStorage.removeItem(getStorageKey(orgId));
        return;
      }
      setState((prev) => ({
        ...prev,
        cart: parsed.cart ?? prev.cart,
        customer: { ...prev.customer, ...parsed.customer, cpfCnpj: null },
        delivery: { ...prev.delivery, ...parsed.delivery },
        cashback: parsed.cashback ?? prev.cashback,
        coupon: parsed.coupon ?? prev.coupon,
        reward: parsed.reward ?? prev.reward,
        payment: parsed.payment ?? prev.payment,
        idempotencyKey: parsed.idempotencyKey ?? prev.idempotencyKey,
        publicAccessToken: parsed.publicAccessToken ?? prev.publicAccessToken,
      }));
    } catch {
      window.localStorage.removeItem(getStorageKey(orgId));
    }
  }, [orgId]);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    setState((prev) => ({ ...prev, orgId, mode }));
  }, [orgId, mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload: TStoredShopOrderState = {
      version: SHOP_CART_STORAGE_VERSION,
      cart: state.cart,
      customer: {
        id: state.customer.id,
        nome: state.customer.nome,
        telefone: state.customer.telefone,
      },
      delivery: state.delivery,
      cashback: state.cashback,
      coupon: state.coupon,
      reward: state.reward,
      payment: state.payment,
      idempotencyKey: state.idempotencyKey,
      publicAccessToken: state.publicAccessToken,
    };
    // Debounced: updates arrive per keystroke (payment notes, address fields) and
    // serializing the whole cart on each one is wasted main-thread work.
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(
        getStorageKey(orgId),
        JSON.stringify(payload),
      );
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    orgId,
    state.cart,
    state.customer,
    state.delivery,
    state.cashback,
    state.coupon,
    state.reward,
    state.payment,
    state.idempotencyKey,
    state.publicAccessToken,
  ]);

  const addItem = useCallback((item: TShopCartItem) => {
    setState((prev) => ({
      ...prev,
      cart: {
        items: [
          ...prev.cart.items,
          { ...item, tempId: item.tempId ?? crypto.randomUUID() },
        ],
      },
      coupon: { resgate: null },
      ...createOrderIdentity(),
    }));
  }, []);

  const updateItemQuantity = useCallback(
    (tempId: string, quantidade: number) => {
      setState((prev) => ({
        ...prev,
        cart: {
          items: prev.cart.items.map((item) =>
            item.tempId === tempId
              ? { ...item, quantidade: Math.max(1, quantidade) }
              : item,
          ),
        },
        coupon: { resgate: null },
        ...createOrderIdentity(),
      }));
    },
    [],
  );

  const replaceItem = useCallback((tempId: string, item: TShopCartItem) => {
    setState((prev) => ({
      ...prev,
      cart: {
        items: prev.cart.items.map((existing) =>
          existing.tempId === tempId ? { ...item, tempId } : existing,
        ),
      },
      coupon: { resgate: null },
      ...createOrderIdentity(),
    }));
  }, []);

  const removeItem = useCallback((tempId: string) => {
    setState((prev) => ({
      ...prev,
      cart: { items: prev.cart.items.filter((item) => item.tempId !== tempId) },
      coupon: { resgate: null },
      ...createOrderIdentity(),
    }));
  }, []);

  const clearCart = useCallback(() => {
    setState((prev) => ({
      ...prev,
      cart: { items: [] },
      customer: { ...prev.customer, cpfCnpj: null },
      cashback: { resgateSolicitado: 0 },
      coupon: { resgate: null },
      reward: { resgates: [] },
      ...createOrderIdentity(),
    }));
    if (typeof window !== "undefined")
      window.localStorage.removeItem(getStorageKey(orgId));
  }, [orgId]);

  const updateCustomer = useCallback((customer: Partial<TShopCustomer>) => {
    setState((prev) => {
      const nextCustomer = { ...prev.customer, ...customer };
      const shouldClearBenefits =
        customer.id !== undefined && customer.id !== prev.customer.id;
      return {
        ...prev,
        customer: nextCustomer,
        cashback: shouldClearBenefits
          ? { resgateSolicitado: 0 }
          : prev.cashback,
        coupon: shouldClearBenefits ? { resgate: null } : prev.coupon,
        reward: shouldClearBenefits ? { resgates: [] } : prev.reward,
        ...createOrderIdentity(),
      };
    });
  }, []);

  const updateDelivery = useCallback((delivery: Partial<TShopDelivery>) => {
    setState((prev) => ({
      ...prev,
      delivery: { ...prev.delivery, ...delivery },
      ...createOrderIdentity(),
    }));
  }, []);

  const updateCashback = useCallback(
    (cashback: Partial<TShopOrderState["cashback"]>) => {
      setState((prev) => ({
        ...prev,
        cashback: { ...prev.cashback, ...cashback },
        reward:
          (cashback.resgateSolicitado ?? 0) > 0
            ? { resgates: [] }
            : prev.reward,
        ...createOrderIdentity(),
      }));
    },
    [],
  );

  const updateCoupon = useCallback(
    (coupon: TShopOrderState["coupon"]["resgate"]) => {
      setState((prev) => ({
        ...prev,
        coupon: { resgate: coupon },
        reward: coupon ? { resgates: [] } : prev.reward,
        ...createOrderIdentity(),
      }));
    },
    [],
  );

  // Recompensas são exclusivas com cupom e cashback: adicionar uma zera os irmãos. A mesma
  // recompensa de novo incrementa a quantidade da linha, nunca duplica a linha.
  const addReward = useCallback(
    (reward: Omit<TShopRewardSnapshot, "quantidade"> & { quantidade?: number }) => {
      setState((prev) => {
        const existing = prev.reward.resgates.find(
          (line) => line.recompensaId === reward.recompensaId,
        );
        const resgates = existing
          ? prev.reward.resgates.map((line) =>
              line.recompensaId === reward.recompensaId
                ? { ...line, quantidade: line.quantidade + (reward.quantidade ?? 1) }
                : line,
            )
          : [...prev.reward.resgates, { ...reward, quantidade: reward.quantidade ?? 1 }];
        return {
          ...prev,
          reward: { resgates },
          coupon: { resgate: null },
          cashback: { resgateSolicitado: 0 },
          ...createOrderIdentity(),
        };
      });
    },
    [],
  );

  const setRewardQuantity = useCallback(
    (recompensaId: string, quantidade: number) => {
      setState((prev) => ({
        ...prev,
        reward: {
          resgates:
            quantidade < 1
              ? prev.reward.resgates.filter((line) => line.recompensaId !== recompensaId)
              : prev.reward.resgates.map((line) =>
                  line.recompensaId === recompensaId
                    ? { ...line, quantidade: Math.floor(quantidade) }
                    : line,
                ),
        },
        ...createOrderIdentity(),
      }));
    },
    [],
  );

  /** Atualiza valores de uma linha (revalidação) sem mexer na quantidade nem na identidade do pedido. */
  const updateRewardValues = useCallback(
    (
      recompensaId: string,
      updates: Partial<Pick<TShopRewardSnapshot, "valor" | "valorVenda" | "titulo" | "imagemCapaUrl">>,
    ) => {
      setState((prev) => ({
        ...prev,
        reward: {
          resgates: prev.reward.resgates.map((line) =>
            line.recompensaId === recompensaId ? { ...line, ...updates } : line,
          ),
        },
      }));
    },
    [],
  );

  const removeReward = useCallback((recompensaId: string) => {
    setState((prev) => ({
      ...prev,
      reward: {
        resgates: prev.reward.resgates.filter((line) => line.recompensaId !== recompensaId),
      },
      ...createOrderIdentity(),
    }));
  }, []);

  const clearRewards = useCallback(() => {
    setState((prev) =>
      prev.reward.resgates.length === 0
        ? prev
        : { ...prev, reward: { resgates: [] }, ...createOrderIdentity() },
    );
  }, []);

  const updatePayment = useCallback(
    (payment: Partial<TShopOrderState["payment"]>) => {
      setState((prev) => ({
        ...prev,
        payment: { ...prev.payment, ...payment },
        ...createOrderIdentity(),
      }));
    },
    [],
  );

  const setCheckoutStep = useCallback(
    (checkoutStep: TShopOrderState["checkoutStep"]) => {
      setState((prev) => ({ ...prev, checkoutStep }));
    },
    [],
  );

  const nextStep = useCallback(() => {
    setState((prev) => {
      const index = CHECKOUT_STEPS.indexOf(prev.checkoutStep);
      return {
        ...prev,
        checkoutStep:
          CHECKOUT_STEPS[Math.min(CHECKOUT_STEPS.length - 1, index + 1)],
      };
    });
  }, []);

  const previousStep = useCallback(() => {
    setState((prev) => {
      const index = CHECKOUT_STEPS.indexOf(prev.checkoutStep);
      return { ...prev, checkoutStep: CHECKOUT_STEPS[Math.max(0, index - 1)] };
    });
  }, []);

  const resetCheckout = useCallback(() => {
    setState((prev) => ({ ...prev, checkoutStep: "CARRINHO" }));
  }, []);

  const resetState = useCallback(() => {
    setState(getDefaultState(orgId, mode));
    if (typeof window !== "undefined")
      window.localStorage.removeItem(getStorageKey(orgId));
  }, [orgId, mode]);

  const refreshOrderIdentity = useCallback(() => {
    setState((prev) => ({ ...prev, ...createOrderIdentity() }));
  }, []);

  const orderInput = useMemo<TCreateShopOrderInput>(
    () => ({
      idempotencyKey: state.idempotencyKey,
      publicAccessToken: state.publicAccessToken,
      cliente: {
        id: state.customer.id,
        nome: state.customer.nome,
        cpfCnpj: state.customer.cpfCnpj,
        telefone: state.customer.telefone,
      },
      entrega: state.delivery,
      itens: state.cart.items,
      pagamento: {
        metodo: state.payment.metodo,
        observacoes:
          [
            state.payment.precisaTroco && state.payment.trocoPara
              ? `Troco para R$ ${state.payment.trocoPara.toFixed(2).replace(".", ",")}.`
              : null,
            state.payment.observacoes.trim() || null,
          ]
            .filter(Boolean)
            .join(" ") || null,
      },
      cashbackResgateSolicitado: state.cashback.resgateSolicitado,
      cupomResgate: state.coupon.resgate,
      recompensasResgate: state.reward.resgates.map((line) => ({
        recompensaId: line.recompensaId,
        programaId: line.programaId,
        quantidade: line.quantidade,
      })),
      observacoes: null,
    }),
    [
      state.idempotencyKey,
      state.publicAccessToken,
      state.customer,
      state.delivery,
      state.cart.items,
      state.payment,
      state.cashback.resgateSolicitado,
      state.coupon.resgate,
      state.reward.resgates,
    ],
  );

  return {
    state,
    orderInput,
    addItem,
    updateItemQuantity,
    replaceItem,
    removeItem,
    clearCart,
    updateCustomer,
    updateDelivery,
    updateCashback,
    updateCoupon,
    addReward,
    setRewardQuantity,
    updateRewardValues,
    removeReward,
    clearRewards,
    updatePayment,
    setCheckoutStep,
    nextStep,
    previousStep,
    resetCheckout,
    resetState,
    hydrateFromStorage,
    refreshOrderIdentity,
  };
}

export type TUseShopOrderState = ReturnType<typeof useShopOrderState>;
