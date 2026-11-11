"use client";

import type { TGetInboundDocumentsOutputDefault } from "@/app/api/fiscal/inbound/route";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/components/ui/copy-button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatToCNPJ, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import type { TFiscalInboundManifestEventEnum } from "@/schemas/enums";
import dayjs from "dayjs";
import {
	ArrowRight,
	Ban,
	Check,
	CheckCheck,
	ChevronDown,
	CircleCheck,
	CircleX,
	Clock,
	Copy,
	Download,
	Eye,
	FileCheck2,
	FileQuestion,
	FileText,
	LoaderCircle,
	ShieldX,
} from "lucide-react";
import Link from "next/link";
import { getSupplierInitials } from "./purchase-status-meta";

export type TInboundDocument = TGetInboundDocumentsOutputDefault["documents"][number];

const MANIFEST_CHIPS: Record<TFiscalInboundManifestEventEnum, { label: string; className: string }> = {
	CIENCIA: { label: "Ciência registrada", className: "bg-info-surface text-info-surface-foreground" },
	CONFIRMACAO: { label: "Operação confirmada", className: "bg-success-surface text-success-surface-foreground" },
	DESCONHECIMENTO: { label: "Operação desconhecida", className: "bg-destructive-surface text-destructive-surface-foreground" },
	NAO_REALIZADA: { label: "Não realizada", className: "bg-destructive-surface text-destructive-surface-foreground" },
};

export function formatInboundIssueDate(date: Date | string | null | undefined) {
	return date ? dayjs(date).format("DD/MM/YYYY") : null;
}

export function formatInboundNumber(numero: string | null) {
	return numero ? Number(numero).toLocaleString("pt-BR") : null;
}

type InboundDocumentCardProps = {
	doc: TInboundDocument;
	canCreatePurchase: boolean;
	canManifest: boolean;
	/** Esta nota está registrando ciência agora (botão "Dar ciência e registrar"). */
	registeringCiencia: boolean;
	manifestDisabled: boolean;
	onRegister: () => void;
	onRegisterWithCiencia: () => void;
	onManifest: (evento: TFiscalInboundManifestEventEnum) => void;
};

