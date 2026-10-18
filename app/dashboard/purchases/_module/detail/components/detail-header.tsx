"use client";

import DateInput from "@/components/Inputs/DateInput";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDateAsLocale, formatDateForInputValue, formatDateOnInputChange, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import type { TPurchaseState } from "@/state-hooks/use-purchase-state";
import { PurchaseStatusOptions } from "@/utils/select-options";
import { ArrowLeft, Check, Circle, CircleAlert, Ellipsis, FileText, PackageCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TONE_CLASSES } from "../../builder/components/builder-ui";
import type { TPurchaseById } from "../helpers/hydrate";

type PurchaseDetailHeaderProps = {
	purchase: TPurchaseById;
	state: TPurchaseState;
	canEdit: boolean;
	isSaving: boolean;
	itemsTotal: number;
	itemsMatchValue: boolean;
	hasUnsavedChanges: boolean;
	onReceive: (receivedAt: Date) => void;
	onCancel: () => void;
};

function formatShortDateTime(value: Date | string | null | undefined) {
	if (!value) return null;
	const date = new Date(value);
	return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatShortDate(value: Date | string | null | undefined) {
	if (!value) return null;
	return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

export default function PurchaseDetailHeader({
	purchase,
	state,
	canEdit,
	isSaving,
	itemsTotal,
	itemsMatchValue,
	hasUnsavedChanges,
	onReceive,
	onCancel,
}: PurchaseDetailHeaderProps) {
	const [receiveOpen, setReceiveOpen] = useState(false);
	const [cancelOpen, setCancelOpen] = useState(false);
	const [receivedAt, setReceivedAt] = useState<Date>(new Date());
	const status = PurchaseStatusOptions.find((option) => option.value === purchase.status) ?? null;
	const document = purchase.documentosImportados?.documentos?.[0] ?? null;
	const supplierName = purchase.fornecedor?.nome ?? purchase.pedidoFornecedorNome ?? null;
	const isReceived = purchase.status === "RECEBIDA";
	const isCancelled = purchase.status === "CANCELADA";
	const canReceive = canEdit && !isReceived && !isCancelled;

	// Only the creation time and the receipt date are stored; the steps say what is known, nothing more.
	const reachedSteps = isReceived ? 3 : purchase.status === "RASCUNHO" ? 1 : 2;
	const lifecycle = [
		{ label: "Criada", sub: formatShortDateTime(purchase.dataInsercao) ?? "—" },
		{
			label: "Confirmada",
			sub: purchase.pedidoData ? `Pedido em ${formatShortDate(purchase.pedidoData)}` : reachedSteps >= 2 ? "Confirmada" : "Pendente",
		},
		{
			label: "Recebida",
			sub: isReceived
				? (formatShortDate(purchase.entregaDataRecebimentoEfetivacao) ?? "Recebida")
				: purchase.entregaDataRecebimentoPrevisao
					? `Previsão ${formatShortDate(purchase.entregaDataRecebimentoPrevisao)}`
					: "Sem previsão",
		},
	];

	return (
		<div className="flex w-full flex-col gap-4">
			<Button variant="ghost" size="fit" asChild className="flex w-fit items-center gap-1 rounded-full px-2 py-2 hover:bg-primary/10">
				<Link href={appRoutes.purchases()} className="flex items-center gap-1">
					<ArrowLeft className="h-5 w-5" />
					VOLTAR
				</Link>
			</Button>
			<div className="flex w-full flex-col items-start justify-between gap-4 lg:flex-row">
				<div className="flex min-w-0 flex-col gap-2">
					<div className="flex flex-wrap items-center gap-2">
						{document?.numero ? (
							<div className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-2 text-[0.65rem] font-bold italic text-foreground/80">
								<FileText className="h-4 min-h-4 w-4 min-w-4" />
								<p>NF-e {document.numero}</p>
							</div>
						) : null}
						<h1 className="text-xl font-extrabold leading-none tracking-tight md:text-2xl">{state.purchase.titulo || "Compra sem título"}</h1>
						{status ? (
							<div className={cn("flex items-center gap-1.5 rounded-lg border-none px-2 py-1", status.className)}>
								{status.icon}
								<span className="text-xs font-medium">{status.label}</span>
							</div>
						) : null}
					</div>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
						{supplierName ? (
							<span>
								Fornecedor: <span className="font-medium text-foreground">{supplierName}</span>
							</span>
						) : null}
						<span>
							Total: <span className="font-medium text-foreground">{formatToMoney(state.lancamentoContabil.valor)}</span>
						</span>
						<span>
							Criada em {formatDateAsLocale(purchase.dataInsercao)}
							{purchase.autor?.nome ? ` por ${purchase.autor.nome}` : ""}
						</span>
					</div>
				</div>
				{canEdit ? (
					<div className="flex items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Mais ações">
										<Ellipsis className="h-4 w-4" />
									</Button>
								}
							/>
							<DropdownMenuContent align="end">
								<DropdownMenuItem variant="destructive" onClick={() => setCancelOpen(true)}>
									<XCircle className="h-3.5 w-3.5" />
									CANCELAR COMPRA
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						{canReceive ? (
							<Button
								type="button"
								variant="brand"
								className="flex items-center gap-1.5 rounded-full"
								onClick={() => {
									setReceivedAt(new Date());
									setReceiveOpen(true);
								}}
							>
								<PackageCheck className="h-4 w-4" />
								REGISTRAR RECEBIMENTO
							</Button>
						) : null}
					</div>
				) : null}
			</div>

			{isCancelled ? (
				<div className={cn("flex w-full max-w-2xl items-center gap-2 rounded-lg px-3 py-2 text-xs", TONE_CLASSES.bad)}>
					<XCircle className="h-4 w-4 shrink-0" />
					Compra cancelada. Ela não pode mais ser editada.
				</div>
			) : (
				<ol className="flex w-full max-w-2xl items-center" aria-label="Situação da compra">
					{lifecycle.map((step, index) => {
						const done = index < reachedSteps;
						const current = index === reachedSteps - 1;
						return (
							<li key={step.label} className="flex flex-1 items-center gap-2">
								<span
									className={cn(
										"flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full border",
										done ? "border-brand" : "border-border bg-background text-muted-foreground/50",
										done && current && "bg-brand text-brand-foreground",
										done && !current && "bg-brand/20 text-brand",
									)}
								>
									{done ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
								</span>
								<span className="flex flex-col">
									<span className={cn("text-xs font-semibold", done ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
									<span className="text-[0.7rem] text-muted-foreground">{step.sub}</span>
								</span>
								{index < lifecycle.length - 1 ? <span className={cn("mx-2.5 h-px flex-1", index < reachedSteps - 1 ? "bg-brand" : "bg-border")} /> : null}
							</li>
						);
					})}
				</ol>
			)}

			<Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Registrar recebimento</DialogTitle>
						<DialogDescription>
							Dá entrada dos itens no estoque, gera os lotes e trava a composição da compra. A programação de pagamento continua editável.
						</DialogDescription>
					</DialogHeader>
					<DateInput
						label="RECEBIDA EM"
						value={formatDateForInputValue(receivedAt)}
						handleChange={(value) => setReceivedAt((formatDateOnInputChange(value, "date") as Date | null) ?? new Date())}
					/>
					{!itemsMatchValue ? (
						<p className={cn("flex gap-1.5 rounded-md px-3 py-2 text-xs", TONE_CLASSES.warn)}>
							<CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							Os itens somam {formatToMoney(itemsTotal)} e o valor a pagar é {formatToMoney(state.lancamentoContabil.valor)}. Ajuste no Financeiro antes de
							receber.
						</p>
					) : null}
					{hasUnsavedChanges ? <p className="text-xs text-muted-foreground">As alterações não salvas desta página serão salvas junto.</p> : null}
					<DialogFooter>
						<Button variant="outline" onClick={() => setReceiveOpen(false)}>
							VOLTAR
						</Button>
						<LoadingButton
							variant="brand"
							loading={isSaving}
							disabled={!itemsMatchValue}
							onClick={() => {
								onReceive(receivedAt);
								setReceiveOpen(false);
							}}
						>
							CONFIRMAR RECEBIMENTO
						</LoadingButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Cancelar compra?</DialogTitle>
						<DialogDescription>
							{isReceived
								? "A entrada no estoque é estornada e os lotes são descartados. Só é possível se nenhum lote desta compra foi usado."
								: "A compra deixa de valer e não poderá mais ser editada."}{" "}
							O lançamento contábil e as transações não são apagados.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setCancelOpen(false)}>
							VOLTAR
						</Button>
						<LoadingButton
							variant="destructive"
							loading={isSaving}
							onClick={() => {
								onCancel();
								setCancelOpen(false);
							}}
						>
							CANCELAR COMPRA
						</LoadingButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
