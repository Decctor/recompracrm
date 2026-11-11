"use client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { appRoutes } from "@/lib/navigation/routes";
import { Plus, ShoppingCart, Truck } from "lucide-react";
import Link from "next/link";
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
		<Tabs value={tab} onValueChange={(value) => void setTab(value as TPurchasesTab)} className="flex w-full flex-col gap-4 tabular-nums">
			<div className="flex flex-wrap items-center justify-between gap-3">
				{canSeeInbound ? (
					<TabsList className="h-11 rounded-[18px] bg-muted p-1">
						<TabsTrigger value="compras" className="h-9 gap-2 rounded-[14px] px-3.5 text-sm font-semibold">
							<ShoppingCart className="h-4 w-4 min-h-4 min-w-4" />
							Compras
						</TabsTrigger>
						<TabsTrigger value="notas" className="h-9 gap-2 rounded-[14px] px-3.5 text-sm font-semibold">
							<Truck className="h-4 w-4 min-h-4 min-w-4" />
							Notas recebidas
						</TabsTrigger>
					</TabsList>
				) : (
					<span />
				)}
				{canCreatePurchase ? (
					<Button asChild className="h-10 rounded-2xl px-[18px] font-bold shadow-sm">
						<Link href={appRoutes.newPurchase()}>
							<Plus className="h-4 w-4 min-h-4 min-w-4" />
							Nova compra
						</Link>
					</Button>
				) : null}
			</div>
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
