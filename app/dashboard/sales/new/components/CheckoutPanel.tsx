"use client";

import SelectInput from "@/components/Inputs/SelectInput";
import type { TAutoEmissionExceptions } from "@/lib/fiscal/auto-emission-policy";
import type { TDiscountAuthority } from "@/lib/permissions/discounts";
import { useClientLocations } from "@/lib/queries/clients/locations";
import type { ClassifiedPayment } from "@/lib/sales/utils";
import { useSellersSimplified } from "@/lib/queries/sellers";
import type { TCashbackProgramEntity } from "@/services/drizzle/schema";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import { PencilLine, ShoppingCart } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import ClientSection from "./checkout/ClientSection";
import DeliverySection from "./checkout/DeliverySection";
import DraftActionSection from "./checkout/DraftActionSection";
import FiscalEmissionSection from "./checkout/FiscalEmissionSection";
import ItemsSection from "./checkout/ItemsSection";
import PaymentsSection from "./checkout/PaymentsSection";
import SummarySection from "./checkout/SummarySection";
import TotalDock from "./checkout/TotalDock";

const ClientVinculationMenu = dynamic(() => import("@/components/Clients/ClientVinculationMenu"));
const NewClientLocation = dynamic(() => import("@/components/Modals/Clients/Locations/NewClientLocation").then((module) => module.NewClientLocation));

function preloadClientVinculationMenu() {
	void import("@/components/Clients/ClientVinculationMenu");
}

function preloadNewClientLocation() {
	void import("@/components/Modals/Clients/Locations/NewClientLocation");
}

// Modo edição de venda confirmada: mesma superfície do checkout, com o que é imutável travado
// (cliente, cupom, resgate de cashback, pagamentos recebidos) e o CTA trocado para salvar.
export type CheckoutPanelEditContext = {
	idExterno: string;
	pagamentosEfetivados: Pick<ClassifiedPayment, "id" | "metodo" | "valor" | "parcela" | "totalParcelas">[];
};

type CheckoutPanelProps = {
	organizationCashbackProgram: TCashbackProgramEntity | null;
	saleState: TUseSaleState;
	organizationAutoFiscalEmission: boolean;
	organizationAutoFiscalCapable: boolean;
	autoEmissionExceptions: TAutoEmissionExceptions;
	canEmitFiscal: boolean;
	canConfigureFiscal?: boolean;
	discountAuthority?: TDiscountAuthority | null;
	onCreateDraft: () => void;
	onFinalizeSale: () => void;
	isCreatingDraft?: boolean;
	isFinalizingSale?: boolean;
	onOpenContext?: () => void;
	edit?: CheckoutPanelEditContext | null;
	// Bloqueios que não vêm do carrinho (caixa fechado, preços defasados no checkout de orçamento).
	finalizeBlockedReason?: string | null;
	hideDraftAction?: boolean;
	// Conteúdo acima das ações — hoje o aviso de preços defasados do checkout.
	beforeActions?: React.ReactNode;
	sellerEditable?: boolean;
	// Coluna em foco no desktop (expandida para 640px): o total do dock escala junto com o espaço.
	expanded?: boolean;
};

