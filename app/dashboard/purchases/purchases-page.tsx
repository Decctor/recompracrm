"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { ShoppingCart, Truck } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import InboundDocumentsTab from "./components/InboundDocumentsTab";
import PurchasesListTab from "./components/PurchasesListTab";

type PurchasesPageProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

const TABS = ["compras", "notas"] as const;
type TPurchasesTab = (typeof TABS)[number];
const tabParser = parseAsStringEnum<TPurchasesTab>([...TABS]).withDefault("compras");

export default function PurchasesPage({ membership }: PurchasesPageProps) {
	const permissions = membership.permissoes;
	const canCreatePurchase = permissions.compras.criar;
	// Notas recebidas vêm do módulo fiscal: sem permissão de vê-las, a aba não existe.
	const canSeeInbound = permissions.fiscal.visualizar;
	const [tabParam, setTab] = useQueryState("tab", tabParser.withOptions({ shallow: true }));
	const tab: TPurchasesTab = canSeeInbound ? tabParam : "compras";

	return (
		<Tabs value={tab} onValueChange={(value) => void setTab(value as TPurchasesTab)} className="flex w-full flex-col gap-3 tabular-nums">
			{canSeeInbound ? (
				<TabsList variant="page">
					<TabsTrigger value="compras">
						<ShoppingCart className="h-4 w-4 min-h-4 min-w-4" />
						COMPRAS
					</TabsTrigger>
					<TabsTrigger value="notas">
						<Truck className="h-4 w-4 min-h-4 min-w-4" />
						NOTAS RECEBIDAS
					</TabsTrigger>
				</TabsList>
			) : null}
			<TabsContent value="compras" className="w-full">
				<PurchasesListTab canCreate={canCreatePurchase} />
			</TabsContent>
			{canSeeInbound ? (
				<TabsContent value="notas" className="w-full">
					<InboundDocumentsTab canCreatePurchase={canCreatePurchase} canManifest={permissions.fiscal.emitir} />
				</TabsContent>
			) : null}
		</Tabs>
	);
}
