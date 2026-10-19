"use client";

import SelectInput from "@/components/Inputs/SelectInput";
import type { TAutoEmissionExceptions } from "@/lib/fiscal/auto-emission-policy";
import { resolveAutoEmissionException } from "@/lib/fiscal/auto-emission-policy";
import { useFiscalPreview } from "@/lib/queries/fiscal-preview";
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

// `loading` não é opcional aqui: sem ele o next/dynamic não cria Suspense próprio e, com o chunk
// ainda não baixado, a suspensão sobe até o loading.tsx da rota — a tela inteira vira loading.
const ClientVinculationMenu = dynamic(() => import("@/components/Clients/ClientVinculationMenu"), { loading: () => null });
const ControlClient = dynamic(() => import("@/components/Modals/Clients/ControlClient"), { loading: () => null });
const NewClientLocation = dynamic(
	() => import("@/components/Modals/Clients/Locations/NewClientLocation").then((module) => module.NewClientLocation),
	{ loading: () => null },
);

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
	fiscalSaleId?: string;
	fiscalChannel?: string | null;
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
	// Card do caixa (sessão de venda) logo abaixo do cabeçalho: o operador vê em que caixa a venda
	// vai cair na mesma superfície em que fecha a venda, no desktop e no Sheet do mobile.
	cashSession?: React.ReactNode;
	// Coluna em foco no desktop (expandida para 640px): o total do dock escala junto com o espaço.
	expanded?: boolean;
};

export default function CheckoutPanel({
	fiscalSaleId,
	fiscalChannel,
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
	cashSession,
	expanded,
}: CheckoutPanelProps) {
	const [isVinculationMenuOpen, setIsVinculationMenuOpen] = useState(false);
	const [isNewLocationOpen, setIsNewLocationOpen] = useState(false);
	const [isFiscalClientEditOpen, setIsFiscalClientEditOpen] = useState(false);
	const exception = resolveAutoEmissionException({
		metodos: saleState.state.pagamentos.filter((payment) => payment.valor > 0).map((payment) => payment.metodo),
		excecoes: autoEmissionExceptions,
	});
	const fiscalEnabled = saleState.state.emissaoFiscalAutomatica ?? (organizationAutoFiscalEmission && !exception);
	// Keep the switch available if an existing fiscal setup becomes incomplete or expires.
	const fiscalControlsVisible =
		organizationAutoFiscalCapable ||
		organizationAutoFiscalEmission ||
		saleState.state.emissaoFiscalAutomatica === true ||
		saleState.state.emissaoFiscalDocumento !== null;
	const fiscalPreview = useFiscalPreview(
		{
			saleId: fiscalSaleId,
			canal: fiscalChannel,
			clienteId: saleState.state.cliente?.id,
			entregaModalidade: saleState.state.entregaModalidade,
			entregaLocalizacaoId: saleState.state.entregaModalidade === "ENTREGA" ? saleState.state.entregaLocalizacaoId : null,
			emissaoFiscalDocumento: saleState.state.emissaoFiscalDocumento,
		},
		fiscalControlsVisible && fiscalEnabled,
	);
	const fiscalBlockedReason =
		fiscalEnabled && fiscalControlsVisible
			? fiscalPreview.isPending || fiscalPreview.isFetching
				? "Verificando o modelo da nota fiscal."
				: fiscalPreview.isError
					? "Não foi possível verificar a emissão fiscal. Tente novamente."
					: !fiscalPreview.data?.disponivel
						? (fiscalPreview.data?.problemas[0] ?? "Revise a configuração fiscal.")
						: null
			: null;
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

				{cashSession}

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
				<PaymentsSection saleState={saleState} pagamentosEfetivados={edit?.pagamentosEfetivados} allowTerminal={!edit} />
				<SummarySection
					saleState={saleState}
					organizationCashbackProgram={organizationCashbackProgram}
					discountAuthority={discountAuthority}
					editMode={!!edit}
				/>
				<FiscalEmissionSection
					preview={fiscalPreview}
					onResolveClient={() => (saleState.state.cliente ? setIsFiscalClientEditOpen(true) : setIsVinculationMenuOpen(true))}
					saleState={saleState}
					organizationAutoFiscalEmission={organizationAutoFiscalEmission}
					organizationAutoFiscalCapable={fiscalControlsVisible}
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
					finalizeBlockedReason={finalizeBlockedReason ?? fiscalBlockedReason}
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
			{isFiscalClientEditOpen && saleState.state.cliente ? (
				<ControlClient
					clientId={saleState.state.cliente.id}
					closeModal={() => setIsFiscalClientEditOpen(false)}
					callbacks={{
						onSuccess: () => {
							void fiscalPreview.refetch();
							void refetchClientLocations();
						},
					}}
				/>
			) : null}

			{isNewLocationOpen && saleState.state.cliente ? (
				<NewClientLocation
					clienteId={saleState.state.cliente.id}
					closeModal={() => setIsNewLocationOpen(false)}
					callbacks={{
						// O endereço recém-cadastrado é o da entrega, mesmo com outro já selecionado. O refetch
						// vem antes para a opção já existir no select quando o valor mudar.
						onSuccess: async (location) => {
							await refetchClientLocations();
							saleState.setEntregaLocalizacaoId(location.id);
						},
					}}
				/>
			) : null}
		</>
	);
}
