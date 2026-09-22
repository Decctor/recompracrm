"use client";

import { Button } from "@/components/ui/button";
import {
  formatCashbackValue,
  formatToMoney,
  formatToPhone,
} from "@/lib/formatting";
import { buildShopCartLines } from "@/lib/shop/cart";
import { resolveShopDeliveryFee } from "@/lib/shop/config";
import type { TShopPaymentMethod } from "@/schemas/shop";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Banknote,
  Clock3,
  CreditCard,
  Gift,
  Info,
  Package,
  QrCode,
  Send,
  Sparkles,
  Ticket,
  Truck,
  User,
} from "lucide-react";
import Image from "next/image";
import { useMemo, type ComponentType } from "react";
import { useShop } from "../ShopProvider";

type OrderReviewStepProps = {
  onSubmit: () => void;
  isSubmitting: boolean;
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const fadeUp = (delay = 0, reduced = false) =>
  reduced
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.35, delay, ease: EASE_OUT },
      };

function getPaymentLabel(metodo: TShopPaymentMethod) {
  switch (metodo) {
    case "DINHEIRO":
      return "Dinheiro";
    case "PIX":
      return "PIX";
    case "CARTAO_DEBITO":
      return "Cartão de débito";
    case "CARTAO_CREDITO":
      return "Cartão de crédito";
    default:
      return "Pagamento";
  }
}

function getPaymentIcon(metodo: TShopPaymentMethod) {
  switch (metodo) {
    case "DINHEIRO":
      return Banknote;
    case "PIX":
      return QrCode;
    default:
      return CreditCard;
  }
}

type SummaryTileProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail?: string;
  delay: number;
  reduced: boolean;
};

