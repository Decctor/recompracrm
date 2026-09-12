"use client";

import type { TGetClientStatsOutput } from "@/app/api/clients/stats/by-client/route";
import { ClientDuplicatePill } from "@/components/Clients/duplicates/ClientDuplicatePill";
import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { Button } from "@/components/ui/button";
import {
	type TClientRegistryClient,
	formatMissingEssentialFields,
	getClientRegistryCompleteness,
	mapClientToState,
} from "@/lib/clients/client-registry-state";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import { getRFMConfigByLabel } from "@/utils/rfm";
import { ArrowLeft, BadgeDollarSign, CirclePlus, Grid3X3, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { BsTicketPerforated } from "react-icons/bs";

type ClientDetailHeaderProps = {
	client: TClientRegistryClient;
	totals: TGetClientStatsOutput["data"]["totais"] | undefined;
	canReconcileClients: boolean;
};

/**
 * Cabeçalho que acompanha o cliente em todas as abas.
 *
 * Condensado de propósito: identidade (nome, segmento RFM, duplicidade), o quanto do cadastro está
 * preenchido e três números de vida inteira. O detalhe de contato e endereço saiu daqui — ele agora
 * é editável na aba CADASTRO, e repetir em leitura o que está a um clique de distância só empurra
 * as abas para baixo da dobra.
 *
 * Os KPIs não seguem o filtro de período da aba ESTATÍSTICAS: o cabeçalho fica visível em abas que
 * não têm filtro nenhum, e um número que muda sem controle visível ao lado não se explica.
 */
export default function ClientDetailHeader({ client, totals, canReconcileClients }: ClientDetailHeaderProps) {
	const rfmConfig = getRFMConfigByLabel(client.analiseRFMTitulo);
	const completeness = useMemo(() => getClientRegistryCompleteness(mapClientToState(client)), [client]);

	return (
		<div className="flex w-full flex-col gap-4">
			<Button variant="ghost" size="sm" className="w-fit gap-1" asChild>
				<Link href={appRoutes.customers.root()}>
					<ArrowLeft className="h-4 w-4 min-h-4 min-w-4" />
					VOLTAR
				</Link>
			</Button>

			<div className="flex w-full flex-col items-start gap-4 lg:flex-row">
				<div className="bg-primary text-primary-foreground flex h-16 w-16 shrink-0 items-center justify-center rounded-lg">
					<UserRound className="h-10 w-10 min-h-10 min-w-10" />
				</div>

				<div className="flex min-w-0 grow flex-col gap-2">
					<div className="flex w-full flex-wrap items-center gap-1.5">
						<h1 className="text-2xl font-extrabold tracking-tight">{client.nome}</h1>
						{client.analiseRFMTitulo ? (
							<div className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5", rfmConfig.backgroundCollor, rfmConfig.textCollor)}>
								<Grid3X3 className="h-4 w-4 min-h-4 min-w-4" />
								<p className={cn("text-xs font-medium uppercase tracking-tight", rfmConfig.textCollor)}>{client.analiseRFMTitulo}</p>
							</div>
						) : null}
						<ClientDuplicatePill entityType="client" entityId={client.id} canReconcile={canReconcileClients} />
					</div>

					<div className="flex w-full max-w-lg items-center gap-2.5">
						<div className="bg-secondary relative h-1 flex-1 overflow-hidden rounded-full">
							<div className="bg-brand absolute inset-y-0 left-0 rounded-full" style={{ width: `${completeness.percentual}%` }} />
						</div>
						<p className="text-micro text-muted-foreground text-numeric shrink-0">
							Cadastro {completeness.percentual}% completo · {formatMissingEssentialFields(completeness.faltantes)}
						</p>
					</div>
				</div>

				<div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:w-auto lg:items-stretch">
					<ClientHeaderKpi
						icon={<CirclePlus className="h-4 w-4 min-h-4 min-w-4" />}
						title="Compras"
						value={formatDecimalPlaces(totals?.qtdeCompras ?? 0)}
					/>
					<ClientHeaderKpi
						icon={<BadgeDollarSign className="h-4 w-4 min-h-4 min-w-4" />}
						title="Valor compro"
						value={formatToMoney(totals?.valorComproTotal ?? 0)}
					/>
					<ClientHeaderKpi
						icon={<BsTicketPerforated className="h-4 w-4 min-h-4 min-w-4" />}
						title="Ticket médio"
						value={formatToMoney(totals?.ticketMedio ?? 0)}
					/>
				</div>
			</div>
		</div>
	);
}

function ClientHeaderKpi({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
	const { colors } = useOrgColors();

	return (
		<div className="bg-card border-border text-numeric flex w-full flex-col gap-2 rounded-xl border px-3.5 py-3 shadow-2xs lg:w-44">
			<div className="flex min-w-0 items-center gap-2">
				<span className="text-muted-foreground shrink-0">{icon}</span>
				<h2 className="truncate text-xs font-medium uppercase tracking-tight">{title}</h2>
			</div>
			<span className="text-xl font-bold leading-none" style={{ color: colors.secondary }}>
				{value}
			</span>
		</div>
	);
}
