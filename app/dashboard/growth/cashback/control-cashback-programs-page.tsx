"use client";
import type { TGetCashbackProgramOutput } from "@/app/api/cashback-programs/route";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ControlCashbackProgram from "@/components/Modals/CashbackPrograms/ControlCashbackProgram";
import { Button } from "@/components/ui/button";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatCashbackValue, formatDecimalPlaces, formatToMoney, getCashbackUnitLabel } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import {
	BadgeDollarSign,
	Calendar,
	Check,
	Database,
	DollarSign,
	Gift,
	LayoutGrid,
	Pencil,
	Banknote,
	PlayIcon,
	TextIcon,
	TrendingUp,
	Percent,
	Stars,
	Plus,
	ReceiptText,
	WalletCards,
	Printer,
} from "lucide-react";
import { useState } from "react";
import CashbackStatsBlock from "./_components/CashbackStatsBlock";
import CashbackBalancesView from "./_components/CashbackBalancesView";
import CashbackTransactionsView from "./_components/CashbackTransactionsView";
import { updateCashbackProgram } from "@/lib/mutations/cashback-programs";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { Section } from "@/components/ui/section";
import { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import NewCashbackProgramPrize from "@/components/Modals/CashbackPrograms/Prizes/NewCashbackProgramPrize";
import ControlCashbackProgramPrize from "@/components/Modals/CashbackPrograms/Prizes/ControlCashbackProgramPrize";
import Image from "next/image";

type CashbackProgramsPageProps = {
	user: TAuthUserSession["user"];
	userOrg: Exclude<TAuthUserSession["membership"], null>["organizacao"];
	cashbackProgram: Exclude<TGetCashbackProgramOutput["data"], null>;
};

export default function CashbackProgramsPage({ user, userOrg, cashbackProgram }: CashbackProgramsPageProps) {
	const [viewMode, setViewMode] = useQueryState("view", parseAsStringEnum(["stats", "transactions", "balances", "control-cashback-program"]));
	const { mutate: handleUpdateCashbackProgramMutation, isPending } = useMutation({
		mutationKey: ["update-cashback-program", cashbackProgram.id],
		mutationFn: updateCashbackProgram,
		onSuccess: async (data) => {
			return toast.success(data.message);
		},
		onError: async (error) => {
			return toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			return window.location.reload();
		},
	});
	return (
		<div className="w-full h-full flex flex-col gap-3">
			<div className="flex items-start justify-between">
				<div className="flex flex-col items-start">
					<h1 className="text-lg font-bold tracking-tight">{cashbackProgram.titulo}</h1>
					{cashbackProgram.descricao && <p className="text-sm font-medium tracking-tight">{cashbackProgram.descricao}</p>}
				</div>
				<div className="flex items-center gap-3">
					{cashbackProgram.ativo ? (
						<div className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 bg-green-500 dark:bg-green-600 text-white")}>
							<Check className="w-4 min-w-4 h-4 min-h-4" />
							<p className="text-[0.65rem] font-bold tracking-tight uppercase">ATIVO</p>
						</div>
					) : (
						<Button
							variant="ghost"
							size="fit"
							disabled={isPending}
							className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 bg-green-500 dark:bg-green-600 text-white hover:bg-green-600 hover:dark:bg-green-700 hover:text-white"
							onClick={() =>
								handleUpdateCashbackProgramMutation({
									cashbackProgramId: cashbackProgram.id,
									cashbackProgram: {
										...cashbackProgram,
										ativo: true,
									},
									cashbackProgramPrizes: cashbackProgram.recompensas,
								})
							}
						>
							<PlayIcon className="w-4 min-w-4 h-4 min-h-4" />
							ATIVAR
						</Button>
					)}
				</div>
			</div>
			<Tabs
				value={viewMode ?? "stats"}
				onValueChange={(value: string) => setViewMode(value as "stats" | "transactions" | "balances" | "control-cashback-program")}
			>
				<TabsList variant="page">
					<TabsTrigger value="stats">
						<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />
						Estatísticas
					</TabsTrigger>
					<TabsTrigger value="transactions">
						<ReceiptText className="w-4 h-4 min-w-4 min-h-4" />
						Transações
					</TabsTrigger>
					<TabsTrigger value="balances">
						<WalletCards className="w-4 h-4 min-w-4 min-h-4" />
						Saldos
					</TabsTrigger>
					<TabsTrigger value="control-cashback-program">
						<Database className="w-4 h-4 min-w-4 min-h-4" />
						Meu Programa
					</TabsTrigger>
				</TabsList>
				<TabsContent value="stats" className="flex flex-col gap-3">
					<CashbackProgramsStatsView cashbackProgram={cashbackProgram} />
				</TabsContent>
				<TabsContent value="transactions" className="flex flex-col gap-3">
					<CashbackTransactionsView terminology={cashbackProgram.terminologia} />
				</TabsContent>
				<TabsContent value="balances" className="flex flex-col gap-3">
					<CashbackBalancesView terminology={cashbackProgram.terminologia} />
				</TabsContent>
				<TabsContent value="control-cashback-program" className="flex flex-col gap-3">
					<CashbackProgramControlView cashbackProgram={cashbackProgram} user={user} userOrg={userOrg} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

type CashbackProgramsStatsViewProps = {
	cashbackProgram: Exclude<TGetCashbackProgramOutput["data"], null>;
};
function CashbackProgramsStatsView({ cashbackProgram }: CashbackProgramsStatsViewProps) {
	const [period, setPeriod] = useState<{ after?: Date; before?: Date }>({
		after: dayjs().startOf("month").toDate(),
		before: dayjs().endOf("month").toDate(),
	});

	const periodFormatted = {
		after: period.after ? period.after.toISOString() : dayjs().startOf("month").toISOString(),
		before: period.before ? period.before.toISOString() : dayjs().endOf("month").toISOString(),
	};
	return (
		<div className="w-full flex flex-col gap-3">
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
			<CashbackStatsBlock period={periodFormatted} terminology={cashbackProgram.terminologia} />
		</div>
	);
}

type CashbackProgramControlViewProps = {
	cashbackProgram: Exclude<TGetCashbackProgramOutput["data"], null>;
	user: TAuthUserSession["user"];
	userOrg: Exclude<TAuthUserSession["membership"], null>["organizacao"];
};
function CashbackProgramControlView({ cashbackProgram, user, userOrg }: CashbackProgramControlViewProps) {
	const [editCashbackProgramModalIsOpen, setEditCashbackProgramModalIsOpen] = useState<boolean>(false);

	const [newCashbackProgramPrizeModalIsOpen, setNewCashbackProgramPrizeModalIsOpen] = useState<boolean>(false);
	const [editCashbackProgramPrizeId, setEditCashbackProgramPrizeId] = useState<string | null>(null);
	const activePrizesCount = cashbackProgram.recompensas.filter((prize) => prize.ativo).length;
	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-stretch gap-3 flex-col lg:flex-row">
				<div className="h-[500px] max-h-[500px] min-h-[500px] w-full lg:w-1/2">
					<Section.Root className="h-full">
						<Section.Header>
							<Section.Icon>
								<LayoutGrid className="w-4 min-w-4 h-4 min-h-4" />
							</Section.Icon>
							<Section.Title>INFORMAÇÕES GERAIS</Section.Title>
							<Section.Actions>
								<Button variant="ghost" size="xs" onClick={() => setEditCashbackProgramModalIsOpen(true)} className="flex items-center gap-1">
									<Pencil className="w-4 h-4 min-w-4 min-h-4" />
									EDITAR
								</Button>
							</Section.Actions>
						</Section.Header>
						<Section.Body>
							<div className="w-full flex flex-col gap-2">
								<h1 className="text-xs leading-none tracking-tight">INFORMAÇÕES GERAIS</h1>
								<div className="w-full flex flex-col gap-1.5">
									<div className="w-full flex items-center gap-1.5">
										<TextIcon className="w-4 min-w-4 h-4 min-h-4" />
										<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">TÍTULO DO PROGRAMA</h3>
										<h3 className="text-sm font-semibold tracking-tight">{cashbackProgram.titulo}</h3>
									</div>
									<div className="w-full flex items-center gap-1.5">
										<TextIcon className="w-4 min-w-4 h-4 min-h-4" />
										<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">DESCRIÇÃO DO PROGRAMA</h3>
										<h3 className="text-sm font-semibold tracking-tight">{cashbackProgram.descricao ?? "Nenhuma descrição definida..."}</h3>
									</div>
									<div className="w-full flex items-center gap-1.5">
										{cashbackProgram.terminologia === "DINHEIRO" ? (
											<Banknote className="w-4 min-w-4 h-4 min-h-4" />
										) : (
											<Stars className="w-4 min-w-4 h-4 min-h-4" />
										)}
										<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">TERMINOLOGIA DO PROGRAMA</h3>
										<h3 className="text-sm font-semibold tracking-tight">{cashbackProgram.terminologia}</h3>
									</div>
								</div>
							</div>
							<div className="w-full flex flex-col gap-2">
								<h1 className="text-xs leading-none tracking-tight">REGRAS DE ACÚMULO</h1>
								<div className="w-full flex flex-col gap-1.5">
									<div className="w-full flex items-center gap-1.5">
										<TrendingUp className="w-4 min-w-4 h-4 min-h-4" />
										<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">REGRA DE ACUMULAÇÃO (CLIENTE)</h3>
										<h3 className="text-sm font-semibold tracking-tight">
											{cashbackProgram.acumuloTipo === "PERCENTUAL"
												? `${formatDecimalPlaces(cashbackProgram.acumuloValor)}% do valor da venda`
												: `${formatCashbackValue(cashbackProgram.acumuloValor, cashbackProgram.terminologia)} fixo por venda`}
										</h3>
									</div>
									<div className="w-full flex items-center gap-1.5">
										<TrendingUp className="w-4 min-w-4 h-4 min-h-4" />
										<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">REGRA DE ACUMULAÇÃO (PARCEIRO)</h3>
										<h3 className="text-sm font-semibold tracking-tight">
											{cashbackProgram.acumuloTipo === "PERCENTUAL"
												? `${formatDecimalPlaces(cashbackProgram.acumuloValorParceiro)}% do valor da venda`
												: `${formatCashbackValue(cashbackProgram.acumuloValorParceiro, cashbackProgram.terminologia)} fixo por venda`}
										</h3>
									</div>
									<div className="w-full flex items-center gap-1.5">
										<DollarSign className="w-4 min-w-4 h-4 min-h-4" />
										<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">VALOR MÍNIMO P/ ACÚMULO</h3>
										<h3 className="text-sm font-semibold tracking-tight">
											{cashbackProgram.acumuloRegraValorMinimo > 0
												? `Vendas acima de ${formatToMoney(cashbackProgram.acumuloRegraValorMinimo)}`
												: "Sem valor mínimo"}
										</h3>
									</div>
									<div className="w-full flex items-center gap-1.5">
										<Calendar className="w-4 min-w-4 h-4 min-h-4" />
										<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">
											VALIDADE DO {getCashbackUnitLabel(cashbackProgram.terminologia, { uppercase: true, plural: false })}:{" "}
											{cashbackProgram.expiracaoRegraValidadeValor > 0
												? `${cashbackProgram.expiracaoRegraValidadeValor} dias após o acúmulo`
												: "Sem validade (não expira)"}
										</h3>
									</div>
								</div>
							</div>
							<div className="w-full flex flex-col gap-2">
								<h1 className="text-xs leading-none tracking-tight">REGRAS DE RESGATE</h1>
								<div className="w-full flex flex-col gap-1.5">
									<div className="w-full flex items-center gap-1.5">
										<Percent className="w-4 min-w-4 h-4 min-h-4" />
										<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">PERMITE DESCONTOS (CLIENTE)</h3>
										<h3 className="text-sm font-semibold tracking-tight">{cashbackProgram.modalidadeDescontosPermitida ? "Sim" : "Não"}</h3>
									</div>
									<div className="w-full flex items-center gap-1.5">
										<Gift className="w-4 min-w-4 h-4 min-h-4" />
										<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">PERMITE RECOMPENSAS (CLIENTE)</h3>
										<h3 className="text-sm font-semibold tracking-tight">{cashbackProgram.modalidadeRecompensasPermitida ? "Sim" : "Não"}</h3>
									</div>
									{cashbackProgram.modalidadeDescontosPermitida ? (
										<div className="w-full flex items-center gap-1.5">
											<BadgeDollarSign className="w-4 min-w-4 h-4 min-h-4" />
											<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">LIMITE DE RESGATE (PARCEIRO)</h3>
											<h3 className="text-sm font-semibold tracking-tight">
												{cashbackProgram.resgateLimiteTipo === "PERCENTUAL"
													? `${formatDecimalPlaces(cashbackProgram.resgateLimiteValor ?? 0)}% do valor da venda`
													: `${formatCashbackValue(cashbackProgram.resgateLimiteValor ?? 0, cashbackProgram.terminologia)} fixo por venda`}
											</h3>
										</div>
									) : null}
								</div>
							</div>
						</Section.Body>
					</Section.Root>
				</div>
				<div className="h-[500px] max-h-[500px] min-h-[500px] w-full lg:w-1/2">
					<Section.Root className="h-full">
						<Section.Header>
							<Section.Icon>
								<Gift className="w-4 min-w-4 h-4 min-h-4" />
							</Section.Icon>
							<Section.Title>RECOMPENSAS</Section.Title>
							<Section.Actions>
								<div className="flex items-center gap-1">
									<Button
										variant="ghost"
										size="xs"
										disabled={activePrizesCount === 0}
										onClick={() => window.open(`/cashback-rewards-display/${userOrg.id}`, "_blank", "noopener,noreferrer")}
										className="flex items-center gap-1"
									>
										<Printer className="h-4 w-4" />
										IMPRIMIR RESUMO
									</Button>
									<Button variant="ghost" size="xs" onClick={() => setNewCashbackProgramPrizeModalIsOpen(true)} className="flex items-center gap-1">
										<Plus className="w-4 h-4 min-w-4 min-h-4" />
										ADICIONAR
									</Button>
								</div>
							</Section.Actions>
						</Section.Header>
						<Section.Body>
							<div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto">
								{cashbackProgram.recompensas.length > 0 ? (
									cashbackProgram.recompensas.map((recompensa) => (
										<CashbackProgramPrizeCard
											key={recompensa.id}
											prize={recompensa}
											cashbackProgramTerminology={cashbackProgram.terminologia}
											handleEditClick={() => setEditCashbackProgramPrizeId(recompensa.id)}
										/>
									))
								) : (
									<div className="w-full text-center text-sm font-medium tracking-tight text-foreground/80">Nenhuma recompensa encontrada.</div>
								)}
							</div>
						</Section.Body>
					</Section.Root>
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
			{newCashbackProgramPrizeModalIsOpen ? (
				<NewCashbackProgramPrize
					user={user}
					userOrg={userOrg}
					cashbackProgramId={cashbackProgram.id}
					cashbackProgramTerminology={cashbackProgram.terminologia}
					closeMenu={() => setNewCashbackProgramPrizeModalIsOpen(false)}
					callbacks={{
						onSettled: () => window.location.reload(),
					}}
				/>
			) : null}
			{editCashbackProgramPrizeId ? (
				<ControlCashbackProgramPrize
					user={user}
					userOrg={userOrg}
					cashbackProgramId={cashbackProgram.id}
					cashbackProgramPrizeId={editCashbackProgramPrizeId}
					closeMenu={() => setEditCashbackProgramPrizeId(null)}
					callbacks={{
						onSettled: () => window.location.reload(),
					}}
				/>
			) : null}
		</div>
	);
}

type CashbackProgramPrizeCardProps = {
	prize: Exclude<TGetCashbackProgramOutput["data"], null>["recompensas"][number];
	cashbackProgramTerminology: TCashbackProgramTerminologyEnum;
	handleEditClick: () => void;
};
function CashbackProgramPrizeCard({ prize, cashbackProgramTerminology, handleEditClick }: CashbackProgramPrizeCardProps) {
	return (
		<div className="w-full flex flex-col sm:flex-row gap-1.5 bg-card border-border rounded-xl border p-1.5 shadow-2xs">
			<div className="flex items-center justify-center">
				<div className="relative aspect-square w-16 h-16 max-w-16 max-h-16 min-w-16 min-h-16 rounded-lg overflow-hidden">
					{prize.imagemCapaUrl ? (
						<Image src={prize.imagemCapaUrl} alt={prize.titulo} fill className="object-cover" />
					) : (
						<div className="bg-primary/50 text-foreground-foreground flex h-full w-full items-center justify-center">
							<Gift className="w-6 h-6" />
						</div>
					)}
				</div>
			</div>
			<div className="flex flex-col grow gap-1">
				<div className="grow w-full flex flex-col gap-0.5">
					<div className="w-full flex items-center flex-col md:flex-row justify-between gap-2">
						<h1 className="text-xs font-bold tracking-tight lg:text-sm">{prize.titulo}</h1>
						<div className="flex items-center gap-3 flex-col md:flex-row gap-y-1">
							<div className="flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[0.65rem]">
								<BadgeDollarSign className="w-4 min-w-4 h-4 min-h-4" />
								<p className="text-xs tracking-tight uppercase">{formatCashbackValue(prize.valor, cashbackProgramTerminology)}</p>
							</div>
						</div>
					</div>
					<p className="text-xs text-muted-foreground">{prize.descricao || "Nenhuma descrição definida..."}</p>
				</div>

				<div className="w-full flex items-center justify-end gap-2 flex-wrap">
					{/* <Button
						variant="ghost"
						className="flex items-center gap-1.5 p-2 rounded-full hover:bg-destructive/10 hover:text-destructive duration-300 ease-in-out"
						size="fit"
						onClick={handleRemoveClick}
					>
						<Trash2 className="w-3 min-w-3 h-3 min-h-3" />
					</Button> */}
					<Button variant="ghost" className="flex items-center gap-1.5 p-2 rounded-full" size="fit" onClick={handleEditClick}>
						<Pencil className="w-3 min-w-3 h-3 min-h-3" />
					</Button>
				</div>
			</div>
		</div>
	);
}
