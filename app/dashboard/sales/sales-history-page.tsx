"use client";

import type { TAuthUserSession } from "@/lib/authentication/types";
import { SalesHistoryView, SalesModuleActions } from "./sales-page";

type SalesHistoryPageProps = {
	organization: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	canEditSales: boolean;
	canEmitFiscal: boolean;
	canConfigureFiscal: boolean;
	exceptionalPresenceEnabled: boolean;
	resaleCreditEnabled: boolean;
};

export default function SalesHistoryPage({
	organization,
	canEditSales,
	canEmitFiscal,
	canConfigureFiscal,
	exceptionalPresenceEnabled,
	resaleCreditEnabled,
}: SalesHistoryPageProps) {
	return (
		<div className="flex h-full w-full flex-col gap-3">
			<div className="flex items-center justify-end">
				<SalesModuleActions orgHasERPAccess={organization.configuracao.recursos.erp.acesso} />
			</div>
			<SalesHistoryView
				canEditSales={canEditSales}
				canEmitFiscal={canEmitFiscal}
				canConfigureFiscal={canConfigureFiscal}
				exceptionalPresenceEnabled={exceptionalPresenceEnabled}
				resaleCreditEnabled={resaleCreditEnabled}
				orgHasERPAccess={organization.configuracao.recursos.erp.acesso}
			/>
		</div>
	);
}