export default function CheckoutPanel({
	organizationCashbackProgram,
	saleState,
	organizationAutoFiscalEmission,
	organizationAutoFiscalCapable,
	autoEmissionExceptions,
	canEmitFiscal,
	canConfigureFiscal,
	discountAuthority,
	onCreateDraft,
	onFinalizeSale,
	isCreatingDraft,
	isFinalizingSale,
	onOpenContext,
	edit,
	finalizeBlockedReason,
	hideDraftAction,
	beforeActions,
	sellerEditable = true,
	expanded,
}: CheckoutPanelProps) {
	const [isVinculationMenuOpen, setIsVinculationMenuOpen] = useState(false);
	const [isNewLocationOpen, setIsNewLocationOpen] = useState(false);
	const { data: sellers } = useSellersSimplified();
	const { data: clientLocations = [], refetch: refetchClientLocations } = useClientLocations({ clienteId: saleState.state.cliente?.id ?? null });

	const sellerOptions = useMemo(
		() =>
			sellers?.map((seller) => ({
				id: seller.id,
				value: seller.id,
				label: seller.nome,
			})) ?? [],
		[sellers],
	);

	const locationOptions = useMemo(
		() =>
			clientLocations.map((location) => ({
				id: location.id,
				value: location.id,
				label: `${location.titulo} - ${[location.localizacaoCidade, location.localizacaoEstado].filter(Boolean).join("/") || "Sem cidade/UF"}`,
			})),
		[clientLocations],
	);

	useEffect(() => {
		if (saleState.state.entregaModalidade !== "ENTREGA") return;
		const firstLocationId = clientLocations[0]?.id ?? null;
		saleState.ensureEntregaLocation(firstLocationId);
	}, [clientLocations, saleState.state.entregaModalidade, saleState.ensureEntregaLocation]);

	return (
		<>
			{/* min-h-full (e não h-full) + shrink-0: o dock do total é `sticky`, e seu bloco contêiner
			    precisa crescer com o conteúdo. Travado em 100% — por altura fixa no desktop ou por
			    flex-shrink dentro do Sheet do mobile — o contêiner para na altura do scrollport e o dock
			    deixa de grudar depois do primeiro scroll. */}
			<div className="flex min-h-full shrink-0 flex-col gap-3">
				<div className="flex items-center gap-2">
					<div className="p-2 bg-primary/10 rounded-lg">
						{edit ? <PencilLine className="w-5 h-5 text-foreground" /> : <ShoppingCart className="w-5 h-5 text-foreground" />}
					</div>
					<div>
						<h2 className="font-black text-lg">{edit ? `EDITANDO PEDIDO #${edit.idExterno}` : "CHECKOUT"}</h2>
						<p className="text-xs text-muted-foreground">
							{saleState.itemCount} {saleState.itemCount === 1 ? "ITEM" : "ITENS"}
						</p>
					</div>
				</div>

				<SelectInput
					label="VENDEDOR"
					editable={sellerEditable}
					value={saleState.state.vendedorId}
					options={sellerOptions}
					handleChange={(value) => {
						const seller = sellers?.find((item) => item.id === value);
						saleState.setVendedor(value, seller?.nome ?? null);
					}}
					onReset={() => saleState.setVendedor(null, null)}
					resetOptionLabel="SELECIONE UM VENDEDOR"
				/>

				<ClientSection
					saleState={saleState}
					organizationCashbackProgram={organizationCashbackProgram}
					onOpenVinculationMenu={() => setIsVinculationMenuOpen(true)}
					onPreloadVinculationMenu={preloadClientVinculationMenu}
					onOpenContext={onOpenContext}
					locked={!!edit}
				/>
				<ItemsSection saleState={saleState} />
				<DeliverySection
					saleState={saleState}
					locationOptions={locationOptions}
					onOpenNewLocation={() => setIsNewLocationOpen(true)}
					onPreloadNewLocation={preloadNewClientLocation}
				/>
				<PaymentsSection saleState={saleState} pagamentosEfetivados={edit?.pagamentosEfetivados} />
				<SummarySection
					saleState={saleState}
					organizationCashbackProgram={organizationCashbackProgram}
					discountAuthority={discountAuthority}
					editMode={!!edit}
				/>
				<FiscalEmissionSection
					saleState={saleState}
					organizationAutoFiscalEmission={organizationAutoFiscalEmission}
					organizationAutoFiscalCapable={organizationAutoFiscalCapable}
					autoEmissionExceptions={autoEmissionExceptions}
					canEmitFiscal={canEmitFiscal}
					canConfigureFiscal={canConfigureFiscal}
				/>
				{beforeActions}
				{edit || hideDraftAction ? null : (
					<DraftActionSection saleState={saleState} onCreateDraft={onCreateDraft} isCreatingDraft={isCreatingDraft} isFinalizingSale={isFinalizingSale} />
				)}
				<TotalDock
					saleState={saleState}
					onFinalizeSale={onFinalizeSale}
					isFinalizingSale={isFinalizingSale}
					isCreatingDraft={isCreatingDraft}
					editMode={!!edit}
					finalizeBlockedReason={finalizeBlockedReason}
					hideDraftAction={hideDraftAction}
					expanded={expanded}
				/>
			</div>

			{isVinculationMenuOpen ? (
				<ClientVinculationMenu
					authorSellerId={saleState.state.vendedorId}
					closeModal={() => setIsVinculationMenuOpen(false)}
					onSelectClient={(client) => {
						saleState.setModoCliente("VINCULADO");
						saleState.setCliente(client);
						setIsVinculationMenuOpen(false);
					}}
				/>
			) : null}

			{isNewLocationOpen && saleState.state.cliente ? (
				<NewClientLocation
					clienteId={saleState.state.cliente.id}
					closeModal={() => setIsNewLocationOpen(false)}
					callbacks={{
						onSuccess: async () => {
							const response = await refetchClientLocations();
							const firstLocationId = response.data?.[0]?.id ?? null;
							saleState.ensureEntregaLocation(firstLocationId);
						},
					}}
				/>
			) : null}
		</>
	);
}
