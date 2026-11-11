"use client";

import type { TGetPurchasesOutputDefault } from "@/app/api/purchases/route";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { getSupplierInitials, PURCHASE_STATUS_META } from "./purchase-status-meta";

type TPurchaseListItem = TGetPurchasesOutputDefault["purchases"][number];

/** Datas de calendário (pedido, previsão, recebimento) são gravadas à meia-noite UTC; carimbos de tempo, não. */
function formatCalendarDay(date: Date | string | null | undefined) {
	const formatted = formatDateAsLocale(date);
	if (!formatted) return null;
	return formatted.endsWith(String(new Date().getFullYear())) ? formatted.slice(0, 5) : formatted;
}
function formatTimestampDay(date: Date | string) {
	const parsed = dayjs(date);
	return parsed.year() === dayjs().year() ? parsed.format("DD/MM") : parsed.format("DD/MM/YYYY");
}

function getStatusCaption(purchase: TPurchaseListItem) {
	switch (purchase.status) {
		case "RASCUNHO":
			return "continue de onde parou";
		case "CONFIRMADA":
		case "RECEBIMENTO_PARCIAL": {
			const forecast = formatCalendarDay(purchase.entregaDataRecebimentoPrevisao);
			if (forecast) return `entrega prevista para ${forecast}`;
			return purchase.status === "CONFIRMADA" ? "aguardando a entrega" : "parte dos itens já chegou";
		}
		case "RECEBIDA": {
			const receivedAt = formatCalendarDay(purchase.entregaDataRecebimentoEfetivacao);
			return receivedAt ? `em ${receivedAt}` : null;
		}
		case "CANCELADA":
			return `em ${formatTimestampDay(purchase.dataUltimaAtualizacao)}`;
	}
}

function getDocumentLabel(purchase: TPurchaseListItem) {
	const document = purchase.documentosImportados?.documentos.find((doc) => doc.numero);
	if (!document?.numero) return null;
	const numeric = Number(document.numero.replace(/[^0-9]/g, ""));
	const number = Number.isFinite(numeric) && numeric > 0 ? numeric.toLocaleString("pt-BR") : document.numero;
	return document.origem === "XML" || document.chaveAcesso ? `NF-e ${number}` : `Nota ${number}`;
}

export default function PurchaseListCard({ purchase }: { purchase: TPurchaseListItem }) {
	const meta = PURCHASE_STATUS_META[purchase.status];
	const StatusIcon = meta.icon;
	const supplierName = purchase.fornecedor?.nome ?? purchase.pedidoFornecedorNome;
	const documentLabel = getDocumentLabel(purchase);
	const caption = getStatusCaption(purchase);
	const isDraft = purchase.status === "RASCUNHO";
	const isCancelled = purchase.status === "CANCELADA";
	const itemCount = purchase.itens.length;
	const authorName = purchase.autor?.nome;
	const authorship = isDraft
		? `Editada em ${formatTimestampDay(purchase.dataUltimaAtualizacao)}`
		: `Criada em ${formatTimestampDay(purchase.dataInsercao)}`;

	return (
		<Link
			href={appRoutes.purchase(purchase.id)}
			className={cn(
				"group flex w-full flex-wrap items-center gap-x-5 gap-y-3.5 rounded-3xl border border-border bg-card px-4 py-4 shadow-2xs transition-all hover:border-border hover:shadow-sm sm:px-[18px]",
				isDraft && "border-dashed",
			)}
		>
			<div className="flex min-w-0 flex-[1_1_220px] items-center gap-3.5">
				<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-info-surface text-sm font-extrabold text-info-surface-foreground">
					{getSupplierInitials(supplierName ?? purchase.titulo)}
				</div>
				<div className="flex min-w-0 flex-col gap-1">
					<span className="truncate text-[15px] font-bold tracking-tight">{purchase.titulo || "Compra sem título"}</span>
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-muted-foreground">
						<span>{supplierName || "Sem fornecedor"}</span>
						{documentLabel ? (
							<span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
								<FileText className="h-3 w-3" />
								{documentLabel}
							</span>
						) : null}
					</div>
					<span className="text-[11px] font-semibold text-muted-foreground">{authorName ? `${authorship} por ${authorName}` : authorship}</span>
				</div>
			</div>

			<div className="flex min-w-0 flex-[1_1_330px] items-center gap-5">
				<div className="flex min-w-[150px] max-w-[280px] flex-auto flex-col gap-2.5">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
						<span className={cn("inline-flex items-center gap-1.5 rounded-full py-[3px] pl-2 pr-2.5 text-xs font-bold", meta.chipClassName)}>
							<StatusIcon className="h-3.5 w-3.5" />
							{meta.label}
						</span>
						{caption ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
					</div>
					<div className="grid grid-cols-4 gap-1" aria-hidden>
						{[1, 2, 3, 4].map((step) => (
							<span key={step} className={cn("h-1.5 rounded-full", !isCancelled && step <= meta.step ? meta.barClassName : "bg-border")} />
						))}
					</div>
				</div>
				<div className="ml-auto flex items-center gap-4">
					<div className="flex min-w-[110px] flex-col items-end gap-0.5">
						<span className={cn("text-[17px] font-extrabold tracking-tight tabular-nums", isCancelled && "text-muted-foreground line-through")}>
							{formatToMoney(purchase.valorTotal)}
						</span>
						<span className="text-[11px] font-semibold text-muted-foreground">
							{itemCount} {itemCount === 1 ? "item" : "itens"}
						</span>
					</div>
					<ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
				</div>
			</div>
		</Link>
	);
}
