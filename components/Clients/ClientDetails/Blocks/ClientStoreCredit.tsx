"use client";

import { AlertCircle, HandCoins, NotebookPen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReceiveStoreCreditMenu } from "@/components/Modals/Finances/ReceiveStoreCreditMenu";
import { getStoreCreditDaysOverdue } from "@/lib/finances/store-credit/aging";
import { getStoreCreditTitlesTotal } from "@/lib/finances/store-credit/allocate";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { useStoreCreditClientTitles } from "@/lib/queries/store-credit";
import { cn } from "@/lib/utils";

type ClientStoreCreditProps = {
	clientId: string;
	clientName: string;
	organizationId: string;
	canReceive: boolean;
};

/**
 * O que este cliente deve, na página dele. É a pergunta que se faz antes de estender a próxima nota,
 * e ela não pode exigir uma viagem até a aba Fiados.
 *
 * Some por completo quando não há nada em aberto: um bloco vazio na aba de compras de quem nunca
 * comprou a prazo é ruído permanente para a maioria das organizações.
 */
export default function ClientStoreCredit({ clientId, clientName, organizationId, canReceive }: ClientStoreCreditProps) {
	const [isReceiving, setIsReceiving] = useState(false);
	const { data, isLoading } = useStoreCreditClientTitles({ clientId });

	const titulos = data?.titulos ?? [];
	if (isLoading || titulos.length === 0) return null;

	const saldoAberto = getStoreCreditTitlesTotal(titulos.map((titulo) => ({ saldo: titulo.valor })));
	const vencidos = titulos.filter((titulo) => getStoreCreditDaysOverdue(titulo.dataPrevisao) > 0);
	const saldoVencido = getStoreCreditTitlesTotal(vencidos.map((titulo) => ({ saldo: titulo.valor })));
	const maisAntigo = titulos[0];
	const diasAtrasoMaisAntigo = maisAntigo ? getStoreCreditDaysOverdue(maisAntigo.dataPrevisao) : 0;

	return (
		<>
			<div className="text-numeric bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs">
				<div className="flex w-full flex-col items-start justify-between gap-3 lg:flex-row lg:items-center">
					<div className="flex items-center gap-2">
						<div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 p-1">
							<NotebookPen className="h-4 w-4 min-h-4 min-w-4" />
						</div>
						<div className="flex flex-col">
							<h1 className="text-xs font-medium leading-none tracking-tight">FIADO EM ABERTO</h1>
							<span className="text-[0.65rem] text-muted-foreground">
								{titulos.length} {titulos.length === 1 ? "venda a prazo" : "vendas a prazo"} sem quitação
							</span>
						</div>
					</div>

					<div className="flex w-full flex-col items-stretch gap-2 lg:w-auto lg:flex-row lg:items-center">
						<div className="flex flex-col lg:items-end">
							<span className="text-lg font-bold tracking-tight">{formatToMoney(saldoAberto)}</span>
							{saldoVencido > 0 ? (
								<span className="flex items-center gap-1 text-[0.65rem] font-medium text-red-700 dark:text-red-400">
									<AlertCircle className="h-3 w-3" />
									{formatToMoney(saldoVencido)} vencidos
								</span>
							) : null}
						</div>
						<div className="flex items-center gap-2">
							<Button type="button" variant="outline" size="sm" asChild>
								<Link href={appRoutes.finance.storeCredit()}>VER FIADOS</Link>
							</Button>
							{canReceive ? (
								<Button type="button" size="sm" onClick={() => setIsReceiving(true)} className="flex items-center gap-1.5">
									<HandCoins className="h-4 w-4" />
									RECEBER
								</Button>
							) : null}
						</div>
					</div>
				</div>

				<div className="flex w-full flex-col divide-y divide-border border-t border-border">
					{titulos.slice(0, 5).map((titulo) => {
						const diasAtraso = getStoreCreditDaysOverdue(titulo.dataPrevisao);
						return (
							<div key={titulo.transacaoId} className="flex w-full items-center justify-between gap-3 py-2">
								<div className="flex min-w-0 flex-col gap-0.5">
									<span className="truncate text-xs font-medium tracking-tight">{titulo.titulo || "Venda sem título"}</span>
									<span className={cn("text-[0.65rem]", diasAtraso > 0 ? "font-medium text-red-700 dark:text-red-400" : "text-muted-foreground")}>
										{diasAtraso > 0
											? `${diasAtraso} ${diasAtraso === 1 ? "dia" : "dias"} em atraso`
											: `Previsto para ${formatDateAsLocale(titulo.dataPrevisao)}`}
									</span>
								</div>
								<span className="shrink-0 text-sm font-bold tracking-tight">{formatToMoney(titulo.valor)}</span>
							</div>
						);
					})}
					{titulos.length > 5 ? <p className="py-2 text-center text-[0.65rem] text-muted-foreground">e mais {titulos.length - 5} em aberto</p> : null}
				</div>

				{diasAtrasoMaisAntigo > 0 ? (
					<p className="text-[0.65rem] text-muted-foreground">A venda mais antiga em aberto venceu em {formatDateAsLocale(maisAntigo.dataPrevisao)}.</p>
				) : null}
			</div>

			{isReceiving ? (
				<ReceiveStoreCreditMenu
					organizationId={organizationId}
					cliente={{ clienteId: clientId, nome: clientName, saldoAberto }}
					initialTransacaoId={null}
					originScope={null}
					closeMenu={() => setIsReceiving(false)}
				/>
			) : null}
		</>
	);
}
