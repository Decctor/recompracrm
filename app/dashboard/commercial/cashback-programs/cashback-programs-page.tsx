"use client";
import type { TGetCashbackProgramOutput } from "@/app/api/cashback-programs/route";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ControlCashbackProgram from "@/components/Modals/CashbackPrograms/ControlCashbackProgram";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { copyToClipboard } from "@/lib/utils";
import dayjs from "dayjs";
import { Calendar, DollarSign, Edit, Pencil, Presentation, Settings, TrendingUp } from "lucide-react";
import { useState } from "react";
import CashbackStatsBlock from "./CashbackStatsBlock";
import RecentTransactionsBlock from "./RecentTransactionsBlock";
import TopClientsBlock from "./TopClientsBlock";

type CashbackProgramsPageProps = {
	user: TAuthUserSession["user"];
	userOrg: Exclude<TAuthUserSession["membership"], null>["organizacao"];
	cashbackProgram: Exclude<TGetCashbackProgramOutput["data"], null>;
	organizationId: string;
};

export default function CashbackProgramsPage({ user, userOrg, cashbackProgram, organizationId }: CashbackProgramsPageProps) {
	// Initialize with current month
	const [period, setPeriod] = useState<{ after?: Date; before?: Date }>({
		after: dayjs().startOf("month").toDate(),
		before: dayjs().endOf("month").toDate(),
	});

	const [editCashbackProgramModalIsOpen, setEditCashbackProgramModalIsOpen] = useState<boolean>(false);

	const periodFormatted = {
		after: period.after ? period.after.toISOString() : dayjs().startOf("month").toISOString(),
		before: period.before ? period.before.toISOString() : dayjs().endOf("month").toISOString(),
	};

	return (
		<div className="w-full h-full flex flex-col gap-3">
			{/* Program Info Card */}
			<div className="w-full flex flex-col gap-3">
				<div className="flex items-start justify-between">
					<div className="flex flex-col items-start">
						<h1 className="text-lg font-bold tracking-tight">{cashbackProgram.titulo}</h1>
						{cashbackProgram.descricao && <p className="text-sm font-medium tracking-tight">{cashbackProgram.descricao}</p>}
					</div>
					<Button variant="ghost" className="flex items-center gap-2" onClick={() => setEditCashbackProgramModalIsOpen(true)}>
						<Pencil className="w-4 min-w-4 h-4 min-h-4" />
						EDITAR
					</Button>
				</div>

				<div className="w-full flex items-center gap-2 flex-wrap">
					<div className="flex items-center gap-2">
						<TrendingUp className="w-4 min-w-4 h-4 min-h-4" />
						<p className="text-sm font-medium tracking-tight">
							REGRA DE ACUMULAÇÃO:
							{cashbackProgram.acumuloTipo === "PERCENTUAL"
								? `${formatDecimalPlaces(cashbackProgram.acumuloValor)}% do valor da venda`
								: `${formatToMoney(cashbackProgram.acumuloValor)} fixo por venda`}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<DollarSign className="w-4 min-w-4 h-4 min-h-4" />
						<p className="text-sm font-medium tracking-tight">
							VALOR MÍNIMO P/ ACÚMULO:{" "}
							{cashbackProgram.acumuloRegraValorMinimo > 0
								? `Vendas acima de ${formatToMoney(cashbackProgram.acumuloRegraValorMinimo)}`
								: "Sem valor mínimo"}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Calendar className="w-4 min-w-4 h-4 min-h-4" />
						<p className="text-sm font-medium tracking-tight">
							VALIDADE DOS CRÉDITOS:{" "}
							{cashbackProgram.expiracaoRegraValidadeValor > 0
								? `${cashbackProgram.expiracaoRegraValidadeValor} dias após o acúmulo`
								: "Sem validade (não expira)"}
						</p>
					</div>
				</div>
			</div>
			<div className="w-full flex justify-end">
				<div className="w-fit">
					<DateIntervalInput
						label="Período"
						labelClassName="hidden"
						className="hover:bg-accent hover:text-accent-foreground border-none shadow-none"
						value={{
							after: period.after ? new Date(period.after) : undefined,
							before: period.before ? new Date(period.before) : undefined,
						}}
						handleChange={(value) =>
							setPeriod({
								after: value.after ? new Date(value.after) : undefined,
								before: value.before ? new Date(value.before) : undefined,
							})
						}
					/>
				</div>
			</div>
			<div className="w-full flex items-center justify-end">
				<Button
					variant="ghost"
					className="flex items-center gap-2"
					size="sm"
					onClick={() => copyToClipboard(`${process.env.NEXT_PUBLIC_APP_URL}/point-of-interaction/${organizationId}`)}
				>
					<Presentation className="w-4 h-4 min-w-4 min-h-4" />
					PONTO DE INTERAÇÃO
				</Button>
			</div>
			<CashbackStatsBlock period={periodFormatted} />
			<div className="w-full flex flex-col lg:flex-row gap-3 items-stretch">
				<div className="w-full lg:w-1/2">
					<RecentTransactionsBlock period={periodFormatted} />
				</div>
				<div className="w-full lg:w-1/2">
					<TopClientsBlock />
				</div>
			</div>
			{editCashbackProgramModalIsOpen ? (
				<ControlCashbackProgram
					user={user}
					userOrg={userOrg}
					cashbackProgram={cashbackProgram}
					closeModal={() => setEditCashbackProgramModalIsOpen(false)}
					callbacks={{
						onSettled: () => window.location.reload(),
					}}
				/>
			) : null}
		</div>
	);
}
