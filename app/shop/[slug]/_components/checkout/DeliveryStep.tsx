"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useShopClientLookup } from "@/lib/queries/shop";
import { cn } from "@/lib/utils";
import { isValidCpfCnpj } from "@/lib/validation";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  Package,
  ReceiptText,
  Truck,
} from "lucide-react";
import { useEffect } from "react";
import { useShop } from "../ShopProvider";
import { TUseShopOrderState } from "@/state-hooks/use-shop-order-state";
import TextInput from "@/components/Inputs/TextInput";
import {
  formatToCEP,
  formatToCPForCNPJ,
  formatToMoney,
} from "@/lib/formatting";
import SelectInput from "@/components/Inputs/SelectInput";
import {
  BrazilianCitiesOptionsFromUF,
  BrazilianStatesOptions,
} from "@/utils/states-cities";
import { toast } from "sonner";
import { getCEPInfo } from "@/lib/utils";
import { getShopCartSubtotal } from "@/lib/shop/cart";
import { resolveShopDeliveryFee } from "@/lib/shop/config";
import { HAPTICS, triggerHaptic } from "@/lib/shop/haptics";

type DeliveryStepProps = {
  onNext: () => void;
};

export default function DeliveryStep({ onNext }: DeliveryStepProps) {
  const { orgId, catalog, orderState } = useShop();
  const { customer, delivery } = orderState.state;
  const config = catalog.shopSettings.configuracoes;
  const service = config.atendimento;
  const subtotal = getShopCartSubtotal(
    orderState.state.cart.items,
    catalog.products,
    orderState.state.coupon.resgate?.brinde,
  );

  const onlyPickup = service.retirada.ativo && !service.entrega.ativo;
  const onlyDelivery = !service.retirada.ativo && service.entrega.ativo;

  useEffect(() => {
    if (onlyPickup) {
      orderState.updateDelivery({ modalidade: "RETIRADA", endereco: null });
    } else if (onlyDelivery) {
      orderState.updateDelivery({ modalidade: "ENTREGA" });
    }
  }, [onlyPickup, onlyDelivery]);

  const handleModeSelect = (mode: "RETIRADA" | "ENTREGA") => {
    if (mode === "RETIRADA") {
      orderState.updateDelivery({ modalidade: mode, endereco: null });
      orderState.updateCustomer({ cpfCnpj: null });
    } else {
      orderState.updateDelivery({
        modalidade: mode,
        endereco: delivery.endereco || {
          titulo: null,
          localizacaoCep: null,
          localizacaoEstado: null,
          localizacaoCidade: null,
          localizacaoBairro: null,
          localizacaoLogradouro: null,
          localizacaoNumero: null,
          localizacaoComplemento: null,
        },
      });
    }
  };

  const isDelivery = delivery.modalidade === "ENTREGA";
  const { data: clientLookup, isLoading: isLookingUpClient } =
    useShopClientLookup({ orgId, telefone: customer.telefone });
  const hasStoredFiscalDocument =
    clientLookup?.client?.possuiCpfCnpjValido ?? false;
  const fiscalDocumentValue = customer.cpfCnpj ?? "";
  const hasValidEnteredFiscalDocument = isValidCpfCnpj(fiscalDocumentValue);
  const isWaitingForStoredFiscalDocument =
    isDelivery && !!customer.id && !clientLookup && isLookingUpClient;
  const fiscalDocumentIsReady =
    !isDelivery || hasStoredFiscalDocument || hasValidEnteredFiscalDocument;
  const showFiscalDocumentError =
    fiscalDocumentValue.trim().length > 0 && !hasValidEnteredFiscalDocument;
  const deliveryMinimumReached =
    !isDelivery || subtotal >= service.entrega.pedidoMinimo;
  // Calculada sempre como ENTREGA: o cartão precisa mostrar a taxa antes de o cliente escolher a modalidade.
  const deliveryFee = resolveShopDeliveryFee({
    configuracoes: config,
    modalidade: "ENTREGA",
    subtotalItens: subtotal,
  });
  const missingForFreeDelivery =
    service.entrega.taxa > 0 &&
    service.entrega.gratisAcima !== null &&
    subtotal < service.entrega.gratisAcima
      ? service.entrega.gratisAcima - subtotal
      : 0;

  const canProceed =
    delivery.modalidade === "RETIRADA" ||
    (delivery.modalidade === "ENTREGA" &&
      delivery.endereco?.localizacaoLogradouro &&
      delivery.endereco?.localizacaoNumero &&
      delivery.endereco?.localizacaoCidade &&
      deliveryMinimumReached &&
      fiscalDocumentIsReady &&
      !isWaitingForStoredFiscalDocument);

  const orgLocation = [
    catalog.organization.localizacaoLogradouro,
    catalog.organization.localizacaoNumero,
    catalog.organization.localizacaoBairro,
    catalog.organization.localizacaoCidade,
    catalog.organization.localizacaoEstado,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-6">
      {service.retirada.ativo && service.entrega.ativo && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleModeSelect("RETIRADA")}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors",
              delivery.modalidade === "RETIRADA"
                ? "border-brand bg-brand/5"
                : "border-border hover:border-brand/50",
            )}
          >
            <Package
              className={cn(
                "w-6 h-6",
                delivery.modalidade === "RETIRADA"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            />
            <span className="font-semibold">Retirada</span>
          </button>

          <button
            type="button"
            onClick={() => handleModeSelect("ENTREGA")}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors",
              delivery.modalidade === "ENTREGA"
                ? "border-brand bg-brand/5"
                : "border-border hover:border-brand/50",
            )}
          >
            <Truck
              className={cn(
                "w-6 h-6",
                delivery.modalidade === "ENTREGA"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            />
            <span className="font-semibold">Entrega</span>
            <span className="text-xs text-muted-foreground">
              Até {service.entrega.prazoMinutos} min
            </span>
            {service.entrega.taxa > 0 ? (
              <span
                className={cn(
                  "text-xs",
                  deliveryFee === 0
                    ? "font-semibold text-brand"
                    : "text-muted-foreground",
                )}
              >
                {deliveryFee === 0
                  ? "Entrega grátis"
                  : `Taxa ${formatToMoney(deliveryFee)}`}
              </span>
            ) : null}
          </button>
        </div>
      )}

      {delivery.modalidade === "RETIRADA" && orgLocation && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50 border">
          <MapPin className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Endereço para retirada</p>
            <p className="text-sm text-muted-foreground mt-1">{orgLocation}</p>
          </div>
        </div>
      )}

      {isDelivery ? (
        <div className="flex flex-col gap-4 rounded-xl border bg-muted/40 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ReceiptText className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Dados para a nota fiscal</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                Para pedidos com entrega, precisamos identificar o destinatário
                na nota fiscal.
              </p>
            </div>
          </div>

          {isWaitingForStoredFiscalDocument ? (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" />
              Verificando documento cadastrado...
            </div>
          ) : hasStoredFiscalDocument ? (
            <div className="flex items-center gap-2 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" />
              Documento fiscal já cadastrado
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="shop-delivery-cpf-cnpj"
                className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
              >
                CPF ou CNPJ <span className="text-destructive">*</span>
              </Label>
              <Input
                id="shop-delivery-cpf-cnpj"
                value={fiscalDocumentValue}
                onChange={(event) =>
                  orderState.updateCustomer({
                    cpfCnpj: formatToCPForCNPJ(event.target.value) || null,
                  })
                }
                placeholder="000.000.000-00"
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={showFiscalDocumentError}
                aria-describedby={
                  showFiscalDocumentError
                    ? "shop-delivery-cpf-cnpj-error"
                    : "shop-delivery-cpf-cnpj-help"
                }
                className="h-12 text-base"
              />
              {showFiscalDocumentError ? (
                <p
                  id="shop-delivery-cpf-cnpj-error"
                  className="text-sm font-medium text-destructive"
                >
                  Informe um CPF ou CNPJ válido.
                </p>
              ) : (
                <p
                  id="shop-delivery-cpf-cnpj-help"
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  O documento será usado somente para identificar o destinatário
                  desta entrega.
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}

      {isDelivery ? (
        <DeliveryAddressForm
          deliveryAddress={delivery.endereco}
          updateDelivery={orderState.updateDelivery}
        />
      ) : null}
      {isDelivery && !deliveryMinimumReached ? (
        <p className="text-sm font-medium text-destructive">
          O pedido mínimo para entrega é{" "}
          {formatToMoney(service.entrega.pedidoMinimo)}.
        </p>
      ) : null}
      {isDelivery && missingForFreeDelivery > 0 ? (
        <p className="text-sm text-muted-foreground">
          Faltam{" "}
          <span className="font-semibold text-brand">
            {formatToMoney(missingForFreeDelivery)}
          </span>{" "}
          para ganhar entrega grátis.
        </p>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t bg-background px-4 py-3 lg:-mx-6 lg:px-6">
        <Button
          variant="brand"
          className={cn(
            "flex items-center gap-1.5 w-full h-12 rounded-xl font-bold",
            !canProceed && "opacity-50",
          )}
          onClick={onNext}
          disabled={!canProceed}
        >
          CONTINUAR
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

type DeliveryAddressFormProps = {
  deliveryAddress: TUseShopOrderState["state"]["delivery"]["endereco"];
  updateDelivery: TUseShopOrderState["updateDelivery"];
};
function DeliveryAddressForm({
  deliveryAddress,
  updateDelivery,
}: DeliveryAddressFormProps) {
  async function setAddressDataByCEP(cep: string) {
    const toastID = toast.loading("Buscando endereço pelo CEP...");
    try {
      const addressInfo = await getCEPInfo(cep);
      if (!addressInfo) {
        triggerHaptic(HAPTICS.warning);
        toast.error("CEP não encontrado. Preencha o endereço manualmente.", {
          id: toastID,
        });
        return;
      }
      triggerHaptic(HAPTICS.tap);
      toast.success("Endereço preenchido a partir do CEP.", {
        id: toastID,
        duration: 2000,
      });
      updateDelivery({
        endereco: {
          ...deliveryAddress,
          localizacaoLogradouro: addressInfo.logradouro,
          localizacaoBairro: addressInfo.bairro,
          localizacaoEstado: addressInfo.uf,
          localizacaoCidade: addressInfo.localidade.toUpperCase(),
          localizacaoCep: cep,
        },
      });
    } catch {
      triggerHaptic(HAPTICS.warning);
      toast.error(
        "Não foi possível buscar o CEP. Preencha o endereço manualmente.",
        { id: toastID },
      );
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl bg-muted/50 border">
      <p className="text-sm font-semibold">Endereço de entrega</p>
      <div className="w-full flex flex-col gap-3">
        <div className="w-full flex items-center flex-col lg:flex-row gap-3">
          <div className="w-full lg:w-1/3">
            <TextInput
              label="CEP"
              placeholder="00000-000"
              inputMode="numeric"
              autoComplete="postal-code"
              value={deliveryAddress?.localizacaoCep || ""}
              handleChange={(value) => {
                if (value.length === 9) {
                  setAddressDataByCEP(value);
                }
                updateDelivery({
                  endereco: {
                    ...deliveryAddress,
                    localizacaoCep: formatToCEP(value),
                  },
                });
              }}
            />
          </div>
          <div className="w-full lg:w-1/3">
            <SelectInput
              label="Estado"
              value={deliveryAddress?.localizacaoEstado || null}
              handleChange={(value) =>
                updateDelivery({
                  endereco: { ...deliveryAddress, localizacaoEstado: value },
                })
              }
              options={BrazilianStatesOptions}
              resetOptionLabel="Selecione um estado"
              onReset={() =>
                updateDelivery({
                  endereco: { ...deliveryAddress, localizacaoEstado: null },
                })
              }
            />
          </div>
          <div className="w-full lg:w-1/3">
            <SelectInput
              label="Cidade"
              value={deliveryAddress?.localizacaoCidade || null}
              handleChange={(value) =>
                updateDelivery({
                  endereco: { ...deliveryAddress, localizacaoCidade: value },
                })
              }
              options={BrazilianCitiesOptionsFromUF(
                deliveryAddress?.localizacaoEstado ?? null,
              )}
              resetOptionLabel="Selecione uma cidade"
              onReset={() =>
                updateDelivery({
                  endereco: { ...deliveryAddress, localizacaoCidade: null },
                })
              }
            />
          </div>
        </div>
        <div className="w-full flex items-center flex-col lg:flex-row gap-3">
          <div className="w-full lg:w-1/3">
            <TextInput
              label="Bairro"
              placeholder="Ex.: Centro"
              autoComplete="address-level3"
              value={deliveryAddress?.localizacaoBairro || ""}
              handleChange={(value) =>
                updateDelivery({
                  endereco: { ...deliveryAddress, localizacaoBairro: value },
                })
              }
            />
          </div>
          <div className="w-full lg:w-1/3">
            <TextInput
              label="Rua"
              placeholder="Ex.: Rua das Flores"
              autoComplete="address-line1"
              value={deliveryAddress?.localizacaoLogradouro || ""}
              handleChange={(value) =>
                updateDelivery({
                  endereco: {
                    ...deliveryAddress,
                    localizacaoLogradouro: value,
                  },
                })
              }
            />
          </div>
          <div className="w-full lg:w-1/3">
            <TextInput
              label="Número"
              placeholder="Ex.: 123"
              value={deliveryAddress?.localizacaoNumero || ""}
              handleChange={(value) =>
                updateDelivery({
                  endereco: { ...deliveryAddress, localizacaoNumero: value },
                })
              }
            />
          </div>
        </div>
        <TextInput
          label="Complemento"
          placeholder="Apto, bloco, ponto de referência..."
          autoComplete="address-line2"
          value={deliveryAddress?.localizacaoComplemento || ""}
          handleChange={(value) =>
            updateDelivery({
              endereco: { ...deliveryAddress, localizacaoComplemento: value },
            })
          }
        />
      </div>
    </div>
  );
}