function SummaryTile({
  icon: Icon,
  label,
  value,
  detail,
  delay,
  reduced,
}: SummaryTileProps) {
  return (
    <motion.div
      {...fadeUp(delay, reduced)}
      className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card p-3.5"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
      <div className="min-w-0 pl-0.5">
        <p className="text-pretty text-sm font-bold leading-snug">{value}</p>
        {detail ? (
          <p className="text-pretty mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}

export default function OrderReviewStep({
  onSubmit,
  isSubmitting,
}: OrderReviewStepProps) {
  const prefersReducedMotion = useReducedMotion();
  const reduced = prefersReducedMotion ?? false;

  const { catalog, availability, orderState } = useShop();
  const { customer, delivery, cashback, cart, payment, coupon, reward } =
    orderState.state;
  const config = catalog.shopSettings.configuracoes;
  const shopIsOpen = availability.status === "ABERTA";

  const cartLines = useMemo(
    () => buildShopCartLines(cart.items, catalog.products),
    [cart.items, catalog.products],
  );

  const subtotal = cartLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const couponDiscount = coupon.resgate?.valorDesconto ?? 0;
  const cashbackDiscount = cashback.resgateSolicitado;
  const discount = couponDiscount + cashbackDiscount;
  const deliveryFee = resolveShopDeliveryFee({
    configuracoes: config,
    modalidade: delivery.modalidade,
    subtotalItens: subtotal,
  });
  const total = Math.max(0, subtotal - discount) + deliveryFee;
  const itemCount = cartLines.reduce((sum, line) => sum + line.quantidade, 0);

  const addressParts = delivery.endereco
    ? [
        delivery.endereco.localizacaoLogradouro,
        delivery.endereco.localizacaoNumero,
        delivery.endereco.localizacaoComplemento,
        delivery.endereco.localizacaoBairro,
        delivery.endereco.localizacaoCidade,
        delivery.endereco.localizacaoEstado,
      ].filter(Boolean)
    : [];

  const previsaoDetail =
    delivery.modalidade === "ENTREGA"
      ? `Preparo em até ${config.operacao.preparoMinutos} min · entrega em até ${config.atendimento.entrega.prazoMinutos} min`
      : `Preparo em até ${config.operacao.preparoMinutos} min`;

  const deliveryLabel =
    delivery.modalidade === "RETIRADA" ? "Retirada no local" : "Entrega";
  const deliveryDetail =
    delivery.modalidade === "ENTREGA" && addressParts.length > 0
      ? addressParts.join(", ")
      : delivery.modalidade === "RETIRADA"
        ? "Você retira quando estiver pronto"
        : undefined;

  const paymentDetail = [
    `Pagamento na ${delivery.modalidade === "RETIRADA" ? "retirada" : "entrega"}`,
    payment.precisaTroco && payment.trocoPara
      ? `troco para ${formatToMoney(payment.trocoPara)}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  const PaymentIcon = getPaymentIcon(payment.metodo);
  const DeliveryIcon = delivery.modalidade === "RETIRADA" ? Package : Truck;

  return (
    <div className="flex flex-col gap-5 pb-1">
      <motion.div
        {...fadeUp(0, reduced)}
        className="relative overflow-hidden rounded-2xl border border-brand/20 bg-brand/5 px-4 py-4"
      >
        <div className="relative flex items-start gap-3">
          <motion.span
            initial={reduced ? false : { scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              delay: 0.12,
              type: "spring",
              stiffness: 420,
              damping: 22,
            }}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground"
          >
            <Sparkles className="size-5" />
          </motion.span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-pretty text-sm font-black uppercase tracking-wide text-brand">
              Quase lá
            </p>
            <p className="text-pretty mt-1 text-sm leading-relaxed text-muted-foreground">
              Revise os detalhes abaixo e confirme quando estiver tudo certo.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-background/80 px-2.5 py-1 text-xs font-bold tabular-nums text-foreground ring-1 ring-border">
            {itemCount} {itemCount === 1 ? "item" : "itens"}
          </span>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-2.5">
        <SummaryTile
          icon={User}
          label="Cliente"
          value={customer.nome || "Cliente"}
          detail={[
            formatToPhone(customer.telefone),
            delivery.modalidade === "ENTREGA"
              ? "Documento fiscal informado"
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          delay={0.05}
          reduced={reduced}
        />
        <SummaryTile
          icon={Clock3}
          label="Previsão"
          value={
            delivery.modalidade === "ENTREGA"
              ? "Entrega estimada"
              : "Retirada estimada"
          }
          detail={previsaoDetail}
          delay={0.1}
          reduced={reduced}
        />
        <SummaryTile
          icon={DeliveryIcon}
          label={delivery.modalidade === "RETIRADA" ? "Retirada" : "Entrega"}
          value={deliveryLabel}
          detail={deliveryDetail}
          delay={0.15}
          reduced={reduced}
        />
        <SummaryTile
          icon={PaymentIcon}
          label="Pagamento"
          value={getPaymentLabel(payment.metodo)}
          detail={paymentDetail}
          delay={0.2}
          reduced={reduced}
        />
      </div>

      <AnimatePresence>
        {config.operacao.mensagemCheckout ? (
          <motion.div
            key="checkout-message"
            {...fadeUp(0.22, reduced)}
            className="flex items-start gap-3 rounded-2xl border border-brand-secondary/30 bg-brand-secondary/10 p-3.5"
          >
            <Info className="mt-0.5 size-4 shrink-0 text-brand-secondary" />
            <p className="text-pretty text-sm font-medium leading-relaxed">
              {config.operacao.mensagemCheckout}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div {...fadeUp(0.26, reduced)} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-black uppercase tracking-wide">
            Itens do pedido
          </h3>
          <span className="text-xs font-semibold text-muted-foreground">
            {formatToMoney(subtotal)}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {cartLines.map((item, index) => {
            return (
              <motion.div
                key={item.tempId || index}
                {...fadeUp(0.3 + index * 0.05, reduced)}
                className="flex gap-3 rounded-2xl border bg-card p-3"
              >
                {item.imageUrl ? (
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                    <Image
                      src={item.imageUrl}
                      alt={item.displayName}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  </div>
                ) : (
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <span className="text-lg font-black text-muted-foreground/50">
                      {item.displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}

                <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-pretty text-sm font-semibold leading-snug">
                      <span className="font-black text-primary">
                        {item.quantidade}x
                      </span>{" "}
                      {item.displayName}
                    </p>
                    {item.modifiersDetails.length > 0 ? (
                      <p className="text-pretty mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {item.modifiersDetails
                          .map((m) =>
                            m.quantidade > 1
                              ? `${m.quantidade}x ${m.nome}`
                              : m.nome,
                          )
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {formatToMoney(item.lineTotal)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {reward.resgates.map((line, index) => (
        <motion.div
          key={line.recompensaId}
          {...fadeUp(0.36 + index * 0.02, reduced)}
          className="flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-3.5"
        >
          {line.imagemCapaUrl ? (
            <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
              <Image
                src={line.imagemCapaUrl}
                alt={line.titulo}
                fill
                className="object-cover"
                sizes="56px"
              />
            </div>
          ) : (
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand/10">
              <Gift className="size-5 text-brand" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-brand">
              Recompensa resgatada
            </p>
            <p className="text-sm font-bold">
              {line.titulo}
              {line.quantidade > 1 ? ` ×${line.quantidade}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCashbackValue(
                line.valor * line.quantidade,
                catalog.cashbackProgram?.terminologia ?? "DINHEIRO",
              )}{" "}
              · {formatToMoney(line.valorVenda * line.quantidade)} grátis
            </p>
          </div>
        </motion.div>
      ))}

      <motion.div
        {...fadeUp(0.38, reduced)}
        className="rounded-2xl border border-primary/15 bg-primary/5 p-4"
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatToMoney(subtotal)}
            </span>
          </div>

          {discount > 0 ? (
            <div className="flex flex-col gap-2">
              {coupon.resgate ? (
                <div className="flex items-center justify-between gap-3 text-primary">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
                    <Ticket className="size-3.5 shrink-0" />
                    <span className="truncate">
                      Cupom {coupon.resgate.codigo ?? ""}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    -{formatToMoney(couponDiscount)}
                  </span>
                </div>
              ) : null}
              {cashbackDiscount > 0 ? (
                <div className="flex items-center justify-between gap-3 text-primary">
                  <span className="text-sm">Cashback</span>
                  <span className="text-sm font-semibold tabular-nums">
                    -{formatCashbackValue(cashbackDiscount)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {delivery.modalidade === "ENTREGA" ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                Taxa de entrega
              </span>
              <span
                className={`text-sm font-semibold tabular-nums ${deliveryFee === 0 ? "text-primary" : ""}`}
              >
                {deliveryFee === 0 ? "Grátis" : formatToMoney(deliveryFee)}
              </span>
            </div>
          ) : null}

          <div className="flex items-end justify-between gap-3 border-t border-primary/15 pt-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Total a pagar
              </p>
              <p className="text-pretty mt-0.5 text-[11px] text-muted-foreground">
                {delivery.modalidade === "RETIRADA"
                  ? "Na retirada"
                  : "Na entrega"}
              </p>
            </div>
            <span className="text-2xl font-black tabular-nums text-primary">
              {formatToMoney(total)}
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div
        {...fadeUp(0.44, reduced)}
        className="sticky bottom-0 z-10 -mx-4 mt-auto border-t bg-background px-4 py-3 lg:-mx-6 lg:px-6"
      >
        <Button
          variant="brand"
          className="group flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-base font-black"
          onClick={onSubmit}
          disabled={isSubmitting || !shopIsOpen}
        >
          ENVIAR PEDIDO
          <Send className="size-4 transition-transform group-hover:translate-x-0.5 group-active:translate-x-1" />
        </Button>
      </motion.div>
    </div>
  );
}