export default function InboundDocumentCard({
	doc,
	canCreatePurchase,
	canManifest,
	registeringCiencia,
	manifestDisabled,
	onRegister,
	onRegisterWithCiencia,
	onManifest,
}: InboundDocumentCardProps) {
	const status = doc.situacaoRegistro;
	const supplierName = doc.fornecedor?.nome ?? doc.emitenteNome ?? "Fornecedor não identificado";
	const number = formatInboundNumber(doc.numero);
	const issueDate = formatInboundIssueDate(doc.dataEmissao);
	const manifestChip = doc.manifestacaoAtual
		? MANIFEST_CHIPS[doc.manifestacaoAtual]
		: { label: "Sem manifestação", className: "bg-muted text-foreground" };
	const isClosed = status === "CANCELADA" || status === "DESCONSIDERADA";
	const canDownloadXml = !!doc.xmlStoragePath || !!doc.provedorDocumentoId;
	const hasDanfe = doc.completo && !!doc.provedorDocumentoId;
	// Ciência dada e XML completo ainda não redistribuído pela SEFAZ: não há o que ler até ele chegar.
	const awaitingXml = status === "A_REGISTRAR" && !doc.completo && (doc.manifestacaoAtual === "CIENCIA" || doc.manifestacaoAtual === "CONFIRMACAO");
	const showManifestMenu = canManifest && !isClosed && status !== "REGISTRADA" && doc.manifestacaoAtual !== "CONFIRMACAO";

	return (
		<div className={cn("relative w-full rounded-3xl border border-border bg-card shadow-2xs", isClosed && "opacity-75")}>
			<div className="flex flex-wrap items-start gap-x-5 gap-y-3.5 px-4 py-4 sm:px-[18px]">
				<div className="flex min-w-0 flex-[1_1_300px] gap-3.5">
					<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-info-surface text-sm font-extrabold text-info-surface-foreground">
						{getSupplierInitials(supplierName)}
					</div>
					<div className="flex min-w-0 flex-col gap-1">
						<span className="text-[15px] font-bold tracking-tight">{supplierName}</span>
						<span className="text-[13px] text-muted-foreground">
							{[
								number ? `NF-e nº ${number}` : "NF-e",
								doc.serie ? `série ${doc.serie}` : null,
								doc.emitenteCnpj ? `CNPJ ${formatToCNPJ(doc.emitenteCnpj)}` : null,
							]
								.filter(Boolean)
								.join(" · ")}
						</span>
						<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
							<span
								className={cn(
									"inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-bold",
									doc.completo ? "bg-success-surface text-success-surface-foreground" : "bg-warning-surface text-warning-surface-foreground",
								)}
								title={doc.completo ? undefined : "A SEFAZ libera o XML completo após a manifestação do destinatário."}
							>
								{doc.completo ? <FileCheck2 className="h-3 w-3" /> : <FileQuestion className="h-3 w-3" />}
								{doc.completo ? "XML completo" : "Só o resumo da SEFAZ"}
							</span>
							<span className={cn("inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold", manifestChip.className)}>
								{manifestChip.label}
							</span>
							<AccessKeyButton chaveAcesso={doc.chaveAcesso} />
						</div>
					</div>
				</div>
				<div className="ml-auto flex flex-col items-end gap-0.5">
					<span className={cn("text-[17px] font-extrabold tracking-tight tabular-nums", status === "CANCELADA" && "line-through")}>
						{typeof doc.valorTotal === "number" ? formatToMoney(doc.valorTotal) : "—"}
					</span>
					{issueDate ? <span className="text-[11px] font-semibold text-muted-foreground">Emitida em {issueDate}</span> : null}
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-2.5 rounded-b-3xl border-t border-border bg-muted/40 py-2.5 pl-4 pr-3 sm:pl-[18px]">
				<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
					{status === "A_REGISTRAR" ? (
						awaitingXml ? (
							<>
								<span className="flex items-center gap-1.5 text-[13px] font-semibold text-info-surface-foreground">
									<Clock className="h-4 w-4" />
									Aguardando o XML completo da SEFAZ
								</span>
								<span className="text-xs text-muted-foreground">Chega minutos depois da ciência; a nota fica pronta sozinha.</span>
							</>
						) : doc.completo ? (
							canCreatePurchase ? (
								<>
									<Button className="h-9 rounded-[14px] px-4 text-[13px] font-bold shadow-sm" onClick={onRegister}>
										Registrar compra
										<ArrowRight className="h-4 w-4" />
									</Button>
									<span className="text-xs text-muted-foreground">Fornecedor, itens e duplicatas vêm preenchidos pela nota.</span>
								</>
							) : (
								<span className="text-xs text-muted-foreground">Nota pronta para virar compra.</span>
							)
						) : canCreatePurchase && canManifest ? (
							<>
								<Button
									className="h-9 rounded-[14px] px-4 text-[13px] font-bold shadow-sm"
									disabled={registeringCiencia || manifestDisabled}
									onClick={onRegisterWithCiencia}
								>
									{registeringCiencia ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
									Dar ciência e registrar
									{registeringCiencia ? null : <ArrowRight className="h-4 w-4" />}
								</Button>
								<span className="text-xs text-muted-foreground">A ciência libera o XML completo na SEFAZ.</span>
							</>
						) : (
							<span className="text-xs text-muted-foreground">Falta a ciência da operação para liberar o XML completo.</span>
						)
					) : null}
					{status === "REGISTRADA" && doc.compra ? (
						<>
							<span className="flex items-center gap-1.5 text-[13px] font-semibold text-success-strong">
								<CircleCheck className="h-4 w-4" />
								Compra registrada
							</span>
							<Link href={appRoutes.purchase(doc.compra.id)} className="flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
								{doc.compra.titulo}
								<ArrowRight className="h-3.5 w-3.5" />
							</Link>
						</>
					) : null}
					{status === "CANCELADA" ? (
						<span className="flex items-center gap-1.5 text-[13px] font-semibold text-destructive-surface-foreground">
							<Ban className="h-4 w-4" />
							{doc.situacao === "DENEGADA" ? "Nota denegada pela SEFAZ. Nada a registrar." : "Nota cancelada pelo emitente. Nada a registrar."}
						</span>
					) : null}
					{status === "DESCONSIDERADA" ? (
						<span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
							<CircleX className="h-4 w-4" />
							{doc.manifestacaoAtual === "DESCONHECIMENTO" ? "Operação desconhecida. Não vira compra." : "Marcada como não realizada. Não vira compra."}
						</span>
					) : null}
				</div>
				<div className="flex items-center gap-1">
					{showManifestMenu ? <ManifestMenu current={doc.manifestacaoAtual} disabled={manifestDisabled} onManifest={onManifest} /> : null}
					{canDownloadXml ? (
						<Button
							variant="ghost"
							size="sm"
							className="h-8 rounded-xl px-2.5 text-xs font-semibold"
							title={doc.completo ? "Baixar XML autorizado" : "Baixar XML de resumo (não vale para escrituração)"}
							onClick={() => window.open(`/api/fiscal/inbound/xml?inboundId=${doc.id}`, "_blank", "noopener,noreferrer")}
						>
							<Download className="h-3.5 w-3.5" />
							XML
						</Button>
					) : null}
					{hasDanfe ? (
						<Button
							variant="ghost"
							size="sm"
							className="h-8 rounded-xl px-2.5 text-xs font-semibold"
							onClick={() => window.open(`/api/fiscal/inbound/pdf?inboundId=${doc.id}`, "_blank", "noopener,noreferrer")}
						>
							<FileText className="h-3.5 w-3.5" />
							DANFE
						</Button>
					) : null}
				</div>
			</div>
		</div>
	);
}

function AccessKeyButton({ chaveAcesso }: { chaveAcesso: string }) {
	const { copied, copy } = useCopyToClipboard();
	const short = `${chaveAcesso.slice(0, 8)} … ${chaveAcesso.slice(-8)}`;
	return (
		<button
			type="button"
			title="Copiar chave de acesso"
			onClick={() => void copy(chaveAcesso)}
			className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] font-mono text-[11px] font-semibold text-muted-foreground hover:bg-muted"
		>
			Chave {short}
			{copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
		</button>
	);
}

function ManifestMenu({
	current,
	disabled,
	onManifest,
}: {
	current: TFiscalInboundManifestEventEnum | null;
	disabled: boolean;
	onManifest: (evento: TFiscalInboundManifestEventEnum) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled}
				render={
					<Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-xl pl-3 pr-2.5 text-[13px] font-semibold">
						Manifestar
						<ChevronDown className="h-3.5 w-3.5" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="w-80 p-1.5">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="px-2.5 pb-1.5 pt-2 text-[11px] font-extrabold uppercase leading-none tracking-[0.08em]">
						Manifestação do destinatário
					</DropdownMenuLabel>
					{current === null ? (
						<ManifestMenuItem
							icon={Eye}
							title="Ciência da operação"
							description="Libera o XML completo. Pode ser substituída depois."
							onClick={() => onManifest("CIENCIA")}
						/>
					) : null}
					<ManifestMenuItem
						icon={CheckCheck}
						title="Confirmar operação"
						description="Definitiva. Confirme só se a operação ocorreu."
						onClick={() => onManifest("CONFIRMACAO")}
					/>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<ManifestMenuItem
						icon={ShieldX}
						title="Desconhecer operação"
						description="Definitiva. Exige justificativa (mín. 15 caracteres)."
						destructive
						onClick={() => onManifest("DESCONHECIMENTO")}
					/>
					<ManifestMenuItem
						icon={CircleX}
						title="Operação não realizada"
						description="Definitiva. Exige justificativa (mín. 15 caracteres)."
						destructive
						onClick={() => onManifest("NAO_REALIZADA")}
					/>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ManifestMenuItem({
	icon: Icon,
	title,
	description,
	destructive,
	onClick,
}: {
	icon: typeof Eye;
	title: string;
	description: string;
	destructive?: boolean;
	onClick: () => void;
}) {
	return (
		<DropdownMenuItem variant={destructive ? "destructive" : "default"} className="items-start gap-2.5 px-2.5 py-2" onClick={onClick}>
			<Icon className="mt-0.5 h-4 w-4" />
			<span className="flex flex-col gap-0.5">
				<span className="text-[13px] font-bold">{title}</span>
				<span className="text-xs leading-snug text-muted-foreground">{description}</span>
			</span>
		</DropdownMenuItem>
	);
}
