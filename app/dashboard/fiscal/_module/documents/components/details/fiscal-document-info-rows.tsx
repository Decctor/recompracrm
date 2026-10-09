"use client";

import { DataList } from "@/components/ui/data-list";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type TFiscalDocumentInfoRow = {
	icon: LucideIcon;
	label: string;
	value: ReactNode;
};

/**
 * Linhas ícone + rótulo + valor, no mesmo tratamento das seções da venda e do cliente: o rótulo
 * em caixa alta e o valor logo ao lado, não justificado à direita. Valor vazio vira travessão.
 */
export function FiscalDocumentInfoRows({ rows }: { rows: TFiscalDocumentInfoRow[] }) {
	return (
		<DataList.Root layout="inline">
			{rows.map(({ icon: Icon, label, value }) => (
				<DataList.Item key={label}>
					<DataList.Label icon={<Icon className="size-4 min-h-4 min-w-4 text-muted-foreground" />} className="text-foreground/80 uppercase">
						{label}
					</DataList.Label>
					<DataList.Value>{value}</DataList.Value>
				</DataList.Item>
			))}
		</DataList.Root>
	);
}
