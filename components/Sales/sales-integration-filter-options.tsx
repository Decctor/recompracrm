import type { TSaleQueryFilterOptions } from "@/app/api/stats/sales-query-params/route";
import { getSalesIntegrationLabel, SALES_INTEGRATION_META } from "@/components/Sales/SalesIntegrationPill";
import type { InteractiveFilterOption } from "@/components/ui/interactive-filter";
import { INTERNAL_SALES_INTEGRATION_ID, INTERNAL_SALES_LABEL } from "@/lib/integrations/internal-sales";
import { Store } from "lucide-react";
import Image from "next/image";

/**
 * Opções do filtro de INTEGRAÇÕES: "Vendas internas" primeiro (vendas sem `integracaoId`),
 * depois as conexões da organização — logo do provedor como `startContent`, apelido como rótulo
 * e sufixo para conexões desativadas (que seguem selecionáveis por causa das vendas históricas).
 */
export function buildSalesIntegrationFilterOptions(
	integrations: TSaleQueryFilterOptions["integrations"] | undefined,
): InteractiveFilterOption<string>[] {
	return [
		{
			id: INTERNAL_SALES_INTEGRATION_ID,
			value: INTERNAL_SALES_INTEGRATION_ID,
			label: INTERNAL_SALES_LABEL,
			startContent: <Store className="h-4 w-4" />,
		},
		...(integrations ?? []).map((integration) => {
			const label = getSalesIntegrationLabel({ tipo: integration.tipo, apelido: integration.apelido });
			const logo = SALES_INTEGRATION_META[integration.tipo].logo;
			return {
				id: integration.id,
				value: integration.value,
				label: integration.ativo ? label : `${label} (inativa)`,
				startContent: logo ? <Image src={logo} alt="" width={20} height={14} className="h-3.5 w-5 object-contain" /> : undefined,
			};
		}),
	];
}
