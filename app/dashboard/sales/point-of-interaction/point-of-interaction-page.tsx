"use client";
import { NewTransaction } from "@/components/Modals/TransactionRequests/NewTransaction";
import { PointOfInteractionLinksAndHelpers } from "@/components/PointOfInteraction/LinksAndHelpers";
import { PointOfInteractionTransactionRequestsQueue } from "@/components/PointOfInteraction/TransactionRequestsQueue";
import { Button } from "@/components/ui/button";
import { TAuthUserSession } from "@/lib/authentication/types";
import { ShoppingCart } from "lucide-react";
import { useState } from "react";

type PointOfInteractionPageProps = {
	user: TAuthUserSession["user"];
	organization: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	usuarioVendedorId: NonNullable<TAuthUserSession["membership"]>["usuarioVendedorId"];
};
export default function PointOfInteractionPage({ user, organization, usuarioVendedorId }: PointOfInteractionPageProps) {
	const [newTransactionModalOpen, setNewTransactionModalOpen] = useState(false);
	// "Quem fez a venda?" só existe quando o POI registra venda.
	const poiSalesConfig = organization.poiConfiguracao?.vendas;
	const poiColetaVendedor = poiSalesConfig?.registroAtivo === true && poiSalesConfig.coletaVendedor === true;
	return (
		<div className="w-full flex flex-col gap-3 md:flex-1 md:min-h-0">
			<div className="w-full flex justify-end">
				<Button onClick={() => setNewTransactionModalOpen(true)} className="flex items-center gap-1.5">
					<ShoppingCart className="h-4 min-h-4 w-4 min-w-4" />
					<span>NOVA TRANSAÇÃO</span>
				</Button>
			</div>
			<div className="w-full flex gap-3 flex-col-reverse md:flex-row md:flex-1 md:min-h-0 md:items-stretch">
				<div className="w-full md:w-1/2 md:h-full">
					<PointOfInteractionLinksAndHelpers organization={organization} />
				</div>
				<div className="w-full md:w-1/2 md:h-full">
					<PointOfInteractionTransactionRequestsQueue
						orgId={organization.id}
						usuarioVendedorId={usuarioVendedorId}
						poiConfirmacaoValorObrigatoria={organization.poiConfirmacaoValorObrigatoria}
						poiColetaVendedor={poiColetaVendedor}
					/>
				</div>
			</div>
			{newTransactionModalOpen ? (
				<NewTransaction
					sessionOrgId={organization.id}
					sessionUser={user}
					poiConfirmacaoValorObrigatoria={organization.poiConfirmacaoValorObrigatoria}
					poiColetaVendedor={poiColetaVendedor}
					closeMenu={() => setNewTransactionModalOpen(false)}
				/>
			) : null}
		</div>
	);
}
